import Link from "next/link";
import type { Metadata } from "next";
import { Check, CircleCheck, ImagePlus, LayoutTemplate, Printer, QrCode, ScanLine } from "lucide-react";
import { MarketingLayout } from "@/components/marketing-layout";

export const metadata: Metadata = { title: "SnapQueue | Photo booth print queue", description: "A simple guest photo flow and one clear print queue for your photo booth team." };

export default function HomePage() {
  return <MarketingLayout>
    <section className="marketing-hero">
      <div className="marketing-hero-copy">
        <span className="marketing-kicker"><span/> MADE FOR PHOTO BOOTH TEAMS</span>
        <h1>Every photo finds its way <em>to print.</em></h1>
        <p>Give guests a simple QR flow. Give your team one clear place to review, prepare, and print every order.</p>
        <div className="marketing-hero-actions"><Link href="/signup" className="marketing-button">Create your workspace</Link><Link href="/how-it-works" className="marketing-text-link">See how it works</Link></div>
        <div className="marketing-proofline"><Check size={15}/> Guest uploads <span/> Operator review <span/> Print-ready files</div>
      </div>
      <div className="marketing-demo-wrap" aria-label="Illustration of the SnapQueue print queue">
        <div className="marketing-demo-glow"/>
        <div className="marketing-demo-card">
          <div className="demo-topline"><div><small>DEMO PREVIEW · WORKSPACE</small><strong>Studio queue</strong></div><span className="demo-live"><i/> READY</span></div>
          <div className="demo-event"><div className="demo-event-icon"><QrCode size={20}/></div><div><small>EXAMPLE EVENT</small><strong>Summer rooftop party</strong></div><span>Active</span></div>
          <div className="demo-section-title"><strong>Print queue</strong><span>3 orders</span></div>
          <div className="demo-order demo-order-new"><div className="demo-photo demo-photo-one"><ImagePlus size={18}/></div><div className="demo-order-info"><strong>Queue 024</strong><small>2 photos · 4 × 6 in</small></div><span className="demo-tag">New</span></div>
          <div className="demo-order"><div className="demo-photo demo-photo-two"><ScanLine size={18}/></div><div className="demo-order-info"><strong>Queue 023</strong><small>4 photos · 2 × 6 in</small></div><span className="demo-tag muted">Accepted</span></div>
          <div className="demo-order"><div className="demo-photo demo-photo-three"><CircleCheck size={18}/></div><div className="demo-order-info"><strong>Queue 022</strong><small>1 photo · 4 × 6 in</small></div><span className="demo-tag muted">Printed</span></div>
          <div className="demo-print-button"><Printer size={16}/> Open print-ready image</div>
        </div>
        <div className="demo-float-card"><span className="demo-float-icon"><LayoutTemplate size={17}/></span><span><small>EVENT LAYOUT</small><strong>Set once. Ready for guests.</strong></span></div>
      </div>
    </section>

    <section className="marketing-workflow section-frame">
      <div className="marketing-section-heading"><span className="marketing-kicker">A CALMER WAY TO PRINT</span><h2>From first scan to final print.</h2><p>Keep the guest experience easy and the operator workflow under control.</p></div>
      <div className="workflow-grid">
        <article><span className="workflow-icon violet"><QrCode size={21}/></span><small>01 · GUESTS</small><h3>Scan and add photos</h3><p>Guests open the event link, add photos, and see how they fit the print layout.</p></article>
        <article><span className="workflow-icon coral"><ScanLine size={21}/></span><small>02 · OPERATORS</small><h3>Review every order</h3><p>New requests wait in the queue until an operator checks and accepts them.</p></article>
        <article><span className="workflow-icon green"><Printer size={21}/></span><small>03 · PRINT</small><h3>Print with confidence</h3><p>Open a finished, print-sized image in the browser and confirm the result.</p></article>
      </div>
    </section>

    <section className="marketing-feature-band">
      <div className="section-frame feature-band-inner"><div><span className="marketing-kicker">MADE FOR THE REAL EVENT FLOW</span><h2>One event. One layout. One queue your team can trust.</h2><p>Keep event setup, guest access, order review, and printable media connected from the start.</p><Link href="/features" className="marketing-text-link">Explore the features</Link></div><div className="feature-check-list"><p><Check/> Event-specific print layouts</p><p><Check/> QR access for guests</p><p><Check/> Manual operator review</p><p><Check/> Print-ready image library</p></div></div>
    </section>

    <section className="marketing-cta section-frame"><div><span className="marketing-kicker">READY FOR YOUR NEXT EVENT?</span><h2>Bring the whole print flow together.</h2><p>Set up your workspace and create an event when you’re ready.</p></div><Link href="/signup" className="marketing-button light">Create your workspace</Link></section>
  </MarketingLayout>;
}
