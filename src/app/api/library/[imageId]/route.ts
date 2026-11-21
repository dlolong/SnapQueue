import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: path, error } = await supabase.rpc("delete_workspace_printable_image", { p_image_id: imageId });
  if (error) {
    const status = /not found/i.test(error.message) ? 404 : /access denied/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  const { error: storageError } = await createAdminClient().storage.from("snapqueue-guest-exports").remove([path]);
  return NextResponse.json({ ok: true, ...(storageError ? { warning: "The library item was deleted, but its stored file could not be removed." } : {}) });
}
