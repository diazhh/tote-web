# Phase 11 — Deferred Items

Logged from Plan 11-03 execution (per execute-plan scope boundary rules).

## Pre-existing test failures unrelated to Phase 11

**File:** `backend/src/services/__tests__/monitor.service.test.js`
**Status:** Pre-existing (last touched by `017fc6c feat(05-01)` from Phase 5).
**Symptom:** 8 failing assertions, all `TypeError: Cannot read properties of undefined (reading 'findMany')` at `monitor.service.js:516` (`prisma.ticket.findMany`).
**Root cause:** The test's mock `prisma` object is missing `ticket: { findMany: ... }`. The code in `monitor.service.js:516` for tripleta winners was added after the test's mock was written.
**Scope:** Phase 5 maintenance. NOT caused by 11-03 changes (`git diff HEAD~3 HEAD -- monitor.service.*` shows no edits in this plan's commit range).
**Action:** Defer — not in 11-03 scope. The new 11-03 integration test passes on its own (`npm test -- --testPathPattern=draw-financial-pipeline.integration` → 6/6 pass).
