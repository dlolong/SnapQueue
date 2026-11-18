"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";

const val=(fd:FormData,key:string)=>String(fd.get(key)??"").trim();
export async function saveEvent(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace(); const id=val(fd,"id"); const name=val(fd,"name");
 if(name.length<2||name.length>120) redirect(`/events/${id?`${id}/edit`:"new"}?error=Event%20name%20must%20be%202-120%20characters`);
 const primaryColor=val(fd,"primary_color");const secondaryColor=val(fd,"secondary_color");if((primaryColor&&!/^#[0-9a-fA-F]{6}$/.test(primaryColor))||(secondaryColor&&!/^#[0-9a-fA-F]{6}$/.test(secondaryColor)))redirect(`/events/${id?`${id}/edit`:"new"}?error=Brand%20colors%20must%20be%20six-digit%20hex%20values`);const row={name,description:val(fd,"description")||null,event_type:val(fd,"event_type")||"Other",primary_color:primaryColor||null,secondary_color:secondaryColor||null,event_date:val(fd,"event_date")||null,start_time:val(fd,"start_time")||null,end_time:val(fd,"end_time")||null,venue:val(fd,"venue")||null,client_name:val(fd,"client_name")||null,client_contact:val(fd,"client_contact")||null,status:val(fd,"status")||"draft"};
 const {data,error}=id?await supabase.from("events").update(row).eq("id",id).eq("workspace_id",workspace.id).select("id").single():await supabase.from("events").insert({...row,workspace_id:workspace.id}).select("id").single();
 if(error||!data) redirect(`/events/${id?`${id}/edit`:"new"}?error=${encodeURIComponent(error?.message??"Unable to save event")}`);
 revalidatePath("/events"); revalidatePath("/"); redirect(`/events/${data.id}`);
}
export async function deleteEvent(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace(); const id=val(fd,"id");
 const {error}=await supabase.from("events").delete().eq("id",id).eq("workspace_id",workspace.id);
 if(error) redirect(`/events/${id}?error=${encodeURIComponent(error.message)}`);
 revalidatePath("/events"); redirect("/events");
}
export async function createSession(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace(); const type=val(fd,"session_type")==="event"?"event":"walk_in"; const eventId=val(fd,"event_id")||null;
 if(type==="event"&&!eventId) redirect("/sessions/new?error=Choose%20an%20event");
 if(eventId){const {data,error}=await supabase.from("events").select("id").eq("id",eventId).eq("workspace_id",workspace.id).maybeSingle();if(error||!data)redirect("/sessions/new?error=That%20event%20is%20not%20available");}
 const {data,error}=await supabase.rpc("create_photo_session",{p_workspace_id:workspace.id,p_event_id:eventId,p_session_type:type,p_customer_name:val(fd,"customer_name")||null,p_customer_contact:val(fd,"customer_contact")||null});
 if(error||!data) redirect(`/sessions/new?error=${encodeURIComponent(error?.message??"Unable to create session")}`);
 revalidatePath("/sessions"); redirect(`/sessions/${data}/editor`);
}
export async function duplicateTemplate(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace();const id=val(fd,"template_id");
 const {data:source,error:readError}=await supabase.from("templates").select("name,description,category,width_px,height_px,width_inches,height_inches,unit,dpi,background,layout_config").eq("id",id).eq("is_active",true).maybeSingle();
 if(readError||!source)redirect(`/templates?error=${encodeURIComponent(readError?.message??"Template unavailable")}`);
 const {error}=await supabase.from("templates").insert({...source,name:`${source.name} copy`,workspace_id:workspace.id,is_system:false,is_active:true});
 if(error)redirect(`/templates?error=${encodeURIComponent(error.message)}`);revalidatePath("/templates");
}
export async function customizeTemplate(fd:FormData){const {supabase,workspace}=await requireWorkspace();const id=val(fd,"template_id");const name=val(fd,"name");const color=val(fd,"background");if(name.length<2||name.length>120||!/^#[0-9a-fA-F]{6}$/.test(color))redirect(`/templates?error=Enter%20a%20valid%20name%20and%20hex%20background`);let layout:unknown;try{layout=JSON.parse(val(fd,"layout_config"))}catch{redirect("/templates?error=Template%20layout%20must%20be%20valid%20JSON")}if(!layout||typeof layout!=="object"||!Array.isArray((layout as {elements?:unknown}).elements))redirect("/templates?error=Layout%20JSON%20must%20contain%20an%20elements%20array");const layoutRecord=layout as {canvas?:Record<string,unknown>};if(layoutRecord.canvas)layoutRecord.canvas={...layoutRecord.canvas,background:color};const {error}=await supabase.from("templates").update({name,background:{type:"color",value:color},layout_config:layout,updated_at:new Date().toISOString()}).eq("id",id).eq("workspace_id",workspace.id).eq("is_system",false);if(error)redirect(`/templates?error=${encodeURIComponent(error.message)}`);revalidatePath("/templates")}
export async function saveDesign(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace();const sessionId=val(fd,"session_id");let design:unknown;
 try{design=JSON.parse(val(fd,"design"));}catch{redirect(`/sessions/${sessionId}/editor?error=Invalid%20design%20data`)}
 if(!design||typeof design!=="object"||!("version" in design)||!("elements" in design))redirect(`/sessions/${sessionId}/editor?error=Design%20is%20missing%20required%20fields`);
 const {error}=await supabase.from("photo_sessions").update({design_config:design,status:"editing"}).eq("id",sessionId).eq("workspace_id",workspace.id);
 if(error)redirect(`/sessions/${sessionId}/editor?error=${encodeURIComponent(error.message)}`);revalidatePath(`/sessions/${sessionId}/editor`);
}
export async function updateWorkspace(fd:FormData){const {supabase,workspace}=await requireWorkspace();const name=val(fd,"name");if(name.length<2||name.length>80)redirect("/settings?error=Workspace%20name%20must%20be%202-80%20characters");const {error}=await supabase.from("workspaces").update({name,updated_at:new Date().toISOString()}).eq("id",workspace.id);if(error)redirect(`/settings?error=${encodeURIComponent(error.message)}`);revalidatePath("/");redirect("/settings?success=Workspace%20updated")}
export async function updateSessionStatus(fd:FormData){const {supabase,workspace}=await requireWorkspace();const id=val(fd,"session_id");const status=val(fd,"status");if(!["draft","editing","ready_for_export","exported","archived"].includes(status))redirect(`/sessions/${id}/editor?error=Invalid%20session%20status`);if(status==="exported"){const {data:record}=await supabase.from("session_exports").select("id").eq("session_id",id).eq("workspace_id",workspace.id).limit(1).maybeSingle();if(!record)redirect(`/sessions/${id}/editor?error=Export%20the%20design%20before%20marking%20this%20session%20exported`)}const {error}=await supabase.from("photo_sessions").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("workspace_id",workspace.id);if(error)redirect(`/sessions/${id}/editor?error=${encodeURIComponent(error.message)}`);revalidatePath("/sessions");revalidatePath(`/sessions/${id}/editor`)}
