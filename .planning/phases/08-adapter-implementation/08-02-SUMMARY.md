---
phase: 08-adapter-implementation
plan: "02"
subsystem: backend/webhooks
tags: [tdd, webhook, rejection, drawId, normalization, service]
dependency_graph:
  requires:
    - virtuales.adapter.draft.js (normalize() output contract from 08-01)
    - lib/prisma.js (webhookLog.update, ticket.create)
    - lib/logger.js (warn on rejection)
  provides:
    - webhook.service.js (D-04 rejection check + D-01 drawId passthrough)
    - webhook-service-rejection.test.js (4-test coverage suite)
    - virtuales.adapter.js (active entry point re-exporting from draft)
  affects:
    - webhook.service.js (dispatchWebhook, createWebhookTicket)
tech_stack:
  added: []
  patterns:
    - TDD (RED -> GREEN)
    - Integration-style tests via prisma mocks
    - Conditional spread for optional fields (drawId passthrough)
    - Guard against null/undefined rejection object (T-08-06)
key_files:
  created:
    - backend/src/__tests__/webhook-service-rejection.test.js
    - backend/src/webhooks/adapters/virtuales.adapter.js
  modified:
    - backend/src/services/webhook.service.js
decisions:
  - "Integration-style tests (prisma-mocked) chosen over dynamic import mocking — jest.unstable_mockModule with { virtual: true } does not intercept dynamic import() for non-existent files in Jest 29 ESM mode"
  - "virtuales.adapter.js created as active entry point (re-exports from .draft.js) — required for webhook.service.js to load adapter without ERR_MODULE_NOT_FOUND; slightly ahead of Plan 10 rename but semantically correct"
  - "T-08-06 mitigation: guard is `normalized && normalized.rejected` (not just `normalized.rejected`) to handle null/undefined adapter returns"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-08"
  tasks_completed: 1
  files_changed: 3
---

# Phase 8 Plan 2: Rejection Wiring + drawId Passthrough Summary

**One-liner:** D-04 rejection check wired into webhook.service.js — when normalize() returns `{ rejected: true, reason }`, WebhookLog is updated to FAILED and ticket creation is skipped; plus D-01 per-detail drawId passthrough in TicketDetail.create.

## What Was Built

Two changes to `webhook.service.js` and a new test file covering both:

### Change 1 — D-04 Rejection Check (lines 113-121)

Between the `normalize()` call and `createWebhookTicket()`, a guard was inserted:

```javascript
if (normalized && normalized.rejected) {
  await prisma.webhookLog.update({
    where: { id: log.id },
    data: { status: 'FAILED', errorMessage: normalized.reason || 'Rejected by adapter' },
  });
  logger.warn(`[webhook] Payload rejected by adapter "${slug}" (logId=${log.id}): ${normalized.reason}`);
  return { status: 'rejected', logId: log.id, reason: normalized.reason };
}
```

This implements the D-04 decision: adapter rejections (DRAWN/CANCELLED/CLOSED draws, invalid slots, unknown numbers) become FAILED log entries without creating tickets.

### Change 2 — D-01 drawId Passthrough (line 50)

In `createWebhookTicket`, the TicketDetail map now conditionally includes `drawId`:

```javascript
...(d.drawId ? { drawId: d.drawId } : {}),
```

This enables multi-draw plays where each detail records the specific draw UUID for that play.

### New Files

- **`virtuales.adapter.js`** — Active entry point for the Virtuales adapter. Re-exports `normalize` from `virtuales.adapter.draft.js`. Required because `webhook.service.js` imports `{slug}.adapter.js` by convention.
- **`webhook-service-rejection.test.js`** — 4 integration-style tests verifying rejection wiring and drawId passthrough via prisma-mocked adapter calls.

## Tasks Completed

| Task | Description | RED Commit | GREEN Commit |
|------|-------------|------------|--------------|
| 1 | Rejection check + drawId + tests | d17b788 | deff555 |

## Test Coverage (4 tests, all passing)

| Test | Behavior Verified |
|------|-------------------|
| Test 1 | DRAWN draw → normalize rejects → WebhookLog FAILED, ticket.create not called |
| Test 2 | SCHEDULED draw → normalize succeeds → ticket.create receives drawId in details |
| Test 3 | CANCELLED draw → rejection check fires BEFORE createWebhookTicket (not TypeError) |
| Test 4 | No draw found → clean rejection with reason string |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jest.unstable_mockModule with { virtual: true } does not intercept dynamic import() for non-existent files**
- **Found during:** Task 1 (RED → GREEN transition)
- **Issue:** The plan called for mocking the absolute path of `virtuales.adapter.js` via `jest.unstable_mockModule`. In Jest 29 with `--experimental-vm-modules`, this approach fails with "Cannot find module" because `jest.unstable_mockModule` with `{ virtual: true }` does not intercept `import()` calls that use computed absolute paths for non-existent files.
- **Fix:** Two-part solution:
  1. Created `virtuales.adapter.js` as a real file (re-exports from `.draft.js`) so the adapter path exists on disk and the service can load it in all environments
  2. Rewrote tests as integration-style tests that control adapter behavior via prisma mocks — instead of mocking `normalize()` directly, prisma returns controlled Draw/GameItem results that cause the adapter to produce either rejection or success output
- **Files modified:** `backend/src/__tests__/webhook-service-rejection.test.js`, `backend/src/webhooks/adapters/virtuales.adapter.js` (new)
- **Impact:** Tests are slightly higher-level (integration vs unit) but verify the same D-04 and D-01 behaviors with full fidelity. The `virtuales.adapter.js` creation is also correct for Plan 10 (which was going to rename the draft).

## Pre-existing Test Failure (Out of Scope)

`src/__tests__/terminal-pantera.test.js` has 1 pre-existing failing test (`importSRQTickets` not called). This was failing before these changes and is unrelated to webhook rejection wiring. Not logged again — already documented in 08-01 SUMMARY.

## Threat Model Verification

| Threat | Status |
|--------|--------|
| T-08-06: Tampering via normalized.rejected bypass | Mitigated — `normalized && normalized.rejected` guard handles null/undefined |
| T-08-07: DoS via rejection logging | Accepted — logger.warn is lightweight, no amplification |
| T-08-08: Info disclosure in rejection reason | Accepted — reason returned to controller; Phase 9 controls HTTP response |

## Known Stubs

None — both changes are fully implemented and tested.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. Changes are internal service logic only.

## Self-Check: PASSED

- `backend/src/__tests__/webhook-service-rejection.test.js` exists: FOUND
- `backend/src/webhooks/adapters/virtuales.adapter.js` exists: FOUND
- `backend/src/services/webhook.service.js` contains `normalized && normalized.rejected`: CONFIRMED (line 114)
- `backend/src/services/webhook.service.js` contains `status: 'FAILED', errorMessage: normalized.reason`: CONFIRMED (line 117)
- `backend/src/services/webhook.service.js` contains `return { status: 'rejected', logId: log.id, reason: normalized.reason }`: CONFIRMED (line 120)
- `backend/src/services/webhook.service.js` contains `d.drawId` in createWebhookTicket: CONFIRMED (line 50)
- Rejection check is BEFORE createWebhookTicket: CONFIRMED (line 114 before line 123)
- RED commit `d17b788` exists: FOUND
- GREEN commit `deff555` exists: FOUND
- All 4 new tests pass: CONFIRMED
- Full suite: 56 passing, 1 pre-existing failure (unrelated)
