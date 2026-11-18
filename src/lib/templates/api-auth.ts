import { createClient } from "@/lib/supabase/server";

export async function templateApiContext(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {error:"Sign in required",status:401 as const};
 const {data:membership,error}=await supabase.from("workspace_members").select("workspace_id,role").eq("user_id",user.id).order("created_at").limit(1).maybeSingle();
 if(error)return {error:error.message,status:500 as const};
 if(!membership)return {error:"Workspace not found",status:403 as const};
 if(!["owner","admin","operator"].includes(membership.role))return {error:"Template editing permission required",status:403 as const};
 return {supabase,user,workspaceId:membership.workspace_id};
}
