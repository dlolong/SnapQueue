import { notFound, redirect } from "next/navigation";
import { BrowserPrintView } from "@/components/guest/browser-print-view";
import { requireWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PrintJobPage({ params, searchParams }: { params: Promise<{ eventId: string; jobId: string }>; searchParams: Promise<{ attemptId?: string }> }) {
  const [{ eventId, jobId }, query, { supabase, workspace, role }] = await Promise.all([params, searchParams, requireWorkspace()]);
  if (!["owner", "admin", "operator"].includes(role)) redirect("/events");
  if (!query.attemptId) notFound();

  const [{ data: event }, { data: job }, { data: attempt }] = await Promise.all([
    supabase.from("events").select("id,workspace_id").eq("id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("print_jobs").select("id,event_id,workspace_id,queue_number,status,final_export_path,layout_snapshot,printable_image_id").eq("id", jobId).eq("event_id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("print_attempts").select("id,print_job_id,attempt_type,status").eq("id", query.attemptId).eq("print_job_id", jobId).eq("event_id", eventId).eq("workspace_id", workspace.id).maybeSingle(),
  ]);
  if (!event || !job || !attempt || attempt.status !== "initiated") notFound();
  if (attempt.attempt_type === "print" && job.status !== "accepted") notFound();
  if (attempt.attempt_type === "reprint" && job.status !== "printed") notFound();
  if (!job.final_export_path) notFound();

  const { data: image } = await (
    job.printable_image_id
      ? supabase.from("printable_images").select("width_inches,height_inches,width_px,height_px").eq("id", job.printable_image_id).eq("workspace_id", workspace.id).maybeSingle()
      : Promise.resolve({ data: null })
  );
  const snapshot = job.layout_snapshot as { width_px?: number; height_px?: number; dpi?: number } | null;
  const dpi = Number(snapshot?.dpi) || 300;
  const widthInches = Number(image?.width_inches) || Number(snapshot?.width_px) / dpi;
  const heightInches = Number(image?.height_inches) || Number(snapshot?.height_px) / dpi;
  const widthPixels = Number(image?.width_px) || Number(snapshot?.width_px) || Math.round(widthInches * dpi);
  const heightPixels = Number(image?.height_px) || Number(snapshot?.height_px) || Math.round(heightInches * dpi);
  if (!Number.isFinite(widthInches) || !Number.isFinite(heightInches) || widthInches <= 0 || heightInches <= 0 || widthInches > 30 || heightInches > 30) notFound();

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from("snapqueue-guest-exports").createSignedUrl(job.final_export_path, 300);
  if (error || !signed?.signedUrl) notFound();
  return <BrowserPrintView imageUrl={signed.signedUrl} widthInches={widthInches} heightInches={heightInches} widthPixels={widthPixels} heightPixels={heightPixels} queueNumber={job.queue_number}/>;
}
