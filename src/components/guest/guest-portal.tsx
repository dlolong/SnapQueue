"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { GuestBusinessBrand } from "@/components/guest/business-brand";
import { renderDesign } from "@/lib/design/render";
import { addDpiMetadata } from "@/lib/design/raster-metadata.mjs";
import type { DesignElement, DesignModel } from "@/lib/design/model";
import { formatEventTime } from "@/lib/events/format";
import { optimizeImage, disposeImageOptimizer } from "@/lib/guest/optimize-image";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";
import { photoTargetPixels } from "@/lib/guest/photo-target.mjs";

type Template = {
  id: string;
  name: string;
  description: string | null;
  width_px: number;
  height_px: number;
  dpi: number;
  layout_config: {
    canvas?: { background?: string };
    photo_slots_required?: boolean;
    overlay?: { path: string; width: number; height: number; x: number; y: number; displayWidth: number; displayHeight: number; rotation: number; locked: boolean };
    elements?: Array<{
      id?: string; type?: string; x?: number; y?: number; width?: number; height?: number;
      zIndex?: number; rotation?: number; name?: string; required?: boolean; slotNumber?: number;
      visible?: boolean; locked?: boolean; fit?: "cover" | "contain"; cropX?: number; cropY?: number;
      configuration?: { text?: string; color?: string; fontSize?: number; align?: "left" | "center" | "right"; fit?: "cover" | "contain" };
    }>;
  };
  background: { value?: string };
};

type GuestEvent = {
  workspace_name: string;
  workspace_logo_url?: string | null;
  name: string;
  event_type: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  primary_color: string;
  secondary_color: string;
  guest_instructions: string;
  print_sizes: string[];
  print_packages: { code: string; label: string; quantity: number }[];
  max_print_quantity: number;
  marketing_consent_enabled: boolean;
  layout: Template;
};

type GuestPhoto = { id: string; filename: string; mime_type: string; file_size: number; width_px: number; height_px: number; url: string };
type UploadAuthorizationResponse = { error?: string; uploads: { path: string; token: string }[] };
type UploadCompletionResponse = { error?: string; photos: GuestPhoto[] };
type PendingPhoto = { id: string; filename: string; previewUrl: string; state: "preparing" | "optimizing" | "uploading" | "verifying" | "failed"; progress: number | null; warning?: string; file?: File };
type Panel = "print" | null;

const toDesign = (template: Template): DesignModel => ({
  version: 1,
  canvas: {
    width: template.width_px,
    height: template.height_px,
    dpi: template.dpi,
    background: template.layout_config.canvas?.background ?? template.background?.value ?? "#ffffff",
  },
  overlay: template.layout_config.overlay,
  elements: (template.layout_config.elements ?? []).map((element, index) => ({
    id: element.id ?? `element-${index}`,
    type: element.type === "text" ? "text" : element.type === "shape" ? "shape" : "photo",
    name: element.name ?? `Photo ${index + 1}`,
    required: element.required ?? template.layout_config.photo_slots_required ?? true,
    slotNumber: element.slotNumber ?? index + 1,
    cropX: element.cropX ?? 0.5,
    cropY: element.cropY ?? 0.5,
    x: element.x ?? 0,
    y: element.y ?? 0,
    width: element.width ?? 200,
    height: element.height ?? 200,
    rotation: element.rotation ?? 0,
    zIndex: element.zIndex ?? index,
    visible: element.visible ?? true,
    locked: element.locked ?? false,
    fit: element.fit ?? element.configuration?.fit ?? "cover",
    text: element.configuration?.text ?? "",
    fontSize: element.configuration?.fontSize ?? 48,
    color: element.configuration?.color ?? "#222222",
    align: element.configuration?.align ?? "center",
  } as DesignElement)),
});

