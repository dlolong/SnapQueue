import { notFound, redirect } from "next/navigation";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { requireWorkspace } from "@/lib/workspace";

export default async function EventLayoutPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const [{ eventId }, query, { supabase, workspace, role }] = await Promise.all([params, searchParams, requireWorkspace()]);
  if (!["owner", "admin", "operator"].includes(role)) redirect(`/events/${eventId}`);
  const [{ data: event }, { data: settings }, { data: libraryTemplates }] = await Promise.all([
    supabase.from("events").select("id,name,event_date,status").eq("id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("event_guest_settings").select("layout_template_id,layout_name,layout_config,layout_width_px,layout_height_px,layout_dpi,layout_version").eq("event_id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("templates").select("id,name,description,category,width_px,height_px,dpi,background,layout_config,is_active").eq("is_active", true).or(`is_system.eq.true,workspace_id.eq.${workspace.id}`).order("name"),
  ]);
  if (!event || !settings?.layout_template_id || !settings.layout_config) notFound();
  const { data: source } = await supabase.from("templates").select("id,name,description,category,is_active,width_px,height_px,dpi,background,layout_config").eq("id", settings.layout_template_id).maybeSingle();
  if (!source) notFound();
  const template = {
    id: source.id,
    is_active: true,
    name: settings.layout_name ?? "Event layout",
    description: source.description ?? "",
    category: source.category ?? "Event",
    width_px: settings.layout_width_px,
    height_px: settings.layout_height_px,
    dpi: settings.layout_dpi,
    background: { value: (settings.layout_config as { canvas?: { background?: string } }).canvas?.background ?? "#ffffff" },
    layout_config: settings.layout_config,
  };
  const templates = [...(libraryTemplates ?? [])];
  if (!templates.some((item) => item.id === source.id)) templates.unshift({ ...source, is_active: true });
  return <TemplateDesigner template={template} templates={templates} eventId={eventId} eventMeta={event} initialError={query.error} initialSuccess={query.success}/>;
}
