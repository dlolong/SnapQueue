import Link from "next/link";
import { Layers3, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/workspace";
import { duplicateTemplate } from "@/lib/data/actions";
import { TemplateArchiveButton } from "@/components/templates/template-archive-button";
import { TemplatePreview } from "@/components/templates/template-preview";
import { DeleteItemButton } from "@/components/delete-item-button";

type SearchParams = { error?: string; success?: string; archived?: string };
type TemplateLayout = { elements?: { type: string }[]; overlay?: { path?: string; width?: number; height?: number } } | null;

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, { supabase, workspace, role }] = await Promise.all([searchParams, requireWorkspace()]);
  const showArchived = params.archived === "true";
  const canEdit = ["owner", "admin", "operator"].includes(role);
  const { data, error } = await supabase.from("templates")
    .select("id,name,description,category,width_px,height_px,dpi,background,is_system,workspace_id,layout_config,is_active")
    .eq("is_active", !showArchived)
    .or(`is_system.eq.true,workspace_id.eq.${workspace.id}`)
    .order("created_at", { ascending: false }).order("name", { ascending: true });

  return <>
    <PageHeader eyebrow="DESIGN" title="Templates" description="Create reusable print layouts, add transparent PNG overlays, and control event availability."
      action={canEdit ? <Link href="/templates/new" className="button"><Plus size={16}/> New template</Link> : undefined}/>
    {params.error && <p className="form-error">{params.error}</p>}
    {params.success && <p className="form-success">{params.success}</p>}
    <div className="template-list-tools">
      <span className="muted">{showArchived ? "Archived templates" : "Active templates"}</span>
      <Link className="button secondary" href={showArchived ? "/templates" : "/templates?archived=true"}>{showArchived ? "Show active" : "Show archived"}</Link>
    </div>
    {error ? <section className="section-card"><p className="form-error">Could not load templates: {error.message}</p></section>
      : <div className="template-grid">
        {data?.map((template) => {
          const layout = template.layout_config as TemplateLayout;
          const slots = layout?.elements?.filter((element) => element.type === "photo").length ?? 0;
          return <article className="stat-card template-card" key={template.id}>
            <TemplatePreview template={template}/>
            <b>{template.name}</b>
            <p className="muted">{(template.width_px / template.dpi).toFixed(2)} × {(template.height_px / template.dpi).toFixed(2)} in · {template.width_px} × {template.height_px}px · {template.dpi} DPI</p>
            <p className="muted">{template.description || `${slots} photo slots`} · {template.category}</p>
            <span className="tag">{template.is_system ? "System template" : showArchived ? "Archived" : "Workspace template"}</span>
            {layout?.overlay?.path && <p className="muted">PNG overlay · {layout.overlay.width} × {layout.overlay.height}px</p>}
            {template.is_system
              ? <form action={duplicateTemplate}><input type="hidden" name="template_id" value={template.id}/><button className="button secondary">Duplicate to customize</button></form>
              : <div className="template-card-actions">
                {!showArchived && canEdit && <>
                  <Link className="button secondary" href={`/templates/${template.id}/edit`}>Edit template</Link>
                  <form action={duplicateTemplate}><input type="hidden" name="template_id" value={template.id}/><button className="button secondary">Duplicate</button></form>
                </>}
                {canEdit && <>
                  <TemplateArchiveButton id={template.id} active={!showArchived}/>
                  <DeleteItemButton endpoint="/api/templates" requestBody={{ id: template.id }} label="Delete"
                    confirmMessage={`Permanently delete the template “${template.name}”? This cannot be undone. Templates currently used by an event or print job must be replaced before deletion.`}/>
                </>}
              </div>}
          </article>;
        })}
        {!data?.length && <div className="empty-card"><div className="empty-icon"><Layers3 size={22}/></div><h3>{showArchived ? "No archived templates" : "No templates available"}</h3><p>{showArchived ? "Archived templates can be restored when needed." : "Create a reusable print layout or duplicate a system template."}</p>{!showArchived && canEdit && <Link href="/templates/new" className="button">Create template</Link>}</div>}
      </div>}
  </>;
}
