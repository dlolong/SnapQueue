import Link from "next/link";
import type { Metadata } from "next";
import { Check, Images, LayoutTemplate, ListChecks, Printer, QrCode, ScanLine } from "lucide-react";
import { MarketingLayout } from "@/components/marketing-layout";

export const metadata: Metadata = { title: "Features | SnapQueue", description: "Explore event layouts, guest QR access, operator print review, browser printing, and the printable image library." };

const features = [
  { icon: QrCode, label: "GUEST ACCESS", title: "A quick scan gets guests started.", body: "Give each event a guest link and QR code. Guests can upload photos from their phones without creating an account." },
  { icon: LayoutTemplate, label: "EVENT LAYOUTS", title: "Set the print design for each event.", body: "Start from a template or an existing event layout, then customize the copy for the event you’re running." },
  { icon: ListChecks, label: "OPERATOR REVIEW", title: "Keep a person in the print loop.", body: "Every guest request arrives for review. Operators accept requests, start a print, and confirm when output is ready." },
  { icon: Printer, label: "BROWSER PRINTING", title: "Open the final file when it’s time to print.", body: "Prepare the print-sized image in the browser and use the print dialog on the station connected to your printer." },
  { icon: Images, label: "PRINTABLE LIBRARY", title: "Find finished images after the rush.", body: "Keep completed printable images organized by event, with print details and direct access to each job." },
  { icon: ScanLine, label: "LIVE QUEUE STATUS", title: "Make the next action clear.", body: "Track pending, accepted, printed, and removed jobs so the team can see what needs attention." },
];

export default function FeaturesPage() {
  return <MarketingLayout>
    <section className="subpage-hero section-frame">
      <span className="marketing-kicker">THE SNAPQUEUE TOOLKIT</span>
      <h1>Built around the moments between <em>“take a photo”</em> and <em>“here’s your print.”</em></h1>
      <p>Event setup, guest uploads, operator review, and print-ready files work together in one photobooth workspace.</p>
      <Link href="/signup" className="marketing-button">Start your workspace</Link>
      <div className="subpage-hero-art"><span><QrCode/></span><i/><span><ListChecks/></span><i/><span><Printer/></span></div>
    </section>
    <section className="feature-grid-section section-frame">
      <div className="marketing-section-heading"><span className="marketing-kicker">A CONNECTED WORKFLOW</span><h2>Everything has a place in the queue.</h2></div>
      <div className="marketing-feature-grid">{features.map(({ icon: Icon, label, title, body }) => <article className="marketing-feature-card" key={label}><span className="feature-card-icon"><Icon size={22}/></span><small>{label}</small><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>
    <section className="marketing-inline-cta section-frame"><div><span className="marketing-kicker">CLEAR FOR GUESTS. USEFUL FOR OPERATORS.</span><h2>See how the pieces fit together.</h2></div><Link className="marketing-text-link" href="/how-it-works">Explore the workflow</Link></section>
  </MarketingLayout>;
}
