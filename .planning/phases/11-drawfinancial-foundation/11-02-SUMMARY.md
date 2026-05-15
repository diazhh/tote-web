---
phase: 11
plan: 2
subsystem: backend/queue
tags: [pg-boss, worker, service, draw-financial, fin-agg, aggregation, idempotency]
requirements:
  - FIN-AGG-01
  - FIN-AGG-02
  - FIN-AGG-03
  - FIN-AGG-04
  - FIN-AGG-06
  - FIN-AGG-07
dependency_graph:
  requires:
    - "DrawFinancial + DrawFinancialProvider models (Plan 11-01)"
    - "decimal.js@^10.6.0 (Plan 11-01)"
    - "Prisma client regenerated with new models (Plan 11-01)"
  provides:
    - "computeAndUpsertSales(drawId, closedAt) — named export"
    - "computeAndUpsertPrizes(drawId, totalizedAt) — named export"
    - "PrizesNotProcessedError — named class export"
    - "calculateDrawFinancialsWorker(jobs) — two-phase router (SALES, PRIZES)"
    - "QUEUES.CALCULATE_DRAW_FINANCIALS + QUEUE_CONFIGS entry"
    - "QUEUES.CALCULATE_PROVIDER_COMMISSION + QUEUE_CONFIGS entry (Phase 12 placeholder)"
    - "Both queue rows in pgboss.queue at boot (F-11 mitigation)"
  affects:
    - "Plan 11-03 (pipeline triggers) calls boss.send(CALCULATE_DRAW_FINANCIALS, {drawId, phase}) from close-and-ingest and step-process-prizes"
    - "Plan 11-04 (backfill) imports the named service functions and calls them per draw"
    - "Phase 12 (commissions) swaps the placeholder handler at CALCULATE_PROVIDER_COMMISSION — no register.js change needed"
tech_stack:
  added: []
  patterns:
    - "Pure-function aggregation service (NOT Croner class — F-13)"
    - "TicketDetail.drawId as the canonical aggregation key (F-3 fix)"
    - "Explicit findFirst + update/create for NULL-FK upserts (D-08)"
    - "Two-phase worker routing via job.data.phase (D-13)"
    - "Fail-fast PrizesNotProcessedError at worker boundary (F-1 / D-14)"
    - "pg-boss v10 array-unwrap (jobs = Array.isArray(jobs) ? jobs[0] : jobs)"
    - "Always-on worker registration (no PGBOSS_* gate per CLAUDE.md)"
    - "Jest unstable_mockModule for hermetic service+worker tests"
key_files:
  created:
    - "backend/src/services/draw-financial.service.js"
    - "backend/src/services/__tests__/draw-financial.service.test.js"
    - "backend/src/queue/workers/calculate-draw-financials.worker.js"
    - "backend/src/queue/workers/__tests__/calculate-draw-financials.worker.test.js"
  modified:
    - "backend/src/queue/constants.js"
    - "backend/src/queue/register.js"
decisions:
  - "Named exports (export const + export class), not default export — locks the cross-plan import contract for Plan 11-04 (backfill) and the worker."
  - "Service exports use `export const` arrow form for the two functions and `export class` for the error — matches existing service-file conventions in the directory."
  - "Phase PRIZES recomputes ticketCount from TicketDetail (write-through) so a PRIZES-only run still leaves DrawFinancial.ticketCount populated. Belt-and-braces against the impossible-but-defensive case where PRIZES fires without SALES."
  - "Worker pre-checks Draw.prizesProcessed at the worker boundary AND the service rechecks it before mutation — defense-in-depth so the service is safe to call directly from the Phase 11-04 backfill without bypassing the F-1 guard."
  - "utility = Number(totalSales) - Number(totalPrize), result .toFixed(2) — accurate at the Decimal(12,2) target precision; no decimal.js dependency in the service path. decimal.js is available for Plan 11-04 backfill batch arithmetic if precision-sensitive accumulation is ever needed there."
metrics:
  duration_minutes: ~15
  tasks_completed: 3
  files_created: 4
  files_modified: 2
  test_count: 12
  commits:
    - hash: "552b1e0"
      message: "feat(11-02): add draw-financial.service with TicketDetail-keyed aggregation"
    - hash: "b376c01"
      message: "feat(11-02): add calculate-draw-financials worker + queue constants"
    - hash: "0331a45"
      message: "feat(11-02): register calculate-draw-financials + commission placeholder"
  completed: 2026-05-15T18:15:00Z
