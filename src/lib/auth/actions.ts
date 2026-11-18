"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=Email%20and%20password%20are%20required");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) redirect("/signup?error=Enter%20an%20email%20and%20password%20of%20at%20least%208%20characters");
  const supabase = await createClient();
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL??"http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({ email, password, options:{emailRedirectTo:`${siteUrl.replace(/\/$/,"")}/auth/callback`} });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  if (!data.session) redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account");
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) redirect("/onboarding?error=Workspace%20name%20must%20be%202-80%20characters");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("workspaces").insert({ name, created_by: user.id });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}
