# Codex Task: Complete SnapQueue Phase 1 from this Starter

You are working inside the existing SnapQueue Next.js starter. Do not replace the project with a different stack.

## First inspect
Read `README.md`, inspect all routes/components/styles, review `supabase/migrations/0001_initial_schema.sql`, and identify incomplete scaffolding. Preserve the Next.js App Router, TypeScript, Tailwind CSS v4, and Supabase architecture.

## Objective
Turn this starter into a working Phase 1 photobooth SaaS MVP. Implement persistent, tenant-isolated workflows—not mock UI.

## Required implementation
1. Supabase authentication (signup, login, logout, protected routes) using `@supabase/ssr`.
2. Workspace onboarding and secure workspace membership; enforce workspace isolation in PostgreSQL RLS and server-side data access.
3. Database-backed dashboard statistics.
4. Complete event CRUD, search, filters, and event detail/session navigation.
5. Walk-in and event photo sessions with persistent session numbers and statuses.
6. Multi-file photo uploads to private Supabase Storage, validated by MIME type and size; persist metadata and enforce Storage RLS.
7. Photo library with thumbnails, metadata, filtering, deletion, and session association.
8. Seeded, editable system templates for 2x6, 4x6, and 4x4 layouts; workspace template duplication/customization.
9. Simple editor with photo slot assignment, crop/fit, positioning, text, backgrounds, and save/reload.
10. Advanced editor foundation with layers, selection, move, resize, rotate, z-order, visibility, lock, duplicate, delete, undo, and redo.
11. A single versioned design JSON model and shared rendering engine used by editor preview and export.
12. High-resolution PNG/JPEG export at exact physical dimensions and DPI (2x6 at 300 DPI = 600x1800; 4x6 = 1200x1800; 4x4 = 1200x1200). Export must render from the design model, not screenshot the UI.
13. Save each export as a versioned private Storage object and create `session_exports` metadata. Allow secure download.
14. Proper loading, empty, error, validation, and confirmation states. No fake buttons or silent failures.

## Architecture constraints
- Keep components modular and business logic separate from UI.
- Use server components for initial data reads where appropriate and server actions/route handlers for privileged mutations.
- Never expose service-role credentials to the browser.
- Use signed URLs or authenticated access for private media.
- Do not trust client-supplied workspace IDs or ownership claims; derive membership from the authenticated user.
- Validate inputs server-side.
- Add indexes and safe constraints as needed.
- Keep print queue and physical printer integration out of Phase 1. Exports must be printer-ready and independent of any printer implementation.
- Do not claim offline printing; that belongs to the future Windows Agent phase.

## Testing and deliverables
Add automated tests for critical utilities and workflows, plus end-to-end tests if the repository supports them. Test cross-workspace access denial, upload validation, design persistence, and exact export dimensions. Run typecheck, lint, tests, and production build; fix failures.

Update README and create:
- `docs/PHASE_1_IMPLEMENTATION.md`
- `docs/DATABASE_ARCHITECTURE.md`
- `docs/EDITOR_ARCHITECTURE.md`
- `docs/TESTING_REPORT.md`
- `docs/PHASE_2_HANDOFF.md`

Do not stop after planning. Implement the complete scope, report completed/partial items honestly, and list any required Supabase dashboard configuration.
