import Link from "next/link";
import { Camera, LayoutDashboard, CalendarDays, Images, Layers3, Settings, Sparkles } from "lucide-react";
import { ReactNode } from "react";
import { LogOut } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/sessions", label: "Photo Sessions", icon: Camera },
  { href: "/templates", label: "Templates", icon: Layers3 },
  { href: "/library", label: "Photo Library", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children, workspaceName, email, signOutAction }: { children: ReactNode; workspaceName: string; email: string; signOutAction: () => Promise<void> }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Camera size={19}/></span><span>Snap<span className="brand-accent">Queue</span></span></Link>
      <div className="workspace-switch"><span className="workspace-avatar">{workspaceName[0]?.toUpperCase()}</span><span><b>{workspaceName}</b><small>Workspace</small></span></div>
      <p className="nav-caption">WORKSPACE</p>
      <nav>{nav.map(({href,label,icon:Icon}) => <Link key={href} href={href} className="nav-link"><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom"><div className="plan-card"><Sparkles size={17}/><b>SnapQueue</b><p>Manage events, sessions, and print-ready designs.</p><Link href="/settings">Workspace settings →</Link></div><div className="user-row"><div className="user-avatar">{email[0]?.toUpperCase()}</div><span><b>{email}</b><small>Workspace member</small></span><form action={signOutAction}><button className="icon-button" title="Sign out" aria-label="Sign out"><LogOut size={15}/></button></form></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="topbar-label">Photobooth workspace <span>/</span> <b>Overview</b></div><div className="topbar-right"><span className="status-dot"/> <span>Workspace ready</span><div className="top-avatar">U</div></div></header><div className="page-content">{children}</div></main>
  </div>;
}
