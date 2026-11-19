import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { templateApiContext } from "@/lib/templates/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await templateApiContext();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data: settings, error } = await context.supabase.from("event_guest_settings")
    .select("layout_config")
    .eq("event_id", eventId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error || !settings) return NextResponse.json({ error: "Event layout unavailable" }, { status: 404 });
  const layout = settings.layout_config as { overlay?: { path?: string } } | null;
  const path = layout?.overlay?.path;
  if (!path || !path.startsWith(`${context.workspaceId}/templates/`)) return NextResponse.json({ error: "Overlay unavailable" }, { status: 404 });
  const { data, error: downloadError } = await createAdminClient().storage.from("snapqueue-template-overlays").download(path);
  if (downloadError || !data) return NextResponse.json({ error: "Overlay unavailable" }, { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
