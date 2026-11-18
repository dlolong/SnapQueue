import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Guest workflows require the server-only SUPABASE_SECRET_KEY environment variable (or legacy SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
