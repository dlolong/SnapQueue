# Event-centric implementation

## Current application

- Workspace-scoped event CRUD, event layout editing, event QR access, and print queue management.
- Three event sections: Layout, QR Code, and Print Queue.
- One customized layout per event, with a reusable template as the starting point.
- Guest uploads and print orders use the public event portal; guest uploads do not create photo sessions.
- Guest order submissions enter `pending_approval` for operator review. The operator prints manually and updates queue status.
- Source uploads remain private and temporary. Final print compositions are stored in `printable_images` and are the only records shown in Photo Library.
- Dashboard counts events, print jobs, and printable images. The library supports event/date/size filters, download, and reprint.

## Database migration

Apply migrations in numeric order through `0011_operator_review_queue.sql`. Migration 0010 adds the event-layout and final-image indexes while retaining legacy photo-session tables/rows. Migration 0011 repairs missing `print_jobs.package_code` columns and enforces operator review for guest orders.

## Verification limits

TypeScript and lint checks are run locally. SQL migrations and RLS/queue behavior require a configured Supabase project or local Supabase stack. Physical print execution remains an operator action; the current application does not integrate a printer agent.
