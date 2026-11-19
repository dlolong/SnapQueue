"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Edit2, LayoutTemplate, MapPin, Users } from "lucide-react";
import { EventOverviewHeader, EventTabs, type EventSummary } from "@/components/events/event-navigation";
import { formatEventTime } from "@/lib/events/format";

type Props = {
  event: EventSummary & { venue: string | null; client_name: string | null; client_contact: string | null; description: string | null };
  layout: { name: string; width_px: number; height_px: number; dpi: number; version: number; photo_slots: number } | null;
  pendingCount: number;
  layoutPreview: ReactNode;
  layoutEditor: ReactNode;
  qrCard: ReactNode;
  guestPortalToggle: ReactNode;
  success?: string;
  error?: string;
};

export function EventOverview({ event, layout, pendingCount, layoutPreview, layoutEditor, qrCard, guestPortalToggle, success, error }: Props) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => {
    const close = () => setLayoutOpen(false);
    window.addEventListener("snapqueue:close-event-layout", close);
    return () => window.removeEventListener("snapqueue:close-event-layout", close);
  }, []);
  return <div className="event-details-page">
    <EventOverviewHeader event={event}/>
    <EventTabs eventId={event.id} active="overview"/>
    {success && <p className="form-success">{success}</p>}{error && <p className="form-error">{error}</p>}
    <div className="event-overview-cards">
      <section className="event-info-card">
        <div className="event-info-card-title"><h2><CalendarDays size={21}/>Event details</h2><Link href={`/events/${event.id}/edit`} aria-label="Edit event details"><Edit2 size={18}/></Link></div>
        <dl><div><dt>Type</dt><dd>{event.event_type}</dd></div><div><dt>Start date</dt><dd>{event.event_date ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "Not set"}</dd></div><div><dt>Start time</dt><dd>{formatEventTime(event.start_time) ?? "—"}</dd></div><div><dt>End time</dt><dd>{formatEventTime(event.end_time) ?? "—"}</dd></div><div><dt>Venue</dt><dd>{event.venue || "—"}</dd></div><div><dt>Client</dt><dd>{event.client_name || "—"}</dd></div><div><dt>Status</dt><dd><span className={`event-header-status status-${event.status}`}>{event.status}</span></dd></div></dl>
        {event.description && <p className="event-info-description">{event.description}</p>}
      </section>
      <section className="event-layout-card">
        <h2><LayoutTemplate size={21}/>Print layout</h2>
        {layout ? <><div className="event-layout-summary"><div className="event-layout-thumb">{layoutPreview}</div><div><strong>{layout.name}</strong><p>{layout.width_px} × {layout.height_px} px · {layout.dpi} DPI</p><p>Version {layout.version} · {layout.photo_slots} photo slots</p></div></div><button type="button" className="button event-layout-update" onClick={() => setLayoutOpen(true)}><Edit2 size={17}/>Update layout</button></> : <><p className="muted">Configure the event’s print layout before opening guest access.</p><Link className="button event-layout-update" href={`/events/${event.id}/layout`}>Configure layout</Link></>}
      </section>
      <section className="event-access-card">
        <div className="event-access-heading"><h2><Users size={21}/>Guest access</h2><span className={event.status === "active" ? "event-access-live" : "event-access-closed"}>{event.status === "active" ? "Open" : "Closed"}</span></div>
        <div className="event-access-content">{qrCard}<div className="event-access-controls"><p>Guests scan to order prints without an account.</p>{guestPortalToggle}</div></div>
        <div className="event-access-queue-count"><MapPin size={15}/>{pendingCount ? `${pendingCount} orders in queue` : "No orders yet"}</div>
      </section>
    </div>
    {layoutOpen && <div className="event-layout-modal-shell" role="presentation" onKeyDown={(eventKey) => { if (eventKey.key === "Escape") setLayoutOpen(false); }}>{layoutEditor}</div>}
  </div>;
}
