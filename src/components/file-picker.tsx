"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";

export function FilePicker({ id, name, accept, required = false }: { id: string; name: string; accept: string; required?: boolean }) {
  const [filename, setFilename] = useState("");

  return <label className="workspace-file-picker" htmlFor={id}>
    <span className="workspace-file-picker-copy">
      <span className="workspace-file-picker-icon"><ImagePlus size={19}/></span>
      <span className="workspace-file-picker-text">
        <strong>{filename || "Choose a logo image"}</strong>
        <small>{filename ? "Ready to upload" : "PNG, JPG, or WebP · up to 2 MB"}</small>
      </span>
    </span>
    <span className="workspace-file-picker-button">Browse files</span>
    <input id={id} name={name} type="file" accept={accept} required={required} onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? "")}/>
  </label>;
}
