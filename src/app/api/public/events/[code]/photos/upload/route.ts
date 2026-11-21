import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenFromCookie, rateLimit, tokenHash } from "@/lib/guest/security";
import { imageTypeMatches } from "@/lib/media-validation.mjs";
import { imageDimensions } from "@/lib/design/raster-metadata.mjs";
import { MAX_PHOTO_BYTES } from "@/lib/media-validation.mjs";

type GuestAuth = { guest_session_id: string; max_photo_size_bytes: number; photo_count: number };
type UploadRequest = { filename: string; mime_type: string; file_size: number };

async function authorize(request: Request, code: string) {
  const token = accessTokenFromCookie(request.headers.get("cookie"), code);
  if (!token) return { error: "Guest session is missing. Reload the event." } as const;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_guest_session", { p_code: code, p_access_token_hash: tokenHash(token) });
  if (error || !data) return { error: "Guest session expired. Reload the event." } as const;
  return { admin, token, auth: data as GuestAuth } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-f0-9]{48}$/.test(code)) return NextResponse.json({ error: "Event unavailable" }, { status: 404 });
  const result = await authorize(request, code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  let body: { action?: string; files?: UploadRequest[]; uploads?: Array<{ path: string; filename: string; mime_type: string }> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid upload request" }, { status: 400 }); }

  if (body.action === "authorize") {
    if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > 10) return NextResponse.json({ error: "Choose between 1 and 10 photos." }, { status: 400 });
    const total = body.files.reduce((sum, file) => sum + (Number.isSafeInteger(file.file_size) ? file.file_size : 0), 0);
    if (total > 50 * 1024 * 1024) return NextResponse.json({ error: "This upload is limited to 50 MB total." }, { status: 400 });
    try {
      if (!await rateLimit(request.headers, code, "upload", 50, 3600) || !await rateLimit(request.headers, code + result.auth.guest_session_id, "session-upload", 30, 3600)) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload temporarily unavailable" }, { status: 503 }); }
    if (result.auth.photo_count + body.files.length > 20) return NextResponse.json({ error: "The photo limit has been reached." }, { status: 400 });
    const publicClient = await import("@/lib/supabase/server").then((module) => module.createClient());
    const { data: eventData, error: eventError } = await publicClient.rpc("get_public_guest_event", { p_code: code });
    const layoutSlots = eventData?.layout?.layout_config?.elements?.filter((element: { type?: string }) => element.type === "photo").length ?? 0;
    if (eventError || !layoutSlots || result.auth.photo_count + body.files.length > layoutSlots) return NextResponse.json({ error: "The selected layout does not have enough photo slots." }, { status: 400 });
    const uploads = [];
    for (const file of body.files) {
      if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.mime_type) || file.file_size < 1 || file.file_size > Math.min(MAX_PHOTO_BYTES, result.auth.max_photo_size_bytes)) return NextResponse.json({ error: `${file?.filename ?? "Photo"}: unsupported format or file size.` }, { status: 400 });
      const suffix = file.mime_type === "image/jpeg" ? "jpg" : file.mime_type === "image/png" ? "png" : "webp";
      const path = `${code}/${result.auth.guest_session_id}/${crypto.randomUUID()}.${suffix}`;
      const { data, error } = await result.admin.storage.from("snapqueue-guest-uploads").createSignedUploadUrl(path, { upsert: false });
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not authorize upload." }, { status: 400 });
      uploads.push({ path, token: data.token, filename: file.filename.slice(0, 255), mime_type: file.mime_type, file_size: file.file_size });
    }
    return NextResponse.json({ uploads });
  }

  if (body.action === "complete") {
    if (!Array.isArray(body.uploads) || body.uploads.length < 1 || body.uploads.length > 10) return NextResponse.json({ error: "Invalid completed upload list." }, { status: 400 });
    const prefix = `${code}/${result.auth.guest_session_id}/`;
    const completed = [];
    for (const upload of body.uploads) {
      if (!new RegExp(`^${prefix}[a-f0-9-]{36}\\.(jpg|png|webp)$`).test(upload.path) || !["image/jpeg", "image/png", "image/webp"].includes(upload.mime_type)) return NextResponse.json({ error: "Upload authorization is invalid." }, { status: 400 });
      const { data: existing } = await result.admin.from("guest_photos").select("id,filename,mime_type,file_size,width_px,height_px").eq("guest_session_id", result.auth.guest_session_id).eq("object_path", upload.path).maybeSingle();
      if (existing) {
        completed.push({ ...existing, url: `/api/public/events/${code}/photos/${existing.id}/content` });
        continue;
      }
      const { data: file, error: downloadError } = await result.admin.storage.from("snapqueue-guest-uploads").download(upload.path);
      if (downloadError || !file || file.size < 1 || file.size > Math.min(MAX_PHOTO_BYTES, result.auth.max_photo_size_bytes)) {
        await result.admin.storage.from("snapqueue-guest-uploads").remove([upload.path]);
        return NextResponse.json({ error: "Uploaded photo could not be verified." }, { status: 400 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!imageTypeMatches(upload.mime_type, bytes)) {
        await result.admin.storage.from("snapqueue-guest-uploads").remove([upload.path]);
        return NextResponse.json({ error: "Photo content does not match its declared format." }, { status: 400 });
      }
      let dimensions: { width: number; height: number };
      try { dimensions = imageDimensions(bytes, upload.mime_type); } catch {
        await result.admin.storage.from("snapqueue-guest-uploads").remove([upload.path]);
        return NextResponse.json({ error: "Photo dimensions could not be read." }, { status: 400 });
      }
      if (dimensions.width * dimensions.height > 40_000_000) {
        await result.admin.storage.from("snapqueue-guest-uploads").remove([upload.path]);
        return NextResponse.json({ error: "Photo has too many pixels to process safely." }, { status: 400 });
      }
      const safeName = upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "guest-photo";
      const { data: photo, error } = await result.admin.rpc("register_guest_photo", {
        p_code: code, p_access_token_hash: tokenHash(result.token), p_object_path: upload.path,
        p_filename: safeName, p_mime_type: upload.mime_type, p_file_size: file.size,
        p_width: dimensions.width, p_height: dimensions.height,
      });
      if (error || !photo) {
        await result.admin.storage.from("snapqueue-guest-uploads").remove([upload.path]);
        return NextResponse.json({ error: error?.message ?? "Photo registration failed." }, { status: 400 });
      }
      completed.push(photo);
    }
    return NextResponse.json({ photos: completed.map((photo) => ({ ...photo, url: `/api/public/events/${code}/photos/${photo.id}/content` })) });
  }
  return NextResponse.json({ error: "Unsupported upload action." }, { status: 400 });
}
