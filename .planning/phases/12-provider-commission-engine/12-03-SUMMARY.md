---
phase: 12
plan: 3
plan_name: pipeline-wiring-admin-routes-integration-test
status: complete
completed_at: 2026-05-15
commits:
  - 890df78  # Task 1 — step-process-prizes third boss.send + cron allowlist
  - e6aadfd  # Task 2 — commission.controller.js + routes + tests
  - eb3dd59  # Task 3 — integration test
test_counts:
  commission.controller.test.js: 15 passed
  commission-pipeline.integration.test.js: 4 passed
  regression_suite: 53 passed (all Phase 11-12 tests)
key_assertion:
  ledger_amount_exact: "55.00000000"
requirements:
  - FIN-COMM-05
  - FIN-COMM-06
  - FIN-COMM-07
  - FIN-COMM-08
  - FIN-COMM-09
  - FIN-COMM-10
  - FIN-COMM-11
---

# Plan 12-03 — Pipeline Wiring + Admin Routes + Integration Test

## What was built

Three coordinated edits to existing files, two new Express files, and one live-DB integration test. The end result is a fully wired provider-commission compute pipeline that fires automatically every time a draw totalizes, plus a backend-enforced admin surface for managing configs, ledgers, and weekly settlements.

## Task 1 — Pipeline trigger + cron allowlist (commit 890df78)

### `backend/src/queue/workers/step-process-prizes.worker.js`

Two surgical insertions, one per branch — both immediately after the existing Phase 11 `CALCULATE_DRAW_FINANCIALS` send. The exact line locations:

| Branch | Function path                                                         | Phase 12 send line | Preceding Phase 11 (CALCULATE_DRAW_FINANCIALS) send line |
| ------ | --------------------------------------------------------------------- | ------------------:| --------------------------------------------------------:|
| 1      | `stepProcessPrizesWorker()` — early-return when `prizesProcessed=true` | 31                 | 26                                                       |
| 2      | `stepProcessPrizesWorker()` — main success path                        | 67                 | 56                                                       |

Both insertions follow the identical shape used by the existing parallel sends:

```js
// Phase 12: parallel-trigger provider commission. Worker has DrawFinancialNotReadyError race-guard (Pitfall 7) — pg-boss retries 3× with backoff if PRIZES has not committed.
await boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, { drawId }, {
  singletonKey: `comm-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
});
```

No new imports — `getBoss`, `QUEUES`, `QUEUE_CONFIGS` were already imported from Phase 11. No `try/catch` wrapper — failure semantics match the existing `STEP_CALCULATE_STATS` and `CALCULATE_DRAW_FINANCIALS` neighbors (pg-boss retries the whole worker), and the commission worker's `DrawFinancialNotReadyError` race-guard handles the only timing race that matters.

### `backend/src/scripts/trigger-pgboss-cron.mjs`

Single-line addition inside the `ALLOWED_QUEUES` set, after `'cleanup-logs'`:

```diff
   'retry-failed-publications',
   'monitor-dlq',
   'cleanup-logs',
+  // Phase 12 — weekly settlement snapshot, fired Monday 06:00 VE via /etc/cron.d/tote-triggers
+  'weekly-settlement-snapshot',
 ]);
