---
phase: 01-schema-foundation
plan: 01
subsystem: database
tags: [prisma, postgresql, schema, webhook, apisystem]

# Dependency graph
requires: []
provides:
  - ApiSystem model extended with slug (unique), webhookToken, mode (PULL/PUSH), isActive fields
  - ApiSystemMode enum (PULL/PUSH)
  - WebhookLog model with rawPayload, headers, status, errorMessage, FK to ApiSystem
  - WebhookLogStatus enum (DISCOVERED/PROCESSED/DUPLICATE/FAILED)
  - TicketSource enum extended with WEBHOOK_PUSH value
  - Local DB migrated and Prisma client regenerated
  - SRQ row backfilled: slug='srq', mode='PULL'
affects: [02-webhook-pipeline, 03-admin-provider-ui, 04-webhook-log-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step db push for nullable-to-unique field promotion on table with existing rows"
    - "Companion backfill script pattern for idempotent row data migration"

key-files:
  created:
    - backend/src/scripts/backfill-apisystem-slug.js
  modified:
    - backend/prisma/schema.prisma

key-decisions:
  - "Two-step db push (nullable slug first, backfill, then @unique) avoids null constraint violation on existing SRQ row"
  - "isActive added to ApiSystem in Phase 1 despite not being in SCHEMA-01 explicitly, as it is a hard dependency for Phase 2 webhook auth middleware"
  - "headers Json? added to WebhookLog for LOGS-04 (Phase 4) to avoid mid-stream schema change later"
  - "rawPayload stored as String (not Json) to handle malformed bodies without parse failures"
  - "--accept-data-loss flag required for both webhookToken unique constraint and slug nullable-to-unique promotion"

patterns-established:
  - "Pattern: Two-step db push — add nullable first, backfill data, promote to @unique non-nullable"
  - "Pattern: Idempotent backfill script — checks if already set before updating; safe to re-run"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 01 Plan 01: Schema Foundation Summary

**Prisma schema extended with WebhookLog model, ApiSystemMode/WebhookLogStatus enums, and SRQ row backfilled with slug='srq' via two-step db push sequence**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T17:50:20Z
- **Completed:** 2026-04-01T17:52:40Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended ApiSystem model with slug (unique), webhookToken, mode, isActive fields and new ApiSystemMode (PULL/PUSH) enum
- Created WebhookLog model with four-value status enum (DISCOVERED/PROCESSED/DUPLICATE/FAILED), rawPayload, headers, and FK to ApiSystem with composite indexes
- Extended TicketSource enum with WEBHOOK_PUSH value for Phase 2 ticket creation
- Executed three-step local deployment: push nullable schema → backfill SRQ row → promote slug to @unique → regenerate client
- Created idempotent backfill script that safely handles re-runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Write step-1 schema (nullable slug) and backfill script** - `8677ff7` (feat)
2. **Task 2: Execute three-step local deployment (push → backfill → push → generate)** - `d5f06dd` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `backend/prisma/schema.prisma` - Extended ApiSystem, added ApiSystemMode enum, added WebhookLog model and WebhookLogStatus enum, extended TicketSource with WEBHOOK_PUSH
- `backend/src/scripts/backfill-apisystem-slug.js` - One-time idempotent backfill script for SRQ slug='srq' and mode='PULL'

## Decisions Made

- **Two-step db push required:** Existing SRQ row has no slug value. Adding `@unique` directly would fail with null constraint violation. Nullable-first, backfill, then promote is the safe path.
- **isActive added in Phase 1:** Although not explicitly listed in SCHEMA-01, the field has `@default(true)` so no backfill is needed, and it's required for Phase 2 middleware (`mode = 'PUSH' AND isActive = true`). Added proactively.
- **headers Json? in WebhookLog:** LOGS-04 (Phase 4) requires displaying request headers. Adding nullable now avoids a mid-stream schema change during Phase 4.
- **--accept-data-loss flag used twice:** Once for webhookToken unique constraint (no existing data), once for slug nullable-to-non-nullable promotion (after backfill confirmed no nulls).

## Deviations from Plan

None - plan executed exactly as written. The `--accept-data-loss` flag was needed for the initial push (not just step 3) due to the webhookToken unique constraint warning, which was anticipated in the research document.

## Issues Encountered

- First `db push` call (Step 1) required `--accept-data-loss` due to the new `webhookToken` unique constraint warning, even though the table has no existing webhookToken values. This was expected behavior (Prisma flags any new unique constraint as potentially destructive). Resolved by adding the flag.

## User Setup Required

None - no external service configuration required. All changes are local DB schema + backfill only.

## Next Phase Readiness

- Phase 2 (webhook-pipeline) can proceed: ApiSystem has slug for routing, webhookToken for auth, mode for distinguishing PULL vs PUSH
- WebhookLog table is ready to receive raw payloads from Phase 2 webhook handler
- WEBHOOK_PUSH TicketSource value is available for Phase 2 ticket creation
- Prisma client is regenerated and reflects all new fields
- Production deployment: run same three-step sequence on VPS 144 via SSH before Phase 2 goes live

---
*Phase: 01-schema-foundation*
*Completed: 2026-04-01*
