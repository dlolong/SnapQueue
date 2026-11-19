import Link from "next/link";
import type { Metadata } from "next";
import { Check, ClipboardCheck, FileImage, QrCode, Upload } from "lucide-react";
import { MarketingLayout } from "@/components/marketing-layout";

export const metadata: Metadata = { title: "How it works | SnapQueue", description: "See how SnapQueue connects event setup, guest photo uploads, operator review, and printing." };

const steps = [
  { number: "01", icon: ClipboardCheck, title: "Set up the event", body: "Create an event, choose its starting print layout, and tailor the layout to the occasion. Activate the event when it’s ready for guests." },
  { number: "02", icon: QrCode, title: "Share the guest link", body: "Give guests the event QR code. They can open the portal on their phones and add photos to the event’s print layout." },
  { number: "03", icon: Upload, title: "Review each request", body: "Guest orders enter the event queue for operator review. Accept the request before sending it to the print station." },
  { number: "04", icon: FileImage, title: "Print and confirm", body: "Open the print-ready image on the connected station, check the output, and confirm the job as printed." },
];

export default function HowItWorksPage() {
  return <MarketingLayout>
    <section className="subpage-hero section-frame how-hero">
      <span className="marketing-kicker">A FLOW YOUR WHOLE TEAM CAN FOLLOW</span>
      <h1>Four clear steps. <em>One smooth print run.</em></h1>
      <p>Guests get an easy way to submit photos. Operators stay in charge of what reaches the printer.</p>
      <Link href="/signup" className="marketing-button">Set up your first event</Link>
    </section>
    <section className="steps-section section-frame">
      <div className="steps-rail" aria-hidden="true"><i/><i/><i/></div>
      {steps.map(({ number, icon: Icon, title, body }, index) => <article className={`how-step how-step-${index + 1}`} key={number}>
        <div className="how-step-number">{number}</div><div className="how-step-content"><span className="feature-card-icon"><Icon size={22}/></span><h2>{title}</h2><p>{body}</p></div>
        {index === 1 && <div className="how-guest-card"><QrCode size={22}/><div><strong>Guest event page</strong><small>Business name · Event layout · Add photos</small></div><Check size={17}/></div>}
        {index === 2 && <div className="how-queue-card"><span className="demo-tag">New request</span><strong>Waiting for operator review</strong><small>Every request starts in the queue.</small></div>}
      </article>)}
    </section>
    <section className="marketing-cta section-frame"><div><span className="marketing-kicker">READY WHEN YOU ARE</span><h2>Make your next event easier to run.</h2><p>Start with a workspace, then configure an event around your print setup.</p></div><Link href="/signup" className="marketing-button light">Create your workspace</Link></section>
  </MarketingLayout>;
}
