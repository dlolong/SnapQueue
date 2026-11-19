"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { randomUUID } from "node:crypto";

const val=(fd:FormData,key:string)=>String(fd.get(key)??"").trim();
export async function saveEvent(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace(); const id=val(fd,"id"); const name=val(fd,"name");
 if(name.length<2||name.length>120) redirect(`/events/${id?`${id}/edit`:"new"}?error=Event%20name%20must%20be%202-120%20characters`);
 const primaryColor=val(fd,"primary_color");const secondaryColor=val(fd,"secondary_color");if((primaryColor&&!/^#[0-9a-fA-F]{6}$/.test(primaryColor))||(secondaryColor&&!/^#[0-9a-fA-F]{6}$/.test(secondaryColor)))redirect(`/events/${id?`${id}/edit`:"new"}?error=Brand%20colors%20must%20be%20six-digit%20hex%20values`);const row={name,description:val(fd,"description")||null,event_type:val(fd,"event_type")||"Other",primary_color:primaryColor||null,secondary_color:secondaryColor||null,event_date:val(fd,"event_date")||null,start_time:val(fd,"start_time")||null,end_time:val(fd,"end_time")||null,venue:val(fd,"venue")||null,client_name:val(fd,"client_name")||null,client_contact:val(fd,"client_contact")||null,status:val(fd,"status")||"draft"};
 if(!id){
  const source=val(fd,"layout_source");
  const {data:created,error:createError}=await supabase.from("events").insert({...row,status:"draft",workspace_id:workspace.id}).select("id").single();
  if(createError||!created)redirect(`/events/new?error=${encodeURIComponent(createError?.message??"Unable to create event")}`);
  let templateId="",layoutName="",layoutConfig:Record<string,unknown>|null=null;
  if(source.startsWith("template:")){
   templateId=source.slice(9);const {data:t}=await supabase.from("templates").select("id,name,width_px,height_px,dpi,layout_config").eq("id",templateId).eq("is_active",true).or(`is_system.eq.true,workspace_id.eq.${workspace.id}`).maybeSingle();
   if(t){layoutName=t.name;layoutConfig=t.layout_config as Record<string,unknown>}
  }else if(source.startsWith("event:")){
   const sourceEventId=source.slice(6);const {data:s}=await supabase.from("event_guest_settings").select("layout_template_id,layout_name,layout_config").eq("event_id",sourceEventId).eq("workspace_id",workspace.id).maybeSingle();
   if(s?.layout_template_id&&s.layout_config){templateId=s.layout_template_id;layoutName=s.layout_name??"Event layout";layoutConfig=s.layout_config as Record<string,unknown>}
  }
  if(!layoutConfig||!templateId){await supabase.from("events").delete().eq("id",created.id).eq("workspace_id",workspace.id);redirect("/events/new?error=Choose%20a%20valid%20starting%20layout")}
  const rawElements=Array.isArray(layoutConfig.elements)?layoutConfig.elements as Record<string,unknown>[]:[];
  const canvas=(layoutConfig.canvas&&typeof layoutConfig.canvas==="object"?layoutConfig.canvas:{}) as Record<string,unknown>;
  const design={version:2,canvas:{width:Number(canvas.width),height:Number(canvas.height),dpi:Number(canvas.dpi),background:String(canvas.background??"#ffffff")},...(layoutConfig.overlay?{overlay:layoutConfig.overlay}:{}),elements:rawElements.map((e,i)=>{const config=(e.configuration&&typeof e.configuration==="object"?e.configuration:{}) as Record<string,unknown>;return {id:typeof e.id==="string"?e.id:randomUUID(),type:e.type==="text"||e.type==="shape"?e.type:"photo",name:String(e.name??(e.type==="photo"?`Photo ${i+1}`:`Layer ${i+1}`)),required:e.required!==false,slotNumber:Number(e.slotNumber??i+1),x:Number(e.x??0),y:Number(e.y??0),width:Number(e.width??100),height:Number(e.height??100),rotation:Number(e.rotation??0),zIndex:Number(e.zIndex??i),visible:e.visible!==false,locked:e.locked===true,fit:e.fit??config.fit??"cover",cropX:Number(e.cropX??0.5),cropY:Number(e.cropY??0.5),text:String(config.text??e.text??""),fontSize:Number(config.fontSize??e.fontSize??48),color:String(config.color??e.color??"#222222"),align:config.align??e.align??"center"}})};
  const {error:layoutError}=await supabase.rpc("save_event_layout",{p_event_id:created.id,p_template_id:templateId,p_layout_name:layoutName,p_layout_config:design,p_activate:false});
  if(layoutError){await supabase.from("events").delete().eq("id",created.id).eq("workspace_id",workspace.id);redirect(`/events/new?error=${encodeURIComponent(layoutError.message)}`)}
  revalidatePath("/events");redirect(`/events/${created.id}/layout?success=Event%20created.%20Customize%20the%20layout%20or%20activate%20the%20event.`)
 }
 const {data,error}=await supabase.from("events").update(row).eq("id",id).eq("workspace_id",workspace.id).select("id").single();
 if(error||!data) redirect(`/events/${id?`${id}/edit`:"new"}?error=${encodeURIComponent(error?.message??"Unable to save event")}`);
 revalidatePath("/events"); revalidatePath("/"); redirect(`/events/${data.id}`);
}
export async function deleteEvent(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace(); const id=val(fd,"id");
 const {error}=await supabase.from("events").delete().eq("id",id).eq("workspace_id",workspace.id);
 if(error) redirect(`/events/${id}?error=${encodeURIComponent(error.message)}`);
 revalidatePath("/events"); redirect("/events");
}
export async function duplicateTemplate(fd:FormData) {
 const {supabase,workspace}=await requireWorkspace();const id=val(fd,"template_id");
 const {data:source,error:readError}=await supabase.from("templates").select("name,description,category,width_px,height_px,width_inches,height_inches,unit,dpi,background,layout_config").eq("id",id).eq("is_active",true).maybeSingle();
 if(readError||!source)redirect(`/templates?error=${encodeURIComponent(readError?.message??"Template unavailable")}`);
 const {error}=await supabase.from("templates").insert({...source,name:`${source.name} copy`,workspace_id:workspace.id,is_system:false,is_active:true});
 if(error)redirect(`/templates?error=${encodeURIComponent(error.message)}`);revalidatePath("/templates");
}
export async function customizeTemplate(fd:FormData){const {supabase,workspace}=await requireWorkspace();const id=val(fd,"template_id");const name=val(fd,"name");const color=val(fd,"background");if(name.length<2||name.length>120||!/^#[0-9a-fA-F]{6}$/.test(color))redirect(`/templates?error=Enter%20a%20valid%20name%20and%20hex%20background`);let layout:unknown;try{layout=JSON.parse(val(fd,"layout_config"))}catch{redirect("/templates?error=Template%20layout%20must%20be%20valid%20JSON")}if(!layout||typeof layout!=="object"||!Array.isArray((layout as {elements?:unknown}).elements))redirect("/templates?error=Layout%20JSON%20must%20contain%20an%20elements%20array");const layoutRecord=layout as {canvas?:Record<string,unknown>};if(layoutRecord.canvas)layoutRecord.canvas={...layoutRecord.canvas,background:color};const {error}=await supabase.from("templates").update({name,background:{type:"color",value:color},layout_config:layout,updated_at:new Date().toISOString()}).eq("id",id).eq("workspace_id",workspace.id).eq("is_system",false);if(error)redirect(`/templates?error=${encodeURIComponent(error.message)}`);revalidatePath("/templates")}
export async function updateWorkspace(fd:FormData){const {supabase,workspace}=await requireWorkspace();const name=val(fd,"name");if(name.length<2||name.length>80)redirect("/settings?error=Workspace%20name%20must%20be%202-80%20characters");const {error}=await supabase.from("workspaces").update({name,updated_at:new Date().toISOString()}).eq("id",workspace.id);if(error)redirect(`/settings?error=${encodeURIComponent(error.message)}`);revalidatePath("/");redirect("/settings?success=Workspace%20updated")}
