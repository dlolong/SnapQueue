"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function DeletePhotoButton({id}:{id:string}){const router=useRouter();const [error,setError]=useState("");const [busy,setBusy]=useState(false);return <div>{error&&<small className="form-error">{error}</small>}<button className="button danger" disabled={busy} onClick={async()=>{if(!window.confirm("Permanently delete this uploaded photo?"))return;setBusy(true);setError("");const r=await fetch(`/api/photos/${id}`,{method:"DELETE"});const j=await r.json();if(!r.ok){setError(j.error??"Delete failed");setBusy(false)}else router.refresh()}}>{busy?"Deleting…":"Delete photo"}</button></div>}
