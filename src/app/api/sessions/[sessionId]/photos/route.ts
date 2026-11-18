import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_PHOTO_BYTES,validatePhoto } from "@/lib/media-validation.mjs";
import { imageDimensions } from "@/lib/design/raster-metadata.mjs";

export async function POST(request:Request,{params}:{params:Promise<{sessionId:string}>}){
 const {sessionId}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
 const {data:members}=await supabase.from("workspace_members").select("workspace_id").eq("user_id",user.id).limit(1);
 const workspaceId=members?.[0]?.workspace_id;if(!workspaceId)return NextResponse.json({error:"Workspace not found"},{status:403});
 const {data:session}=await supabase.from("photo_sessions").select("id").eq("id",sessionId).eq("workspace_id",workspaceId).maybeSingle();
 if(!session)return NextResponse.json({error:"Session not found"},{status:404});
 let form:FormData;try{form=await request.formData()}catch{return NextResponse.json({error:"Invalid multipart upload"},{status:400})}
 const files=form.getAll("files").filter((x):x is File=>x instanceof File);
 if(!files.length||files.length>10)return NextResponse.json({error:"Choose between 1 and 10 image files"},{status:400});
 const inputs:{file:File;bytes:Uint8Array;path:string;dimensions:{width:number;height:number}|null}[]=[];
 for(const file of files){
  if(file.size<1||file.size>MAX_PHOTO_BYTES||!["image/jpeg","image/png","image/webp"].includes(file.type))return NextResponse.json({error:`${file.name}: use JPEG, PNG, or WebP up to 20 MB`},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());if(!validatePhoto(file.type,bytes))return NextResponse.json({error:`${file.name}: file content does not match its image type`},{status:400});
  let dimensions:null|{width:number;height:number}=null;try{dimensions=imageDimensions(bytes,file.type)}catch{/* Signature-checked images without readable dimensions remain uploadable. */}
  const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)||"photo";
  inputs.push({file,bytes,dimensions,path:`${workspaceId}/${sessionId}/original/${crypto.randomUUID()}-${clean}`});
 }
 const storedPaths:string[]=[];const photoIds:string[]=[];const uploaded:unknown[]=[];
 const rollback=async()=>{if(photoIds.length)await supabase.from("photos").delete().in("id",photoIds).eq("workspace_id",workspaceId);if(storedPaths.length)await supabase.storage.from("snapqueue-originals").remove(storedPaths)};
 for(const item of inputs){
  const {error:uploadError}=await supabase.storage.from("snapqueue-originals").upload(item.path,item.bytes,{contentType:item.file.type,upsert:false});
  if(uploadError){await rollback();return NextResponse.json({error:uploadError.message},{status:400})}storedPaths.push(item.path);
  const {data:photo,error:dbError}=await supabase.from("photos").insert({workspace_id:workspaceId,session_id:sessionId,original_path:item.path,filename:item.file.name.slice(0,255),mime_type:item.file.type,file_size:item.file.size,width_px:item.dimensions?.width??null,height_px:item.dimensions?.height??null}).select("id,filename,mime_type,file_size,original_path,created_at").single();
  if(dbError){await rollback();return NextResponse.json({error:dbError.message},{status:400})}photoIds.push(photo.id);uploaded.push(photo);
 }
 return NextResponse.json({photos:uploaded},{status:201});
}
