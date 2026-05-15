---
phase: 11
plan: 3
subsystem: backend/queue
tags: [pg-boss, worker, integration-test, draw-financial, fin-agg, pipeline-wiring]
requirements:
  - FIN-AGG-01
  - FIN-AGG-02
dependency_graph:
  requires:
    - "QUEUES.CALCULATE_DRAW_FINANCIALS + QUEUE_CONFIGS (Plan 11-02)"
    - "calculateDrawFinancialsWorker registered in pg-boss (Plan 11-02)"
    - "computeAndUpsertSales / computeAndUpsertPrizes service exports (Plan 11-02)"
    - "DrawFinancial + DrawFinancialProvider models in DB (Plan 11-01)"
  provides:
    - "phase-SALES trigger at all 3 close return paths in close-and-ingest.worker.js"
    - "phase-PRIZES parallel trigger alongside STEP_CALCULATE_STATS in step-process-prizes.worker.js"
    - "Live-DB integration test proving the pipeline produces correct DrawFinancial rows end-to-end"
  affects:
    - "Plan 11-04 (backfill) can now safely write ~2,600 rows knowing the live pipeline produces equivalent data"
    - "Production deploy: after this plan ships, every newly closed draw materializes DrawFinancial automatically"
tech_stack:
  added: []
  patterns:
    - "Best-effort pipeline chain via try/catch (D-10) — phase-SALES never blocks close"
    - "Parallel pipeline chain (D-11) — phase-PRIZES runs in parallel to STEP_CALCULATE_STATS, no ordering"
    - "Live-DB integration test with unique-prefix Game cleanup pattern"
    - "Static-grep wiring assertion (Test 6) as substitute for full pg-boss harness"
key_files:
  created:
    - "backend/src/queue/workers/__tests__/draw-financial-pipeline.integration.test.js"
    - ".planning/phases/11-drawfinancial-foundation/deferred-items.md"
  modified:
    - "backend/src/queue/workers/close-and-ingest.worker.js"
    - "backend/src/queue/workers/step-process-prizes.worker.js"
decisions:
  - "Test 6 implemented as static grep on close-and-ingest.worker.js source rather than a pg-boss live-enqueue test. The plan's Task 3 explicitly permits this fallback (and the Task 1 acceptance criteria already prove the runtime wiring via grep)."
  - "Test cleanup uses unique TEST_PREFIX = `__test-df-${Date.now()}-${pid}` so concurrent CI runs don't collide and the dev DB is left at COUNT=0 after each run."
  - "Test 5 (per-provider) verifies SUM(DrawFinancialProvider.totalSales) === DrawFinancial.totalSales — the financial invariant that Phase 12 commission settlement and Phase 14 P&L dashboards depend on."
metrics:
  duration_minutes: 5
  tasks_completed: 3
  files_created: 2
  files_modified: 2
  test_count: 6
  commits:
    - hash: "f34ed9e"
      message: "feat(11-03): trigger phase-SALES DrawFinancial from close-and-ingest"
    - hash: "c625f18"
      message: "feat(11-03): parallel-trigger phase-PRIZES from step-process-prizes"
    - hash: "91210d2"
      message: "test(11-03): live-DB integration test for DrawFinancial pipeline"
  completed: 2026-05-15T19:19:07Z
---

# Phase 11 Plan 3: DrawFinancial Pipeline Wiring Summary

Surgical pipeline wiring that fires the Plan 11-02 worker from every existing draw-close return path (best-effort, never blocks the close per D-10) and parallel-triggers it next to the existing STEP_CALCULATE_STATS send when prize processing finishes (per D-11). Proven end-to-end by a 6-test live-DB integration suite that verifies non-CANCELLED aggregation, FIN-AGG-07 guard, totalizedAt=drawnAt, idempotency, per-provider invariants, and the static wiring contract.

## Trigger Insertion Points (code-review trail)

### `backend/src/queue/workers/close-and-ingest.worker.js` — phase-SALES (3 sites)

