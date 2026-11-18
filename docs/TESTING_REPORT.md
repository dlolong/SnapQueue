# Testing report

## Automated checks

The local utility suite (`npm test`) covers upload MIME/signature/size validation, PNG/JPEG dimension parsing, 300 DPI metadata, supported print pixel dimensions, and version 1 design JSON validation/round-trip. pgTAP coverage includes tenant event visibility/membership isolation (`phase_1_rls.test.sql`) and guest queue access code rotation, safe public projection, concurrent-style sequential counter allocation, unique references, and bearer-link queue-ahead status (`guest_queue.test.sql`).

Validation commands run for this implementation:

- `npm run typecheck` — passed.
- `npm run lint` — passed with no warnings.
- `npm test` — passed (5 Node tests).
- `npm run build` — passed. Next.js emitted webpack cache size and Node/Tailwind CommonJS-to-ESM experimental warnings; compilation and route generation succeeded.

## Not run

`supabase test db` was not run because a local Supabase/Postgres test service is not part of this workspace. The pgTAP tests require applying migrations in a disposable local Supabase instance. There is no configured browser E2E framework in the starter. Guest authenticated-session flows, Storage behavior, and cross-tenant RLS should be exercised against a configured local Supabase stack before production rollout. External Supabase dashboard configuration and scheduling remain deployment tasks.
