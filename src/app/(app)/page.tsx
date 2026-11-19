import Link from "next/link";
import { ArrowUpRight, CalendarDays, Images, Layers3, Plus, Printer, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/workspace";

export default async function DashboardPage() {
  const { supabase, workspace } = await requireWorkspace();
  const [totalEvents, activeEvents, printJobs, printableImages, pendingJobs, completedJobs, recentEvents, recentJobs] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "active"),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("printable_images").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["pending", "accepted"]),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "printed"),
    supabase.from("events").select("id,name,event_date,status,venue").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("print_jobs").select("id,queue_number,status,submitted_at,print_quantity,print_size,event_id,events(name)").eq("workspace_id", workspace.id).order("submitted_at", { ascending: false }).limit(8),
  ]);
  const stats = [
    ["Total Events", totalEvents.count ?? 0, CalendarDays],
    ["Active Events", activeEvents.count ?? 0, CalendarDays],
    ["Total Print Jobs", printJobs.count ?? 0, ReceiptText],
    ["Printable Images", printableImages.count ?? 0, Images],
    ["Pending Print Jobs", pendingJobs.count ?? 0, Printer],
    ["Completed Print Jobs", completedJobs.count ?? 0, Printer],
  ] as const;
  const queryError = [totalEvents, activeEvents, printJobs, printableImages, pendingJobs, completedJobs, recentEvents, recentJobs].find((result) => result.error)?.error;

  return <>
    <PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Events, print jobs, and finished compositions across your workspace." action={<Link className="button" href="/events/new"><Plus size={16}/> Create event</Link>}/>
    {queryError && <p className="form-error">Unable to load dashboard data: {queryError.message}</p>}
    <div className="stats-grid">{stats.map(([label, value, Icon]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={16}/></span></div><div className="stat-value">{value}</div><div className="stat-note">Workspace total</div></div>)}</div>
    <div className="content-grid">
      <section className="panel"><div className="panel-heading"><h2>Recent events</h2><Link href="/events">View all <ArrowUpRight size={12}/></Link></div>{recentEvents.error?<p className="form-error">Could not load events: {recentEvents.error.message}</p>:recentEvents.data?.length?<div className="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Status</th><th/></tr></thead><tbody>{recentEvents.data.map((event)=><tr key={event.id}><td><Link href={`/events/${event.id}`}>{event.name}</Link></td><td>{event.event_date||"—"}</td><td>{event.status}</td><td>{event.venue||""}</td></tr>)}</tbody></table></div>:<div className="empty-inline">No events yet. Create one to get started.</div>}</section>
      <section className="panel"><div className="panel-heading"><h2>Recent print jobs</h2><Link href="/events">Open events <ArrowUpRight size={12}/></Link></div>{recentJobs.error?<p className="form-error">Could not load print jobs: {recentJobs.error.message}</p>:recentJobs.data?.length?<div className="table-wrap"><table><thead><tr><th>Queue</th><th>Event</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{recentJobs.data.map((job)=>{const event=Array.isArray(job.events)?job.events[0]:job.events;return <tr key={job.id}><td><Link href={`/events/${job.event_id}/queue`}>{job.queue_number}</Link><small className="dashboard-job-meta">{job.print_quantity} × {job.print_size}</small></td><td>{event?.name??"Event"}</td><td>{job.status.replaceAll("_"," ")}</td><td>{new Date(job.submitted_at).toLocaleDateString()}</td></tr>})}</tbody></table></div>:<div className="empty-inline">Guest print jobs will appear here.</div>}</section>
    </div>
    <section className="panel dashboard-activity" style={{ marginTop: 24 }}><div className="panel-heading"><h2>Quick actions</h2></div><div className="quick-actions"><Link href="/events/new" className="quick-action"><span className="quick-icon"><CalendarDays size={17}/></span><span><b>Create an event</b><small>Configure a layout and guest QR link</small></span></Link><Link href="/templates" className="quick-action"><span className="quick-icon"><Layers3 size={17}/></span><span><b>Browse templates</b><small>Choose a reusable event starting layout</small></span></Link></div></section>
  </>;
}
