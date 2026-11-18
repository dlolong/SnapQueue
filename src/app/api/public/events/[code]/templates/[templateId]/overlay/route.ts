import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/guest/security";

export async function GET(request:Request,{params}:{params:Promise<{code:string;templateId:string}>}){
 const {code,templateId}=await params;if(!/^[a-f0-9]{48}$/.test(code))return NextResponse.json({error:"Event unavailable"},{status:404});
 try{
  if(!await rateLimit(request.headers,code,"overlay",300,60))return NextResponse.json({error:"Too many requests"},{status:429});
  const supabase=await createClient();const {data,error}=await supabase.rpc("get_public_guest_event",{p_code:code});if(error||!data)return NextResponse.json({error:"Event unavailable"},{status:404});
  const template=(data.templates as Array<{id:string;layout_config?:{overlay?:{path?:string}}}>).find(item=>item.id===templateId);const path=template?.layout_config?.overlay?.path;
  if(!path)return NextResponse.json({error:"Overlay unavailable"},{status:404});
  const {data:file,error:downloadError}=await createAdminClient().storage.from("snapqueue-template-overlays").download(path);if(downloadError||!file)return NextResponse.json({error:"Overlay unavailable"},{status:404});
  return new Response(file,{headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"Overlay unavailable"},{status:503})}
}
