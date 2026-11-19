import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function MarketingPage() {
  return <>
    <PageHeader eyebrow="WORKSPACE" title="Marketing" description="Prepare event galleries and share finished photos with guests."/>
    <section className="empty-card">
      <div className="empty-icon"><Megaphone size={22}/></div>
      <h3>Marketing tools are coming soon</h3>
      <p>Final printable images are stored in the Photo Library. Guest sharing and campaign tools will appear here.</p>
    </section>
  </>;
}