---

# Phase 11 Plan 2: DrawFinancial Worker Pipeline Summary

Production worker pipeline that materializes `DrawFinancial` and `DrawFinancialProvider` rows: pure-function service layer with `TicketDetail.drawId`-keyed aggregation (F-3 fix), two-phase router worker (SALES + PRIZES), idempotent NULL-FK upsert pattern (D-08), Phase-12 commission queue placeholder (D-15), and 12 unit tests proving the aggregation key, the prizesProcessed guard, and the idempotency contract.

## Named Export Contract (locked by this plan)

The service exports three named symbols. **No `export default`** — Plan 11-04 (backfill) and the worker both depend on this:

```js
// arrow consts (chosen form — matches the dominant style in this directory)
export const computeAndUpsertSales  = async (drawId, closedAt)    => { ... };
export const computeAndUpsertPrizes = async (drawId, totalizedAt) => { ... };
// class export
export class PrizesNotProcessedError extends Error { ... }
```

Consumers import them by name:

```js
import {
  computeAndUpsertSales,
  computeAndUpsertPrizes,
  PrizesNotProcessedError,
} from '../../services/draw-financial.service.js';   // from a worker
```

## Function Signatures

### `computeAndUpsertSales(drawId, closedAt)`

**Inputs:**
- `drawId: string` — the Draw UUID being aggregated.
- `closedAt: Date | null` — typically `Draw.closedAt`. Mirrored verbatim into `DrawFinancial.closedAt`.

**Side effects:**
- Upserts `DrawFinancial` (`totalSales`, `ticketCount`, `closedAt`) via `prisma.drawFinancial.upsert({ where: { drawId } })`.
- For each row in the per-provider `$queryRaw` GROUP BY: explicit `findFirst({ drawId, apiSystemId: x ?? null })` + `update | create` on `DrawFinancialProvider`. **Never** `prisma.upsert()` — Postgres treats NULL as distinct in unique indices (D-08).
- Aggregation excludes `Ticket.status = 'CANCELLED'` (D-17).

**Returns:** `{ drawId, phase: 'SALES', totalSales, ticketCount }`

### `computeAndUpsertPrizes(drawId, totalizedAt)`

**Inputs:**
- `drawId: string`.
- `totalizedAt: Date | null` — value to write into `DrawFinancial.totalizedAt`. Live worker passes `Draw.drawnAt`; backfill (Plan 11-04) will also pass `Draw.drawnAt` (D-05).

**Side effects:**
1. Reads `Draw.prizesProcessed`. If `false`, throws `PrizesNotProcessedError(drawId)` — does NOT mutate any DrawFinancial state (F-1 / D-14 / FIN-AGG-07).
2. Aggregates `_sum: { amount, prize }` from `TicketDetail` in a single snapshot.
3. Computes `utility = (totalSales - totalPrize).toFixed(2)`.
4. Upserts `DrawFinancial` — the **update** branch writes only `{ totalPrize, utility, totalizedAt }` and does NOT include `closedAt` (preserves what phase SALES wrote). The **create** branch is defensive (PRIZES-without-prior-SALES, impossible in normal flow) and populates all fields.
5. Per-provider rows: `findFirst + update | create` updating `totalPrize` only on the update branch.

**Returns:** `{ drawId, phase: 'PRIZES', totalSales, totalPrize, utility, totalizedAt }`

### `PrizesNotProcessedError`

```js
class PrizesNotProcessedError extends Error {
  constructor(drawId) {
    super(`Draw ${drawId} prizes not processed — cannot compute totalPrize/utility`);
    this.name = 'PrizesNotProcessedError';
  }
}
```

The worker pre-checks `Draw.prizesProcessed` at its boundary and rethrows this error directly, so pg-boss surfaces the failure to its retry/dead-letter machinery rather than silently writing a zero-prize row. Plan 11-03 will reference this class when the live trigger orchestration is wired.

## Two-Phase Worker

```
job.data.phase === 'SALES'
   → computeAndUpsertSales(drawId, draw.closedAt)
   → returns { success: true, drawId, phase: 'SALES' }

job.data.phase === 'PRIZES'
   → if draw.prizesProcessed === false: throw PrizesNotProcessedError(drawId)
   → computeAndUpsertPrizes(drawId, draw.drawnAt)
   → returns { success: true, drawId, phase: 'PRIZES' }

job.data.phase === anything else
   → throw new Error('[calculate-draw-financials] unknown phase: ...')
```

