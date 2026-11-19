import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";

const links = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="marketing-site">
    <header className="marketing-header">
      <Link href="/" className="marketing-brand" aria-label="SnapQueue home"><BrandLogo className="marketing-logo"/></Link>
      <nav className="marketing-nav" aria-label="Main navigation">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="marketing-header-actions"><Link href="/login" className="marketing-login">Log in</Link><Link href="/signup" className="marketing-button small">Get started</Link></div>
      <details className="marketing-mobile-menu">
        <summary aria-label="Open navigation menu"><span/><span/></summary>
        <nav aria-label="Mobile navigation">
          {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          <Link href="/login">Log in</Link>
          <Link href="/signup" className="marketing-button">Get started</Link>
        </nav>
      </details>
    </header>
    <main>{children}</main>
    <footer className="marketing-footer">
      <Link href="/" className="marketing-footer-brand"><BrandLogo className="marketing-logo"/></Link>
      <span>Photo booth operations, all in one queue.</span>
      <nav aria-label="Footer navigation">{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>
      <small>© {new Date().getFullYear()} SnapQueue</small>
    </footer>
  </div>;
}
