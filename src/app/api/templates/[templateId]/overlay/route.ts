import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request:Request,{params}:{params:Promise<{templateId:string}>}){
 const {templateId}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
 const {data:membership}=await supabase.from("workspace_members").select("workspace_id").eq("user_id",user.id).order("created_at").limit(1).maybeSingle();if(!membership)return NextResponse.json({error:"Workspace not found"},{status:403});
 const {data:template,error}=await supabase.from("templates").select("workspace_id,is_system,layout_config").eq("id",templateId).maybeSingle();if(error||!template||(!template.is_system&&template.workspace_id!==membership.workspace_id))return NextResponse.json({error:"Template unavailable"},{status:404});
 const layout=template.layout_config as {overlay?:{path?:string}}|null;const path=layout?.overlay?.path;if(!path)return NextResponse.json({error:"Overlay unavailable"},{status:404});
 const {data,error:downloadError}=await createAdminClient().storage.from("snapqueue-template-overlays").download(path);if(downloadError||!data)return NextResponse.json({error:"Overlay unavailable"},{status:404});
 return new Response(data,{headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}});
}
