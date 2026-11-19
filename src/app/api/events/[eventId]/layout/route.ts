import { NextResponse } from "next/server";
import { templateApiContext } from "@/lib/templates/api-auth";
import { validDesign } from "@/lib/design/model";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await templateApiContext();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid event layout data" }, { status: 400 });

  const templateId = String(body.template_id ?? "");
  const name = String(body.layout_name ?? "").trim();
  const layout = body.layout_config;
  const width = Number(body.width_px);
  const height = Number(body.height_px);
  const dpi = Number(body.dpi);
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !/^[0-9a-f-]{36}$/i.test(templateId)) return NextResponse.json({ error: "Event or source layout is invalid" }, { status: 400 });
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Layout name must be 2–120 characters" }, { status: 400 });
  if (!validDesign(layout) || layout.canvas.width !== width || layout.canvas.height !== height || layout.canvas.dpi !== dpi) return NextResponse.json({ error: "Layout configuration does not match its print dimensions" }, { status: 400 });
  if (!layout.elements.some((element) => element.type === "photo")) return NextResponse.json({ error: "Add at least one photo placeholder" }, { status: 400 });
  const photoSlotCount = layout.elements.filter((element) => element.type === "photo").length;
  if (photoSlotCount > 20) return NextResponse.json({ error: "An event layout can have up to 20 photo placeholders" }, { status: 400 });
  if (layout.guest?.maxPhotosPerGuest !== photoSlotCount) return NextResponse.json({ error: "The photo limit must match the number of photo placeholders" }, { status: 400 });
  if (layout.overlay && !layout.overlay.path.startsWith(`${context.workspaceId}/templates/`)) return NextResponse.json({ error: "Overlay asset is outside this workspace" }, { status: 400 });

  const printOptions = body.print_options;
  let guestSettings: Record<string, unknown> | null = null;
  if (printOptions) {
    const size = String(printOptions.size ?? "");
    const packageLabel = String(printOptions.package_label ?? "").trim();
    const quantity = Number(printOptions.quantity);
    if (!["2x6", "4x6", "4x4"].includes(size)) return NextResponse.json({ error: "Choose a supported guest print size" }, { status: 400 });
    if (packageLabel.length < 1 || packageLabel.length > 80) return NextResponse.json({ error: "Package name must be 1–80 characters" }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return NextResponse.json({ error: "Copies per order must be between 1 and 100" }, { status: 400 });
    const { data: current, error: settingsError } = await context.supabase.from("event_guest_settings")
      .select("max_photos_per_guest,max_photo_size_bytes,approval_mode,guest_instructions,marketing_consent_enabled,photo_retention_days")
      .eq("event_id", eventId).eq("workspace_id", context.workspaceId).maybeSingle();
    if (settingsError || !current) return NextResponse.json({ error: settingsError?.message ?? "Guest settings are unavailable" }, { status: 400 });
    guestSettings = {
      print_sizes: [size],
      print_packages: [{ code: "standard", label: packageLabel, quantity }],
      max_photos_per_guest: photoSlotCount,
      max_photo_size_bytes: 20 * 1024 * 1024,
      max_print_quantity: quantity,
      approval_mode: current.approval_mode,
      guest_instructions: current.guest_instructions,
      marketing_consent_enabled: current.marketing_consent_enabled,
      photo_retention_days: current.photo_retention_days,
    };
  }

  const { data: version, error } = await context.supabase.rpc("save_event_layout", {
    p_event_id: eventId,
    p_template_id: templateId,
    p_layout_name: name,
    p_layout_config: layout,
    p_activate: body.activate === true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (guestSettings) {
    const { error: printSettingsError } = await context.supabase.rpc("save_event_guest_settings", {
      p_event_id: eventId,
      p_settings: guestSettings,
      p_template_ids: [templateId],
    });
    if (printSettingsError) return NextResponse.json({ error: printSettingsError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, version });
}
