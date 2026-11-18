"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { renderDesign } from "@/lib/design/render";
import { addDpiMetadata } from "@/lib/design/raster-metadata.mjs";
import type { DesignElement, DesignModel } from "@/lib/design/model";

type Template = {
  id: string;
  name: string;
  description: string | null;
  width_px: number;
  height_px: number;
  dpi: number;
  layout_config: {
    canvas?: { background?: string };
    photo_slots_required?: boolean;
    overlay?: { path: string; width: number; height: number; x: number; y: number; displayWidth: number; displayHeight: number; rotation: number; locked: boolean };
    elements?: Array<{
      id?: string; type?: string; x?: number; y?: number; width?: number; height?: number;
      zIndex?: number; rotation?: number; name?: string; required?: boolean; slotNumber?: number;
      visible?: boolean; locked?: boolean; fit?: "cover" | "contain"; cropX?: number; cropY?: number;
      configuration?: { text?: string; color?: string; fontSize?: number; align?: "left" | "center" | "right"; fit?: "cover" | "contain" };
    }>;
  };
  background: { value?: string };
};

type GuestEvent = {
  name: string;
  event_type: string;
  event_date: string | null;
  venue: string | null;
  primary_color: string;
  secondary_color: string;
  guest_instructions: string;
  print_sizes: string[];
  print_packages: { code: string; label: string; quantity: number }[];
  max_photos_per_guest: number;
  max_photo_size_bytes: number;
  max_print_quantity: number;
  marketing_consent_enabled: boolean;
  templates: Template[];
};

type GuestPhoto = { id: string; filename: string; mime_type: string; file_size: number; width_px: number; height_px: number; url: string };
type Panel = "layout" | "gallery" | "print" | null;

const toDesign = (template: Template): DesignModel => ({
  version: 1,
  canvas: {
    width: template.width_px,
    height: template.height_px,
    dpi: template.dpi,
    background: template.layout_config.canvas?.background ?? template.background?.value ?? "#ffffff",
  },
  overlay: template.layout_config.overlay,
  elements: (template.layout_config.elements ?? []).map((element, index) => ({
    id: element.id ?? `element-${index}`,
    type: element.type === "text" ? "text" : element.type === "shape" ? "shape" : "photo",
    name: element.name ?? `Photo ${index + 1}`,
    required: element.required ?? template.layout_config.photo_slots_required ?? true,
    slotNumber: element.slotNumber ?? index + 1,
    cropX: element.cropX ?? 0.5,
    cropY: element.cropY ?? 0.5,
    x: element.x ?? 0,
    y: element.y ?? 0,
    width: element.width ?? 200,
    height: element.height ?? 200,
    rotation: element.rotation ?? 0,
    zIndex: element.zIndex ?? index,
    visible: element.visible ?? true,
    locked: element.locked ?? false,
    fit: element.fit ?? element.configuration?.fit ?? "cover",
    text: element.configuration?.text ?? "",
    fontSize: element.configuration?.fontSize ?? 48,
    color: element.configuration?.color ?? "#222222",
    align: element.configuration?.align ?? "center",
  } as DesignElement)),
});

const photoSlotCount = (template: Template | undefined) => template?.layout_config.elements?.filter((element) => element.type === "photo").length ?? 0;
const autoPlacePhotos = (design: DesignModel, photos: GuestPhoto[]): DesignModel => {
  const alreadyUsed = new Set(design.elements.filter((element) => element.type === "photo" && element.photoId).map((element) => element.photoId));
  const available = photos.filter((photo) => !alreadyUsed.has(photo.id));
  let next = 0;
  return {
    ...design,
    elements: design.elements.map((element) => {
      if (element.type !== "photo" || element.photoId || !available[next]) return element;
      return { ...element, photoId: available[next++].id };
    }),
  };
};
const printDimensions = (template: Template | undefined) => template ? `${(template.width_px / template.dpi).toFixed(2)} × ${(template.height_px / template.dpi).toFixed(2)} in · ${template.dpi} DPI` : "";

