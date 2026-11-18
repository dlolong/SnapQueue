# Editor architecture

## Model

`src/lib/design/model.ts` defines version 1 `DesignModel`: canvas dimensions/background/DPI plus typed photo, text, and shape elements. Element geometry uses print-canvas pixels; `zIndex` controls painter order. Photo elements refer to `photos.id`, not browser URLs. URLs remain transient signed credentials and are not persisted in the design.

`validDesign` validates the version, canvas bounds, element count, element types, and finite geometry. The API saves the model to `photo_sessions.design_config` only after checking authenticated workspace membership and session ownership. The selected template ID is checked by both RLS and a database trigger.

## Rendering

`src/lib/design/render.ts` is the shared renderer. It draws the canvas background, then visible elements ordered by z-index, with rotation, photo cover/contain, shapes, and text. The editor uses it for its canvas preview. Export creates a separate canvas whose intrinsic width/height are the print pixels, calls the same renderer, encodes PNG/JPEG, then writes 300 DPI metadata (`pHYs` for PNG or JFIF density for JPEG).

The export endpoint parses the image headers to verify true pixel dimensions and density before uploading. It writes to a private versioned object and inserts a `session_exports` row. A failed metadata insert removes the just-uploaded object. Previous exports remain intact.

## Editing behavior

The client editor stores a bounded undo/redo history, supports canvas drag and numeric geometry, and exposes layer controls for z-order, visibility, lock, duplicate, and delete. Photos are uploaded separately and assigned to photo elements by ID. Saving is an authenticated JSON `PUT`; exports are generated from the model and photo assets, never from a screenshot of the surrounding interface.

## Extension points

Increment `version` only with an explicit model migration/normalizer. New renderable element types belong in the shared renderer so preview and export stay consistent. Server-side export can replace browser rendering later without changing the stored model contract. Add output formats only with a metadata parser/encoder and dimension tests.
