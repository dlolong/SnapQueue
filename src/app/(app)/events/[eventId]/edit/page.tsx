import Link from "next/link";
import { notFound } from "next/navigation";
import { EventOverviewHeader, EventTabs } from "@/components/events/event-navigation";
import { requireWorkspace } from "@/lib/workspace";
import { saveEvent } from "@/lib/data/actions";

export default async function EditEvent({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ eventId }, { error }, { supabase, workspace }] = await Promise.all([params, searchParams, requireWorkspace()]);
  const { data: event, error: loadError } = await supabase.from("events").select("*").eq("id", eventId).eq("workspace_id", workspace.id).maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!event) notFound();

  return <div className="event-details-page">
    <EventOverviewHeader event={event} showEditLink={false}/>
    <EventTabs eventId={event.id} active="overview"/>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="section-card event-form-card">
      <div className="event-form-intro"><div><h2>Edit event</h2><p>Update the details guests and your workspace see.</p></div></div>
      <form action={saveEvent} className="event-form">
        <input type="hidden" name="id" value={event.id}/>
        <input type="hidden" name="primary_color" value={event.primary_color ?? "#6658e8"}/>
        <input type="hidden" name="secondary_color" value={event.secondary_color ?? "#171b25"}/>
        <section className="event-form-section">
          <h3>Event details</h3>
          <div className="event-form-grid">
            <div className="field"><label htmlFor="event-name">Event name</label><input id="event-name" name="name" required minLength={2} maxLength={120} defaultValue={event.name}/></div>
            <div className="field"><label htmlFor="event-type">Event type</label><select id="event-type" name="event_type" defaultValue={event.event_type}>{["Birthday","Wedding","Corporate","School","Mall / Walk-in","Private Party","Other"].map(type=><option key={type}>{type}</option>)}</select></div>
            <div className="field"><label htmlFor="event-date">Start date</label><input id="event-date" name="event_date" type="date" defaultValue={event.event_date ?? ""}/></div>
            <div className="field"><label htmlFor="event-status">Event status</label><select id="event-status" name="status" defaultValue={event.status}>{["draft","active","completed","archived"].map(status=><option key={status} value={status}>{status[0].toUpperCase()+status.slice(1)}</option>)}</select></div>
          </div>
        </section>
        <section className="event-form-section">
          <h3>Venue and client</h3>
          <div className="event-form-grid">
            <div className="field"><label htmlFor="event-venue">Venue</label><input id="event-venue" name="venue" maxLength={160} defaultValue={event.venue ?? ""} placeholder="Venue name or address"/></div>
            <div className="field"><label htmlFor="event-client">Client name</label><input id="event-client" name="client_name" maxLength={120} defaultValue={event.client_name ?? ""}/></div>
            <div className="field"><label htmlFor="event-contact">Client contact</label><input id="event-contact" name="client_contact" maxLength={160} defaultValue={event.client_contact ?? ""} placeholder="Email or phone number"/></div>
          </div>
        </section>
        <details className="event-optional-details">
          <summary>More details and schedule</summary>
          <div className="event-form-grid event-optional-grid">
            <div className="field"><label htmlFor="event-start-time">Start time</label><input id="event-start-time" name="start_time" type="time" defaultValue={event.start_time ?? ""}/></div>
            <div className="field"><label htmlFor="event-end-time">End time</label><input id="event-end-time" name="end_time" type="time" defaultValue={event.end_time ?? ""}/></div>
            <div className="field event-form-full"><label htmlFor="event-description">Description</label><textarea id="event-description" name="description" maxLength={1000} defaultValue={event.description ?? ""} placeholder="Optional event details"/></div>
          </div>
        </details>
        <footer className="event-form-actions"><Link className="button secondary" href={`/events/${event.id}`}>Cancel</Link><button className="button">Save changes</button></footer>
      </form>
    </section>
  </div>;
}
