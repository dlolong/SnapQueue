"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import NextImage from "next/image";

export function EventQrCard({ url, eventName, workspaceName, workspaceLogoUrl, enabled }: { url: string; eventName: string; workspaceName: string; workspaceLogoUrl?: string | null; enabled: boolean }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "H", color: { dark: "#171b25", light: "#ffffff" } })
      .then((data) => active && setImage(data))
      .catch(() => active && setError("QR code could not be generated"));
    return () => { active = false; };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the guest link");
    }
  };

  const download = () => {
    if (!image) return;
    const anchor = document.createElement("a");
    anchor.href = image;
    anchor.download = "event-qr.png";
    anchor.click();
  };

  const printPoster = () => {
    if (!image) return;
    const printWindow = window.open("", "_blank", "width=650,height=850");
    if (!printWindow) {
      setError("Allow pop-ups to open the printable QR poster.");
      return;
    }
    printWindow.document.title = `${workspaceName} · ${eventName}`;
    const style = printWindow.document.createElement("style");
    style.textContent = "body{font-family:Arial,sans-serif;display:grid;place-items:center;min-height:95vh;margin:0;color:#211b36;text-align:center}.poster{padding:32px;max-width:520px}.poster img.qr{width:min(80vw,420px)}.poster img.brand-logo{display:block;max-width:min(70vw,280px);max-height:100px;object-fit:contain;margin:0 auto 8px}h1{font-size:38px;margin:8px 0}h2{font-size:20px;color:#625a70;font-weight:600;margin:0 0 24px}p{font-size:18px;color:#555;margin:0 0 15px}.powered{font-size:13px;color:#777;margin-top:20px}button{padding:12px 20px;font-size:16px}@media print{button{display:none}}";
    printWindow.document.head.appendChild(style);
    const box = printWindow.document.createElement("main");
    box.className = "poster";
    const business = workspaceLogoUrl ? printWindow.document.createElement("img") : printWindow.document.createElement("h1");
    if (workspaceLogoUrl) {
      business.setAttribute("src", workspaceLogoUrl);
      business.setAttribute("alt", workspaceName);
      business.className = "brand-logo";
    } else {
      business.textContent = workspaceName;
    }
    const event = printWindow.document.createElement("h2");
    event.textContent = eventName;
    const hint = printWindow.document.createElement("p");
    hint.textContent = "Scan to add photos and join the print queue";
    const qr = printWindow.document.createElement("img");
    qr.src = image;
    qr.alt = "Event guest QR code";
    qr.className = "qr";
    const powered = printWindow.document.createElement("p");
    powered.className = "powered";
    powered.textContent = "Powered by SnapQueue";
    const button = printWindow.document.createElement("button");
    button.textContent = "Print poster";
    button.onclick = () => printWindow.print();
    box.append(business, event, hint, qr, powered, button);
    printWindow.document.body.appendChild(box);
  };

  return <section className="section-card guest-qr-card">
    <div><h2>Event QR code</h2><p className="muted">Guests scan this link to place a photo order without creating an account.</p><p className="guest-url">{url}</p><span className={enabled ? "tag" : "tag tag-muted"}>{enabled ? "Guest access enabled" : "Guest access disabled"}</span></div>
    {image ? <NextImage className="operator-qr" src={image} alt={`QR code for ${eventName}`} width={512} height={512} unoptimized/> : <div className="operator-qr qr-placeholder">{error || "Creating QR…"}</div>}
    <div className="guest-qr-actions"><button className="button secondary guest-copy-link" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button><button className="button secondary" onClick={download} disabled={!image}>Download PNG</button><button className="button secondary" onClick={printPoster} disabled={!image}>Print poster</button></div>
    {error && <p className="form-error">{error}</p>}
  </section>;
}
