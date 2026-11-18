"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
const field=(fd:FormData,key:string)=>String(fd.get(key)??"").trim();
const int=(fd:FormData,key:string,fallback:number)=>{const n=Number(field(fd,key));return Number.isInteger(n)?n:fallback};
function fail(eventId:string,message:string):never{redirect(`/events/${eventId}/guest?error=${encodeURIComponent(message)}`)}
export async function saveGuestSettings(fd:FormData){
 const {supabase,workspace}=await requireWorkspace();const eventId=field(fd,"event_id");const {data:event}=await supabase.from("events").select("id").eq("id",eventId).eq("workspace_id",workspace.id).maybeSingle();if(!event)fail(eventId,"Event not found");
 const printSizes=fd.getAll("print_sizes").map(String);const packagesText=field(fd,"print_packages");let printPackages:unknown;try{printPackages=JSON.parse(packagesText)}catch{fail(eventId,"Print packages must be valid JSON")}
 if(!Array.isArray(printPackages)||!printPackages.length||printPackages.length>12)fail(eventId,"Configure between 1 and 12 print packages");
 const templateIds=[...new Set(fd.getAll("template_ids").map(String))];
 const settings={print_sizes:printSizes,print_packages:printPackages,max_photos_per_guest:int(fd,"max_photos_per_guest",8),max_photo_size_bytes:int(fd,"max_photo_size_mb",10)*1024*1024,max_print_quantity:int(fd,"max_print_quantity",10),approval_mode:field(fd,"approval_mode"),guest_instructions:field(fd,"guest_instructions"),marketing_consent_enabled:fd.get("marketing_consent_enabled")==="on",photo_retention_days:int(fd,"photo_retention_days",30)};
 if(!printSizes.length)fail(eventId,"Select at least one print size");
 if(settings.max_photos_per_guest<1||settings.max_photos_per_guest>20)fail(eventId,"Photos per guest must be between 1 and 20");
 if(settings.max_photo_size_bytes<1024*1024||settings.max_photo_size_bytes>20*1024*1024)fail(eventId,"Photo size must be between 1 and 20 MB");
 if(settings.max_print_quantity<1||settings.max_print_quantity>100)fail(eventId,"Print quantity must be between 1 and 100");
 if(!["automatic","manual"].includes(settings.approval_mode))fail(eventId,"Select automatic or manual approval");
 if(settings.photo_retention_days<1||settings.photo_retention_days>365)fail(eventId,"Photo retention must be 1–365 days");
 const {error}=await supabase.rpc("save_event_guest_settings",{p_event_id:eventId,p_settings:settings,p_template_ids:templateIds});if(error)fail(eventId,error.message);
 revalidatePath(`/events/${eventId}`);revalidatePath(`/events/${eventId}/guest`);revalidatePath(`/events/${eventId}/queue`);redirect(`/events/${eventId}/guest?success=Guest%20settings%20saved`);
}
export async function toggleGuestAccess(fd:FormData){const {supabase,workspace}=await requireWorkspace();const eventId=field(fd,"event_id");const enabled=field(fd,"enabled")==="true";const {data:event,error:loadError}=await supabase.from("events").select("id,status").eq("id",eventId).eq("workspace_id",workspace.id).maybeSingle();if(loadError||!event)fail(eventId,loadError?.message??"Event not found");if(enabled&&event.status!=="active")fail(eventId,"Set the event status to Active before enabling guest ordering");const {error}=await supabase.from("events").update({guest_portal_enabled:enabled}).eq("id",eventId).eq("workspace_id",workspace.id);if(error)fail(eventId,error.message);revalidatePath(`/events/${eventId}`);revalidatePath(`/events/${eventId}/guest`);redirect(`/events/${eventId}/guest?success=Guest%20access%20${enabled?"enabled":"disabled"}`)}
export async function rotateGuestCode(fd:FormData){const {supabase,workspace}=await requireWorkspace();const eventId=field(fd,"event_id");const newCode=randomBytes(24).toString("hex");const {error}=await supabase.from("events").update({public_event_code:newCode,guest_portal_enabled:false}).eq("id",eventId).eq("workspace_id",workspace.id);if(error)fail(eventId,error.message);revalidatePath(`/events/${eventId}`);revalidatePath(`/events/${eventId}/guest`);redirect(`/events/${eventId}/guest?success=Code%20regenerated.%20Guest%20access%20is%20disabled%20until%20you%20enable%20it.`)}
