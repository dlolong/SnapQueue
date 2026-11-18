import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tokenHash } from "@/lib/guest/security";
import { OrderStatus } from "@/components/guest/order-status";
export const dynamic="force-dynamic";
export default async function OrderPage({params}:{params:Promise<{token:string}>}){const {token}=await params;if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))notFound();const supabase=await createClient();const {data,error}=await supabase.rpc("get_guest_order",{p_tracking_token_hash:tokenHash(token)});if(error||!data)notFound();return <main className="guest-page"><OrderStatus token={token} initialOrder={data}/></main>}
