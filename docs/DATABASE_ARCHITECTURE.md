# Database architecture

## Tenant boundary

`workspace_members` is the authorization source. Server code calls Supabase SSR `auth.getUser()`, resolves membership, and applies `workspace_id` filters. RLS policies use `is_workspace_member(uuid)`, a narrowly scoped `SECURITY DEFINER` function with a fixed search path. Workspace creation triggers insertion of the authenticated creator's owner membership. The public API cannot self-assign membership in an existing workspace.

The session creation RPC checks `auth.uid()` membership itself and allocates a sequence value by atomically updating `workspace_session_counters`. Session/event/template references and photo/export/session references have tenant-consistency triggers. This prevents a valid member from attaching another workspace's event or media row to their own session.

## Tables

- `workspaces`, `workspace_members`: tenant and roles.
- `events`: event details and lifecycle status.
- `templates`: system records (`workspace_id IS NULL`, `is_system`) and workspace copies.
- `photo_sessions`: event or walk-in session, unique per-workspace human session number, status, selected template, and versioned design JSON.
- `photos`: private original path, original name, MIME, byte size, optional dimensions, and ordering.
- `session_exports`: private path, output format, exact pixel dimensions, DPI, version, and size.
- `workspace_session_counters`: serialized counter per tenant.

## Storage

Migration `0003_phase_1_security.sql` creates private `snapqueue-originals` and `snapqueue-exports` buckets. Object keys begin with the workspace UUID: `{workspace_id}/{session_id}/original/{unique-name}` and `{workspace_id}/{session_id}/exports/vN-{uuid}.{extension}`. Storage policies verify membership against the first path segment. The app uses signed URLs for previews and downloads; uploaded paths are never public URLs.

## Indexes and constraints

Tenant/date, tenant/status, tenant/session, photo/session sort, and export/session version indexes support the primary list views. Unique workspace/session numbering and session/export version constraints prevent duplicate identifiers. Foreign keys cascade photos and exports with sessions and clear an event's session association when an event is deleted.

Apply migrations in numeric order through `0004_authenticated_table_grants.sql`. SQL `GRANT`s permit the authenticated API role to reach the tables; they do not bypass RLS. The pgTAP isolation check is `supabase/tests/phase_1_rls.test.sql`.

## Guest event ordering

Migration `0005_guest_ordering.sql` adds a 192-bit random `events.public_event_code`, an enable flag, per-event order/photo/template settings, guest sessions, private guest photo metadata, queue counters, `print_jobs`, and hashed rate-limit buckets. A code rotation revokes every previous guest URL. Event defaults copy all active system and workspace templates into the event's allowlist; selected templates are checked against the event workspace by a database trigger and again when an order is submitted. Migration `0006_template_overlays.sql` creates private PNG overlay storage; authorized app routes serve assets to workspace editors and only event-approved templates to guests. Migration `0007_template_guest_slot_rules.sql` checks guest slot assignments against the selected template and requires assigned images for required slots.

Guests have no direct table or Storage privileges. The anonymous role can only execute `get_public_guest_event` and `get_guest_order`. The former returns the event's guest-safe projection without its internal event/workspace IDs. The latter accepts a SHA-256 hash of a high-entropy bearer token and returns order status only. Session creation/verification, rate limiting, photo registration, and order submission RPCs are executable only by `service_role`, called from server routes. Rate-limit keys HMAC the request IP with the server-only key. Raw session and tracking tokens are delivered only via an HttpOnly event-scoped cookie or private status URL; only hashes are persisted.

The service routes verify cookies before reading or mutating guest data. Uploaded files are signature-checked, dimension-checked, and copied to private `snapqueue-guest-uploads`; export files are dimension/DPI checked before private `snapqueue-guest-exports` upload. Object keys include the random public event code and guest-session UUID. Guest access to an upload is proxied only after verifying that the photo belongs to the cookie's session. Operators see queue rows under workspace RLS; only trusted server code creates signed preview links.

Queue numbers are allocated by updating one counter row per event in the same transaction that creates a job, so concurrent submissions serialize and receive unique increasing values. A paused queue stores automatic orders in `submitted`; resume atomically changes those rows to `queued`. Manual approval stores jobs as `pending_approval`. `queue_position` and priority provide stable ordering. Realtime publishes `print_jobs` changes to authenticated clients, with the UI polling as fallback. Queue statuses record order/operator/agent state; without a connected agent, no physical print is implied.

The daily maintenance endpoint removes guest source photos after each event's configured retention period and clears expired guest sessions and old rate-limit rows. Configure a scheduler to call `POST /api/maintenance/guest-retention` with `Authorization: Bearer $CRON_SECRET`. Retention is not enforced until this job is scheduled. The private final export is retained with the job for operator fulfilment; deleting export history should be a separately defined business rule.

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in browser/SSR clients and server-only `SUPABASE_SECRET_KEY` for trusted guest routes. The application temporarily accepts legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as fallback variable names to allow zero-downtime rotation. Never expose the secret key to a browser. Supabase secret keys map to the elevated `service_role` database role, so the existing SQL grants and policies do not need to change. Migrations must be applied in sequence through `0007_template_guest_slot_rules.sql`; automated SQL coverage is in `supabase/tests/guest_queue.test.sql` and `supabase/tests/phase_1_rls.test.sql`.
