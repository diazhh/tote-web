---
phase: 08-adapter-implementation
plan: "01"
subsystem: backend/webhooks
tags: [tdd, adapter, webhook, virtuales, normalization, validation]
dependency_graph:
  requires:
    - virtuales.slots.js (48-slot config)
    - lib/prisma.js (Draw + GameItem queries)
    - lib/dateUtils.js (getVenezuelaDateString)
  provides:
    - virtuales.adapter.draft.js (normalize() function)
    - virtuales-adapter.test.js (18-test coverage suite)
  affects:
    - webhook.service.js (calls normalize() via dynamic import)
tech_stack:
  added: []
  patterns:
    - TDD (RED -> GREEN)
    - Two-pass validation (collect then build)
    - Structured rejection objects (D-03)
    - All-or-nothing ticket validation (D-02/D-06)
key_files:
  created:
    - backend/src/__tests__/virtuales-adapter.test.js
    - backend/src/webhooks/adapters/virtuales.adapter.draft.js
    - backend/src/webhooks/adapters/virtuales.slots.js
  modified: []
decisions:
  - "resolveDrawId() returns { id, status } not just id — enables status validation before GameItem lookup"
  - "normalize() uses two-pass approach: validate+collect all plays, then build output — ensures D-02/D-06 all-or-nothing"
  - "parseInt(play.drawSlotId, 10) handles both string and integer drawSlotId from provider (ADAPT-04)"
  - "String(play.number) coerces number field for GameItem lookup — provider may send integer or string"
  - "Animal field preserved only in providerData — ignored for GameItem lookup (D-05)"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_changed: 3
---

# Phase 8 Plan 1: Virtuales Adapter TDD Implementation Summary

**One-liner:** Virtuales webhook adapter with full TDD — 18 tests covering slot resolution, GameItem mapping, multi-play, string coercion, and structured rejection objects for all 8 requirements (ADAPT-01..04, VALID-01..04).

## What Was Built

The `normalize()` function in `virtuales.adapter.draft.js` transforms raw provider payloads into the internal ticket creation contract. The adapter:

1. **Validates** plays array existence (T-08-05 mitigation)
2. **Iterates** each play with two-phase validation:
   - `parseInt(play.drawSlotId, 10)` with `isNaN + range 1-48` guard (T-08-01, T-08-04)
   - `resolveDrawId()` returns `{ id, status }` for same-query status check
   - Status check: `['DRAWN', 'CANCELLED', 'CLOSED'].includes(draw.status)` (VALID-01/02)
   - `prisma.gameItem.findFirst({ where: { gameId, number: String(play.number) } })` (ADAPT-02, D-05)
3. **Builds** normalized output with `resolvedPlays[0].draw.id` as top-level `drawId` and per-detail `drawId` (D-01)
4. **Rejects** with `{ rejected: true, reason }` — never throws for validation failures (D-03)

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 (RED) | Write 18 failing tests covering all requirements | d59132e |
| 2 (GREEN) | Implement adapter to pass all tests | 8cf152f |

## Test Coverage (18 tests, all passing)

| Requirement | Tests |
|------------|-------|
| ADAPT-01: drawSlotId resolution | 2 tests (slot 5 → 12:00:00, no-draw rejection) |
| ADAPT-02: GameItem by number | 1 test (lookup args + result) |
| ADAPT-03: multi-play | 1 test (2 plays, totalAmount=300, details.length=2) |
| ADAPT-04: string coercion | 2 tests (string "12" + integer 12) |
| VALID-01: DRAWN/CANCELLED reject | 2 tests |
| VALID-02: CLOSED reject | 1 test |
| VALID-03: invalid drawSlotId | 3 tests (0, 49, "abc") |
| VALID-04: unknown number | 1 test |
| D-01: per-detail drawId | 1 test |
| D-02/D-06: all-or-nothing | 1 test |
| D-05: animal ignored | 1 test |
| Output contract | 2 tests (shape + multiplier type) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapter skeleton imported non-existent `getVenezuelaDate`**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** `virtuales.adapter.draft.js` imported `getVenezuelaDate` from `lib/dateUtils.js` — this export does not exist. The correct export is `getVenezuelaDateString`.
- **Fix:** Changed import to `getVenezuelaDateString` and updated usage (removed `.toISOString().split('T')[0]` chain — `getVenezuelaDateString` already returns `'YYYY-MM-DD'` string directly).
- **Files modified:** `backend/src/webhooks/adapters/virtuales.adapter.draft.js`
- **Commit:** 8cf152f

**2. [Rule 1 - Bug] Adapter skeleton returned only `draw.id` instead of `{ id, status }`**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Original `resolveDrawId()` returned `draw?.id ?? null` — a plain string. The normalized adapter needs `draw.status` to implement VALID-01/02 without a second Prisma query.
- **Fix:** Changed return to `draw ? { id: draw.id, status: draw.status } : null`. The `select` already fetched `status: true`, so no extra query needed.
- **Files modified:** `backend/src/webhooks/adapters/virtuales.adapter.draft.js`
- **Commit:** 8cf152f

## Pre-existing Test Failure (Out of Scope)

`src/__tests__/terminal-pantera.test.js` has 1 pre-existing failing test (`importSRQTickets` not called). This was failing before these changes and is unrelated to the adapter. Logged to deferred items.

## Threat Model Verification

All 5 threats from the plan's `<threat_model>` are mitigated:

| Threat | Status |
|--------|--------|
| T-08-01: Tampering via payload fields | Mitigated — parseInt + isNaN + String() coercion |
| T-08-02: DoS via Prisma queries | Accepted — low volume, upstream auth gates |
| T-08-03: Info disclosure in reasons | Accepted — slot IDs/game names are semi-public |
| T-08-04: EoP via out-of-range slotId | Mitigated — explicit `slotId < 1 \|\| slotId > 48` check |
| T-08-05: Tampering via non-array plays | Mitigated — `Array.isArray() && length > 0` check |

## Known Stubs

None — `normalize()` is fully implemented. The file remains `.draft.js` intentionally (Phase 10 renames it to `.js` to activate auto-import in `webhook.service.js`).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. The adapter is a pure transformation function tested in isolation.

## Self-Check: PASSED

- `backend/src/__tests__/virtuales-adapter.test.js` exists: FOUND
- `backend/src/webhooks/adapters/virtuales.adapter.draft.js` exists: FOUND
- `backend/src/webhooks/adapters/virtuales.slots.js` exists: FOUND
- RED commit `d59132e` exists: FOUND
- GREEN commit `8cf152f` exists: FOUND
- All 18 tests pass: CONFIRMED
