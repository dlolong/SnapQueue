import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { MarketingLayout } from "@/components/marketing-layout";

export const metadata: Metadata = { title: "Pricing | SnapQueue", description: "Compare monthly SnapQueue plans for photo booth operators, studios, and multi-branch teams." };

type Plan = { name: string; price: string; description: string; recommended?: boolean; features: string[] };

const plans: Plan[] = [
  {
    name: "Starter",
    price: "₱499",
    description: "For a single photo booth setup.",
    features: ["1 print station", "1 printer", "Basic templates", "500 print jobs per month", "Standard branding"],
  },
  {
    name: "Professional",
    price: "₱999",
    description: "For busy studios running more events.",
    recommended: true,
    features: ["3 print stations", "Multiple printers", "Custom templates", "2,000 print jobs per month", "Custom branding", "Sales reports"],
  },
  {
    name: "Business",
    price: "₱1,999",
    description: "For teams working across branches.",
    features: ["Multiple branches", "Multiple print stations", "Unlimited templates", "5,000 print jobs per month", "Advanced reporting", "Priority support"],
  },
];

export default function PricingPage() {
  return <MarketingLayout>
    <section className="pricing-hero section-frame">
      <span className="marketing-kicker">PLANS FOR YOUR PHOTO BOOTH BUSINESS</span>
      <h1>Choose the setup that <em>fits your operation.</em></h1>
      <p>Start with one print station or equip a growing team across branches. All plans are billed monthly.</p>
      <div className="pricing-billing-note"><span/> Monthly plans <span className="pricing-billing-divider">·</span> Prices in Philippine pesos</div>
    </section>
    <section className="pricing-grid-section section-frame" aria-label="SnapQueue plans">
      <div className="pricing-grid">{plans.map((plan) => <article className={`pricing-card${plan.recommended ? " recommended" : ""}`} key={plan.name}>
        {plan.recommended && <div className="pricing-recommend">RECOMMENDED</div>}
        <div className="pricing-card-head"><h2>{plan.name}</h2><p>{plan.description}</p></div>
        <div className="pricing-amount"><strong>{plan.price}</strong><span>/ month</span></div>
        <Link href="/signup" className={plan.recommended ? "marketing-button" : "pricing-choose-button"}>Get started</Link>
        <div className="pricing-includes"><strong>Plan includes</strong>{plan.features.map((feature) => <p key={feature}><Check size={16}/>{feature}</p>)}</div>
      </article>)}</div>
      <p className="pricing-footnote">Prices are per month in Philippine pesos. <Link href="/signup">Create a workspace to get started.</Link></p>
    </section>
    <section className="pricing-faq section-frame"><div><span className="marketing-kicker">CHOOSE WHAT FITS TODAY</span><h2>Scale your setup as your business grows.</h2></div><div className="pricing-faq-answer"><h3>One station or several?</h3><p>Starter is sized for one station. Professional adds room for multiple stations and printers. Business is designed for teams working across branches.</p><h3>How are monthly jobs shown?</h3><p>Each plan lists its monthly print job allowance, along with the number of stations and included tools.</p><Link className="marketing-text-link" href="/signup">Get started with SnapQueue</Link></div></section>
  </MarketingLayout>;
}
