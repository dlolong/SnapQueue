import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireWorkspace } from "@/lib/workspace";
export default async function EventsPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){
 const {supabase,workspace}=await requireWorkspace();const params=await searchParams;let query=supabase.from("events").select("id,name,event_type,event_date,venue,status,client_name").eq("workspace_id",workspace.id).order("event_date",{ascending:false});
 if(params.q)query=query.or(`name.ilike.%${params.q.replace(/[,%()]/g,"")}%,venue.ilike.%${params.q.replace(/[,%()]/g,"")}%`);
 if(params.status&&["draft","active","completed","archived"].includes(params.status))query=query.eq("status",params.status);
 const {data,error}=await query;
 return <><PageHeader eyebrow="WORKSPACE" title="Events" description="Create and organize photobooth events." action={<Link className="button" href="/events/new"><Plus size={16}/> Create event</Link>}/>
 <form className="filter-bar"><input name="q" defaultValue={params.q} placeholder="Search event or venue"/><select name="status" defaultValue={params.status??""}><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select><button className="button secondary">Filter</button></form>
 {error?<section className="section-card"><p className="form-error">Unable to load events: {error.message}</p></section>:data?.length?<section className="section-card table-wrap"><table><thead><tr><th>Event</th><th>Type</th><th>Date</th><th>Venue</th><th>Client</th><th>Status</th></tr></thead><tbody>{data.map(e=><tr key={e.id}><td><Link href={`/events/${e.id}`}><b>{e.name}</b></Link></td><td>{e.event_type}</td><td>{e.event_date||"—"}</td><td>{e.venue||"—"}</td><td>{e.client_name||"—"}</td><td><span className="tag">{e.status}</span></td></tr>)}</tbody></table></section>:<div className="empty-card"><div className="empty-icon"><CalendarDays size={22}/></div><h3>{params.q||params.status?"No matching events":"No events yet"}</h3><p>Create your first event to organize photo sessions.</p><Link className="button" href="/events/new">Create your first event</Link></div>}</>}
