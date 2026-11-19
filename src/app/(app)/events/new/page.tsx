import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { saveEvent } from "@/lib/data/actions";
import { requireWorkspace } from "@/lib/workspace";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, { supabase, workspace }] = await Promise.all([searchParams, requireWorkspace()]);
  const [{ data: templates }, { data: eventLayouts }] = await Promise.all([
    supabase
      .from("templates")
      .select("id,name,width_px,height_px")
      .eq("is_active", true)
      .or(`is_system.eq.true,workspace_id.eq.${workspace.id}`)
      .order("name"),
    supabase
      .from("event_guest_settings")
      .select("event_id,layout_name,events!inner(name,workspace_id)")
      .not("layout_config", "is", null)
      .eq("events.workspace_id", workspace.id)
      .order("updated_at", { ascending: false }),
  ]);
  const hasLayouts = Boolean(templates?.length || eventLayouts?.length);

  return <>
    <PageHeader
      eyebrow="EVENTS"
      title="Create event"
      description="Name your event and choose a starting layout. You can add the other details later."
    />
    <section className="section-card new-event-card">
      {params.error && <p className="form-error" role="alert">{params.error}</p>}
      <form action={saveEvent} className="new-event-form">
        <div className="new-event-field field">
          <label htmlFor="new-event-name">Event name</label>
          <input
            id="new-event-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoFocus
            placeholder="e.g. Ana’s 18th Birthday"
          />
        </div>

        <div className="new-event-field field">
          <label htmlFor="new-event-layout">Starting layout</label>
          {hasLayouts ? <>
            <select id="new-event-layout" name="layout_source" required defaultValue="">
              <option value="" disabled>Choose a layout</option>
              {templates?.length ? <optgroup label="Template library">
                {templates.map((template) => <option key={template.id} value={`template:${template.id}`}>
                  {template.name} · {template.width_px} × {template.height_px}px
                </option>)}
              </optgroup> : null}
              {eventLayouts?.length ? <optgroup label="Copy from an event">
                {eventLayouts.map((item) => {
                  const event = Array.isArray(item.events) ? item.events[0] : item.events;
                  return <option key={item.event_id} value={`event:${item.event_id}`}>
                    {event?.name} · {item.layout_name ?? "Event layout"}
                  </option>;
                })}
              </optgroup> : null}
            </select>
            <small className="muted">This makes a copy for the new event. You can customize it before activating the event.</small>
          </> : <div className="new-event-no-layouts">
            <p>No layouts are available yet. Create a template first, then come back to set up your event.</p>
            <Link className="button secondary" href="/templates/new">Create a template</Link>
          </div>}
        </div>

        <footer className="new-event-actions">
          <Link className="button secondary" href="/events">Cancel</Link>
          <button className="button" disabled={!hasLayouts}>Create event and configure layout</button>
        </footer>
      </form>
    </section>
  </>;
}
