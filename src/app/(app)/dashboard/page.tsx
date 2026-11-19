import Link from "next/link";
import { ArrowUpRight, CalendarDays, Images, Layers3, Plus, Printer, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/workspace";
import { formatEventTime } from "@/lib/events/format";

function relativeSubmissionTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function DashboardPage() {
  const { supabase, workspace } = await requireWorkspace();
  const [totalEvents, activeEvents, printJobs, printableImages, pendingJobs, completedJobs, recentEvents, recentJobs] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("printable_images").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["pending", "accepted"]),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "printed"),
    supabase.from("events").select("id,name,event_date,start_time,end_time,status,venue").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("print_jobs").select("id,queue_number,status,submitted_at,print_quantity,print_size,event_id,events(name)").eq("workspace_id", workspace.id).order("submitted_at", { ascending: false }).limit(8),
  ]);
  const stats = [
    ["Total Events", totalEvents.count ?? 0, CalendarDays, "/events", "Browse events"],
    ["Active Events", activeEvents.count ?? 0, CalendarDays, "/events?status=active", "View active events"],
    ["Total Print Jobs", printJobs.count ?? 0, ReceiptText, "/events", "Open event queues"],
    ["Printable Images", printableImages.count ?? 0, Images, "/library", "Open photo library"],
    ["Pending Print Jobs", pendingJobs.count ?? 0, Printer, "/events", "Review event queues"],
    ["Completed Print Jobs", completedJobs.count ?? 0, Printer, "/events", "Open event queues"],
  ] as const;
  const queryError = [totalEvents, activeEvents, printJobs, printableImages, pendingJobs, completedJobs, recentEvents, recentJobs].find((result) => result.error)?.error;

  return <>
    <PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Events, print jobs, and finished compositions across your workspace." action={<Link className="button" href="/events/new"><Plus size={16}/> Create event</Link>}/>
    {queryError && <p className="form-error">Unable to load dashboard data: {queryError.message}</p>}
    <div className="stats-grid dashboard-stats">{stats.map(([label, value, Icon, href, note]) => <Link className="stat-card dashboard-stat-card" href={href} key={label}>
      <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={16}/></span></div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </Link>)}</div>
    <div className="content-grid">
      <section className="panel"><div className="panel-heading"><h2>Recent events</h2><Link href="/events">View all <ArrowUpRight size={12}/></Link></div>{recentEvents.error?<p className="form-error">Could not load events: {recentEvents.error.message}</p>:recentEvents.data?.length?<div className="table-wrap"><table><thead><tr><th>Event</th><th>Schedule</th><th>Status</th><th/></tr></thead><tbody>{recentEvents.data.map((event)=><tr key={event.id}><td><Link href={`/events/${event.id}`}>{event.name}</Link></td><td>{event.event_date||"Date not set"} · {formatEventTime(event.start_time)||"Start time not set"} – {formatEventTime(event.end_time)||"End time not set"}</td><td>{event.status}</td><td>{event.venue||""}</td></tr>)}</tbody></table></div>:<div className="empty-inline">No events yet. Create one to get started.</div>}</section>
      <section className="panel dashboard-jobs-panel"><div className="panel-heading"><h2>Recent print jobs</h2><Link href="/events">Open events <ArrowUpRight size={12}/></Link></div>{recentJobs.error?<p className="form-error">Could not load print jobs: {recentJobs.error.message}</p>:recentJobs.data?.length?<div className="dashboard-jobs-list">{recentJobs.data.map((job)=>{
        const event=Array.isArray(job.events)?job.events[0]:job.events;
        const submitted=new Date(job.submitted_at);
        const isNew=Date.now()-submitted.getTime()<15*60_000;
        return <article className="dashboard-job-row" key={job.id}>
          <div className="dashboard-job-order"><Link href={`/events/${job.event_id}/queue`}>Queue {job.queue_number}</Link><small>{job.print_quantity} × {job.print_size} · {event?.name??"Event"}</small></div>
          <span className={`dashboard-job-status status-${job.status}`}>{job.status.replaceAll("_"," ")}</span>
          <div className="dashboard-job-time">{isNew&&<span className="dashboard-new-badge">New</span>}<strong>{relativeSubmissionTime(job.submitted_at)}</strong><time dateTime={job.submitted_at}>{submitted.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</time></div>
        </article>;
      })}</div>:<div className="empty-inline">Guest print jobs will appear here.</div>}</section>
    </div>
    <section className="panel dashboard-activity" style={{ marginTop: 24 }}><div className="panel-heading"><h2>Quick actions</h2></div><div className="quick-actions"><Link href="/events/new" className="quick-action"><span className="quick-icon"><CalendarDays size={17}/></span><span><b>Create an event</b><small>Configure a layout and guest QR link</small></span></Link><Link href="/templates" className="quick-action"><span className="quick-icon"><Layers3 size={17}/></span><span><b>Browse templates</b><small>Choose a reusable event starting layout</small></span></Link></div></section>
  </>;
}
