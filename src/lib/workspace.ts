import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership, error } = await supabase.from("workspace_members")
    .select("workspace_id, role, workspaces(id,name,logo_path)").eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(`Unable to load workspace: ${error.message}`);
  if (!membership) redirect("/onboarding");
  const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
  if (!workspace) redirect("/onboarding");
  return { supabase, user, workspace, role: membership.role };
}
