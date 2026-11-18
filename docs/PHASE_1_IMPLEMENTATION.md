# Phase 1 implementation

## Delivered

- Supabase SSR auth actions for signup, login, logout, and protected application routes. Workspace onboarding creates a workspace; a database trigger atomically creates the owner membership.
- A server workspace resolver obtains the authenticated user and their membership. User-supplied workspace IDs are not used as authorization claims. All application reads and mutations also filter by the resolved workspace; PostgreSQL RLS is the final isolation boundary.
- Database-backed dashboard counts, event CRUD/search/status filters/detail/session navigation, session creation with atomic workspace counters, and event/walk-in session lists.
- Private, multi-file original uploads with MIME allow-list, size ceiling, and file-signature validation. Photo records hold metadata and private object paths. Signed URLs are created for authenticated previews.
- Searchable photo library, private media deletion, seeded system layouts, workspace duplication and customization.
- Version 1 design JSON shared by editor preview and export rendering. The editor supports slot assignment, crop/fit, text, backgrounds, position, size, rotation, layer ordering, visibility, lock, duplicate, delete, undo, redo, save, and reload.
- PNG/JPEG export uses the composition renderer rather than a UI screenshot. Supported canvas sizes are 600×1800, 1200×1800, and 1200×1200 at 300 DPI. Density metadata and actual raster dimensions are validated by the export handler before the private versioned object and `session_exports` row are recorded.

## Configuration required

- Apply all SQL migrations in order to the target Supabase project, including `0004_authenticated_table_grants.sql` so the authenticated API role has SQL table privileges while RLS enforces row-level tenant access.
- Configure email/password auth, Site URL, and allowed local/production `/auth/callback` URLs in the Supabase dashboard. Set `NEXT_PUBLIC_SITE_URL` in each deployment environment.
- Configure SMTP/email confirmation policy according to deployment needs.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY` in deployment. The publishable key replaces `anon`; the secret key replaces `service_role` for trusted guest upload/order routes. For zero-downtime migration, old `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` variables are accepted as fallback names until all deployments are moved.

## Known limits

- Workspace membership is secure, but the current UI selects the user's first workspace. Multi-workspace switching/invitations are not exposed yet.
- Template customization edits a workspace-owned template's name, background, and JSON layout. It is a raw JSON layout editor rather than a full template-design mode.
- Exports currently support PNG and JPEG. The browser canvas is the rendering runtime; highly complex font/color-management needs, PDF output, and server-side rendering are future enhancements.
- The RLS isolation test is checked in for `supabase test db`, but cannot be run without a local Supabase/Postgres test stack.
- Settings currently cover the workspace name. Export preference profiles and member administration are not implemented.
