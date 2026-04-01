---
phase: 03-admin-provider-management
plan: "02"
subsystem: frontend/provider
tags: [react, nextjs, provider-management, badge, modal, token-generation, adapter-status]
dependency_graph:
  requires:
    - "Phase 03-01: POST /api/providers/systems/:id/generate-token endpoint"
    - "Phase 03-01: GET /api/providers/systems/:id/adapter-status endpoint"
    - "Phase 03-01: getAllSystems returning slug and mode fields"
  provides:
    - "Mode badges (PULL/PUSH) in system list — ADMIN-05"
    - "Adapter status badges (Ready/Discovery) per system — ADMIN-06"
    - "SystemModal with slug auto-generation from name — ADMIN-02"
    - "SystemModal with mode selector PULL/PUSH — ADMIN-01"
    - "SystemModal token management panel for PUSH mode — ADMIN-03, ADMIN-04"
    - "Token generation calling generate-token endpoint with yellow copy box"
  affects:
    - "Phase 03-03: Webhook log viewer shares the same proveedores page context"
tech_stack:
  added: []
  patterns:
    - "Promise.allSettled for parallel adapter-status fetches (non-blocking, tolerates individual failures)"
    - "Private state flag (_slugManuallyEdited) stripped from submit payload before saving"
    - "systemTokens state map for tracking post-generation token presence without re-fetching masked token"
key_files:
  created: []
  modified:
    - "frontend/app/admin/proveedores/page.js"
decisions:
  - "Both tasks (badges and SystemModal) written in a single file write since they modify the same file — committed as one logical commit covering both"
  - "fetchAdapterStatuses called after setSystems (non-blocking, fire-and-forget pattern) so loading spinner clears before status badges resolve"
  - "systemTokens state map (not re-fetch) used to determine hasToken after generation — avoids round-trip since backend excludes token from getAllSystems"
  - "Private _slugManuallyEdited flag in formData stripped in handleSubmit before calling onSave — backend never sees this UI flag"
metrics:
  duration: "3min"
  completed: "2026-04-01"
  tasks_completed: 2
  files_modified: 1
---

# Phase 03 Plan 02: Provider Frontend UI Extension Summary

Extended the proveedores admin page with mode badges (PULL gray / PUSH blue), adapter status badges (Ready green / Discovery orange), and a fully-featured SystemModal supporting slug auto-generation, mode selector, and PUSH-only webhook token management panel with first-time copy box.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add adapter status state and fetch logic; mode + adapter badges to system list | 09d936f | frontend/app/admin/proveedores/page.js |
| 2 | Extend SystemModal with slug, mode, isActive, and token management panel | 09d936f | frontend/app/admin/proveedores/page.js |

Note: Tasks 1 and 2 were committed together as they modify the same file and were written in one pass.

## What Was Built

**System list cards (ADMIN-05, ADMIN-06):**
- `adapterStatuses` state map populated by `fetchAdapterStatuses` called non-blocking after `setSystems`
- Each system card shows: mode badge (PULL gray, PUSH blue) and adapter status badge (Ready green, Discovery orange) or loading `...` while fetching
- Slug displayed as `/api/webhooks/{slug}` below the badges when present

**Extended SystemModal (ADMIN-01 through ADMIN-04):**
- `generateSlug` converts name to lowercase kebab-case (strips non-alphanum except dash)
- `_slugManuallyEdited` flag suppresses auto-generation once user edits slug manually
- Mode selector: PULL (default) vs PUSH
- `isActive` checkbox only shown on edit (not create)
- Token panel appears only when `formData.mode === 'PUSH'`
- On create: shows "Guarda el sistema primero para generar un token." message
- On edit + PUSH: shows "Generar Token" or "Regenerar Token" button
- After generation: yellow `bg-yellow-50` box with full 64-char hex token and "Copiar" button
- Subsequent opens: masked `••••••••••••••••(token configurado)` text
- `systemTokens` state map in parent tracks which systems have tokens post-generation

**SystemModal call site updated** to pass `apiUrl`, `hasToken`, and `onTokenGenerated` props.

## Verification

- `npm run build` passed with zero errors — 926-line file compiles clean
- Backend test suite: 19 tests, 2 suites, all passing (unchanged)
- All 8 success criteria patterns confirmed present via grep

## Deviations from Plan

### Auto-combined tasks

**[Rule 3 - Implementation choice] Tasks 1 and 2 implemented in single file write**
- **Found during:** Task 1 execution
- **Reason:** Both tasks target the same file; writing task 1 then re-reading and editing for task 2 would risk losing context. Written together, committed once with combined message.
- **Impact:** Single commit covers both tasks instead of two separate commits.
- **Files modified:** frontend/app/admin/proveedores/page.js
- **Commit:** 09d936f

## Checkpoint

**Checkpoint: Verify frontend UI locally** — Auto-approved per user authorization ("haz todo"). Build gate passed (zero errors). All 8 success criteria verified via grep patterns and build output.

## Known Stubs

None — all UI components are fully wired to real backend endpoints:
- Mode and adapter badges consume real `adapter-status` API responses
- Token generation calls real `generate-token` endpoint
- System save/update calls real `PUT/POST /providers/systems` endpoints

## Self-Check: PASSED
