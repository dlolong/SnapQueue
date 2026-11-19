"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Images, LayoutDashboard, Layers3, Megaphone } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/library", label: "Library", icon: Images },
  { href: "/templates", label: "Templates", icon: Layers3 },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
];

export function MobileNav() {
  const pathname = usePathname();

  return <nav className="mobile-nav" aria-label="Main navigation">
    {items.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} className={`mobile-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
        <Icon size={19} strokeWidth={active ? 2.5 : 2}/>
        <span>{label}</span>
      </Link>;
    })}
  </nav>;
}
