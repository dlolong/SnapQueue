import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowed = new Set(["accept", "print", "reprint", "confirm_printed", "delete"]);

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: event } = await supabase.from("events").select("id,workspace_id").eq("id", eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const { data: membership } = await supabase.from("workspace_members").select("workspace_id,role")
    .eq("user_id", user.id).eq("workspace_id", event.workspace_id).maybeSingle();
  if (!membership || !["owner", "admin", "operator"].includes(membership.role)) {
    return NextResponse.json({ error: "Operator access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const jobId = body?.jobId ? String(body.jobId) : null;
  if (!allowed.has(action) || !jobId) return NextResponse.json({ error: "Invalid queue action" }, { status: 400 });

  const { data, error } = await supabase.rpc("operate_print_queue", {
    p_event_id: eventId,
    p_job_id: jobId,
    p_action: action,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if ((action === "print" || action === "reprint") && data?.attempt_id) {
    return NextResponse.json({ ...data, print_url: `/events/${eventId}/queue/${jobId}/print?attemptId=${encodeURIComponent(data.attempt_id)}` });
  }
  return NextResponse.json(data);
}
