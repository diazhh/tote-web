---
phase: 12
plan: 2
plan_name: commission-service-and-workers
status: complete
completed_at: 2026-05-15
commits:
  - 5a9e307  # Task 1 — commission.service.js + tests
  - e5e26be  # Task 2 — workers + tests
  - 2e73f12  # Task 3 — constants.js + register.js wiring
test_counts:
  commission.service.test.js: 13 passed
  calculate-provider-commission.worker.test.js: 4 passed
  weekly-settlement-snapshot.worker.test.js: 5 passed
---

# Plan 12-02 — Commission Service + Workers + Queue Wiring

## What was built

### 1. `backend/src/services/commission.service.js` (commit 5a9e307)

Named exports (9 symbols, all 9 acceptance grep gates passed):

| Export | Shape | Purpose |
|--------|-------|---------|
| `findEffectiveConfig(apiSystemId, drawnAt)` | `Promise<ProviderCommissionConfig + tiers \| null>` | Latest config row with `effectiveFrom ≤ drawnAt`. Hits `@@index([apiSystemId, effectiveFrom(sort: Desc)])` from Plan 12-01. |
| `computeCommission(config, providerRow, cumulativeWeeklySales)` | `string` (`.toFixed(8)`) | Pure compute, no DB. Switches on `formulaType` — SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED. |
| `getCumulativeWeeklySales(apiSystemId, drawnAt)` | `Promise<string>` | Raw SQL: `SUM(DrawFinancialProvider.totalSales)` JOIN Draw WHERE drawnAt in same VE ISO week ≤ reference. Used by TIERED bracket lookup. |
| `computeAndUpsertLedgerForDraw(drawId)` | `Promise<{ providersProcessed, skipped }>` | Reads `DrawFinancialProvider` (apiSystemId NOT NULL), looks up effective config, computes via `computeCommission`, writes `ProviderCommissionLedger` row via D-08 explicit `findFirst` + `update`/`create`. D-01 silent skip when no config. |
| `computeSettlementForWeek(apiSystemId, isoYear, isoWeek)` | `Promise<{ total, ledgerRowCount }>` | Pure compute (no write) — used by Plan 12-03 admin recompute endpoint. |
| `getSettlementWithLedger(settlementId)` | `Promise<{ settlement, ledgerRows }>` | Loads settlement + ledger rows via JOIN to Draw on drawnAt week range. |
| `buildSettlementExcel(settlementId)` | `Promise<Buffer>` | ExcelJS workbook with audit-grade SUM-formula totals row (copied from `accounting-report.service.js`). |
| `getSettlementPdfData(settlementId)` | `Promise<{ settlement, ledgerRows, totals: { sales, prizes, commission } }>` | Pure data shape; PDFKit streaming lives in the controller (Plan 12-03). |
| `class DrawFinancialNotReadyError` | `Error subclass` | Thrown by Pitfall 7 race-guard at worker entry. |

**Locked-in invariants:**

- `Decimal.set({ rounding: Decimal.ROUND_HALF_UP })` at module load — F-4.
- `prisma.providerCommissionConfig.update` NEVER called (F-5 append-only, asserted in unit test).
- No `prisma.upsert` anywhere in this module (D-08 explicit pattern).
- All 4 formula cases (`SALES_PCT | UTILITY_PCT | SALES_AND_UTILITY_PCT | TIERED`) — verified by `grep -cE` returning 4.
- `configSnapshot Json` denormalized onto every ledger row: `{ formulaType, salesRate, utilityRate, tiers }`.
- `'no_config_at_drawnAt'` reason code logged via `logger.warn` on D-01 silent skip.

### 2. `backend/src/queue/workers/calculate-provider-commission.worker.js` (commit e5e26be)

Replaces the Phase 11 D-15 placeholder. Race-condition guard:

```js
const df = await prisma.drawFinancial.findUnique({
  where: { drawId },
  select: { totalizedAt: true },
});
if (!df || df.totalizedAt === null) {
  throw new DrawFinancialNotReadyError(drawId);
}
```

pg-boss retries 3× with backoff (`QUEUE_CONFIGS.CALCULATE_PROVIDER_COMMISSION` = `retryLimit: 3, retryDelay: 5, retryBackoff: true`). When the PRIZES phase commits, the next retry succeeds.

Array-unwrap idiom `const job = Array.isArray(jobs) ? jobs[0] : jobs` matches the codebase convention. On success delegates to `computeAndUpsertLedgerForDraw(drawId)` and returns `{ success, drawId, providersProcessed, skipped }`.

### 3. `backend/src/queue/workers/weekly-settlement-snapshot.worker.js` (commit e5e26be)

Cron-triggered (Linux, Monday 06:00 VE). Reference date = `subDays(new Date(), 1)` — guarantees we're inside the prior ISO week even if cron fires late.

GROUP BY apiSystemId via raw SQL across the closed ISO week's ledger rows. Then for each row, state-conditional branch — **no `prisma.upsert` anywhere**:

| Existing state | Drift? | Action |
|----------------|--------|--------|
| (no row) | n/a | `create({ status: 'DRAFT', ... })` — `created++` |
| `DRAFT` | n/a | `update({ amount, ledgerRowCount, snapshotAt })` — `updated++`. Note: status NOT touched. |
| `CONFIRMED` | no | freeze — no DB write — `frozen++` |
| `CONFIRMED` | yes | `update({ status: 'ADJUSTED', adjustmentReason: 'auto: drift detected by snapshot' })` + `logger.warn` with `oldAmount`/`newAmount`. Amount is **NOT** overwritten (D-03 freeze). `drifted++` |
| `ADJUSTED` | any | freeze — terminal vs automatic recomputation (D-02 final sentence) — `frozen++` |

