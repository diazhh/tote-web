---
phase: 03-admin-provider-management
plan: "01"
subsystem: backend/provider
tags: [tdd, controller, routes, webhook, token-generation, adapter-pattern]
dependency_graph:
  requires:
    - "Phase 01: ApiSystem schema with slug, mode, webhookToken fields"
  provides:
    - "POST /api/providers/systems/:id/generate-token"
    - "GET /api/providers/systems/:id/adapter-status"
    - "Extended createSystem/updateSystem with slug/mode/isActive"
    - "getAllSystems excluding webhookToken from response"
  affects:
    - "Phase 03-02: Admin UI uses these endpoints for provider management"
    - "Phase 03-03: Webhook log viewer assumes adapter-status endpoint exists"
tech_stack:
  added:
    - "node:crypto (randomBytes for 64-char hex token)"
    - "node:fs/promises (access for adapter file check)"
  patterns:
    - "TDD (RED/GREEN) with jest.unstable_mockModule for ES module mocking"
    - "Prisma select to exclude sensitive fields (webhookToken) from list responses"
    - "Partial data object construction for updateSystem (only defined keys)"
key_files:
  created:
    - "backend/src/controllers/__tests__/provider.controller.test.js"
  modified:
    - "backend/src/controllers/provider.controller.js"
    - "backend/src/routes/provider.routes.js"
decisions:
  - "Use Prisma select (not exclude) in getAllSystems to prevent webhookToken leakage — Prisma has no native field exclusion, select is explicit and safe"
  - "generateToken uses crypto.randomBytes(32).toString('hex') = 64 hex chars, no bcrypt (plain storage, re-displayable)"
  - "getAdapterStatus resolves adapter path relative to __dirname, checks existence via fs.access — ENOENT returns adapterReady: false"
metrics:
  duration: "2min"
  completed: "2026-04-01"
  tasks_completed: 3
  files_modified: 3
---

# Phase 03 Plan 01: Provider Controller Extension Summary

Extended provider controller and routes with token generation, adapter filesystem check, and slug/mode/isActive field support. All six ADMIN requirements now have working, test-verified backend endpoints.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Write failing tests for ADMIN-01 through ADMIN-06 | e26540b | backend/src/controllers/__tests__/provider.controller.test.js |
| 2 (GREEN) | Implement extended controller | a591896 | backend/src/controllers/provider.controller.js |
| 3 | Register two new routes | b6d6c57 | backend/src/routes/provider.routes.js |

## What Was Built

- **createSystem**: Accepts `{ name, description, slug, mode, isActive }`. Requires both `name` and `slug`. Returns 400 on missing slug or duplicate slug (P2002).
- **updateSystem**: Accepts `{ name, description, slug, mode, isActive }`. Builds partial `data` object (only defined keys). Returns 400 on P2002.
- **generateToken**: `crypto.randomBytes(32).toString('hex')` produces 64-char hex. Persists to `ApiSystem.webhookToken` via `prisma.apiSystem.update`. Returns `{ webhookToken, systemId }`.
- **getAdapterStatus**: Fetches system by id, resolves `backend/src/webhooks/adapters/{slug}.adapter.js`, uses `fs.access` — returns `{ adapterReady, slug, mode }`.
- **getAllSystems**: Uses Prisma `select` to explicitly exclude `webhookToken` from list response.
- **Routes**: `POST /api/providers/systems/:id/generate-token` and `GET /api/providers/systems/:id/adapter-status` registered.

## Test Results

- 10 tests, all passing (GREEN)
- Full backend suite: 19 tests, 2 suites, all passing
- Test pattern: `jest.unstable_mockModule` for ES module mocking (`prisma`, `fs/promises`, `logger`)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all endpoints are fully wired with real Prisma calls and filesystem checks.

## Self-Check: PASSED