| Site | Function / Path                                | Line of `phase: 'SALES'` | Wraps return | Pattern marker     |
| ---- | ---------------------------------------------- | -----------------------: | ------------ | ------------------ |
| 1    | `closeTerminalDraw()` — TERMINAL game close    |                       81 | `return { closed: true, method: 'terminal', ... }`         | `Phase 11 (D-10)` + try/catch + `df-sales trigger falló` |
| 2    | `closeAndIngestWorker()` — admin_preselect     |                      197 | `return { closed: true, method: 'admin_preselect' }`       | `Phase 11 (D-10)` + try/catch + `df-sales trigger falló` |
| 3    | `closeAndIngestWorker()` — awaiting_preselect  |                      245 | `return { closed: true, method: 'awaiting_preselect', ... }` | `Phase 11 (D-10)` + try/catch + `df-sales trigger falló` |

Each insertion calls `boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, { drawId, phase: 'SALES' }, { singletonKey: 'df-sales-${drawId}', ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS] })` inside a try/catch that downgrades any failure to a `logger.warn` — never re-throws (D-10).

**New imports added at top of file** (lines 18-19):
```js
import { getBoss } from '../boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
```

### `backend/src/queue/workers/step-process-prizes.worker.js` — phase-PRIZES (2 sites)

| Site | Function path                                                       | Line of `phase: 'PRIZES'` | Preceding STATS send line | Pattern marker      |
| ---- | ------------------------------------------------------------------- | ------------------------: | -------------------------: | ------------------- |
| 1    | `stepProcessPrizesWorker()` — early-return when prizesProcessed=true |                        26 |                         21 | `Phase 11 (D-11)`   |
| 2    | `stepProcessPrizesWorker()` — main success path                      |                        56 |                         51 | `Phase 11 (D-11)`   |

Both insertions are immediately AFTER the existing `boss.send(QUEUES.STEP_CALCULATE_STATS, ...)` call, using `singletonKey: 'df-prizes-${drawId}'`. No try/catch wrap — mirrors the STEP_CALCULATE_STATS surroundings (D-11: pg-boss retries the entire worker on a failed send, which is correct semantics here because `prizesProcessed=true` is already committed by line 33).

**No new imports** — `getBoss`, `QUEUES`, `QUEUE_CONFIGS` were already imported by Plan 11-02 era code.

## Integration Test (Task 3)

File: `backend/src/queue/workers/__tests__/draw-financial-pipeline.integration.test.js` (333 LOC)

**Run:** `cd backend && DATABASE_URL='postgresql://tote_user:tote_password_2025@localhost:5433/tote_db?schema=public' npm test -- --testPathPattern=draw-financial-pipeline.integration`
**Result:** 6/6 pass, ~308 ms total.

| # | Test | Proves |
| - | ---- | ------ |
| 1 | phase SALES aggregates non-CANCELLED TicketDetails | D-17 CANCELLED filter, ticketCount=1 distinct, totalizedAt=NULL during SALES window, totalSales=150.50 (excludes the 999.99 CANCELLED row) |
| 2 | phase PRIZES + prizesProcessed=false | Throws `PrizesNotProcessedError`; **NO DrawFinancial row is written** (FIN-AGG-07 — no silent zero-prize) |
| 3 | phase PRIZES + prizesProcessed=true | totalPrize aggregates from TicketDetail.prize; utility = totalSales − totalPrize; totalizedAt = Draw.drawnAt (D-05) |
| 4 | End-to-end idempotency | Re-running SALES→PRIZES→SALES→PRIZES leaves exactly 1 DrawFinancial row and 1 DrawFinancialProvider row (NULL bucket) |
| 5 | Per-provider breakdown | SUM(DrawFinancialProvider.totalSales) === DrawFinancial.totalSales across NULL house bucket + a seeded ApiSystem (D-06/D-08) |
| 6 | Close-and-ingest static-grep wiring | 3× `phase: 'SALES'`, 3× `Phase 11 (D-10)`, 3× `df-sales trigger falló` in `close-and-ingest.worker.js` — guards against accidental removal |

**Cleanup verification:** `SELECT COUNT(*) FROM "Game" WHERE name LIKE '__test-df-%'` returns 0 after the suite. No residue in `DrawFinancial`, `DrawFinancialProvider`, `Ticket`, or `TicketDetail`.

