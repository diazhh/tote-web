---
phase: 05-backend-reports-foundation
plan: "01"
subsystem: backend-reports
tags: [reports, monitor, tdd, backend, frontend-fix]
dependency_graph:
  requires: []
  provides: [extended-daily-report-endpoint, byGame-aggregation, bySource-aggregation, import-fix]
  affects: [frontend/app/admin/reportes, backend/src/services/monitor.service, backend/src/controllers/monitor.controller]
tech_stack:
  added: []
  patterns: [TDD-red-green, jest-unstable-mockModule, prisma-date-range-filter]
key_files:
  created:
    - backend/src/services/__tests__/monitor.service.test.js
  modified:
    - frontend/app/admin/reportes/page.js
    - frontend/lib/api/monitor.js
    - backend/src/services/monitor.service.js
    - backend/src/controllers/monitor.controller.js
decisions:
  - "Added mockReset() in all test beforeEach blocks to prevent mock call history bleeding between tests — mockResolvedValue alone doesn't clear call counts"
  - "ticketsInclude object pattern used for conditional tickets.where — keeps Prisma include/where sibling without restructuring the entire query"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_modified: 5
---

# Phase 05 Plan 01: Backend Reports Foundation Summary

Extended getDailyReport with date ranges, source/apiSystemId filters, and byGame/bySource aggregations while fixing the formatDrawTime import crash in /admin/reportes.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Write failing tests (RED) for BACK-01, BACK-02, BACK-03 | 9a1be25 | Done |
| 2 | Implement FIX-01 + BACK-01/02/03 — make tests GREEN | 017fc6c | Done |

## What Was Built

### FIX-01 — Import crash resolved

Added `import { formatDrawTime } from '@/lib/utils/dateUtils'` to `frontend/app/admin/reportes/page.js` alongside the existing `getTodayVenezuela` import. The page previously crashed because `formatDrawTime` was used at line 205 but never imported.

### BACK-01 — Date range query

`getDailyReport` now accepts `{ dateFrom, dateTo }` and builds a `where.drawDate = { gte, lte }` clause. The legacy `date` parameter still works (single-day queries).

### BACK-02 — Source and apiSystemId filters

- **source filter**: When `source` is provided, a `tickets.where = { source }` clause is injected into the Prisma include, so only tickets from that source contribute to aggregations.
- **apiSystemId filter**: Queries `ApiDrawMapping` to resolve the set of draw IDs belonging to that system. If no mappings exist, returns an empty response immediately (no draw query executed).

### BACK-03 — Aggregations

Response now includes:
- `byGame[]`: one entry per game with `{ gameId, game, totalSales, totalPrize, totalBalance, totalTickets, drawCount }`
- `bySource[]`: one entry per source with `{ source, totalSales, ticketCount }`
- `totals`: unchanged shape, still includes `{ totalSales, totalPrize, totalBalance, totalTickets, drawCount }`

### Frontend API client

`monitor.js getDailyReport` accepts a third `extraFilters` argument and forwards `dateFrom`, `dateTo`, `source`, and `apiSystemId` as query params. Backward compatible — Phase 6 will use this to pass filter state.

## Test Results

```
Test Suites: 3 passed, 3 total
Tests:       35 passed, 35 total
```

10 new tests added in `monitor.service.test.js` covering all BACK-01/02/03 behaviors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mock call history bleeding between test suites**
- **Found during:** Task 2 (GREEN phase — tests still failing after implementation)
- **Issue:** Test suites shared mock call history because `mockResolvedValue` sets the return value but does not reset `.mock.calls`. The second test in BACK-01 was reading `mock.calls[0]` which still held the call from the first test.
- **Fix:** Added `mockPrisma.draw.findMany.mockReset()` and `mockPrisma.apiDrawMapping.findMany.mockReset()` in all `beforeEach` blocks before the `mockResolvedValue` calls.
- **Files modified:** `backend/src/services/__tests__/monitor.service.test.js`
- **Commit:** 017fc6c (included in GREEN commit)

## Known Stubs

None. All implemented functionality is wired to real Prisma queries.

## Self-Check: PASSED

Files exist:
- `backend/src/services/__tests__/monitor.service.test.js` - FOUND
- `frontend/app/admin/reportes/page.js` - FOUND (contains formatDrawTime import)
- `backend/src/services/monitor.service.js` - FOUND (contains getDailyReport with dateFrom/dateTo)
- `backend/src/controllers/monitor.controller.js` - FOUND (contains dateFrom/dateTo extraction)
- `frontend/lib/api/monitor.js` - FOUND (contains extraFilters third arg)

Commits exist:
- 9a1be25 (RED tests) - FOUND
- 017fc6c (GREEN implementation) - FOUND
