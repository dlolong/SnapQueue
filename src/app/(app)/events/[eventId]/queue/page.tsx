import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { EventOverviewHeader, EventTabs } from "@/components/events/event-navigation";
import { QueueDashboard } from "@/components/guest/queue-dashboard";
import { requireWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function EventQueuePage({ params }: { params: Promise<{ eventId: string }> }) {
  const [{ eventId }, { supabase, workspace, role }] = await Promise.all([params, requireWorkspace()]);
  if (!["owner", "admin", "operator"].includes(role)) redirect("/events");

  const [{ data: event, error: eventError }, { data: rows, error: jobsError }, { data: attemptRows, error: attemptsError }] = await Promise.all([
    supabase.from("events").select("id,name,event_type,event_date,start_time,end_time,status").eq("id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("print_jobs").select("id,queue_number,order_reference,status,print_quantity,submitted_at,final_export_path,layout_snapshot,templates(name)").eq("event_id", eventId).eq("workspace_id", workspace.id).neq("status", "deleted").order("submitted_at"),
    supabase.from("print_attempts").select("id,print_job_id,attempt_type,status,initiated_at").eq("event_id", eventId).eq("workspace_id", workspace.id).order("initiated_at"),
  ]);
  if (eventError) throw new Error(eventError.message);
  if (jobsError) throw new Error(jobsError.message);
  if (attemptsError) throw new Error(attemptsError.message);
  if (!event) notFound();

  const admin = createAdminClient();
  const jobs = await Promise.all((rows ?? []).map(async (row) => {
    const { data: signed } = row.final_export_path
      ? await admin.storage.from("snapqueue-guest-exports").createSignedUrl(row.final_export_path, 600)
      : { data: null };
    const templateRow = Array.isArray(row.templates) ? row.templates[0] : row.templates;
    return {
      ...row,
      template_name: (row.layout_snapshot as { name?: string } | null)?.name ?? templateRow?.name ?? "Event layout",
      preview_url: signed?.signedUrl ?? null,
      attempts: (attemptRows ?? []).filter(attempt => attempt.print_job_id === row.id),
    };
  }));

  return <div className="event-details-page">
    <EventOverviewHeader event={event}/>
    <EventTabs eventId={event.id} active="queue"/>
    <section className="event-overview-queue event-queue-tab-content">
      <div className="event-queue-heading"><h2><Printer size={21}/>Print queue</h2><span>{jobs.length ? `${jobs.length} orders` : "Live"}</span></div>
      <QueueDashboard eventId={eventId} initialJobs={jobs}/>
    </section>
  </div>;
}
