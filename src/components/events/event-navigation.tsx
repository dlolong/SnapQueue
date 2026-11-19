import Link from "next/link";

export type EventSummary = { id: string; name: string; event_date: string | null; event_type?: string; status: string };
export function EventOverviewHeader({ event, showEditLink = true }: { event: EventSummary; showEditLink?: boolean }) {
  return <header className="event-overview-header">
    <div><nav className="event-breadcrumb"><Link href="/events">Events</Link><span>›</span><b>{event.name}</b></nav><h1>{event.name} <span className={`event-header-status status-${event.status}`}>{event.status}</span></h1><p>{event.event_type ?? "Event"} · {event.event_date ?? "Date not set"}</p></div>
    {showEditLink && <Link className="button secondary" href={`/events/${event.id}/edit`}>Edit Event</Link>}
  </header>;
}

export function EventTabs({ eventId, active }: { eventId: string; active: "overview" | "queue" }) {
  return <nav className="event-primary-tabs" aria-label="Event sections"><Link href={`/events/${eventId}`} className={active === "overview" ? "active" : ""} aria-current={active === "overview" ? "page" : undefined}>Overview</Link><Link href={`/events/${eventId}/queue`} className={active === "queue" ? "active" : ""} aria-current={active === "queue" ? "page" : undefined}>Print Queue</Link></nav>;
}
