import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EventOverview } from "@/components/events/event-overview";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { TemplatePreview } from "@/components/templates/template-preview";
import { EventQrCard } from "@/components/guest/event-qr-card";
import { requireWorkspace } from "@/lib/workspace";
import { toggleGuestAccess } from "@/lib/data/guest-actions";

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ eventId }, query, { supabase, workspace, role }] = await Promise.all([params, searchParams, requireWorkspace()]);
  if (!["owner", "admin", "operator"].includes(role)) redirect("/events");
  const [{ data: event, error }, { data: settings }, { data: rows, error: jobsError }, { data: templates }] = await Promise.all([
    supabase.from("events").select("id,name,event_type,event_date,venue,client_name,client_contact,description,status,public_event_code,guest_portal_enabled").eq("id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("event_guest_settings").select("layout_template_id,layout_name,layout_config,layout_width_px,layout_height_px,layout_dpi,layout_version").eq("event_id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("print_jobs").select("status").eq("event_id", eventId).eq("workspace_id", workspace.id),
    supabase.from("templates").select("id,name,description,category,width_px,height_px,dpi,background,layout_config,is_active").eq("is_active", true).or(`is_system.eq.true,workspace_id.eq.${workspace.id}`).order("name"),
  ]);
  if (error) throw new Error(error.message);
  if (jobsError) throw new Error(jobsError.message);
  if (!event) notFound();

  let editor: React.ReactNode = null;
  let preview: React.ReactNode = null;
  let layoutInfo: { name: string; width_px: number; height_px: number; dpi: number; version: number; photo_slots: number } | null = null;
  if (settings?.layout_template_id && settings.layout_config) {
    const { data: source } = await supabase.from("templates").select("id,name,description,category,width_px,height_px,dpi,background,layout_config,is_active").eq("id", settings.layout_template_id).maybeSingle();
    if (source) {
      const template = { ...source, is_active: true, name: settings.layout_name ?? "Event layout", width_px: settings.layout_width_px, height_px: settings.layout_height_px, dpi: settings.layout_dpi, background: { value: (settings.layout_config as { canvas?: { background?: string } }).canvas?.background ?? "#fff" }, layout_config: settings.layout_config };
      const templateChoices = [...(templates ?? [])];
      if (!templateChoices.some((item) => item.id === source.id)) templateChoices.unshift({ ...source, is_active: true });
      const config = settings.layout_config as { elements?: { type?: string }[]; overlay?: { path?: string } };
      layoutInfo = { name: settings.layout_name ?? "Event layout", width_px: settings.layout_width_px, height_px: settings.layout_height_px, dpi: settings.layout_dpi, version: settings.layout_version, photo_slots: config.elements?.filter((element) => element.type === "photo").length ?? 0 };
      preview = <TemplatePreview key={`layout-preview-${eventId}`} template={template} overlayUrl={config.overlay?.path ? `/api/events/${eventId}/layout/overlay` : undefined}/>;
      editor = <TemplateDesigner key={`layout-editor-${eventId}`} template={template} templates={templateChoices} eventId={eventId} eventMeta={{ name: event.name, event_date: event.event_date, status: event.status }} closeHref={`/events/${eventId}`}/>;
    }
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : host?.startsWith("localhost") ? "http" : "https";
  const origin = host ? new URL(`${protocol}://${host}`).origin : new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").origin;
  const portalUrl = `${origin}/e/${event.public_event_code}`;
  const pendingCount = (rows ?? []).filter((job) => ["pending", "accepted"].includes(job.status)).length;

  return <EventOverview event={event} layout={layoutInfo} pendingCount={pendingCount} layoutPreview={preview} layoutEditor={editor} success={query.success} error={query.error}
    qrCard={<EventQrCard key={`event-qr-${eventId}`} url={portalUrl} eventName={event.name} enabled={event.guest_portal_enabled}/>}
    guestPortalToggle={<form action={toggleGuestAccess}><input type="hidden" name="event_id" value={eventId}/><input type="hidden" name="enabled" value={String(!event.guest_portal_enabled)}/><button className="guest-portal-toggle" aria-label={event.guest_portal_enabled ? "Disable guest portal" : "Enable guest portal"} aria-pressed={event.guest_portal_enabled}><span/>{event.guest_portal_enabled ? "Guest portal open" : "Guest portal closed"}</button></form>}
  />;
}
