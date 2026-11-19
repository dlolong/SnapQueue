"use client";

import { useEffect, useMemo, useRef } from "react";
import { renderDesign } from "@/lib/design/render";
import type { DesignElement, DesignModel, OverlayElement } from "@/lib/design/model";

type PreviewTemplate = {
  id: string;
  name: string;
  width_px: number;
  height_px: number;
  dpi: number;
  layout_config: unknown;
  background?: unknown;
};

function toPreviewDesign(template: PreviewTemplate): DesignModel {
  const raw = (template.layout_config && typeof template.layout_config === "object" ? template.layout_config : {}) as {
    canvas?: { background?: string };
    elements?: Array<Record<string, unknown>>;
    overlay?: OverlayElement;
  };
  return {
    version: 2,
    canvas: {
      width: template.width_px,
      height: template.height_px,
      dpi: template.dpi,
      background: raw.canvas?.background ?? (template.background as { value?: string } | undefined)?.value ?? "#fff",
    },
    overlay: raw.overlay,
    elements: (raw.elements ?? []).map((element, index) => {
      const config = (element.configuration && typeof element.configuration === "object" ? element.configuration : {}) as Record<string, unknown>;
      return {
        id: String(element.id ?? `preview-${index}`),
        type: element.type === "text" || element.type === "shape" ? element.type : "photo",
        x: Number(element.x ?? 0), y: Number(element.y ?? 0),
        width: Number(element.width ?? 1), height: Number(element.height ?? 1),
        rotation: Number(element.rotation ?? 0), zIndex: Number(element.zIndex ?? index),
        visible: element.visible !== false, locked: false,
        name: String(element.name ?? `Photo ${index + 1}`),
        required: element.required !== false,
        slotNumber: Number(element.slotNumber ?? index + 1),
        fit: element.fit === "contain" || config.fit === "contain" ? "contain" : "cover",
        cropX: Number(element.cropX ?? 0.5), cropY: Number(element.cropY ?? 0.5),
        text: String(element.text ?? config.text ?? ""),
        fontSize: Number(element.fontSize ?? config.fontSize ?? 48),
        color: String(element.color ?? config.color ?? "#222222"),
        background: String(element.background ?? element.color ?? config.color ?? "#eeeeee"),
        align: element.align === "left" || element.align === "right" ? element.align : config.align === "left" || config.align === "right" ? config.align : "center",
      } as DesignElement;
    }),
  };
}

export function TemplatePreview({ template, overlayUrl }: { template: PreviewTemplate; overlayUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const design = useMemo(() => toPreviewDesign(template), [template]);
  const hasOverlay = !!design.overlay?.path;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = design.canvas.width;
    canvas.height = design.canvas.height;
    let disposed = false;
    const paint = (overlay?: HTMLImageElement) => {
      if (!disposed) renderDesign(context, design, {}, overlay, { showPhotoPlaceholders: true });
    };
    if (!hasOverlay) {
      paint();
      return () => { disposed = true; };
    }
    const image = new Image();
    image.onload = () => paint(image);
    image.onerror = () => paint();
    image.src = overlayUrl ?? `/api/templates/${template.id}/overlay`;
    return () => { disposed = true; image.onload = null; image.onerror = null; };
  }, [design, hasOverlay, overlayUrl, template.id]);

  return <div className="template-preview"><canvas ref={canvasRef} className="template-preview-canvas" aria-label={`Preview of ${template.name}`} /></div>;
}
