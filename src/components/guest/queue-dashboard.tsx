"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { Check, Printer, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Attempt = { id: string; attempt_type: "print" | "reprint"; status: "initiated" | "confirmed"; initiated_at: string };
type Job = {
  id: string; queue_number: string; order_reference: string; status: "pending" | "accepted" | "printed" | "deleted";
  print_quantity: number; submitted_at: string; template_name: string; preview_url: string | null;
  attempts: Attempt[];
};
const filters = ["all", "pending", "accepted", "printed"] as const;
type Filter = typeof filters[number];
const statusLabels: Record<Job["status"], string> = { pending: "Pending", accepted: "Accepted", printed: "Printed", deleted: "Deleted" };

export function QueueDashboard({ eventId, initialJobs }: { eventId: string; initialJobs: Job[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEvents = useRef(new Map<string, number>());
  const previewJob = jobs.find(job => job.id === previewJobId) ?? null;
  useEffect(() => setJobs(initialJobs), [initialJobs]);
  useEffect(() => {
    if (!previewJob) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewJobId(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewJob]);
  useEffect(() => {
    const client = createClient();
    let subscribed = false;
    const scheduleRefresh = (id: string) => {
      const now = Date.now();
      const previous = lastEvents.current.get(id) ?? 0;
      if (now - previous < 1000) return;
      lastEvents.current.set(id, now);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 120);
    };
    const channel = client.channel(`print-jobs-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs", filter: `event_id=eq.${eventId}` }, (payload) => scheduleRefresh(`${payload.eventType}:${payload.new && "id" in payload.new ? payload.new.id : "job"}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "print_attempts", filter: `event_id=eq.${eventId}` }, (payload) => scheduleRefresh(`${payload.eventType}:${payload.new && "id" in payload.new ? payload.new.id : "attempt"}`))
      .subscribe((status) => {
        const connected = status === "SUBSCRIBED";
        if (connected && !subscribed) router.refresh();
        subscribed = connected;
        setLive(connected);
      });
    const timer = setInterval(() => { if (!subscribed) router.refresh(); }, 15000);
    return () => { clearInterval(timer); if (refreshTimer.current) clearTimeout(refreshTimer.current); void client.removeChannel(channel); };
  }, [eventId, router]);

  const perform = async (action: "accept" | "confirm_printed" | "delete", job: Job) => {
    if (action === "delete" && !window.confirm(`Delete ${job.queue_number} from the active queue?`)) return;
    setBusy(job.id);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, jobId: job.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Queue action failed");
      if (action === "delete") setJobs(current => current.filter(item => item.id !== job.id));
      else if (action === "accept") setJobs(current => current.map(item => item.id === job.id ? { ...item, status: "accepted" } : item));
      else setJobs(current => current.map(item => item.id === job.id ? { ...item, status: "printed", attempts: item.attempts.map(attempt => attempt.attempt_type === "print" && attempt.status === "initiated" ? { ...attempt, status: "confirmed" } : attempt) } : item));
      setBusy("");
      router.refresh();
    } catch (cause) {
      setBusy("");
      setError(cause instanceof Error ? cause.message : "Queue action failed");
    }
  };

  const print = async (job: Job) => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("The print window was blocked. Allow pop-ups for SnapQueue, then try again.");
      return;
    }
    popup.opener = null;
    popup.document.write("<!doctype html><title>Preparing print…</title><p style='font:16px sans-serif;padding:24px'>Preparing your print…</p>");
    setBusy(job.id);
    setError("");
    try {
      const action = job.status === "printed" ? "reprint" : "print";
      const response = await fetch(`/api/events/${eventId}/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, jobId: job.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not prepare the print");
      if (!result.print_url) throw new Error("The print view could not be created");
      popup.location.replace(result.print_url);
      const attempt: Attempt = { id: result.attempt_id, attempt_type: action, status: "initiated", initiated_at: new Date().toISOString() };
      setJobs(current => current.map(item => item.id === job.id ? { ...item, attempts: [...item.attempts, attempt] } : item));
      setBusy("");
      router.refresh();
    } catch (cause) {
      popup.close();
      setBusy("");
      setError(cause instanceof Error ? cause.message : "Could not open the print view");
    }
  };

  const visibleJobs = jobs.filter(job => job.status !== "deleted" && (filter === "all" || job.status === filter));
  const counts: Record<Filter, number> = {
    all: jobs.filter(job => job.status !== "deleted").length,
    pending: jobs.filter(job => job.status === "pending").length,
    accepted: jobs.filter(job => job.status === "accepted").length,
    printed: jobs.filter(job => job.status === "printed").length,
  };

  return <div className="simple-queue">
    <p className={`queue-live-indicator ${live ? "connected" : "reconnecting"}`} role="status">{live ? "Live updates connected" : "Reconnecting to live updates…"}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <nav className="queue-tabs" aria-label="Filter print jobs">
      {filters.map(status => <button key={status} type="button" className={filter === status ? "queue-tab active" : "queue-tab"} onClick={() => setFilter(status)}>{status === "all" ? "All" : statusLabels[status]} <b>{counts[status]}</b></button>)}
    </nav>
    {visibleJobs.length ? <section className="queue-list">{visibleJobs.map(job => {
      const hasUnconfirmedPrint = job.status === "accepted" && job.attempts.some(attempt => attempt.attempt_type === "print" && attempt.status === "initiated");
      const attemptsCount = job.attempts.length;
      return <article className="queue-job compact-queue-job" key={job.id}>
        <div className="queue-job-head"><strong className="queue-job-number">{job.queue_number}</strong><span className={`queue-status status-${job.status}`}>{statusLabels[job.status]}</span></div>
        <div className="queue-job-body"><div className="queue-thumb-wrap">{job.preview_url ? <button type="button" className="queue-preview-trigger" aria-label={`View printable image for ${job.queue_number}`} onClick={() => setPreviewJobId(job.id)}><NextImage src={job.preview_url} alt={`Printable image for ${job.queue_number}`} width={280} height={220} unoptimized/></button> : <div className="queue-preview-missing">Preview unavailable</div>}</div>
          <div className="queue-job-info"><b>{new Date(job.submitted_at).toLocaleString()}</b><span>{job.print_quantity} {job.print_quantity === 1 ? "print" : "prints"}</span><span>{attemptsCount} {attemptsCount === 1 ? "print attempt" : "print attempts"}</span>{job.template_name && <span className="queue-job-layout-name">{job.template_name}</span>}</div>
        </div>
        <div className="queue-job-actions">
          {job.status === "pending" && <button className="button queue-action-primary" disabled={!!busy} onClick={() => void perform("accept", job)}><Check size={15}/>{busy === job.id ? "Accepting…" : "Accept"}</button>}
          {job.status === "accepted" && <button className="button queue-action-primary" disabled={!!busy} onClick={() => void print(job)}><Printer size={15}/>{busy === job.id ? "Preparing…" : "Print"}</button>}
          {job.status === "printed" && <button className="button queue-action-primary" disabled={!!busy} onClick={() => void print(job)}><RotateCcw size={15}/>{busy === job.id ? "Preparing…" : "Reprint"}</button>}
          {hasUnconfirmedPrint && <button className="button secondary" disabled={!!busy} onClick={() => void perform("confirm_printed", job)}><Check size={15}/>{busy === job.id ? "Saving…" : "Confirm printed"}</button>}
          <button className="button danger queue-delete-button" disabled={!!busy} onClick={() => void perform("delete", job)}><Trash2 size={15}/><span>Delete</span></button>
        </div>
      </article>;
    })}</section> : <section className="empty-card"><h3>{filter === "all" ? "No print jobs yet" : `No ${statusLabels[filter]} jobs`}</h3><p>New guest print requests will appear here.</p></section>}
    {previewJob?.preview_url && <div className="queue-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewJobId(null); }}>
      <section className="queue-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="queue-preview-title">
        <header><h2 id="queue-preview-title">Printable image · {previewJob.queue_number}</h2><button type="button" className="queue-preview-close" autoFocus onClick={() => setPreviewJobId(null)} aria-label="Close printable preview">×</button></header>
        <div className="queue-preview-image"><NextImage src={previewJob.preview_url} alt={`Printable image for ${previewJob.queue_number}`} fill sizes="(max-width: 700px) 92vw, 80vw" unoptimized/></div>
        <div className="queue-preview-actions">
          {previewJob.status === "pending" && <button className="button queue-action-primary" disabled={!!busy} onClick={() => void perform("accept", previewJob)}><Check size={15}/>{busy === previewJob.id ? "Accepting…" : "Accept"}</button>}
          {previewJob.status === "accepted" && <button className="button queue-action-primary" disabled={!!busy} onClick={() => void print(previewJob)}><Printer size={15}/>{busy === previewJob.id ? "Preparing…" : "Print"}</button>}
          {previewJob.status === "printed" && <button className="button queue-action-primary" disabled={!!busy} onClick={() => void print(previewJob)}><RotateCcw size={15}/>{busy === previewJob.id ? "Preparing…" : "Reprint"}</button>}
          {previewJob.status === "accepted" && previewJob.attempts.some(attempt => attempt.attempt_type === "print" && attempt.status === "initiated") && <button className="button secondary" disabled={!!busy} onClick={() => void perform("confirm_printed", previewJob)}><Check size={15}/>{busy === previewJob.id ? "Saving…" : "Confirm printed"}</button>}
          <button className="button danger queue-delete-button" disabled={!!busy} onClick={() => void perform("delete", previewJob)}><Trash2 size={15}/><span>Delete</span></button>
        </div>
      </section>
    </div>}
  </div>;
}