`jobs` argument is unwrapped via `Array.isArray(jobs) ? jobs[0] : jobs` (pg-boss v10 mandatory). The worker loads the Draw once with `select: { prizesProcessed: true, closedAt: true, drawnAt: true }` and reuses those three fields across both branches — no double round-trip.

## Queue Names & Configs (added to `constants.js`)

| Queue                                | retryLimit | retryDelay | retryBackoff | expireInMinutes | Notes                                                                |
| ------------------------------------ | ---------- | ---------- | ------------ | --------------- | -------------------------------------------------------------------- |
| `calculate-draw-financials`          | 3          | 5          | true         | 3               | Real worker. Slightly longer window than STEP_CALCULATE_STATS (2 min) — two-phase + per-provider upserts. |
| `calculate-provider-commission`      | 3          | 5          | true         | 2               | **Phase 12 placeholder** — current handler logs and returns `{ placeholder: true }`. NEVER throws (D-15). |

Both are registered in `register.js` outside any `PGBOSS_*` env gate (always-on) per CLAUDE.md.

## Smoke Test Commands (operators run after deploy)

After a backend restart that includes Plan 11-02 code:

```bash
# Confirm both queue rows exist in pgboss.queue (F-11 mitigation)
docker exec tote_postgres psql -U tote_user -d tote_db -c \
  "SELECT name FROM pgboss.queue WHERE name LIKE 'calculate-%';"

# Expected output:
#              name
# -------------------------------
#  calculate-draw-financials
#  calculate-provider-commission
# (2 rows)
```

Production equivalent (VPS 94):

```bash
ssh 94 'PGPASSWORD="ToteSecure2024*" psql -U tote_user -h localhost -p 5433 -d tote_db -c \
  "SELECT name FROM pgboss.queue WHERE name LIKE '"'"'calculate-%'"'"';"'
```

If either queue is missing, the deploy did NOT pick up the new register.js block — investigate boss.start() ordering in `boss.js` before flipping any Phase 11-03 triggers.

## Test Inventory (12 tests, 100% passing)

### Service tests — `backend/src/services/__tests__/draw-financial.service.test.js` (6 tests)

| # | Test name (abbrev)                                                                | Proves                                                                  | Truth from plan                          |
| - | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| 1 | aggregates totalSales as SUM(TicketDetail.amount) of non-CANCELLED tickets (D-17) | CANCELLED filter passed to Prisma; aggregate is via TicketDetail; upsert receives the summed value | "Aggregation excludes CANCELLED (D-17)" |
| 2 | idempotent SALES re-run (FIN-AGG-06)                                              | `prisma.drawFinancial.upsert` called with same WHERE both runs — no duplicate insert  | "Re-running upserts (no duplicate-key)" |
| 3 | F-1 — PRIZES with prizesProcessed=false throws & does NOT mutate                  | `PrizesNotProcessedError` raised; `drawFinancial.upsert` never called   | "throws PrizesNotProcessedError"        |
| 4 | PRIZES writes totalPrize, utility = sales - prize, totalizedAt = passed-in arg    | upsert.update payload exactly matches spec; closedAt NOT in update path | "phase PRIZES upserts prize fields + totalizedAt" |
| 5 | NULL-apiSystemId D-08 — findFirst+update/create, no `.upsert`                     | first run hits `.create`, second hits `.update` — never `prisma.drawFinancialProvider.upsert` | "DrawFinancialProvider NULL case uses explicit findFirst" |
| 6 | F-3 multi-draw — TicketDetail.drawId attribution                                  | per-draw `aggregate.where.drawId` differs; sum across draws matches total of all TicketDetail.amount | "aggregates via TicketDetail.drawId" |

### Worker tests — `backend/src/queue/workers/__tests__/calculate-draw-financials.worker.test.js` (6 tests)

