# SnapQueue event-centric photobooth workspace

SnapQueue is an event-centric photobooth workspace built with Next.js App Router, TypeScript, and Supabase. Events own their single customized layout, guest QR portal, print queue, temporary uploads, and final printable compositions. Queue states record operator or agent updates; they do not claim a physical print happened until the job is marked accordingly.

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
3. Apply every migration in numeric order through `0011_operator_review_queue.sql`. Migrations 0003–0011 install private buckets and policies, event layouts, guest upload and queue tables, final printable-image records, and the manual-review queue setting. RLS continues to enforce tenant boundaries. Existing photo-session tables and records are retained as legacy data; the current application no longer exposes or creates photo sessions.
4. Confirm email confirmation and SMTP settings in Authentication. Signup redirects users to the confirmation message when confirmation is enabled.
5. Set the two public Supabase values in `.env.local`, then run the app.
6. Schedule `POST /api/maintenance/guest-retention` daily (or more often) with `Authorization: Bearer $CRON_SECRET`. Photo retention settings are enforced by this task; expired rows/objects otherwise remain stored.

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable or browser bundle. The publishable key is safe to expose; RLS remains responsible for user data access. New secret keys assume the same elevated `service_role` database role, so SQL grants and RLS policies do not need key-name changes.

## Workflows

- Sign up, sign in, workspace creation, and logout.
- Workspace-scoped event dashboard and event CRUD/search/status filters.
- Event detail navigation with Layout, QR Code, and Print Queue tabs.
- Guest photo uploads stored privately as temporary source images and linked to the resulting print job.
- A Photo Library containing final composed images only, with event/date/size filters, download, and reprint.
- Seed system layouts and workspace template copies.
- Shared design JSON, canvas rendering, editor preview, save/reload, layers, photo slots, text, backgrounds, positioning, sizing, rotation, visibility, locking, z-order, duplicate, delete, undo, and redo.
- PNG and JPEG exports at supported 300 DPI sizes: 600×1800, 1200×1800, and 1200×1200. Exports use PNG pHYs or JPEG JFIF density metadata and are stored as private, versioned objects.
- Event QR links with enable/disable and revocation, guest upload and preview using the event's one saved layout, per-event queue numbering, bearer-link status tracking, manual approval options, operator actions, and Realtime updates with polling fallback.
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

Final compositions are private printer-ready files linked to persistent event print jobs. This release does not claim offline printing and does not integrate with a physical printer or Windows Agent. See [database architecture](docs/DATABASE_ARCHITECTURE.md), [testing report](docs/TESTING_REPORT.md), and the [Phase 3 Windows Agent handoff](docs/PHASE_3_WINDOWS_AGENT_HANDOFF.md).
