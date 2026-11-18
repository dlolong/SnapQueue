import Link from "next/link";
import { CalendarDays, Camera, Images, Download, Plus, ArrowUpRight, Layers3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/workspace";
export default async function DashboardPage() {
 const {supabase,workspace}=await requireWorkspace();
 const [events,sessions,photos,exports,recent]=await Promise.all([
  supabase.from("events").select("id",{count:"exact",head:true}).eq("workspace_id",workspace.id),
  supabase.from("photo_sessions").select("id",{count:"exact",head:true}).eq("workspace_id",workspace.id),
  supabase.from("photos").select("id",{count:"exact",head:true}).eq("workspace_id",workspace.id),
  supabase.from("session_exports").select("id",{count:"exact",head:true}).eq("workspace_id",workspace.id),
  supabase.from("events").select("id,name,event_date,status,venue").eq("workspace_id",workspace.id).order("created_at",{ascending:false}).limit(5)
 ]);
 const stats=[{label:"Total Events",value:events.count??0,note:"Events in your workspace",icon:CalendarDays},{label:"Photo Sessions",value:sessions.count??0,note:"Sessions created",icon:Camera},{label:"Uploaded Photos",value:photos.count??0,note:"Photos in your library",icon:Images},{label:"Exported Designs",value:exports.count??0,note:"Finished compositions",icon:Download}];
 const statsError=[events,sessions,photos,exports].find(result=>result.error)?.error;
 return <><PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Your photobooth workspace at a glance." action={<Link className="button" href="/sessions/new"><Plus size={16}/> New photo session</Link>}/>
  {statsError&&<p className="form-error">Unable to load all dashboard statistics: {statsError.message}</p>}
  <div className="stats-grid">{stats.map(({label,value,note,icon:Icon})=><div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={16}/></span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</div>
  <div className="content-grid"><section className="panel"><div className="panel-heading"><h2>Recent events</h2><Link href="/events">View all <ArrowUpRight size={12}/></Link></div>{recent.error?<p className="form-error">Could not load events: {recent.error.message}</p>:recent.data?.length?<div className="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Status</th><th/></tr></thead><tbody>{recent.data.map(e=><tr key={e.id}><td><Link href={`/events/${e.id}`}>{e.name}</Link></td><td>{e.event_date||"—"}</td><td>{e.status}</td><td>{e.venue||""}</td></tr>)}</tbody></table></div>:<div className="empty-inline">No events yet. Create one to get started.</div>}</section>
  <section className="panel"><div className="panel-heading"><h2>Quick actions</h2></div><div className="quick-actions"><Link href="/events/new" className="quick-action"><span className="quick-icon"><CalendarDays size={17}/></span><span><b>Create an event</b><small>Set up a birthday, wedding, or event</small></span></Link><Link href="/sessions/new" className="quick-action"><span className="quick-icon"><Camera size={17}/></span><span><b>Start a photo session</b><small>Upload photos and create a design</small></span></Link><Link href="/templates" className="quick-action"><span className="quick-icon"><Layers3 size={17}/></span><span><b>Browse templates</b><small>Choose a layout for your photos</small></span></Link></div></section></div>
 </>;
}
