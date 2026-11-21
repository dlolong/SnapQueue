"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteItemButton({
  endpoint,
  confirmMessage,
  className = "button danger",
  label = "Delete",
  requestBody,
}: {
  endpoint: string;
  confirmMessage: string;
  className?: string;
  label?: string;
  requestBody?: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy || !window.confirm(confirmMessage)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        ...(requestBody ? { headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not delete this item");
      if (result.warning) window.alert(result.warning);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this item");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className={className} type="button" onClick={() => void remove()} disabled={busy}>
      {busy ? "Deleting…" : label}
    </button>
    {error && <small className="form-error delete-item-error" role="alert">{error}</small>}
  </>;
}
