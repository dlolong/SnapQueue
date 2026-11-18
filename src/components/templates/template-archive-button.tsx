"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TemplateArchiveButton({id,active}:{id:string;active:boolean}){const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");const run=async()=>{setBusy(true);setError("");const response=await fetch("/api/templates",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,is_active:!active})});const result=await response.json();setBusy(false);if(!response.ok){setError(result.error??"Could not update template");return}router.refresh()};return <span><button className="button secondary" onClick={()=>void run()} disabled={busy}>{busy?"Saving…":active?"Archive":"Restore"}</button>{error&&<small className="form-error">{error}</small>}</span>}
