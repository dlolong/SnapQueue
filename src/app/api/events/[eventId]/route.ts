import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: paths, error } = await supabase.rpc("delete_workspace_event", { p_event_id: eventId });
  if (error) {
    const status = /not found/i.test(error.message) ? 404 : /access denied/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  const admin = createAdminClient();
  const cleanup = await Promise.all([
    remove("snapqueue-guest-uploads", paths?.uploads),
    remove("snapqueue-guest-exports", paths?.exports),
    remove("snapqueue-originals", paths?.legacy_originals),
    remove("snapqueue-exports", paths?.legacy_exports),
  ]);
  const cleanupWarning = cleanup.some(Boolean) ? "The event was deleted, but some stored files could not be removed." : undefined;
  return NextResponse.json({ ok: true, ...(cleanupWarning ? { warning: cleanupWarning } : {}) });

  async function remove(bucket: string, value: unknown): Promise<boolean> {
    const paths = Array.isArray(value) ? value.filter((path): path is string => typeof path === "string" && path.length > 0) : [];
    if (!paths.length) return false;
    const { error } = await admin.storage.from(bucket).remove(paths);
    return Boolean(error);
  }
}
