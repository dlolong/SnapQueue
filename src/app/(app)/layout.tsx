import { AppShell } from "@/components/app-shell";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "@/lib/auth/actions";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}

async function ProtectedShell({children}:{children:React.ReactNode}) {
  const {supabase,user,workspace}=await requireWorkspace();
  const workspaceLogoUrl=workspace.logo_path ? supabase.storage.from("workspace-logos").getPublicUrl(workspace.logo_path).data.publicUrl : null;
  return <AppShell workspaceName={workspace.name} workspaceLogoUrl={workspaceLogoUrl} email={user.email ?? "Account"} signOutAction={signOut}>{children}</AppShell>;
}
