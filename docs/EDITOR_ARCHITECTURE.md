# Event layout and guest composition

The operator layout designer edits the event's single customized `DesignModel`. Its canvas is stored in `event_guest_settings` for compatibility with the queue/order RPCs and mirrored to the event's unique `event_layouts` row. The event layout version and JSON snapshot are copied into each submitted print job so later event edits do not alter existing jobs.

Guests receive only the active layout through the event's public guest projection. Their uploaded source images are private temporary uploads linked to the guest session and associated print job. The guest client assigns source photo IDs to predefined photo placeholders and uses the shared renderer to preview and export the final composition.

The composition is rendered to a print-resolution PNG/JPEG with DPI metadata, validated by the order endpoint, stored privately, and indexed as one `printable_images` row per unique output path. Operators review new orders in `pending_approval`, approve them into the manual print queue, then update status after the physical print and pickup steps. Reprint jobs reuse the original stored final image.

Template records remain reusable starting points for operators. Guests do not receive a template catalog or layout-selection controls.
