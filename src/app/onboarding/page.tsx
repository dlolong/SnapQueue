import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/brand-logo";
export default async function OnboardingPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
 const {data:member}=await supabase.from("workspace_members").select("id").eq("user_id",user.id).limit(1).maybeSingle(); if(member) redirect("/dashboard");
 const params=await searchParams;
 return <main className="auth-page"><form action={createWorkspace} className="auth-card"><BrandLogo className="auth-brand-logo"/><h1>Set up your workspace</h1><p>Your business name appears on guest event pages.</p>{params.error&&<p className="form-error">{params.error}</p>}<label>Business name<input name="name" required minLength={2} maxLength={80} placeholder="e.g. Luna Photo Booth"/></label><button className="button">Create workspace</button></form></main>
}
