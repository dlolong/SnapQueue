import Link from "next/link";
import { LayoutDashboard, CalendarDays, Images, Layers3, Settings, Megaphone } from "lucide-react";
import { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { MobileNav } from "@/components/mobile-nav";
import { MobileAccountMenu } from "@/components/mobile-account-menu";
import { LogOut } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/library", label: "Photo Library", icon: Images },
  { href: "/templates", label: "Templates", icon: Layers3 },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children, workspaceName, workspaceLogoUrl, email, signOutAction }: { children: ReactNode; workspaceName: string; workspaceLogoUrl: string | null; email: string; signOutAction: () => Promise<void> }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <Link href="/dashboard" className="business-brand" aria-label={`${workspaceName} dashboard`}>
            {workspaceLogoUrl ? <img src={workspaceLogoUrl} alt={`${workspaceName} logo`}/> : <span>{workspaceName}</span>}
          </Link>
          <MobileAccountMenu email={email} signOutAction={signOutAction}/>
        </div>
        <div className="powered-by-brand"><span>Powered by</span><BrandLogo className="powered-by-logo"/></div>
      </div>
      <p className="nav-caption">WORKSPACE</p>
      <nav>{nav.map(({href,label,icon:Icon}) => <Link key={href} href={href} className="nav-link"><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom"><div className="user-row"><div className="user-avatar">{email[0]?.toUpperCase()}</div><span><b>{email}</b><small>Workspace member</small></span><form action={signOutAction}><button className="icon-button" title="Sign out" aria-label="Sign out"><LogOut size={15}/></button></form></div></div>
    </aside>
    <main className="main-area"><div className="page-content">{children}</div></main>
    <MobileNav/>
  </div>;
}
