import { AppShell } from "@/components/app-shell";
import { requireWorkspace } from "@/lib/workspace";
import { signOut } from "@/lib/auth/actions";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}

async function ProtectedShell({children}:{children:React.ReactNode}) {
  const {user,workspace}=await requireWorkspace();
  return <AppShell workspaceName={workspace.name} email={user.email ?? "Account"} signOutAction={signOut}>{children}</AppShell>;
}