function ActionIcon({ kind }: { kind: "upload" | "layout" | "gallery" | "print" }) {
  if (kind === "upload") return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="10" width="48" height="39" rx="8"/><circle cx="24" cy="24" r="5"/><path d="m12 43 13-13 8 8 7-8 12 13M46 45v14m-7-7h14"/></svg>;
  if (kind === "layout") return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="9" width="19" height="19" rx="3"/><rect x="36" y="9" width="19" height="19" rx="3"/><rect x="9" y="36" width="19" height="19" rx="3"/><rect x="36" y="36" width="19" height="19" rx="3"/></svg>;
  if (kind === "gallery") return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="15" width="39" height="35" rx="5"/><path d="M17 42 27 31l8 8 5-6 7 8M20 25h.1"/><path d="M20 9h35v34"/></svg>;
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 23h36a6 6 0 0 1 6 6v21H8V29a6 6 0 0 1 6-6Z"/><path d="M20 23 24 14h16l4 9M17 50v6h30v-6"/><rect x="20" y="33" width="24" height="12" rx="3"/></svg>;
}

function CameraMascot() {
  return <svg className="guest-mascot" viewBox="0 0 180 150" role="img" aria-label="A smiling camera mascot">
    <path d="M37 40h106a12 12 0 0 1 12 12v58a13 13 0 0 1-13 13H38a13 13 0 0 1-13-13V53a13 13 0 0 1 12-13Z" fill="#fff" stroke="#172b62" strokeWidth="6"/>
    <path d="m59 40 8-16h37l10 16" fill="#70dcff" stroke="#172b62" strokeWidth="6" strokeLinejoin="round"/>
    <circle cx="89" cy="79" r="26" fill="#35b7f4" stroke="#172b62" strokeWidth="6"/><circle cx="89" cy="79" r="13" fill="#18336d"/><circle cx="84" cy="73" r="4" fill="#fff"/>
    <path d="M129 68q9-11 17 0" fill="none" stroke="#172b62" strokeWidth="5" strokeLinecap="round"/><circle cx="48" cy="91" r="6" fill="#ff8ea7"/><circle cx="131" cy="91" r="6" fill="#ff8ea7"/>
    <path d="M42 123v10m95-10v10M68 123v10m48-10v10" stroke="#172b62" strokeWidth="6" strokeLinecap="round"/><path d="m142 24 4-11m10 19 10-5" stroke="#ffc83d" strokeWidth="6" strokeLinecap="round"/>
  </svg>;
}

