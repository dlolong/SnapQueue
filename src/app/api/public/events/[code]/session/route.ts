import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestCookieName,randomGuestToken,rateLimit,tokenHash } from "@/lib/guest/security";
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}){
 const {code}=await params;if(!/^[a-f0-9]{48}$/.test(code))return NextResponse.json({error:"Event unavailable"},{status:404});const admin=createAdminClient();
 try{if(!await rateLimit(request.headers,code,"session",12,900))return NextResponse.json({error:"Please wait before starting another guest session."},{status:429});const token=randomGuestToken();const {data,error}=await admin.rpc("create_guest_session",{p_code:code,p_access_token_hash:tokenHash(token)});if(error||!data)return NextResponse.json({error:error?.message??"Guest portal unavailable"},{status:404});const response=NextResponse.json({ready:true,max_photos_per_guest:data.max_photos_per_guest,max_photo_size_bytes:data.max_photo_size_bytes});response.cookies.set(guestCookieName(code),token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:`/api/public/events/${code}`,maxAge:7*24*60*60});return response}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to start guest session"},{status:503})}
}
