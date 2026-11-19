"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

export function BrowserPrintView({ imageUrl, widthInches, heightInches, widthPixels, heightPixels, queueNumber }: { imageUrl: string; widthInches: number; heightInches: number; widthPixels: number; heightPixels: number; queueNumber: string }) {
  const [state, setState] = useState<"loading" | "printing" | "closed" | "error">("loading");
  const didPrint = useRef(false);
  const openDialog = useCallback(() => {
    if (!didPrint.current) return;
    setState("printing");
    try { window.print(); }
    catch { setState("error"); }
  }, []);

  useEffect(() => {
    const afterPrint = () => setState(current => current === "error" ? current : "closed");
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  const onImageLoad = () => {
    if (didPrint.current) return;
    didPrint.current = true;
    window.setTimeout(openDialog, 250);
  };
  const onImageError = () => setState("error");
  const width = Number(widthInches.toFixed(3));
  const height = Number(heightInches.toFixed(3));

  return <main className="browser-print-page" style={{ "--print-width": `${width}in`, "--print-height": `${height}in` } as React.CSSProperties}>
    <style>{`@page{size:${width}in ${height}in;margin:0}@media print{html,body{width:${width}in;height:${height}in;margin:0!important;padding:0!important;background:#fff!important}.browser-print-page{width:${width}in!important;height:${height}in!important;min-height:0!important;margin:0!important;padding:0!important;display:block!important}.browser-print-art{width:${width}in!important;height:${height}in!important;max-width:none!important;max-height:none!important;object-fit:contain!important;box-shadow:none!important}.browser-print-controls{display:none!important}}`}</style>
    <Image className="browser-print-art" src={imageUrl} alt={`Final print for ${queueNumber}`} width={widthPixels} height={heightPixels} unoptimized onLoad={onImageLoad} onError={onImageError}/>
    <section className="browser-print-controls" aria-live="polite">
      {state === "loading" && <p>Preparing the final print image…</p>}
      {state === "printing" && <><p>The browser print dialog should be open. Confirm the print only after you check the output.</p><button type="button" className="button secondary" onClick={openDialog}>Open print dialog</button></>}
      {state === "closed" && <><h1>Print dialog closed</h1><p>Check the output, then return to SnapQueue and confirm whether the print succeeded.</p><button type="button" className="button" onClick={openDialog}>Open print dialog again</button></>}
      {state === "error" && <><h1>Could not prepare this print</h1><p>Check your connection and reopen the print view from the queue.</p><button type="button" className="button" onClick={() => window.location.reload()}>Reload print image</button></>}
      <p className="browser-print-meta">{queueNumber} · {width} × {height} in</p>
    </section>
  </main>;
}