```

The FATAL guard at line 49-51 stays in place — it's what makes the allowlist meaningful (any cron line trying to enqueue a queue not in the set exits with code 2).

### Verification (Task 1)

| Gate                                                                                                                    | Result |
| ----------------------------------------------------------------------------------------------------------------------- | ------ |
| `grep -c QUEUES.CALCULATE_PROVIDER_COMMISSION backend/src/queue/workers/step-process-prizes.worker.js` (≥ 2 expected)   | 4 ✓    |
| `grep -c "singletonKey: \`comm-" backend/src/queue/workers/step-process-prizes.worker.js` (≥ 2 expected)                | 2 ✓    |
| `grep -c QUEUES.STEP_CALCULATE_STATS backend/src/queue/workers/step-process-prizes.worker.js` (original preserved)      | 4 ✓    |
| `grep -c QUEUES.CALCULATE_DRAW_FINANCIALS backend/src/queue/workers/step-process-prizes.worker.js` (original preserved) | 4 ✓    |
| `grep -F "'weekly-settlement-snapshot'" backend/src/scripts/trigger-pgboss-cron.mjs`                                    | match ✓ |
| All 11 allowlist entries present (`grep -cE` against the 11-name set)                                                   | 11 ✓   |
| `node --check` both files                                                                                               | exit 0 ✓ |

## Task 2 — Admin controller + routes + mount + tests (commit e6aadfd)

### `backend/src/controllers/commission.controller.js` (438 LOC)

Class-style controller with default export `new CommissionController()`. Nine methods, exactly mirroring the route table below.

Key invariants enforced at the controller layer:

| Invariant | Mechanism |
|-----------|-----------|
| **F-5 append-only** | NO `updateConfig` method on the class. POST `/configs` is the only mutation path; the controller emits `createConfig` only. `grep -c updateConfig` on the controller returns 0. |
| **F-5 per-formula validation** | `createConfig` validates required rates per `formulaType` (`SALES_PCT` → `salesRate`, `UTILITY_PCT` → `utilityRate`, `SALES_AND_UTILITY_PCT` → both, `TIERED` → non-empty `tiers[]` with valid `minSales`/`maxSales`/`rate`). Returns 400 with a precise error message on any failure. |
| **D-03 immutability** | `confirmSettlement` re-reads the settlement row inside the request; if `status !== 'DRAFT'` it returns 400 `"Settlement is not in DRAFT status"` BEFORE the update fires. No DB write, no AuditLog write on a rejected transition. |
| **D-02 path 1 snapshot** | `adjustSettlement` reads `existing.amount` and writes it to `originalAmount` in the same update payload as the new `amount`. `grep -F "originalAmount: existing.amount"` returns a match. Requires non-empty `adjustmentReason`. Rejects with 400 if current status is not `CONFIRMED` or `ADJUSTED`. |
| **A4 AuditLog** | Both transitions write an `AuditLog` row synchronously — `await prisma.auditLog.create(...)` with NO `.catch` swallow. Block on the write because financial trust requires the audit row to exist by the time the response is sent. Actions: `'SETTLEMENT_CONFIRMED'`, `'SETTLEMENT_ADJUSTED'`. Entity `'ProviderWeeklySettlement'`. Changes JSON includes `previousStatus`/`newStatus`/`amount` (confirm) and `previousAmount`/`newAmount`/`reason` (adjust). `ipAddress`, `userAgent`, `userId` copied from the request. |

Excel export (`exportSettlementExcel`) delegates to `commissionService.buildSettlementExcel(id)` from Plan 12-02, sets `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and streams the buffer with an `attachment; filename="liquidacion-{tag}-{slug}.xlsx"` disposition.

PDF export (`exportSettlementPdf`) loads `getSettlementPdfData(id)` (Plan 12-02), dynamic-imports `pdfkit`, instantiates `new PDFDocument({ size: 'LETTER', margins: {...}, bufferPages: true })`, pipes to the response, and renders title + totals block + per-draw table using a `drawTable` helper lifted inline from `monitor.controller.js:141-157`. Currency formatting via `Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' })`.

### `backend/src/routes/commission.routes.js` (37 LOC)

```
                          (router.use(authenticate, authorize('ADMIN'))  ← single top-level gate)
GET    /api/commissions/configs/:apiSystemId        → listConfigs
POST   /api/commissions/configs                     → createConfig
GET    /api/commissions/ledger                      → getLedger
GET    /api/commissions/settlements                 → getSettlements
GET    /api/commissions/settlements/:id             → getSettlementDetail
PATCH  /api/commissions/settlements/:id/confirm     → confirmSettlement
PATCH  /api/commissions/settlements/:id/adjust      → adjustSettlement
GET    /api/commissions/settlements/:id/excel       → exportSettlementExcel
GET    /api/commissions/settlements/:id/pdf         → exportSettlementPdf
```

`grep -cE "router\.(put|delete)\(['\"]\/configs"` returns **0** — F-5 enforced at the routing layer in addition to the controller.

### `backend/src/index.js`

Two-line additions:

- Line 215 (after `conciliacionRoutes` import): `import commissionRoutes from './routes/commission.routes.js';`
- Line 266 (after `app.use('/api/conciliacion', conciliacionRoutes);`): `app.use('/api/commissions', commissionRoutes);`

### `backend/src/controllers/__tests__/commission.controller.test.js` (15 tests, all green)