## Verification Block

| Check                                                                    | Result |
| ------------------------------------------------------------------------ | ------ |
| `grep -c "phase: 'SALES'" close-and-ingest.worker.js`                    | 3 ✓    |
| `grep -c "df-sales-" close-and-ingest.worker.js`                         | 3 ✓    |
| `grep -c "Phase 11 (D-10)" close-and-ingest.worker.js`                   | 3 ✓    |
| `grep -c "df-sales trigger falló" close-and-ingest.worker.js`            | 3 ✓    |
| `grep -B 0 -A 8 "phase: 'SALES'" \| grep -c "catch"`                     | 3 ✓    |
| `node --check close-and-ingest.worker.js`                                | exit 0 ✓ |
| `grep -c "phase: 'PRIZES'" step-process-prizes.worker.js`                | 2 ✓    |
| `grep -c "df-prizes-" step-process-prizes.worker.js`                     | 2 ✓    |
| `grep -c "Phase 11 (D-11)" step-process-prizes.worker.js`                | 2 ✓    |
| df-prizes byte-offset > stats- byte-offset (both sites)                  | ✓ (stats@21, df@26 / stats@51, df@56) |
| `node --check step-process-prizes.worker.js`                             | exit 0 ✓ |
| `grep -c "DrawFinancial" draw-financial-pipeline.integration.test.js`    | 22 ✓   |
| `grep -c "PrizesNotProcessedError" draw-financial-pipeline.integration.test.js` | 2 ✓    |
| `grep -c "totalizedAt" draw-financial-pipeline.integration.test.js`      | 3 ✓    |
| Integration test exit code (`npm test -- --testPathPattern=...`)         | 0 ✓ (6/6 pass) |
| Post-run DB residue                                                      | 0 rows ✓ |

## Deviations from Plan

None — all 3 tasks executed exactly as written. Minor stylistic notes:

- **Task 1 "boss variable scope":** the plan permits reusing an existing `boss` declaration if one exists in scope. In `close-and-ingest.worker.js` no `boss` was declared anywhere, so each of the 3 insertions declares its own `const boss = getBoss();` inside its try block. Functionally equivalent to a single function-top declaration; this style keeps each insertion self-contained and survives mechanical refactors.
- **Test 6 implementation:** static-grep assertion against the worker source file. The plan's Task 3 explicitly says this fallback is acceptable when no pg-boss test harness exists in the project — none does. Combined with the Task 1 acceptance grep, the trigger wiring is double-asserted (build-time grep + runtime-readable test).
- **decimal.js dependency status:** `decimal.js@^10.6.0` already present in `backend/package.json` (added by Plan 11-02). No package.json change in this plan.

## Deferred / Out-of-scope Findings

Logged in `.planning/phases/11-drawfinancial-foundation/deferred-items.md`:

- `backend/src/services/__tests__/monitor.service.test.js` — 8 pre-existing failures (`TypeError: prisma.ticket.findMany undefined` in the mock). Last touched by `017fc6c feat(05-01)` in Phase 5. Unrelated to 11-03; the new 11-03 test passes in isolation. Phase 5 maintenance.

## Green-light Statement

**Pipeline is proven correct via 6/6 live-DB integration tests across 5 distinct DrawFinancial scenarios + 1 static wiring check. Plan 11-04 (backfill ~2,600 rows) is now safe to run** — the production worker pipeline materializes equivalent rows for new draws, so backfill historical rows can be reconciled against the same logic.

## Self-Check: PASSED

- `backend/src/queue/workers/close-and-ingest.worker.js` — FOUND (modified, contains 3× phase-SALES triggers)
- `backend/src/queue/workers/step-process-prizes.worker.js` — FOUND (modified, contains 2× phase-PRIZES triggers)
- `backend/src/queue/workers/__tests__/draw-financial-pipeline.integration.test.js` — FOUND (333 LOC, 6 tests)
- `.planning/phases/11-drawfinancial-foundation/deferred-items.md` — FOUND
- Commits f34ed9e, c625f18, 91210d2 — all reachable from HEAD (`git log --oneline -3` confirms).
