# Phase 2 handoff

Phase 1 stores and serves printer-ready PNG/JPEG exports. It has no print queue, physical printer control, offline printing, or Windows Agent integration.

Suggested Phase 2 work:

1. Build a Windows Agent that authenticates a device to a workspace and polls/receives explicitly queued export jobs.
2. Add device registration, health, capabilities, acknowledgements, retries, and idempotent job lifecycle tables/API.
3. Keep print job references attached to immutable `session_exports` versions; never send browser-supplied file paths or arbitrary URLs to the agent.
4. Define paper size, DPI, orientation, margins, color handling, and printer-specific media options per device.
5. Add operator-visible queue states, cancel/retry controls, audit records, and recovery after network loss.
6. Test device authorization and cross-workspace denial independently of user-facing RLS.

Do not advertise offline printing until the Windows Agent has durable local queue storage and recovery tests.