| Group              | Test                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `createConfig`     | SALES_PCT without salesRate → 400                                        |
| `createConfig`     | TIERED with empty tiers → 400                                            |
| `createConfig`     | UTILITY_PCT without utilityRate → 400                                    |
| `createConfig`     | SALES_AND_UTILITY_PCT without both rates → 400                           |
| `createConfig`     | Valid SALES_PCT → 201 + persisted row with `createdById`                 |
| `createConfig`     | Valid TIERED → 201 + nested tier `create:` payload                       |
| `listConfigs`      | Rows ordered effectiveFrom desc with tiers included                      |
| `confirmSettlement`| DRAFT → 200 + status CONFIRMED + AuditLog `SETTLEMENT_CONFIRMED`         |
| `confirmSettlement`| CONFIRMED → 400 `Settlement is not in DRAFT status`                      |
| `confirmSettlement`| ADJUSTED → 400 (same)                                                     |
| `confirmSettlement`| Not found → 404                                                          |
| `adjustSettlement` | CONFIRMED + valid body → 200 + ADJUSTED + originalAmount snapshot + AuditLog |
| `adjustSettlement` | Missing adjustmentReason → 400                                           |
| `adjustSettlement` | DRAFT row → 400 (only CONFIRMED/ADJUSTED accept adjust)                  |
| `F-5 enforcement`  | `commissionController.updateConfig === undefined`                        |

### Live auth-gate verification (Task 2)

Booted the backend in dev mode with `ENABLE_JOBS=false DISABLE_SOCIAL_CHANNELS=true` and:

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/commissions/settlements
401
```

Response body: `{"success":false,"error":"Token de autenticación no proporcionado"}`. The router-level `authenticate` middleware is active.

## Task 3 — End-to-end integration test (commit eb3dd59)

### `backend/src/__tests__/commission-pipeline.integration.test.js` (270 LOC, 4 tests, all green)

Test harness mirrors Phase 11's `draw-financial-pipeline.integration.test.js`:

- Uses the LOTOANIMALITO game id from `CLAUDE.md` (`d953f80c-4335-4bc9-9f78-9b56193286fe`) — already exists in local DB, no seeding needed.
- Unique `TEST_PREFIX = __test-comm-${Date.now()}-${process.pid}` for ApiSystem fixtures so concurrent runs don't collide.
- Tracks created `Draw`/`ProviderCommissionConfig`/`ApiSystem` IDs in module-level arrays. `afterEach` cleans them up via `prisma.deleteMany`; `afterAll` re-cleans then disconnects.
- Direct service invocation — `computeAndUpsertLedgerForDraw(drawId)` and `calculateProviderCommissionWorker({ data: { drawId } })`. No pg-boss in the test (pg-boss is exercised in worker-level tests from Plan 12-02).
- `beforeAll` runs a sanity probe (`prisma.$queryRaw\`SELECT 1\``), proves Plan 12-01 tables exist (`prisma.providerCommissionLedger.count()`), and confirms `LOTOANIMALITO` is present.

### Scenarios

| # | Test                                                                                                       | Proves                                                                                                       |
| - | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 | Happy-path SALES_PCT 5.5% × 1000 → `ledger.amount === "55.00000000"`                                       | Service compute is bit-exact via decimal.js. `salesBase === "1000.00000000"`, `utilityBase === "800.00000000"`, `configSnapshot.formulaType === "SALES_PCT"`, `configSnapshot.salesRate === "5.5"`. |
| 2 | No `ProviderCommissionConfig` row → silent skip                                                            | D-01: `result.skipped === 1`, `result.providersProcessed === 0`, and `prisma.providerCommissionLedger.count` against the seeded draw returns 0. |
| 3 | Re-invoke `computeAndUpsertLedgerForDraw(drawId)` twice                                                    | D-08 explicit upsert: exactly 1 ledger row, not 2. Amount still `55.00000000`.                               |
| 4 | DrawFinancial.totalizedAt = null → invoke `calculateProviderCommissionWorker` directly                     | Pitfall 7 race-guard: `DrawFinancialNotReadyError` thrown, NO ledger row written.                            |

### Determinism + cleanup

- Pre-run `ProviderCommissionLedger.count() = 0`
- Run integration test
- Post-run `ProviderCommissionLedger.count() = 0` ✓
- Re-run the integration test a second time → all 4 tests still pass (re-runnable harness)

