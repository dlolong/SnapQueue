# Phase 3: Windows Print Agent Handoff

## Current boundary

Phase 1 now accepts event guest orders, stores a printer-ready raster export privately, and records a persistent queue row. The operator dashboard can approve, prioritize, cancel, retry, duplicate a completed order, pause/resume incoming work, and report operator-confirmed ready/claimed states. Supabase Realtime and polling keep the dashboard current.

There is no Windows Agent, device registration, physical printer integration, automatic `printing` state, or offline-print claim in this phase. `mark_ready` is an explicit operator report, not proof supplied by SnapQueue that a printer produced media. The `printing` state is reserved for a future trusted agent.

## Agent design goals

1. Register a device to a workspace using a one-time pairing secret and rotateable device credentials. Never accept workspace IDs as authorization claims from an unauthenticated device.
2. Add device, capability, heartbeat, and immutable job-attempt records. Authorize each job against the device's workspace and event.
3. Have the agent claim jobs through a server endpoint that atomically locks/leases the next eligible `queued` row. Include idempotency keys, lease expiry, and monotonically increasing attempt numbers.
4. Deliver a short-lived signed URL or authenticated download for the exact immutable `final_export_path`. Do not accept a path or arbitrary URL from the agent.
5. Verify image MIME, dimensions, DPI, supported paper size, and file hash before handing the file to Windows spooler APIs.
6. Report state transitions and structured error codes through authenticated acknowledgements. Persist the device identity and timestamps for each transition.
7. Define retry/backoff, cancellation races, stale lease recovery, duplicate submission protection, printer offline recovery, and local disk cleanup before enabling unattended runs.
8. Keep the local queue durable and encrypted if the product later supports offline operation; test restart, power loss, network loss, and duplicate acknowledgements.

## Suggested API lifecycle

`queued → leased → downloading → printing → ready_for_pickup → completed`

Failures should record attempt and reason, then either return to `queued` under bounded retry policy or transition to `failed` for operator review. Approval, cancellation, and device lease races must be transactional. Do not expose the service-role key to the Windows client; use scoped device credentials and server-side authorization.

## Required tests before rollout

- Device cannot claim or fetch another workspace's jobs or exports.
- Concurrent agents cannot lease one job at the same time.
- Duplicate acknowledgements are idempotent.
- Expired leases recover safely without losing queue order.
- Cancel/retry/agent report races preserve a valid state transition and audit trail.
- Printer and export capability mismatch is visible before dispatch.
- Offline persistence/recovery works before making any offline-print claim.
