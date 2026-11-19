# Database architecture

## Tenant boundary

`workspace_members` is the authorization source. Server routes resolve the authenticated user's workspace and scope queries by `workspace_id`; RLS is the final isolation boundary. Public guest routes use high-entropy, hashed bearer tokens and narrowly scoped `SECURITY DEFINER` RPCs. Guest roles have no direct access to guest tables or private source storage.

## Event-centric records

- `workspaces`, `workspace_members`: workspace tenancy and roles.
- `events`: event details, lifecycle status, public QR token, and guest access toggle.
- `templates`: reusable system or workspace starting layouts.
- `event_layouts`: one customized active layout per event, version, canvas dimensions, DPI, overlay, and photo-slot geometry. A sync trigger maintains this row when the event layout is saved through the existing layout RPC.
- `event_guest_settings`: event print rules, consent, retention, queue settings, and a compatibility copy of the active layout used by existing queue RPCs.
- `print_jobs`: persistent event orders, atomic event queue number, layout snapshot/version, final output path, and status.
- `temporary_uploads`: private original guest photographs and their source metadata; records are associated with a print job after composition submission.
- `printable_images`: final compositions only, with event/job/queue association, path, format, physical and pixel dimensions, DPI, file size, quantity, and export version.

The application does not create or expose photo sessions. The legacy `photo_sessions`, `photos`, and `session_exports` tables remain in deployed databases to preserve historic records. Migration `0010_event_centric_printable_media.sql` does not destructively drop or rewrite that history.

## Storage and lifecycle

Guest source uploads remain in the private `snapqueue-guest-uploads` bucket and are mirrored into `temporary_uploads`; they are never shown in Photo Library. The daily retention endpoint removes them after the event's retention period but defers deletion while a print job is awaiting submission/approval. Final compositions are stored in the private `snapqueue-guest-exports` bucket and indexed in `printable_images`. A reprint job reuses the same stored composition rather than generating a duplicate library image.

The print-job insert trigger creates or links the printable image row and associates the source uploads referenced by the submitted design. The order route records the validated file size after the database job is committed. Reprint jobs share the original storage path and therefore link to the existing printable image row.

## Queue and layout consistency

Queue numbers are allocated by atomically incrementing one `event_queue_counters` row in the print-job submission RPC. The job stores a JSON snapshot and layout version, so a later event layout update does not change prior outputs. One `event_layouts` row per event plus its active-state constraint prevents template browsing or multiple active layouts in the guest workflow. The guest-safe event RPC returns only that active event layout.

Manual approval produces `pending_approval`; automatic orders enter `queued` unless the queue is paused. Operator actions cover approval, rejection, priority, cancel, retry, reprint, ready for pickup, and claimed status. Queue status is an operator/agent report, not a printer hardware guarantee.

## Migration and verification

Apply migrations in numeric order through `0010_event_centric_printable_media.sql`. Migration 0010 backfills active event layouts and printable-image rows from existing guest orders without deleting session records. It also mirrors existing guest photos into the temporary-upload index and links them to matching jobs where possible.

The app uses signed URLs for operator previews and download links; storage paths are not public. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is safe for browser/SSR clients; `SUPABASE_SECRET_KEY` is server-only for trusted guest operations and maintenance.
