"use client";

import { useState } from "react";

export function PrintableImageActions({ eventId, printJobId, downloadUrl, filename }: { eventId: string; printJobId: string; downloadUrl: string | null; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reprint = async () => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("The print window was blocked. Allow pop-ups for SnapQueue, then try again.");
      return;
    }
    popup.opener = null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reprint", jobId: printJobId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not prepare the reprint");
      if (!result.print_url) throw new Error("The print view could not be created");
      popup.location.replace(result.print_url);
      setBusy(false);
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : "Could not prepare the reprint");
      setBusy(false);
    }
  };
  return <div className="printable-image-actions">
    {downloadUrl && <a className="button secondary" href={downloadUrl} download={filename}>Download</a>}
    <button className="button secondary" type="button" onClick={() => void reprint()} disabled={busy}>{busy ? "Preparing…" : "Reprint"}</button>
    {error && <small className="form-error">{error}</small>}
  </div>;
}