export function GuestPortal({ event, code }: { event: GuestEvent; code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [guestReady, setGuestReady] = useState(false);
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [templateId, setTemplateId] = useState(event.templates[0]?.id ?? "");
  const [design, setDesign] = useState<DesignModel | null>(event.templates[0] ? toDesign(event.templates[0]) : null);
  const [selected, setSelected] = useState<string | null>(null);
  const [packageCode, setPackageCode] = useState(event.print_packages[0]?.code ?? "");
  const [printSize, setPrintSize] = useState(event.print_sizes[0] ?? "");
  const [consent, setConsent] = useState<"yes" | "no" | "">("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);

  const currentTemplate = event.templates.find((template) => template.id === templateId);
  const active = design?.elements.find((element) => element.id === selected);
  const photoLimit = Math.min(event.max_photos_per_guest, photoSlotCount(currentTemplate));
  const hasRequiredSlots = !!design?.elements.some((element) => element.type === "photo" && !element.photoId && (element.required !== false || currentTemplate?.layout_config.photo_slots_required !== false));
  const canPrint = guestReady && photos.length > 0 && !!design && !!currentTemplate && !hasRequiredSlots;

  useEffect(() => {
    let alive = true;
    const start = async () => {
      let response = await fetch(`/api/public/events/${code}/photos`, { cache: "no-store" });
      if (!response.ok) {
        const session = await fetch(`/api/public/events/${code}/session`, { method: "POST" });
        if (!session.ok) throw Error((await session.json()).error ?? "Could not start guest session");
        response = await fetch(`/api/public/events/${code}/photos`, { cache: "no-store" });
      }
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Could not load guest photos");
      if (alive) {
        const loaded = result.photos ?? [];
        setPhotos(loaded);
        setDesign((current) => current ? autoPlacePhotos(current, loaded) : current);
        setGuestReady(true);
      }
    };
    start().catch((reason) => alive && setError(reason instanceof Error ? reason.message : "Guest session unavailable"));
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !design || panel !== "layout") return;
    canvas.width = design.canvas.width;
    canvas.height = design.canvas.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const images: Record<string, CanvasImageSource> = {};
    let stopped = false;
    const loaded = Promise.all(photos.map((photo) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => { images[photo.id] = image; resolve(); };
      image.onerror = () => resolve();
      image.src = photo.url;
    })));
    const overlay = currentTemplate?.layout_config.overlay
      ? new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = `/api/public/events/${code}/templates/${templateId}/overlay`;
        })
      : Promise.resolve(null);
    Promise.all([loaded, overlay]).then(([, overlayImage]) => {
      if (!stopped) renderDesign(context, design, images, overlayImage ?? undefined, { showPhotoPlaceholders: false });
    });
    return () => { stopped = true; };
  }, [design, photos, templateId, currentTemplate, code, panel]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const remaining = photoLimit - photos.length;
    if (remaining <= 0) return setError(`This layout supports up to ${photoLimit} photos. Remove a photo or choose a layout with more photo slots.`);
    if (selectedFiles.length > remaining) return setError(`This layout has room for ${remaining} more photo${remaining === 1 ? "" : "s"}. Select fewer images or choose a layout with more photo slots.`);
    setError("");
    setBusy("Adding your photos…");
    try {
      const form = new FormData();
      selectedFiles.forEach((file) => form.append("files", file));
      form.append("template_id", templateId);
      const response = await fetch(`/api/public/events/${code}/photos`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Photo upload failed");
      const nextPhotos = result.photos ?? [];
      setPhotos(nextPhotos);
      setDesign((current) => current ? autoPlacePhotos(current, nextPhotos) : current);
      setBusy("");
    } catch (reason) {
      setBusy("");
      setError(reason instanceof Error ? reason.message : "Photo upload failed");
    }
  };

  const removePhoto = async (id: string) => {
    const response = await fetch(`/api/public/events/${code}/photos/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not remove photo");
    const remaining = photos.filter((photo) => photo.id !== id);
    setPhotos(remaining);
    setDesign((current) => current ? autoPlacePhotos({ ...current, elements: current.elements.map((element) => element.photoId === id ? { ...element, photoId: undefined } : element) }, remaining) : current);
  };

  const chooseTemplate = (id: string) => {
    const template = event.templates.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setDesign(autoPlacePhotos(toDesign(template), photos));
    setSelected(null);
    setError("");
  };

  const submit = async () => {
    if (!canPrint || !design || !currentTemplate) return;
    if (event.marketing_consent_enabled && !consent) return setError("Choose whether you consent to marketing use.");
    const chosenPackage = event.print_packages.find((item) => item.code === packageCode);
    if (!chosenPackage || !printSize) return setError("Choose a print size and package.");
    setBusy("Preparing your print…");
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = design.canvas.width;
      canvas.height = design.canvas.height;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Canvas rendering is unavailable in this browser");
      const images: Record<string, CanvasImageSource> = {};
      await Promise.all(photos.map((photo) => new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => { images[photo.id] = image; resolve(); };
        image.onerror = () => reject(Error(`Photo “${photo.filename}” could not be loaded. Refresh and try again.`));
        image.src = photo.url;
      })));
      let overlayImage: HTMLImageElement | undefined;
      if (currentTemplate.layout_config.overlay) {
        overlayImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(Error("Template overlay could not be loaded. Refresh and try again."));
          image.src = `/api/public/events/${code}/templates/${templateId}/overlay`;
        });
      }
      renderDesign(context, design, images, overlayImage, { showPhotoPlaceholders: false });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(Error("Could not render print file")), "image/png"));
      const tagged = addDpiMetadata(new Uint8Array(await blob.arrayBuffer()), "image/png", design.canvas.dpi);
      const form = new FormData();
      form.append("export", new Blob([tagged.buffer as ArrayBuffer], { type: "image/png" }), "guest-print.png");
      form.append("design", JSON.stringify(design));
      form.append("template_id", currentTemplate.id);
      form.append("package_code", chosenPackage.code);
      form.append("quantity", String(chosenPackage.quantity));
      form.append("print_size", printSize);
      if (consent) form.append("marketing_consent", consent);
      const response = await fetch(`/api/public/events/${code}/orders`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Order was not submitted");
      window.location.assign(`/order/${result.trackingToken}`);
    } catch (reason) {
      setBusy("");
      setError(reason instanceof Error ? reason.message : "Order submission failed");
    }
  };

  const editElement = (key: keyof DesignElement, value: unknown) => setDesign((current) => current ? ({
    ...current,
    elements: current.elements.map((element) => element.id === selected ? { ...element, [key]: value } : element),
  }) : current);
  const color = event.primary_color || "#1978ec";

  return <div className="guest-portal guest-home" style={{ "--guest-accent": color, "--guest-brand-secondary": event.secondary_color || "#172b62" } as React.CSSProperties}>
    <header className="guest-sticky-header">
      <a className="guest-home-brand" href="#home" aria-label="SnapQueue guest home"><span className="guest-camera-mark">SQ</span><span>SnapQueue</span></a>
      <div className="guest-queue-pill" aria-live="polite"><span>Your queue number</span><strong>—</strong></div>
    </header>

    {event.templates.length === 0 ? <section className="guest-home-empty"><h1>{event.name}</h1><p>Ordering is not available yet. The event operator has not enabled a print layout.</p></section> : <>
      <section className="guest-home-hero" id="home">
        <div className="guest-home-event">
          <p className="guest-eyebrow">{event.event_type || "PHOTOBOOTH"}</p>
          <h1>{event.name}</h1>
          <p>{[event.event_date, event.venue].filter(Boolean).join(" · ") || "Make a photo memory to take home"}</p>
          {event.guest_instructions && <details className="guest-instructions"><summary>Event instructions</summary><p>{event.guest_instructions}</p></details>}
        </div>
        <CameraMascot />
      </section>

      <section className="guest-home-actions" aria-label="Photo booth actions">
        <label className={`guest-action-circle guest-action-upload ${!guestReady || busy || photos.length >= photoLimit ? "is-disabled" : ""}`}>
          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple disabled={!guestReady || !!busy || photos.length >= photoLimit} onChange={(eventChange) => { void upload(eventChange.target.files); eventChange.target.value = ""; }} />
          <ActionIcon kind="upload" />
          <strong>{photos.length ? "Add Photos" : "Upload Photos"}</strong>
          <span>{photos.length} of {photoLimit} selected</span>
        </label>
        <p className="guest-action-hint">Tap to choose your photos</p>

        <div className="guest-secondary-actions">
          <button className="guest-action-circle guest-action-layout" type="button" onClick={() => setPanel("layout")}>
            <ActionIcon kind="layout" /><strong>Choose<br />Layout</strong><span>{currentTemplate?.name ?? "Select a layout"}</span>
          </button>
          <button className="guest-action-circle guest-action-gallery" type="button" onClick={() => setPanel("gallery")}>
            <ActionIcon kind="gallery" /><strong>View<br />Gallery</strong><span>{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : "Your photos"}</span>
          </button>
        </div>

        {canPrint && <button className="guest-action-circle guest-action-print" type="button" onClick={() => setPanel("print")}>
          <ActionIcon kind="print" /><strong>Print</strong><span>Ready when you are</span>
        </button>}
      </section>

      <section className="guest-home-summary" aria-label="Your selections">
        <div><span className="guest-summary-icon">▧</span><div><strong>{currentTemplate?.name ?? "Choose a layout"}</strong><small>{printDimensions(currentTemplate)}</small></div><button type="button" onClick={() => setPanel("layout")}>Change</button></div>
        {photos.length > 0 && <div><span className="guest-summary-icon">▣</span><div><strong>{photos.length} photo{photos.length === 1 ? "" : "s"} selected</strong><small>Photos are fitted automatically to your layout.</small></div><button type="button" onClick={() => setPanel("gallery")}>View</button></div>}
      </section>
      <footer className="guest-home-footer"><span>🎉</span> Have fun and enjoy your photos! <span aria-hidden="true">♥</span></footer>
    </>}

    {error && <p className="form-error guest-error guest-home-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss">×</button></p>}
    {busy && <p className="guest-busy guest-home-busy" role="status">{busy}</p>}
    {!guestReady && <p className="guest-home-loading" role="status">Getting the photo booth ready…</p>}

    {panel && <div className="guest-panel-backdrop" onMouseDown={(eventMouse) => { if (eventMouse.target === eventMouse.currentTarget) setPanel(null); }}>
      <section className="guest-panel" role="dialog" aria-modal="true" aria-label={panel === "layout" ? "Choose a print layout" : panel === "gallery" ? "Your photo gallery" : "Print options"}>
        <div className="guest-panel-header"><div><p className="guest-eyebrow">{event.name}</p><h2>{panel === "layout" ? "Choose a layout" : panel === "gallery" ? "Your gallery" : "Ready to print?"}</h2></div><button className="guest-panel-close" type="button" onClick={() => { setPanel(null); setError(""); }} aria-label="Close">×</button></div>

        {panel === "layout" && <div className="guest-layout-panel">
          <div className="guest-layout-options">{event.templates.map((template) => <button type="button" key={template.id} className={`guest-layout-option ${templateId === template.id ? "active" : ""}`} onClick={() => chooseTemplate(template.id)}><strong>{template.name}</strong><small>{printDimensions(template)} · {photoSlotCount(template)} photo slots</small></button>)}</div>
          <div className="guest-layout-preview-wrap">{design && <canvas ref={canvasRef} className="guest-layout-canvas" onClick={(eventClick) => {
            const model = design;
            const bounds = eventClick.currentTarget.getBoundingClientRect();
            const x = (eventClick.clientX - bounds.left) * model.canvas.width / bounds.width;
            const y = (eventClick.clientY - bounds.top) * model.canvas.height / bounds.height;
            const hit = [...model.elements].sort((a, b) => b.zIndex - a.zIndex).find((element) => x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height);
            if (hit) setSelected(hit.id);
          }} />}</div>
          <p className="guest-panel-note">Your photos automatically resize to fill each slot. Print size: {printDimensions(currentTemplate)}.</p>
          {design?.elements.filter((element) => element.type === "photo").map((element) => <label className="guest-slot-picker" key={element.id}><span>{element.name ?? `Photo slot ${element.slotNumber ?? ""}`} {element.required !== false && <b>Required</b>}</span><select value={element.photoId ?? ""} onChange={(eventChange) => setDesign((current) => current ? ({ ...current, elements: current.elements.map((item) => item.id === element.id ? { ...item, photoId: eventChange.target.value || undefined } : item) }) : current)}><option value="">Choose a photo</option>{photos.filter((photo) => photo.id === element.photoId || !design?.elements.some((item) => item.type === "photo" && item.id !== element.id && item.photoId === photo.id)).map((photo) => <option key={photo.id} value={photo.id}>{photo.filename}</option>)}</select></label>)}
          <button className="guest-panel-primary" type="button" onClick={() => setPanel(null)}>Use this layout</button>
        </div>}

        {panel === "gallery" && <div className="guest-gallery-panel">
          {photos.length === 0 ? <div className="guest-gallery-empty"><span>📷</span><strong>Your gallery is waiting</strong><p>Upload a photo and it will show up here.</p><button className="guest-panel-primary" type="button" onClick={() => setPanel(null)}>Upload photos</button></div> : <div className="guest-gallery-grid">{photos.map((photo) => <article className="guest-gallery-photo" key={photo.id}><NextImage src={photo.url} alt={photo.filename} width={photo.width_px} height={photo.height_px} unoptimized/><button type="button" onClick={() => void removePhoto(photo.id)}>Remove</button></article>)}</div>}
          <p className="guest-panel-note">{photos.length} of {photoLimit} photos selected for {currentTemplate?.name ?? "this layout"}.</p>
        </div>}

        {panel === "print" && <div className="guest-print-panel">
          <div className="guest-print-preview"><CameraMascot /><div><strong>{photos.length} photo{photos.length === 1 ? "" : "s"} · {currentTemplate?.name}</strong><small>{printDimensions(currentTemplate)}</small></div></div>
          <div className="form-grid"><div className="field"><label>Print size</label><select value={printSize} onChange={(eventChange) => setPrintSize(eventChange.target.value)}>{event.print_sizes.map((size) => <option key={size} value={size}>{size.replace("x", " × ")} in</option>)}</select></div><div className="field"><label>Print package</label><select value={packageCode} onChange={(eventChange) => setPackageCode(eventChange.target.value)}>{event.print_packages.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.quantity} print{item.quantity === 1 ? "" : "s"}</option>)}</select></div></div>
          {event.marketing_consent_enabled && <fieldset className="guest-consent"><legend>Optional marketing permission</legend><p>Permission to print is separate from permission to publish.</p><label><input type="radio" name="marketing" checked={consent === "no"} onChange={() => setConsent("no")}/> Do not use my photos for marketing</label><label><input type="radio" name="marketing" checked={consent === "yes"} onChange={() => setConsent("yes")}/> I consent to marketing use</label></fieldset>}
          <div className="guest-queue-confirm"><span>Your queue number</span><strong>Assigned after you print</strong></div>
          <button className="guest-panel-primary" type="button" disabled={!!busy || (event.marketing_consent_enabled && !consent)} onClick={() => void submit()}>{busy || "Send to print queue"}</button>
          <p className="guest-panel-note">Submitting sends your print file to the event queue.</p>
        </div>}
      </section>
    </div>}
  </div>;
}
