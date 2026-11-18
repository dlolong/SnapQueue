import "server-only";
import { createHash,createHmac,randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const randomGuestToken=()=>randomBytes(32).toString("base64url");
export const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export function guestCookieName(code:string){return `sq_guest_${code}`;}
export function accessTokenFromCookie(header:string|null,code:string){
  const name=guestCookieName(code);const item=(header??"").split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
  return item?decodeURIComponent(item.slice(name.length+1)):null;
}
export async function rateLimit(headers:Headers,code:string,action:string,limit:number,windowSeconds:number){
  const ip=headers.get("x-forwarded-for")?.split(",")[0]?.trim()??headers.get("x-real-ip")??"unknown";
  const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new Error("Guest rate limiting requires SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).");
  const scope=createHmac("sha256",secret).update(`${action}:${code}:${ip}`).digest("hex");
  const {data,error}=await createAdminClient().rpc("consume_guest_rate_limit",{p_scope_hash:scope,p_limit:limit,p_window_seconds:windowSeconds});
  if(error)throw new Error(`Guest rate limit check failed: ${error.message}`);
  return data===true;
}
