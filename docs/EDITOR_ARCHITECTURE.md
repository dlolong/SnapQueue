# Event layout and guest composition

The operator layout designer edits the event's single customized `DesignModel`. Its canvas is stored in `event_guest_settings` for compatibility with the queue/order RPCs and mirrored to the event's unique `event_layouts` row. The event layout version and JSON snapshot are copied into each submitted print job so later event edits do not alter existing jobs.

Guests receive only the active layout through the event's public guest projection. Their uploaded source images are private temporary uploads linked to the guest session and associated print job. The guest client assigns source photo IDs to predefined photo placeholders and uses the shared renderer to preview and export the final composition.

Guest photo selection now creates local object-URL previews immediately. Layout frame pixel dimensions plus 1.5x crop headroom set the optimization target; a module Web Worker uses orientation-aware `createImageBitmap` and `OffscreenCanvas` where available, with a canvas fallback. PNG input remains PNG to preserve alpha; JPEG/WebP input is encoded as WebP when resizing. Photos upload from the browser directly to the private Supabase Storage bucket using short-lived, server-issued, session-scoped signed upload tokens. XHR reports actual storage request bytes; the UI holds at 99% while the server downloads and validates signatures/dimensions and registers the object to the authenticated guest session. Failed transfers can retry, and concurrent transfers are capped at three.

The storage SDK's signed upload method is built on a PUT request, so the client uses that same signed endpoint with XHR for genuine progress events. This implementation retries whole-file uploads; it does not yet implement TUS/resumable chunk uploads. HEIC is not accepted. Only newly added guest photos use the direct signed flow today; photo replacement and the final print export still use the existing Next.js request path.

The composition is currently rendered in the guest browser to a print-resolution PNG with DPI metadata, validated by the order endpoint, stored privately, and indexed as one `printable_images` row per unique output path. This is not yet a durable background rendering workflow: order creation waits for the browser render and final export upload. Operators review new orders in `pending_approval`, approve them into the manual print queue, then update status after the physical print and pickup steps. Reprint jobs reuse the original stored final image.

Operator dashboards subscribe to event-filtered `print_jobs` and `print_attempts` changes. Reconnect triggers a server refresh to recover missed updates; a 15-second refresh is retained while realtime is disconnected. Realtime carries row changes only, never image bytes.

Template records remain reusable starting points for operators. Guests do not receive a template catalog or layout-selection controls.