| # | Test name (abbrev)                                              | Proves                                                          | Truth from plan                          |
| - | --------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| 1 | phase=SALES invokes computeAndUpsertSales(drawId, closedAt)     | routing + correct closedAt forwarded; success envelope          | "Worker routes by job.data.phase"        |
| 2 | phase=PRIZES + prizesProcessed=false throws & service untouched | worker-boundary guard fires before service call                 | "Worker throws PrizesNotProcessedError for phase PRIZES" |
| 3 | phase=PRIZES + prizesProcessed=true invokes prizes service      | drawnAt forwarded as totalizedAt argument                       | "'PRIZES' upserts prize fields + totalizedAt" |
| 4 | unknown phase throws with phase value in error message          | default `throw` in switch — no silent fall-through (T-11-09)    | "Phase routing is strict switch with default: throw" |
| 5 | non-existent drawId throws "Draw {drawId} no encontrado"        | matches existing worker convention (Spanish message)            | "if (!draw) throw"                       |
| 6 | jobs array unwrap (pg-boss v10)                                 | `Array.isArray(jobs) ? jobs[0] : jobs` works                    | "pg-boss v10 mandatory unwrap"           |

Run locally:
```bash
cd backend && npm test -- --testPathPattern='draw-financial|calculate-draw-financials'
# Test Suites: 2 passed, Tests: 12 passed
```

## F-11 Order Enforcement

The plan's `<verify>` block carries a Node assertion that the byte-offset of `boss.createQueue(QUEUES.CALCULATE_DRAW_FINANCIALS)` is less than `boss.work(QUEUES.CALCULATE_DRAW_FINANCIALS`. Verified locally:

```
$ node -e "..." # see plan
F-11 order ok
```

Both queues' `createQueue` calls precede their respective `boss.work` calls in `register.js`. The placeholder body has zero `throw` statements (`grep -A 5 'phase-12 placeholder' src/queue/register.js | grep -c 'throw'` returns 0) — D-15 satisfied.

## Deviations from Plan

None — the plan executed exactly as written. Minor style choices made within the planner's "discretion" envelope:

- **Service module form:** chose `export const` arrow functions plus `export class` for the error. The plan permitted either `export const` or `export async function`. Arrow-const matches the dominant pattern in this directory and keeps the named-import grep `import \{[^}]*computeAndUpsertSales[^}]*\}` trivial to satisfy in a single line.
- **Worker import line:** collapsed to a single line so the AC grep `import \{[^}]*computeAndUpsertSales[^}]*\}` matches on one line. Functionally equivalent to a multi-line import; aesthetic only.
- **`boss.work` calls in register.js:** single-line form (matching the existing `EXECUTE_DRAW` block at register.js:84-90), so the AC grep `boss.work(QUEUES.CALCULATE_DRAW_FINANCIALS` matches on one line. Consistent with the surrounding pattern.

## Pointer for Plan 11-03

The Plan 11-03 trigger orchestration imports the worker indirectly via `boss.send`:

```js
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
import { getBoss } from '../boss.js';

// in close-and-ingest.worker.js, after the atomic close commits:
try {
  const boss = getBoss();
  await boss.send(
    QUEUES.CALCULATE_DRAW_FINANCIALS,
    { drawId, phase: 'SALES' },
    { singletonKey: `df-sales-${drawId}`, ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS] },
  );
} catch (e) {
  logger.warn(`[close-and-ingest] df-sales trigger falló (best-effort): ${e.message}`);
}

// in step-process-prizes.worker.js, parallel to STEP_CALCULATE_STATS:
await boss.send(
  QUEUES.CALCULATE_DRAW_FINANCIALS,
  { drawId, phase: 'PRIZES' },
  { singletonKey: `df-prizes-${drawId}`, ...QUEUE_CONFIGS[QUEUES.CALCULATE_DRAW_FINANCIALS] },
);
```

The queue rows already exist after Plan 11-02 deploys, so `boss.send` will not silently drop (F-11 mitigated).

## Self-Check: PASSED

- Files exist on disk:
  - `backend/src/services/draw-financial.service.js` — FOUND
  - `backend/src/services/__tests__/draw-financial.service.test.js` — FOUND
  - `backend/src/queue/workers/calculate-draw-financials.worker.js` — FOUND
  - `backend/src/queue/workers/__tests__/calculate-draw-financials.worker.test.js` — FOUND
  - `backend/src/queue/constants.js` — modified (CALCULATE_DRAW_FINANCIALS + CALCULATE_PROVIDER_COMMISSION present)
  - `backend/src/queue/register.js` — modified (createQueue + work for both queues; D-15 placeholder)
- Commits reachable from HEAD: 552b1e0, b376c01, 0331a45 — all confirmed via `git log --oneline`.
- Live smoke: `SELECT name FROM pgboss.queue WHERE name LIKE 'calculate-%'` returned both rows after a one-shot boss bootstrap.
- All 12 unit tests pass (`npm test -- --testPathPattern='draw-financial|calculate-draw-financials'`).
