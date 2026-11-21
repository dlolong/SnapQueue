# Speed-first implementation status

## Implemented in this pass

- New guest photo selections show a local object-URL preview before network work completes.
- Optimization targets use the assigned layout frame's pixel size with 1.5x crop headroom, avoid upscaling, orient decoded images, and run in a module worker with a compatibility fallback. Optimization is serialized to limit peak decoded-image memory.
- New photos upload directly from the browser to the private Supabase bucket. The server authorizes session-scoped signed paths, and verifies stored bytes, MIME signatures, dimensions, and pixel count before registering the photo. XHR provides actual transfer progress; up to three files upload concurrently, with exponential whole-file retries and cancellation.
- Operator queue subscriptions are event-filtered. The dashboard refreshes after reconnection, coalesces rapid duplicate updates, and polls only while disconnected.

## Verification and measurements

- `npm run typecheck` — passed.
- `npm run lint` — passed; the repository has pre-existing lint warnings in settings, features, app shell, and business branding.
- `npm test` — 6 tests passed, including layout-aware optimization target calculations and existing raster/signature/design utilities.
- `npm run build` — passed. The latest build compiled application code in 11.2 seconds. The event queue route reports 72.7 kB route JS and 184 kB first-load JS; this is build output, not a runtime latency benchmark.
- No p50/p95/p99 upload, order, queue visibility, or render measurements were collected. No 1/10/50/100 customer load run was performed. No configured Supabase storage/realtime integration or browser device run was available in this pass.

## Remaining work

- Photo replacement and final print-export uploads still pass through Next.js. New-photo uploads retry the whole object; resumable/TUS uploads are not implemented. HEIC is not accepted. A scheduled cleanup for abandoned signed uploads is not configured.
- Layout changes during optimization do not supersede an in-flight optimization, and crop/rotation/zoom-specific input beyond frame geometry is not modeled. The application currently exposes no guest zoom editor.
- Order submission still waits for browser-side print-resolution composition and export upload. There is no database-backed rendering job or worker in the repository, so artifact-ready notifications and background rendering are not implemented.
- Queue queries still load the existing page's full job set. Cursor pagination, queue virtualization, thumbnail generation, and query-plan profiling remain outstanding.
- The repository has no Windows Print Agent implementation. Device authentication, leases, checksum verification, local execution journaling, safe retry rules, and printer dispatch are future work documented in `PHASE_3_WINDOWS_AGENT_HANDOFF.md`.
