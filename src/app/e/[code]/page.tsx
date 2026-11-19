import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/guest/security";
import { GuestPortal } from "@/components/guest/guest-portal";
export const dynamic="force-dynamic";
export default async function GuestEventPage({params}:{params:Promise<{code:string}>}){const {code}=await params;if(!/^[a-f0-9]{48}$/.test(code))notFound();const supabase=await createClient();let allowed:boolean;try{allowed=await rateLimit(await headers(),code,"event-page",120,60)}catch{return <main className="guest-page"><p className="form-error">The event portal is temporarily unavailable. Please retry in a moment.</p></main>}if(!allowed)return <main className="guest-page"><p className="form-error">Too many requests. Please try again shortly.</p></main>;const {data,error}=await supabase.rpc("get_public_guest_event",{p_code:code});if(error||!data)notFound();const workspaceLogoUrl=data.workspace_logo_path?supabase.storage.from("workspace-logos").getPublicUrl(data.workspace_logo_path).data.publicUrl:null;const event={...data,workspace_logo_url:workspaceLogoUrl,layout:{...data.layout,id:data.layout.template_id}};return <main className="guest-page"><GuestPortal event={event} code={code}/></main>}
