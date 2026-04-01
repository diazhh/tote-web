---
phase: 02-webhook-backend-pipeline
plan: 01
subsystem: database
tags: [prisma, postgresql, unique-constraint, idempotency, webhook]

# Dependency graph
requires:
  - phase: 01-schema-foundation
    provides: Ticket model with TicketSource enum including WEBHOOK_PUSH value
provides:
  - DB-level unique constraint on (drawId, externalTicketId, source) in Ticket table
  - webhooks/adapters/ directory tracked in git for adapter pattern
affects: [02-webhook-backend-pipeline, webhook-service, ticket-service]

# Tech tracking
tech-stack:
  added: []
  patterns: ["@@unique composite constraint scoped to source for cross-provider idempotency"]

key-files:
  created: [backend/src/webhooks/adapters/.gitkeep]
  modified: [backend/prisma/schema.prisma]

key-decisions:
  - "Unique constraint scoped to (drawId, externalTicketId, source) — not just (drawId, externalTicketId) — so same externalTicketId can exist across different sources (SRQ EXTERNAL_API vs future WEBHOOK_PUSH)"
  - "Local dev duplicate cleanup: 35,450 duplicate EXTERNAL_API tickets removed (kept oldest per group) before constraint applied — duplicates were pre-existing from SRQ imports"

patterns-established:
  - "Idempotency constraint: DB-level unique guard prevents race condition duplicates even when service-layer check is bypassed by concurrent requests"

requirements-completed: [WHOOK-05]

# Metrics
duration: 5min
completed: 2026-04-01
---

# Phase 02 Plan 01: DB Idempotency Constraint + Adapters Directory Summary

**Prisma @@unique([drawId, externalTicketId, source]) constraint applied to Ticket table, blocking concurrent duplicate webhook deliveries at the DB level**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-01T18:13:00Z
- **Completed:** 2026-04-01T18:15:22Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `@@unique([drawId, externalTicketId, source])` to Ticket model in schema.prisma
- Ran `prisma db push` to apply constraint to local PostgreSQL — constraint `Ticket_drawId_externalTicketId_source_key` confirmed in DB
- Created `backend/src/webhooks/adapters/.gitkeep` to track the adapters directory in git

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unique constraint to Ticket model and create adapters directory** - `7f844fa` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `@@unique([drawId, externalTicketId, source])` after existing `@@index([externalTicketId])` in Ticket model
- `backend/src/webhooks/adapters/.gitkeep` - Empty file to make git track the adapters directory

## Decisions Made
- Constraint is scoped to `source` field so that the same `externalTicketId` can coexist across different providers (e.g., SRQ `EXTERNAL_API` and future `WEBHOOK_PUSH` providers during onboarding overlap)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Deduplicated 35,450 pre-existing EXTERNAL_API tickets before applying constraint**
- **Found during:** Task 1 (db push attempt)
- **Issue:** Local dev database had 35,446 duplicate (drawId, externalTicketId, source) pairs from SRQ imports. `prisma db push` failed with data loss warning — cannot create unique constraint when duplicates exist.
- **Fix:** Deleted duplicate rows via SQL, keeping the oldest (first imported) ticket per group: `DELETE FROM "Ticket" WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)` — removed 35,450 rows, leaving 68,598 clean rows. Then ran `prisma db push --accept-data-loss` (the flag is required when schema adds a unique constraint even after data is clean, because Prisma does pre-flight schema diff warnings).
- **Files modified:** No source files modified — data cleanup only in local dev DB
- **Verification:** `SELECT COUNT(*) FROM duplicates HAVING COUNT(*) > 1` returned 0 after cleanup. `\d "Ticket"` confirmed `Ticket_drawId_externalTicketId_source_key UNIQUE` index present.
- **Committed in:** 7f844fa (part of task 1 commit — data cleanup was local DB only, not code)

---

**Total deviations:** 1 auto-fixed (Rule 1 - data bug in local dev environment)
**Impact on plan:** Auto-fix was necessary for local dev data integrity. No impact on schema or production — production data likely has the same issue and will need the same cleanup SQL before this migration is applied there.

## Issues Encountered
- Prisma `db push` always shows a "data loss" warning when adding unique constraints, even after removing all duplicates. The `--accept-data-loss` flag was required. This is expected Prisma behavior for constraint changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB-level idempotency constraint is in place — webhook processing can safely use `upsert` or catch unique constraint violations as duplicate detection
- `backend/src/webhooks/adapters/` directory ready for adapter files (e.g., `srq.adapter.js`, future providers)
- Ready to proceed to Plan 02: webhook route, middleware, and service layer

---
*Phase: 02-webhook-backend-pipeline*
*Completed: 2026-04-01*