### Full regression run

After Task 3 commit, the full Phase 11-12 suite was run:

```
PASS src/services/__tests__/commission.service.test.js
PASS src/controllers/__tests__/commission.controller.test.js
PASS src/queue/workers/__tests__/calculate-draw-financials.worker.test.js
PASS src/queue/workers/__tests__/weekly-settlement-snapshot.worker.test.js
PASS src/queue/workers/__tests__/calculate-provider-commission.worker.test.js
PASS src/__tests__/commission-pipeline.integration.test.js
PASS src/queue/workers/__tests__/draw-financial-pipeline.integration.test.js

Test Suites: 7 passed, 7 total
Tests:       53 passed, 53 total
```

No regressions.

## Deviations

None. Plan executed exactly as written. Minor notes:

- The `<verify>` grep gates spec said "`grep -c QUEUES.CALCULATE_PROVIDER_COMMISSION` returns at least 2" — actual value is 4 because `grep -c` counts **lines** and each `boss.send` line contains the constant twice (once in `boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, ...)` and once in `...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION]`). The intent (a send in each branch) is verified by the dedicated `"singletonKey: \`comm-"` grep returning 2.
- The "no `updateConfig`" gate initially returned 1 because of a doc-block comment that *mentioned* the name. The doc was reworded to "F-5: append-only. NO mutation method on /configs." before commit so the grep returns 0.
- One harness ergonomic improvement vs. Phase 11: cleanup arrays (`createdDrawIds`/`createdConfigIds`/`createdApiSystemIds`) are reset to `[]` inside `cleanupTestData` so back-to-back test invocations stay perfectly idempotent.

## Self-Check: PASSED

- `backend/src/queue/workers/step-process-prizes.worker.js` — FOUND (commit 890df78 added Phase 12 send at lines 31 + 67)
- `backend/src/scripts/trigger-pgboss-cron.mjs` — FOUND (allowlist contains `'weekly-settlement-snapshot'` at line 46)
- `backend/src/controllers/commission.controller.js` — FOUND (438 LOC, 9 controller methods, 0 `updateConfig`)
- `backend/src/routes/commission.routes.js` — FOUND (9 routes, top-level `authenticate + authorize('ADMIN')`, 0 PUT/DELETE on `/configs`)
- `backend/src/index.js` — FOUND (import line 215, mount line 266)
- `backend/src/controllers/__tests__/commission.controller.test.js` — FOUND (15 tests, all pass)
- `backend/src/__tests__/commission-pipeline.integration.test.js` — FOUND (4 tests against live DB, all pass)
- Commits 890df78, e6aadfd, eb3dd59 — all reachable from HEAD (`git log --oneline -3` confirms).
- Live curl auth gate verified — `GET /api/commissions/settlements` returns 401 without a Bearer token.

## Handoff to Plan 12-04

Plan 12-04 picks up here:

1. **Admin UI** — build `frontend/app/admin/proveedores/[id]/comisiones/page.js` (per-provider config tab — append-only form, history timeline) and `frontend/app/admin/comisiones/page.js` (top-level section with "Liquidaciones" + "Ledger" tabs) consuming the routes wired in this plan. Modal-form pattern from `frontend/app/admin/proveedores/logs/page.js`. Tab-state pattern from `frontend/app/admin/proveedores/page.js`. Per `12-CONTEXT.md` D-05.
2. **Historical backfill script** — `backend/src/scripts/backfill-provider-commissions.mjs` (per `12-PATTERNS.md` section 9). Mirrors `backfill-draw-financials.mjs`: `--dry-run` / `--confirm` gates, chunked iteration, F-17 abort if any candidate draw is older than `COMMISSION_GO_LIVE = 2026-04-17T00:00:00-04:00`, reconciliation CSV at `backend/storage/backfill-reports/provider-commission-recon-{stamp}.csv`, summary line surfacing the D-01 silent-skip count.
3. **DEPLOY.md** (out-of-session this round — LOCAL-ONLY per F-12) — add the cron line `0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot` to `/etc/cron.d/tote-triggers`. 10:00 UTC = 06:00 VE (UTC-4, no DST). Plan 12-04 should bundle this in its DEPLOY.md additions; this session does NOT execute any VPS commands.