Returns `{ isoYear, isoWeek, created, updated, frozen, drifted }`.

### 4. `backend/src/queue/constants.js` modifications (commit 2e73f12)

Two surgical changes:

- After the `CALCULATE_PROVIDER_COMMISSION` entry in `QUEUES`: added line  
  `WEEKLY_SETTLEMENT_SNAPSHOT: 'weekly-settlement-snapshot',`
- New `QUEUE_CONFIGS[QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT]` entry — `retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInMinutes: 10` (generous window for the weekly GROUP BY).
- Updated comment on `CALCULATE_PROVIDER_COMMISSION` config to reflect real handler (was "Phase 12 placeholder — fast handler, no real work yet").

### 5. `backend/src/queue/register.js` modifications (commit 2e73f12)

Two surgical changes inside the Phase 11 block (originally lines 94–113):

1. **Placeholder swap (was lines 106–112):** dynamic-imported `calculateProviderCommissionWorker` from `./workers/calculate-provider-commission.worker.js`, then `boss.work(QUEUES.CALCULATE_PROVIDER_COMMISSION, QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION], calculateProviderCommissionWorker)`. The `boss.createQueue(QUEUES.CALCULATE_PROVIDER_COMMISSION)` from Phase 11 stays (F-11 already correct).
2. **Snapshot worker addition (after old line 113 `logger.info`, before the retry-failed-publications block):** dynamic-imported `weeklySettlementSnapshotWorker`, called `boss.createQueue(QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT)` **before** `boss.work(...)` (F-11 mandate), and logged registration with the cron trigger note.

Comment block above the Phase 11 section updated to mention Phase 12 now owns the real handler and the new snapshot queue.

## Verification (all passed locally)

| Gate | Command | Result |
|------|---------|--------|
| Task 1 Jest | `node --experimental-vm-modules node_modules/.bin/jest src/services/__tests__/commission.service.test.js` | 13 passed |
| Task 2 Jest | `... src/queue/workers/__tests__/calculate-provider-commission.worker.test.js src/queue/workers/__tests__/weekly-settlement-snapshot.worker.test.js` | 9 passed (4 + 5) |
| Phase 11 regression | `... src/queue/workers/__tests__/calculate-draw-financials.worker.test.js` | 6 passed (no regressions) |
| Task 1 grep gates | 9 named exports, `Decimal.set`, `ROUND_HALF_UP`, no `prisma.providerCommissionConfig.update`, no `prisma.upsert`, 4 formula `case` statements, `no_config_at_drawnAt`, ≥2 `configSnapshot`, `SUM(C` audit formula | all pass |
| Task 2 grep gates | both worker exports, `DrawFinancialNotReadyError` 2× in commission worker, `getISOWeekVE`/`subDays` in snapshot worker, no `prisma.upsert`, drift reason string present | all pass |
| Task 3 grep gates | constants/register both wired, no `phase-12 placeholder`, no `return { placeholder: true }` | all pass |
| Boot smoke | `SELECT name FROM pgboss.queue WHERE name IN ('calculate-provider-commission','weekly-settlement-snapshot')` after `boss.start()` + `registerAllWorkers(boss)` | returns 2 rows |

## Deviations

None. Plan executed exactly as written. The boot smoke test was performed via a small in-process `boss.start()` + `registerAllWorkers(boss)` harness (then queried pgboss.queue with `docker exec tote_postgres psql ...`) — equivalent to the `<verify>` SQL the plan asks for. The temporary harness file was deleted; nothing extra committed.

`backend/node_modules/decimal.js` was missing on this machine before Task 1 (declared in `package.json` but not on disk). One `npm install` was run to fetch it; no version pin or `package.json` change was made.

## What Plan 12-03 will do (handoff)

## Self-Check: PASSED

All 9 files exist on disk. All 3 task commits present in `git log`: 5a9e307, e5e26be, 2e73f12. Boot smoke test confirms both `calculate-provider-commission` and `weekly-settlement-snapshot` rows in `pgboss.queue`.

## Handoff to Plan 12-03

Plan 12-03 picks up here:

1. **Wire the pipeline trigger** — add a third `boss.send` inside `backend/src/queue/workers/step-process-prizes.worker.js` for `QUEUES.CALCULATE_PROVIDER_COMMISSION` (parallel with the existing `CALCULATE_DRAW_FINANCIALS` and `STEP_CALCULATE_STATS` sends). The commission worker's race-guard (Pitfall 7) handles "PRIZES not yet committed" via pg-boss retry.
2. **Allowlist the new cron queue** — add `'weekly-settlement-snapshot'` to the `ALLOWED_QUEUES` set in `backend/src/scripts/trigger-pgboss-cron.mjs`. DEPLOY.md will add the cron line `0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot` to `/etc/cron.d/tote-triggers` (out of session — LOCAL-ONLY here per F-12).
3. **Admin surface** — `backend/src/routes/commission.routes.js` + `backend/src/controllers/commission.controller.js` exposing config CRUD (append-only — `createConfig` only, no `updateConfig`), ledger viewer, settlement list + drill-down, confirm/adjust transitions (with `AuditLog` writes), and `GET /:id/excel` + `GET /:id/pdf` streaming via `buildSettlementExcel` + `getSettlementPdfData` from this plan.
