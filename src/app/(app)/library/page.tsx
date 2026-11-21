import Image from "next/image";
import Link from "next/link";
import { Images } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PrintableImageActions } from "@/components/library/printable-image-actions";
import { requireWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; event?: string; date?: string; size?: string }> }) {
  const [filters, { supabase, workspace, role }] = await Promise.all([searchParams, requireWorkspace()]);
  const canEdit = ["owner", "admin", "operator"].includes(role);
  const [eventsResult, imagesResult] = await Promise.all([
    supabase.from("events").select("id,name").eq("workspace_id", workspace.id).order("event_date", { ascending: false }),
    (async () => {
      let query = supabase.from("printable_images").select("id,event_id,print_job_id,queue_number,storage_path,image_format,width_inches,height_inches,width_px,height_px,dpi,file_size_bytes,print_quantity,export_version,created_at,events(name)").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(300);
      if (filters.q) query = query.ilike("queue_number", `%${filters.q.replace(/[%_,]/g, "")}%`);
      if (filters.event) query = query.eq("event_id", filters.event);
      if (filters.size && ["2x6", "4x6", "4x4"].includes(filters.size)) {
        const [width, height] = filters.size.split("x").map(Number);
        const tolerance = 0.12;
        query = query.gte("width_inches", width - tolerance).lte("width_inches", width + tolerance).gte("height_inches", height - tolerance).lte("height_inches", height + tolerance);
      }
      if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
        const start = new Date(`${filters.date}T00:00:00`);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        query = query.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
      }
      return query;
    })(),
  ]);
  const admin = createAdminClient();
  const images = await Promise.all((imagesResult.data ?? []).map(async (image) => {
    const { data } = await admin.storage.from("snapqueue-guest-exports").createSignedUrl(image.storage_path, 1800);
    const event = Array.isArray(image.events) ? image.events[0] : image.events;
    return { ...image, eventName: event?.name ?? "Event", url: data?.signedUrl ?? null };
  }));

  return <>
    <PageHeader eyebrow="MEDIA" title="Photo Library" description="Final composed images ready for printing. Guest source uploads are kept private and temporary."/>
    <form className="filter-bar printable-filter-bar">
      <input name="q" defaultValue={filters.q} placeholder="Search queue number" aria-label="Search queue number"/>
      <select name="event" defaultValue={filters.event ?? ""}><option value="">All events</option>{(eventsResult.data ?? []).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>
      <input name="date" type="date" defaultValue={filters.date} aria-label="Filter by date"/>
      <select name="size" defaultValue={filters.size ?? ""}><option value="">All print sizes</option><option value="2x6">2 × 6 in</option><option value="4x6">4 × 6 in</option><option value="4x4">4 × 4 in</option></select>
      <button className="button secondary">Filter</button>
      {(filters.q || filters.event || filters.date || filters.size) && <Link href="/library" className="button secondary">Clear</Link>}
    </form>
    {(imagesResult.error || eventsResult.error) ? <section className="section-card"><p className="form-error">Unable to load printable images: {(imagesResult.error ?? eventsResult.error)?.message}</p></section>
      : images.length ? <div className="library-grid">{images.map((image) => <article className="library-card printable-image-card" key={image.id}>
        {image.url ? <Image src={image.url} alt={`Print composition ${image.queue_number}`} width={image.width_px} height={image.height_px} unoptimized/> : <div className="thumb-missing">Preview unavailable</div>}
        <div className="library-card-body"><b title={image.queue_number}>{image.queue_number} · {image.eventName}</b><small>{image.width_inches.toFixed(2)} × {image.height_inches.toFixed(2)} in · {image.width_px} × {image.height_px}px · {image.dpi} DPI</small><small>{image.image_format.replace("image/", "").toUpperCase()}{image.file_size_bytes ? ` · ${(image.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ""} · {image.print_quantity} copies · v{image.export_version}</small><small>{new Date(image.created_at).toLocaleString()} · <Link href={`/events/${image.event_id}/queue`}>View print job</Link></small><PrintableImageActions imageId={image.id} eventId={image.event_id} printJobId={image.print_job_id} downloadUrl={image.url} filename={`${image.queue_number}.${image.image_format === "image/jpeg" ? "jpg" : "png"}`} canDelete={canEdit}/></div>
      </article>)}</div>
      : <div className="empty-card"><div className="empty-icon"><Images size={22}/></div><h3>{filters.q || filters.event || filters.date || filters.size ? "No matching printable images" : "Your Photo Library is empty"}</h3><p>Final print compositions will appear here after guests submit event orders.</p></div>}
  </>;
}
