import Link from "next/link";
import { CalendarDays, Camera, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/workspace";
import { formatEventTime } from "@/lib/events/format";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [{ supabase, workspace }, params] = await Promise.all([requireWorkspace(), searchParams]);
  const [{ data: events, error }, { data: jobs, error: jobsError }] = await Promise.all([
    supabase.from("events").select("id,name,event_type,event_date,start_time,end_time,venue,status,client_name").eq("workspace_id", workspace.id).order("event_date", { ascending: false }),
    supabase.from("print_jobs").select("event_id,status").eq("workspace_id", workspace.id),
  ]);
  const filtered = (events ?? []).filter((event) => {
    if (params.status && event.status !== params.status) return false;
    const query = params.q?.trim().toLowerCase();
    return !query || [event.name, event.venue ?? "", event.client_name ?? "", event.event_type].some((value) => value.toLowerCase().includes(query));
  });
  const counts = new Map<string, number>();
  (events ?? []).forEach((event) => counts.set(event.status, (counts.get(event.status) ?? 0) + 1));
  const jobCounts = new Map<string, number>();
  (jobs ?? []).forEach((job) => { if (["pending", "accepted"].includes(job.status)) jobCounts.set(job.event_id, (jobCounts.get(job.event_id) ?? 0) + 1); });
  const statuses = [["", "All", events?.length ?? 0], ["active", "Active", counts.get("active") ?? 0], ["draft", "Draft", counts.get("draft") ?? 0], ["completed", "Completed", counts.get("completed") ?? 0]] as const;

  return <>
    <PageHeader eyebrow="WORKSPACE" title="Events" description="Create and organize photobooth events." action={<Link className="button event-create-button" href="/events/new"><Plus size={18}/> Create event</Link>}/>
    <div className="events-filter-row">
      <form className="events-search"><span aria-hidden="true">⌕</span><input name="q" defaultValue={params.q} placeholder="Search event or venue"/><input type="hidden" name="status" value={params.status ?? ""}/><button aria-label="Search events">Search</button></form>
      <nav className="event-status-filters" aria-label="Filter events by status">{statuses.map(([status, label, count]) => <Link key={label} href={`/events?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status ? { status } : {}) }).toString()}`} className={(params.status ?? "") === status ? "active" : ""}>{label}<b>{count}</b></Link>)}</nav>
    </div>
    {(error || jobsError) ? <section className="section-card"><p className="form-error">Unable to load events: {(error ?? jobsError)?.message}</p></section>
      : filtered.length ? <div className="event-card-grid">{filtered.map((event, index) => <Link className={`event-card event-card-tone-${index % 3}`} key={event.id} href={`/events/${event.id}`}>
        <div className="event-card-banner"><Camera size={42}/><span className={`event-status-chip status-${event.status}`}>{event.status}</span></div>
        <div className="event-card-content"><h2>{event.name}</h2><p className="event-card-date"><CalendarDays size={17}/>{event.event_date ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "Date not set"} · Start {formatEventTime(event.start_time) ?? "not set"} · End {formatEventTime(event.end_time) ?? "not set"} · {event.event_type}</p><div className="event-card-meta"><span>{event.venue || "No venue set"}</span><b>{jobCounts.get(event.id) ? `${jobCounts.get(event.id)} in queue` : "No orders yet"}</b></div></div>
      </Link>)}</div>
      : <div className="empty-card"><div className="empty-icon"><CalendarDays size={22}/></div><h3>{params.q || params.status ? "No matching events" : "No events yet"}</h3><p>Create your first event to organize the layout, guest QR code, and print queue.</p><Link className="button" href="/events/new">Create your first event</Link></div>}
  </>;
}
