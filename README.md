# SnapQueue Phase 1 + Event Guest Ordering

SnapQueue is a photobooth workspace MVP built on the existing Next.js App Router, TypeScript, Tailwind CSS v4, and Supabase architecture. Phase 1 covers workspaces, events, photo sessions, private photo storage, editable print layouts, a composition editor, printer-ready raster exports, and event QR self-service photo ordering with an operator-managed persistent queue. This queue is independent of printer hardware; it does not claim a print happened until an operator or future agent updates the order.

## Local setup

Requirements: Node.js 20.9+ (Node 22 LTS recommended) and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, and `CRON_SECRET` in `.env.local`. The secret key is server-only and required for guest workflow RPCs, private object handling, and maintenance. Never prefix it with `NEXT_PUBLIC_`. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names remain accepted as temporary fallbacks.

## Supabase project setup

1. Create a Supabase project and configure Authentication email/password.
2. Set `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000` locally and your canonical production origin when deployed). In Authentication → URL Configuration, set the matching Site URL and allow `/auth/callback` for local and production redirects.
2a. In Supabase Dashboard → Settings → API Keys, create/copy a publishable key (`sb_publishable_...`) and a secret key (`sb_secret_...`). Use each in its matching environment variable above. Deploy with both old and new keys enabled, confirm traffic works, then deactivate legacy keys after Supabase's last-used indicators show no remaining use.
3. Apply migrations in order: `0001_initial_schema.sql`, `0002_seed_system_templates.sql`, `0003_phase_1_security.sql`, `0004_authenticated_table_grants.sql`, `0005_guest_ordering.sql`, `0006_template_overlays.sql`, and `0007_template_guest_slot_rules.sql`. Migrations 0003–0007 install private buckets and policies, security helpers, guest queue tables, and the SQL grants needed by the Supabase API role; RLS continues to enforce tenant boundaries. Apply each migration in order using the Supabase CLI or SQL editor. If an earlier policy script partially ran, use the corrected idempotent migration file from this repository before applying subsequent migrations.
4. Confirm email confirmation and SMTP settings in Authentication. Signup redirects users to the confirmation message when confirmation is enabled.
5. Set the two public Supabase values in `.env.local`, then run the app.
6. Schedule `POST /api/maintenance/guest-retention` daily (or more often) with `Authorization: Bearer $CRON_SECRET`. Photo retention settings are enforced by this task; expired rows/objects otherwise remain stored.

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable or browser bundle. The publishable key is safe to expose; RLS remains responsible for user data access. New secret keys assume the same elevated `service_role` database role, so SQL grants and RLS policies do not need key-name changes.

## Workflows

- Sign up, sign in, workspace creation, and logout.
- Workspace-scoped dashboard, event CRUD/search/status filters, event sessions, and walk-in sessions.
- Sequential per-workspace session numbers.
- Multi-image upload (JPEG, PNG, WebP; 20 MB each) to private Storage and a searchable library.
- Seed system layouts and workspace template copies.
- Shared design JSON, canvas rendering, editor preview, save/reload, layers, photo slots, text, backgrounds, positioning, sizing, rotation, visibility, locking, z-order, duplicate, delete, undo, and redo.
- PNG and JPEG exports at supported 300 DPI sizes: 600×1800, 1200×1800, and 1200×1200. Exports use PNG pHYs or JPEG JFIF density metadata and are stored as private, versioned objects.
- Event QR links with enable/disable and revocation, guest upload/design/package/order flow, per-event queue numbering, bearer-link status tracking, manual approval options, operator actions, and Realtime updates with polling fallback.
- Guest photo and export objects stay in private buckets. Guest ordering routes validate file signatures, dimensions, MIME, size, event rules, design shape, and export DPI before persistence. IP rate-limit identifiers are HMAC hashed before database storage.

See [Phase 1 implementation](docs/PHASE_1_IMPLEMENTATION.md), [database architecture](docs/DATABASE_ARCHITECTURE.md), and [editor architecture](docs/EDITOR_ARCHITECTURE.md).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

RLS and queue integration tests are in `supabase/tests/`; run them against a local Supabase stack with `supabase test db`.

## Scope boundary

Exports are printer-ready files stored with each persistent guest job. This release does not claim offline printing and does not integrate with a physical printer or Windows Agent. See [database architecture](docs/DATABASE_ARCHITECTURE.md), [testing report](docs/TESTING_REPORT.md), and the [Phase 3 Windows Agent handoff](docs/PHASE_3_WINDOWS_AGENT_HANDOFF.md).