const photoSlotCount = (template: Template | undefined) => template?.layout_config.elements?.filter((element) => element.type === "photo").length ?? 0;
function signedUpload(file: File, path: string, token: string, onProgress: (value: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Upload canceled.", "AbortError"));
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = getSupabasePublicKey();
    if (!base || !key) return reject(new Error("Photo storage is not configured."));
    const url = `${base.replace(/\/$/, "")}/storage/v1/object/upload/sign/snapqueue-guest-uploads/${path.split("/").map(encodeURIComponent).join("/")}?token=${encodeURIComponent(token)}`;
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("apikey", key);
    request.setRequestHeader("Authorization", `Bearer ${key}`);
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100))); };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status}).`));
    request.onerror = () => reject(new Error("Network interrupted during upload."));
    request.onabort = () => reject(new DOMException("Upload canceled.", "AbortError"));
    signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });
}
async function readUploadResponse<T>(response: Response, stage: string): Promise<T> {
  const body = await response.text();
  try { return JSON.parse(body) as T; }
  catch { throw new Error(`${stage} returned an invalid response (HTTP ${response.status}). Please retry.`); }
}
const autoPlacePhotos = (design: DesignModel, photos: GuestPhoto[]): DesignModel => {
  const alreadyUsed = new Set(design.elements.filter((element) => element.type === "photo" && element.photoId).map((element) => element.photoId));
  const available = photos.filter((photo) => !alreadyUsed.has(photo.id));
  let next = 0;
  return {
    ...design,
    elements: design.elements.map((element) => {
      if (element.type !== "photo" || element.photoId || !available[next]) return element;
      return { ...element, photoId: available[next++].id };
    }),
  };
};
function ActionIcon({ kind }: { kind: "upload" | "layout" | "print" }) {
  if (kind === "upload") return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="10" width="48" height="39" rx="8"/><circle cx="24" cy="24" r="5"/><path d="m12 43 13-13 8 8 7-8 12 13M46 45v14m-7-7h14"/></svg>;
  if (kind === "layout") return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="9" width="19" height="19" rx="3"/><rect x="36" y="9" width="19" height="19" rx="3"/><rect x="9" y="36" width="19" height="19" rx="3"/><rect x="36" y="36" width="19" height="19" rx="3"/></svg>;
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 23h36a6 6 0 0 1 6 6v21H8V29a6 6 0 0 1 6-6Z"/><path d="M20 23 24 14h16l4 9M17 50v6h30v-6"/><rect x="20" y="33" width="24" height="12" rx="3"/></svg>;
}

function CameraMascot() {
  return <svg className="guest-mascot" viewBox="0 0 180 150" role="img" aria-label="A smiling camera mascot">
    <path d="M37 40h106a12 12 0 0 1 12 12v58a13 13 0 0 1-13 13H38a13 13 0 0 1-13-13V53a13 13 0 0 1 12-13Z" fill="#fff" stroke="#172b62" strokeWidth="6"/>
    <path d="m59 40 8-16h37l10 16" fill="#70dcff" stroke="#172b62" strokeWidth="6" strokeLinejoin="round"/>
    <circle cx="89" cy="79" r="26" fill="#35b7f4" stroke="#172b62" strokeWidth="6"/><circle cx="89" cy="79" r="13" fill="#18336d"/><circle cx="84" cy="73" r="4" fill="#fff"/>
    <path d="M129 68q9-11 17 0" fill="none" stroke="#172b62" strokeWidth="5" strokeLinecap="round"/><circle cx="48" cy="91" r="6" fill="#ff8ea7"/><circle cx="131" cy="91" r="6" fill="#ff8ea7"/>
    <path d="M42 123v10m95-10v10M68 123v10m48-10v10" stroke="#172b62" strokeWidth="6" strokeLinecap="round"/><path d="m142 24 4-11m10 19 10-5" stroke="#ffc83d" strokeWidth="6" strokeLinecap="round"/>
  </svg>;
}

export function GuestPortal({ event, code }: { event: GuestEvent; code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [guestReady, setGuestReady] = useState(false);
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [design, setDesign] = useState<DesignModel | null>(event.layout ? toDesign(event.layout) : null);
  const [consent, setConsent] = useState<"yes" | "no" | "">("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const uploadControllers = useRef(new Map<string, AbortController>());
  const pendingRef = useRef<PendingPhoto[]>([]);
  const cancelledUploadIds = useRef(new Set<string>());

  const currentTemplate = event.layout;
  const templateId = event.layout.id;
  const photoLimit = photoSlotCount(currentTemplate);
  const hasRequiredSlots = !!design?.elements.some((element) => element.type === "photo" && !element.photoId && (element.required !== false || currentTemplate?.layout_config.photo_slots_required !== false));
  const canPrint = guestReady && photos.length > 0 && pendingPhotos.length === 0 && !!design && !hasRequiredSlots;
  const overallUploadProgress = pendingPhotos.length > 0 && pendingPhotos.every((photo) => photo.progress !== null)
    ? Math.floor(pendingPhotos.reduce((sum, photo) => sum + (photo.progress ?? 0) * (photo.file?.size ?? 1), 0) / pendingPhotos.reduce((sum, photo) => sum + (photo.file?.size ?? 1), 0))
    : null;
  const usedPhotoIds = new Set(design?.elements.filter((element) => element.type === "photo" && element.photoId).map((element) => element.photoId) ?? []);

  useEffect(() => {
    let alive = true;
    const start = async () => {
      let response = await fetch(`/api/public/events/${code}/photos`, { cache: "no-store" });
      if (!response.ok) {
        const session = await fetch(`/api/public/events/${code}/session`, { method: "POST" });
        if (!session.ok) throw Error((await session.json()).error ?? "Could not start guest session");
        response = await fetch(`/api/public/events/${code}/photos`, { cache: "no-store" });
      }
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Could not load guest photos");
      if (alive) {
        const loaded = result.photos ?? [];
        setPhotos(loaded);
        setDesign((current) => current ? autoPlacePhotos(current, loaded) : current);
        setGuestReady(true);
      }
    };
    start().catch((reason) => alive && setError(reason instanceof Error ? reason.message : "Guest session unavailable"));
    return () => { alive = false; };
  }, [code]);

  useEffect(() => () => {
    for (const photo of pendingRef.current) URL.revokeObjectURL(photo.previewUrl);
    for (const controller of uploadControllers.current.values()) controller.abort();
    disposeImageOptimizer();
  }, []);
  const updatePending = (id: string, update: Partial<PendingPhoto>) => setPendingPhotos((current) => {
    const next = current.map((photo) => photo.id === id ? { ...photo, ...update } : photo);
    pendingRef.current = next;
    return next;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !design) return;
    canvas.width = design.canvas.width;
    canvas.height = design.canvas.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const images: Record<string, CanvasImageSource> = {};
    let stopped = false;
    const loaded = Promise.all(photos.map((photo) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => { images[photo.id] = image; resolve(); };
      image.onerror = () => resolve();
      image.src = photo.url;
    })));
    const overlay = currentTemplate.layout_config.overlay
      ? new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = `/api/public/events/${code}/templates/${templateId}/overlay`;
        })
      : Promise.resolve(null);
    Promise.all([loaded, overlay]).then(([, overlayImage]) => {
      if (!stopped) renderDesign(context, design, images, overlayImage ?? undefined, { showPhotoPlaceholders: false });
    });
    return () => { stopped = true; };
  }, [design, photos, templateId, currentTemplate, code]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const remaining = photoLimit - photos.length - pendingPhotos.length;
    if (remaining <= 0) return setError(`This layout supports up to ${photoLimit} photos. Remove a photo to continue.`);
    if (selectedFiles.length > remaining) return setError(`This layout has room for ${remaining} more photo${remaining === 1 ? "" : "s"}. Select fewer images to continue.`);
    setError("");
    const ids = selectedFiles.map(() => crypto.randomUUID());
    const slots = design?.elements.filter((element) => element.type === "photo" && !element.photoId) ?? [];
    const previews = selectedFiles.map((file, index): PendingPhoto => ({ id: ids[index], filename: file.name, previewUrl: URL.createObjectURL(file), state: "preparing", progress: null }));
    setPendingPhotos((current) => { const next = [...current, ...previews]; pendingRef.current = next; return next; });
    const optimized = new Array<{ id: string; original: File; file: File; width: number; height: number; warning?: string }>(selectedFiles.length);
    let cursor = 0;
    const optimizeNext = async () => {
      while (cursor < selectedFiles.length) {
        const index = cursor++;
        const original = selectedFiles[index];
        const slot = slots[index] ?? slots[slots.length - 1];
        const target = photoTargetPixels({ width: slot?.width ?? currentTemplate.width_px, height: slot?.height ?? currentTemplate.height_px });
        const maxWidth = target.width;
        const maxHeight = target.height;
        updatePending(ids[index], { state: "optimizing", warning: original.size > 5 * 1024 * 1024 ? "Your photo is large. We're optimizing it for faster uploading while preserving print quality." : undefined });
        try {
          const result = await optimizeImage(original, maxWidth, maxHeight);
          const ext = result.file.type === "image/png" ? "png" : result.file.type === "image/jpeg" ? "jpg" : "webp";
          const file = new File([result.file], `${original.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: result.file.type, lastModified: original.lastModified });
          const warning = result.width < (slot?.width ?? 0) || result.height < (slot?.height ?? 0) ? "This photo may look soft at print size." : undefined;
          optimized[index] = { id: ids[index], original, file, width: result.width, height: result.height, warning };
          updatePending(ids[index], { file, state: "uploading", warning: warning ?? (file.size < original.size ? "Optimized for this print layout." : undefined) });
        } catch (reason) { updatePending(ids[index], { state: "failed", warning: reason instanceof Error ? reason.message : "Photo optimization failed." }); }
      }
    };
    await optimizeNext();
    const ready = optimized.filter((photo): photo is NonNullable<typeof photo> => !!photo && !cancelledUploadIds.current.has(photo.id));
    if (!ready.length) return;
    try {
      const authorize = await fetch(`/api/public/events/${code}/photos/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "authorize", files: ready.map(({ file }) => ({ filename: file.name, mime_type: file.type, file_size: file.size })) }) });
      const authorized = await readUploadResponse<UploadAuthorizationResponse>(authorize, "Upload authorization");
      if (!authorize.ok) throw new Error(authorized.error ?? "Could not authorize uploads.");
      let uploadIndex = 0;
      const uploadedIds = new Set<string>();
      const uploadNext = async () => {
        while (uploadIndex < ready.length) {
          const index = uploadIndex++;
          const photo = ready[index];
          const target = authorized.uploads[index];
          const controller = new AbortController();
          uploadControllers.current.set(photo.id, controller);
          try {
            for (let attempt = 0; ; attempt++) {
              try { await signedUpload(photo.file, target.path, target.token, (progress) => updatePending(photo.id, { progress }), controller.signal); break; }
              catch (error) { if (controller.signal.aborted || attempt >= 2) throw error; await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt)); }
            }
            uploadedIds.add(photo.id);
            updatePending(photo.id, { state: "verifying", progress: 99 });
          } catch (reason) {
            updatePending(photo.id, { state: "failed", warning: reason instanceof Error ? reason.message : "Upload failed. Tap Retry to continue." });
          } finally { uploadControllers.current.delete(photo.id); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, ready.length) }, uploadNext));
      const verifiedCandidates = ready.filter((photo) => uploadedIds.has(photo.id) && !cancelledUploadIds.current.has(photo.id));
      if (verifiedCandidates.length) {
        const complete = await fetch(`/api/public/events/${code}/photos/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", uploads: verifiedCandidates.map((photo) => ({ path: authorized.uploads[ready.indexOf(photo)].path, filename: photo.file.name, mime_type: photo.file.type })) }) });
        const result = await readUploadResponse<UploadCompletionResponse>(complete, "Photo verification");
        if (!complete.ok) throw new Error(result.error ?? "Could not verify uploaded photos.");
        const nextPhotos = [...photos, ...(result.photos ?? [])];
        setPhotos(nextPhotos);
        setDesign((current) => current ? autoPlacePhotos(current, nextPhotos) : current);
        for (const photo of verifiedCandidates) {
          const item = pendingRef.current.find((pendingPhoto) => pendingPhoto.id === photo.id);
          if (item) URL.revokeObjectURL(item.previewUrl);
        }
        const uploadedPendingIds = new Set(verifiedCandidates.map((photo) => photo.id));
        setPendingPhotos((current) => { const next = current.filter((photo) => !uploadedPendingIds.has(photo.id)); pendingRef.current = next; return next; });
      }
    } catch (reason) {
      setPendingPhotos((current) => { const next = current.map((photo) => ids.includes(photo.id) && photo.state !== "failed" ? { ...photo, state: "failed" as const, warning: reason instanceof Error ? reason.message : "Upload interrupted. Tap Retry to continue." } : photo); pendingRef.current = next; return next; });
    }
  };

  const retryUpload = async (photo: PendingPhoto) => {
    if (!photo.file) return;
    updatePending(photo.id, { state: "uploading", progress: null, warning: undefined });
    const controller = new AbortController();
    uploadControllers.current.set(photo.id, controller);
    try {
      const authResponse = await fetch(`/api/public/events/${code}/photos/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "authorize", files: [{ filename: photo.file.name, mime_type: photo.file.type, file_size: photo.file.size }] }) });
      const authResult = await readUploadResponse<UploadAuthorizationResponse>(authResponse, "Upload authorization");
      if (!authResponse.ok) throw new Error(authResult.error ?? "Could not authorize upload.");
      const target = authResult.uploads[0];
      for (let attempt = 0; ; attempt++) {
        try { await signedUpload(photo.file, target.path, target.token, (progress) => updatePending(photo.id, { progress }), controller.signal); break; }
        catch (error) { if (controller.signal.aborted || attempt >= 2) throw error; await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt)); }
      }
      updatePending(photo.id, { state: "verifying", progress: 99 });
      const response = await fetch(`/api/public/events/${code}/photos/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", uploads: [{ path: target.path, filename: photo.file.name, mime_type: photo.file.type }] }) });
      const result = await readUploadResponse<UploadCompletionResponse>(response, "Photo verification");
      if (!response.ok) throw new Error(result.error ?? "Could not verify uploaded photo.");
      const nextPhotos = [...photos, ...(result.photos ?? [])];
      setPhotos(nextPhotos);
      setDesign((current) => current ? autoPlacePhotos(current, nextPhotos) : current);
      URL.revokeObjectURL(photo.previewUrl);
      setPendingPhotos((current) => { const next = current.filter((item) => item.id !== photo.id); pendingRef.current = next; return next; });
    } catch (reason) { updatePending(photo.id, { state: "failed", warning: reason instanceof Error ? reason.message : "Upload interrupted. Tap Retry to continue." }); }
    finally { uploadControllers.current.delete(photo.id); }
  };

  const cancelUpload = (photo: PendingPhoto) => {
    cancelledUploadIds.current.add(photo.id);
    uploadControllers.current.get(photo.id)?.abort();
    URL.revokeObjectURL(photo.previewUrl);
    setPendingPhotos((current) => { const next = current.filter((item) => item.id !== photo.id); pendingRef.current = next; return next; });
  };

  const removePhoto = async (id: string) => {
    const response = await fetch(`/api/public/events/${code}/photos/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not remove photo");
    const remaining = photos.filter((photo) => photo.id !== id);
    setPhotos(remaining);
    setDesign((current) => current ? autoPlacePhotos({ ...current, elements: current.elements.map((element) => element.photoId === id ? { ...element, photoId: undefined } : element) }, remaining) : current);
  };

  const replacePhoto = async (id: string, file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy("Updating your photo…");
    try {
      const form = new FormData();
      const slot = design?.elements.find((element) => element.type === "photo" && element.photoId === id);
      const target = photoTargetPixels({ width: slot?.width ?? currentTemplate.width_px, height: slot?.height ?? currentTemplate.height_px });
      form.append("file", (await optimizeImage(file, target.width, target.height)).file);
      const response = await fetch(`/api/public/events/${code}/photos/${id}`, { method: "PUT", body: form });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Photo update failed");
      setPhotos(result.photos ?? []);
      setBusy("");
    } catch (reason) {
      setBusy("");
      setError(reason instanceof Error ? reason.message : "Photo update failed");
    }
  };

  const submit = async () => {
    if (!canPrint || !design) return;
    if (event.marketing_consent_enabled && !consent) return setError("Choose whether you consent to marketing use.");
    if (!event.print_packages[0] || !event.print_sizes[0]) return setError("Printing is not configured for this event. Please ask event staff.");
    setBusy("Preparing your print…");
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = design.canvas.width;
      canvas.height = design.canvas.height;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Canvas rendering is unavailable in this browser");
      const images: Record<string, CanvasImageSource> = {};
      await Promise.all(photos.map((photo) => new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => { images[photo.id] = image; resolve(); };
        image.onerror = () => reject(Error(`Photo “${photo.filename}” could not be loaded. Refresh and try again.`));
        image.src = photo.url;
      })));
      let overlayImage: HTMLImageElement | undefined;
      if (currentTemplate.layout_config.overlay) {
        overlayImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(Error("Template overlay could not be loaded. Refresh and try again."));
          image.src = `/api/public/events/${code}/templates/${templateId}/overlay`;
        });
      }
      renderDesign(context, design, images, overlayImage, { showPhotoPlaceholders: false });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(Error("Could not render print file")), "image/png"));
      const tagged = addDpiMetadata(new Uint8Array(await blob.arrayBuffer()), "image/png", design.canvas.dpi);
      const form = new FormData();
      form.append("export", new Blob([tagged.buffer as ArrayBuffer], { type: "image/png" }), "guest-print.png");
      form.append("design", JSON.stringify(design));
      if (consent) form.append("marketing_consent", consent);
      const response = await fetch(`/api/public/events/${code}/orders`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Order was not submitted");
      window.location.assign(`/order/${result.trackingToken}`);
    } catch (reason) {
      setBusy("");
      setError(reason instanceof Error ? reason.message : "Order submission failed");
    }
  };

  const color = event.primary_color || "#1978ec";

  return <div className="guest-portal guest-home" style={{ "--guest-accent": color, "--guest-brand-secondary": event.secondary_color || "#172b62" } as React.CSSProperties}>
    <header className="guest-sticky-header">
      <GuestBusinessBrand name={event.workspace_name} logoUrl={event.workspace_logo_url}/>
    </header>

    {!event.layout ? <section className="guest-home-empty"><h1>{event.name}</h1><p>Ordering is not available yet. The event operator has not enabled a print layout.</p></section> : <>
      <section className="guest-home-hero" id="home">
        <div className="guest-home-event">
          <h1>{event.name}</h1>
          <p>{event.event_date ?? "Date not set"} · Start {formatEventTime(event.start_time) ?? "not set"} · End {formatEventTime(event.end_time) ?? "not set"}</p>
          <p>Add photos, check your preview, then print.</p>
        </div>
      </section>

      <section className="guest-layout-card" aria-label="Print preview">
        <div className="guest-layout-preview-wrap">{design && <canvas ref={canvasRef} className="guest-layout-canvas" />}</div>
      </section>

      <section className={`guest-photo-actions ${Number(photos.length < photoLimit) + Number(canPrint) === 1 ? "single-action" : ""}`} aria-label="Photo booth actions">
        {photos.length + pendingPhotos.length < photoLimit && <label className="guest-add-photos">
          <span aria-hidden="true">＋</span>Add photos<input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple disabled={!guestReady || pendingPhotos.length > 0} onChange={(eventChange) => { void upload(eventChange.target.files); eventChange.target.value = ""; }} />
        </label>}
        {canPrint && <button className="guest-print-cta" type="button" onClick={() => setPanel("print")}><ActionIcon kind="print" />Print</button>}
      </section>

      {pendingPhotos.length > 0 && <section className="guest-photos-section guest-upload-progress" aria-live="polite" aria-label="Photo upload progress">
        <div className="guest-photos-heading"><h2>Getting your photos ready</h2><strong>{pendingPhotos.length} in progress</strong></div>
        <p className="guest-upload-overall-status">{pendingPhotos.some((photo) => photo.state === "verifying") ? "Almost done! Checking your photos…" : overallUploadProgress === null ? `Preparing ${pendingPhotos.length} photo${pendingPhotos.length === 1 ? "" : "s"}…` : `Uploading photos… ${overallUploadProgress}%`}</p>
        <progress className="guest-upload-overall-progress" {...(overallUploadProgress === null ? {} : { value: overallUploadProgress })} max="100" aria-label="Overall photo upload progress" />
        <div className="guest-photo-cards">{pendingPhotos.map((photo, index) => <article className="guest-photo-edit-card" key={photo.id}>
          {/* Blob URLs are local previews and must bypass the Next image loader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.previewUrl} alt={`Preview of ${photo.filename}`} />
          <div className="guest-upload-details"><b>{photo.filename}</b><span>{photo.state === "preparing" ? "Preparing your photos…" : photo.state === "optimizing" ? `Optimizing photo ${index + 1} of ${pendingPhotos.length}…` : photo.state === "uploading" ? photo.progress === null ? "Uploading photos…" : `Uploading photos… ${photo.progress}%` : photo.state === "verifying" ? "Almost done! Checking your photos…" : photo.warning ?? "Upload interrupted. Tap Retry to continue."}</span>
            {photo.warning && photo.state !== "failed" && <small>{photo.warning}</small>}
            {photo.progress !== null && photo.state === "uploading" && <progress max="100" value={photo.progress} aria-label={`Uploading ${photo.filename}`} />}
            {photo.state === "failed" && photo.file && <button type="button" className="text-button" onClick={() => void retryUpload(photo)}>Retry</button>}
            <button type="button" className="text-button" disabled={photo.state === "verifying"} onClick={() => cancelUpload(photo)}>{photo.state === "failed" ? "Remove" : photo.state === "verifying" ? "Checking…" : "Cancel"}</button>
          </div>
        </article>)}</div>
      </section>}

      {photos.length > 0 && <section className="guest-photos-section" aria-label="Your uploaded photos">
        <div className="guest-photos-heading"><h2>Your photos</h2><strong>{usedPhotoIds.size} of {photoLimit} used</strong></div>
        <div className="guest-photo-cards">{photos.map((photo, index) => <article className="guest-photo-edit-card" key={photo.id}>
          <NextImage src={photo.url} alt={photo.filename} width={photo.width_px} height={photo.height_px} unoptimized />
          <span className="guest-photo-number">{index + 1}</span>
          {/* <span className={`guest-photo-state ${usedPhotoIds.has(photo.id) ? "used" : "unused"}`}>{usedPhotoIds.has(photo.id) ? "In layout" : "Not used"}</span> */}
          <input id={"replace-photo-" + photo.id} className="guest-visually-hidden" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" disabled={!!busy} onChange={(eventChange) => { void replacePhoto(photo.id, eventChange.target.files?.[0]); eventChange.target.value = ""; }} />
          <div className="guest-photo-edit-actions"><button type="button" disabled={!!busy} onClick={() => document.getElementById("replace-photo-" + photo.id)?.click()} aria-label={"Edit " + photo.filename}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.8 5.7 3.5 3.5"/></svg><span className="guest-visually-hidden">Edit image</span></button><button type="button" disabled={!!busy} onClick={() => void removePhoto(photo.id)} aria-label={"Delete " + photo.filename}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 3v7m6-7v7"/></svg><span className="guest-visually-hidden">Delete image</span></button></div>
        </article>)}</div>
      </section>}
      <footer className="guest-home-footer">Have fun and enjoy your photos!</footer>
    </>}

    {error && <p className="form-error guest-error guest-home-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss">×</button></p>}
    {busy && <p className="guest-busy guest-home-busy" role="status">{busy}</p>}
    {!guestReady && <p className="guest-home-loading" role="status">Getting the photo booth ready…</p>}

    {panel && <div className="guest-panel-backdrop" onMouseDown={(eventMouse) => { if (eventMouse.target === eventMouse.currentTarget) setPanel(null); }}>
      <section className="guest-panel" role="dialog" aria-modal="true" aria-label="Print options">
        <div className="guest-panel-header"><div><p className="guest-eyebrow">{event.name}</p><h2>Ready to print?</h2></div><button className="guest-panel-close" type="button" onClick={() => { setPanel(null); setError(""); }} aria-label="Close">×</button></div>

        {panel === "print" && <div className="guest-print-panel">
          <div className="guest-print-preview"><CameraMascot /><div><strong>{photos.length} photo{photos.length === 1 ? "" : "s"}</strong><small>Your event layout is ready</small></div></div>
          <div className="guest-print-confirmation" role="status"><strong>Your print setup is ready</strong><p>The event team has set the print format. Confirm below to send your photos to the queue.</p></div>
          {event.marketing_consent_enabled && <fieldset className="guest-consent"><legend>Optional marketing permission</legend><p>Permission to print is separate from permission to publish.</p><label><input type="radio" name="marketing" checked={consent === "no"} onChange={() => setConsent("no")}/> Do not use my photos for marketing</label><label><input type="radio" name="marketing" checked={consent === "yes"} onChange={() => setConsent("yes")}/> I consent to marketing use</label></fieldset>}
          <button className="guest-panel-primary" type="button" disabled={!!busy || (event.marketing_consent_enabled && !consent)} onClick={() => void submit()}>{busy || "Send to print queue"}</button>
          <p className="guest-panel-note">Your queue number appears after you submit.</p>
        </div>}
      </section>
    </div>}
  </div>;
}
