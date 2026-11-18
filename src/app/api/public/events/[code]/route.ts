import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/guest/security";
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}){
 const {code}=await params;if(!/^[a-f0-9]{48}$/.test(code))return NextResponse.json({error:"Event unavailable"},{status:404});
 const supabase=await createClient();try{if(!await rateLimit(request.headers,code,"event",120,60))return NextResponse.json({error:"Too many requests"},{status:429});const {data,error}=await supabase.rpc("get_public_guest_event",{p_code:code});if(error||!data)return NextResponse.json({error:"Event unavailable"},{status:404});return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load event"},{status:503})}
}
