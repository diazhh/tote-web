---
phase: 04-webhook-log-viewer
plan: "01"
subsystem: backend-api, frontend-admin
tags: [webhook-logs, pagination, filtering, inspector-modal, tdd]
dependency_graph:
  requires:
    - backend/src/controllers/provider.controller.js
    - backend/src/routes/provider.routes.js
    - frontend/app/admin/proveedores/page.js
  provides:
    - GET /providers/webhook-logs endpoint with pagination and filters
    - frontend/app/admin/proveedores/logs/page.js — full log viewer
  affects:
    - frontend/app/admin/proveedores/page.js (tab nav extended)
    - .gitignore (logs/ pattern scoped)
tech_stack:
  added: []
  patterns:
    - Promise.all([findMany, count]) for paginated queries
    - TDD red-green cycle for controller method
    - StatusBadge component for enum status colors
    - LogInspectorModal with JSON.parse + raw fallback
key_files:
  created:
    - backend/src/controllers/__tests__/provider.controller.test.js (extended)
    - frontend/app/admin/proveedores/logs/page.js
  modified:
    - backend/src/controllers/provider.controller.js
    - backend/src/routes/provider.routes.js
    - frontend/app/admin/proveedores/page.js
    - .gitignore
decisions:
  - rawPayload stays as String throughout (no JSON.parse in backend); frontend handles both valid JSON and raw string fallback in inspector
  - Scoped logs/ gitignore pattern to /logs/ (root) and backend/logs/ — bare logs/ was catching frontend/app/admin/proveedores/logs/ source directory
  - Tab in logs/page.js uses plain <a> anchors (not state-based buttons) since it is a separate Next.js route
metrics:
  duration: 4min
  completed: "2026-04-01"
  tasks_completed: 2
  files_changed: 6
requirements_closed:
  - LOGS-01
  - LOGS-02
  - LOGS-03
  - LOGS-04
---

# Phase 04 Plan 01: Webhook Log Viewer — Backend Endpoint + Frontend Page Summary

**One-liner:** Paginated GET /providers/webhook-logs with apiSystemId/status filters, plus a full admin log viewer page featuring status badges, inspector modal with JSON/raw fallback, and headers display.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | TDD: extend test file + add getWebhookLogs to backend | d2045ee | provider.controller.test.js, provider.controller.js, provider.routes.js |
| 2 | Create logs page + add tab link to proveedores/page.js | b5e10ab | logs/page.js, proveedores/page.js, .gitignore |

## What Was Built

### Backend (Task 1)

`getWebhookLogs` method added to `ProviderController`:
- Parses `page`, `limit`, `apiSystemId`, `status` from `req.query`
- Builds a `where` clause from filters
- Uses `Promise.all([findMany, count])` for a single round-trip
- `findMany` includes `apiSystem: { select: { id, name, slug } }`
- Returns `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`
- `rawPayload` passes through as String — never parsed on backend
- `headers` passes through as-is (null or Json object)
- Errors return 500 `{ error: 'Error al obtener logs' }`

Route registered: `GET /webhook-logs` in `provider.routes.js`.

### Tests (Task 1 — TDD)

6 new tests in `getWebhookLogs` describe block:
- LOGS-01: paginated list with apiSystem relation
- LOGS-02: filter by apiSystemId (where clause check)
- LOGS-02: filter by status (where clause check)
- LOGS-03: rawPayload type check (must be string)
- LOGS-04: headers field present (null or object)
- Error path: 500 on prisma failure

All 16 provider controller tests pass; full 25-test suite passes.

### Frontend (Task 2)

`frontend/app/admin/proveedores/logs/page.js` — full `'use client'` page:
- Fetches systems list once on mount for filter dropdown
- Re-fetches logs on page, apiSystemIdFilter, or statusFilter change
- Filter change resets to page 1
- `StatusBadge` component with correct colors per `WebhookLogStatus` enum
- Table columns: Proveedor, Fecha, Status, Payload preview (truncated at 80 chars), Accion
- Pagination shown when `totalPages > 1`
- `LogInspectorModal`: metadata grid, formatted JSON (with raw fallback on parse error), headers section (or "Sin headers registrados" when null)

Tab link added to `proveedores/page.js`: `<Link href="/admin/proveedores/logs">Logs de Webhook</Link>` after the Sistemas button.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Scoped `logs/` pattern in root .gitignore**

- **Found during:** Task 2 commit
- **Issue:** Root `.gitignore` had bare `logs/` pattern that matched `frontend/app/admin/proveedores/logs/` directory, causing the new page file to be invisible to git
- **Fix:** Changed `logs/` to `/logs/` and `backend/logs/` so PM2 logs directories are still ignored but source code directories named `logs` are not
- **Files modified:** `.gitignore`
- **Commit:** b5e10ab

## Verification Results

1. Provider tests (16/16 pass): all LOGS-01 through LOGS-04 + error path
2. Full backend suite (25/25 pass)
3. Frontend build: clean — `/admin/proveedores/logs` page appears in build output at 3.63 kB
4. Route confirmed: `grep "webhook-logs" backend/src/routes/provider.routes.js` → found
5. Tab link confirmed: `grep "proveedores/logs" frontend/app/admin/proveedores/page.js` → found

## Known Stubs

None — all four LOGS requirements are fully implemented and wired.

## Self-Check: PASSED

- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/controllers/provider.controller.js` — contains `getWebhookLogs` method
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/routes/provider.routes.js` — contains `router.get('/webhook-logs'`
- `/Users/diazhh/Documents/GitHub/tote-web/frontend/app/admin/proveedores/logs/page.js` — created and committed
- `/Users/diazhh/Documents/GitHub/tote-web/frontend/app/admin/proveedores/page.js` — contains `href="/admin/proveedores/logs"`
- Commits d2045ee and b5e10ab exist in git log
