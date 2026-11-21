import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { templateApiContext } from "@/lib/templates/api-auth";
import { validDesign } from "@/lib/design/model";

export async function POST(request:Request){
 const context=await templateApiContext();if("error" in context)return NextResponse.json({error:context.error},{status:context.status});
 const body=await request.json().catch(()=>null);if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid template data"},{status:400});
 const name=String(body.name??"").trim(),description=String(body.description??"").trim(),category=String(body.category??"Custom").trim();
 const width=Number(body.width_px),height=Number(body.height_px),dpi=Number(body.dpi),background=String(body.background??"#ffffff");
 if(name.length<2||name.length>120||!Number.isInteger(width)||!Number.isInteger(height)||!Number.isInteger(dpi)||width<1||height<1||width>5000||height>5000||dpi<72||dpi>1200||!/^#[0-9a-fA-F]{6}$/.test(background))return NextResponse.json({error:"Enter a valid name, canvas size, DPI, and background color"},{status:400});
 const layout=body.layout_config;if(!validDesign(layout)||layout.canvas.width!==width||layout.canvas.height!==height||layout.canvas.dpi!==dpi)return NextResponse.json({error:"Template design does not match its canvas settings"},{status:400});
 if(layout.overlay&& !layout.overlay.path.startsWith(`${context.workspaceId}/templates/`))return NextResponse.json({error:"Overlay asset is outside this workspace"},{status:400});
 if(!Array.isArray(body.photo_slots)||body.photo_slots.length>100)return NextResponse.json({error:"Invalid photo slot list"},{status:400});
 const row={name,description:description.slice(0,500),category:category.slice(0,40),workspace_id:context.workspaceId,is_system:false,is_active:true,width_px:width,height_px:height,width_inches:Number((width/dpi).toFixed(3)),height_inches:Number((height/dpi).toFixed(3)),unit:"in",dpi,background:{type:"color",value:background},layout_config:{...layout,version:2,photo_slots_required:body.photo_slots_required!==false}};
 const id=typeof body.id==="string"?body.id:null;let oldPath:string|undefined;
 if(id){const {data:existing,error:readError}=await context.supabase.from("templates").select("id,layout_config").eq("id",id).eq("workspace_id",context.workspaceId).eq("is_system",false).maybeSingle();if(readError||!existing)return NextResponse.json({error:readError?.message??"Template not found"},{status:404});oldPath=(existing.layout_config as {overlay?:{path?:string}}|null)?.overlay?.path;const {data,error}=await context.supabase.from("templates").update({...row,updated_at:new Date().toISOString()}).eq("id",id).eq("workspace_id",context.workspaceId).select("id").maybeSingle();if(error||!data)return NextResponse.json({error:error?.message??"Template was not saved"},{status:400});}
 else{const {data,error}=await context.supabase.from("templates").insert(row).select("id").single();if(error||!data)return NextResponse.json({error:error?.message??"Template was not saved"},{status:400});body.id=data.id;}
 const newPath=layout.overlay?.path;if(id&&oldPath&&oldPath!==newPath&&oldPath.startsWith(`${context.workspaceId}/templates/`))await createAdminClient().storage.from("snapqueue-template-overlays").remove([oldPath]);
 return NextResponse.json({id:body.id??id});
}

export async function PATCH(request:Request){
 const context=await templateApiContext();if("error" in context)return NextResponse.json({error:context.error},{status:context.status});
 const body=await request.json().catch(()=>null);if(!body||typeof body.id!=="string"||typeof body.is_active!=="boolean")return NextResponse.json({error:"Invalid archive request"},{status:400});
 const {data,error}=await context.supabase.from("templates").update({is_active:body.is_active,updated_at:new Date().toISOString()}).eq("id",body.id).eq("workspace_id",context.workspaceId).eq("is_system",false).select("id").maybeSingle();
 if(error||!data)return NextResponse.json({error:error?.message??"Template not found"},{status:404});return NextResponse.json({ok:true});
}

export async function DELETE(request:Request){
 const context=await templateApiContext();if("error" in context)return NextResponse.json({error:context.error},{status:context.status});
 const body=await request.json().catch(()=>null);if(!body||typeof body.id!=="string")return NextResponse.json({error:"Invalid template delete request"},{status:400});
 const {data:path,error}=await context.supabase.rpc("delete_workspace_template",{p_template_id:body.id});
 if(error){const status=/not found/i.test(error.message)?404:/access denied|system templates/i.test(error.message)?403:/used by an event/i.test(error.message)?409:400;return NextResponse.json({error:error.message},{status});}
 const safePath=typeof path==="string"&&path.startsWith(`${context.workspaceId}/templates/`)?path:null;
 const {error:storageError}=safePath?await createAdminClient().storage.from("snapqueue-template-overlays").remove([safePath]):{error:null};
 return NextResponse.json({ok:true,...(storageError?{warning:"Template deleted, but its PNG overlay could not be removed."}:{})});
}
