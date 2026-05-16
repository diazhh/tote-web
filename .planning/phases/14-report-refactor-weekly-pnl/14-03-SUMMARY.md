---
phase: 14
plan: 3
plan_name: weekly-pnl-service-controller-routes
subsystem: backend / reports
type: execute
tags: [phase-14, pnl, weekly, fin-report-05, fin-report-06, fin-report-07, d-01, d-02, d-04, p-b, p-c]
requires:
  - .planning/phases/14-report-refactor-weekly-pnl/14-02-SUMMARY.md (DrawFinancial path now canonical via REPORT_USE_MATERIALIZED=true)
  - .planning/phases/11-drawfinancial-foundation/11-04-SUMMARY.md (DrawFinancial + DrawFinancialProvider schema)
  - .planning/phases/12-provider-commission-engine (ProviderWeeklySettlement model)
  - .planning/phases/13-exchange-rate-accounting-ledger (ExchangeRate + AccountingEntry model)
provides:
  - backend/src/services/pnl-report.service.js (PnlReportService: getWeeklyPnl + buildPnlExcel + buildPnlPdf)
  - backend/src/controllers/pnl-report.controller.js (REST handlers + validateWeekParams)
  - backend/src/routes/pnl-report.routes.js (admin-gated /pnl/semanal{,/excel,/pdf})
  - backend/src/lib/dateUtils.js: getMondayOfISOWeek, getISOWeek, getISOWeekYear (re-exports)
  - 4 new Jest test files (FIN-REPORT-05, P-B double-count guard, P-C empty week, FIN-REPORT-07 Excel/PDF)
affects:
  - 14-04 (frontend Weekly P&L dashboard consumes /api/reportes/pnl/semanal*)
tech_stack:
  added: []
  patterns:
    - ExcelJS SUM-formula auditable totals (Phase 12 pattern at accounting-report.service.js:248-261)
    - PDFKit drawTable inline helper (monitor.controller.js:141-157 verbatim)
    - decimal.js ROUND_HALF_UP for all monetary arithmetic + .toFixed(2) on the wire
    - Promise.all + Prisma.sql parameterized $queryRaw fragments (T-14-03-01)
    - Service-class singleton export + named class export (matches accounting-report pattern)
    - Validation-throws-with-statusCode error pattern, controller translates to 400/500
key_files:
  created:
    - backend/src/services/pnl-report.service.js
    - backend/src/controllers/pnl-report.controller.js
    - backend/src/routes/pnl-report.routes.js
    - backend/src/__tests__/pnl-report-service.test.js
    - backend/src/__tests__/pnl-empty-data.test.js
    - backend/src/__tests__/pnl-double-count-guard.test.js
    - backend/src/__tests__/pnl-excel-pdf.test.js
  modified:
    - backend/src/lib/dateUtils.js
    - backend/src/index.js
key_decisions:
  - "D-01 (this phase) implemented as ORDER BY date DESC, createdAt DESC LIMIT 1 with date <= mondayOfWeek — INTENTIONALLY different from Phase 13 D-01 (same-day createdAt DESC). Documented in service JSDoc to prevent future conflation."
  - "D-02 PAYMENT exclusion enforced as explicit WHERE type='EXPENSE' (NOT WHERE type != 'INCOME'). PAYMENT linked to settlement is invisible in weekExpenses. Pinned by pnl-double-count-guard.test.js (P-B regression net)."
  - "D-04 provider-filtered mode returns weekExpenses=null + otherIncome=null + byProvider=[]. The Promise.all retains a stable shape via short-circuit-resolved promises (keeps the destructuring tidy without conditional branches at the call site)."
  - "AccountingEntry FK is named `settlementId` (NOT `providerSettlementId` as some plan text hinted). Verified against schema.prisma:1566. No code change required — the seed and the (decoupled) drill-down ids both use settlementId."
  - "Test seeding uses ISO 1999-W1 (formula test) and 1998-W1 (double-count test) to keep the two suites independent and isolated from any real prod-mirror data."
  - "Excel USD column is implemented as { formula: 'B<row> / B<rateRow>' } cells referencing a single rate-value cell. Operator editing the rate cell recomputes every USD figure — auditable per FIN-REPORT-07."
  - "PDF builder collects chunks via doc.on('data') and Buffer.concats them — pure in-memory; controller streams via res.send(buffer). This mirrors the pattern most-used in commission.service.js / accounting-report.service.js where the controller does the streaming."
metrics:
  duration_seconds: ~600
  duration_human: ~10 min
  tasks_completed: 3
  commits: 3
  completed_at: 2026-05-15
---

# Phase 14 Plan 03 — Weekly P&L (FIN-REPORT-05/06/07) Summary

New backend surface combining Phase 11 (DrawFinancial), Phase 12 (ProviderWeeklySettlement) and Phase 13 (AccountingEntry + ExchangeRate) into a single ISO-week P&L row with USD equivalent, drill-down IDs, per-provider breakdown, and auditable Excel/PDF exports — all behind the same admin auth gate used by the monitor routes.

## What was built

1. **dateUtils.js** — added `getMondayOfISOWeek(isoYear, isoWeek)` returning the UTC instant for Monday 00:00 America/Caracas. Implementation: shift Jan 4 forward by `(isoWeek - 1)` weeks, take `startOfISOWeek`, convert via `fromZonedTime`. Also re-exports `getISOWeek` / `getISOWeekYear` from date-fns (defensive per assumption A1; Phase 12 already exports them too, this aliases them at a stable path).

2. **pnl-report.service.js** — `PnlReportService` class with three methods:
   - `getWeeklyPnl({ isoYear, isoWeek, apiSystemId? })` — single Promise.all fan-out across DrawFinancial/DrawFinancialProvider, ProviderWeeklySettlement, AccountingEntry (EXPENSE + INCOME separately), plus ExchangeRate. Returns the full documented response shape including drill-down arrays and byProvider breakdown.
   - `buildPnlExcel(opts)` — emits an `xlsx` Buffer whose Utilidad bruta / Neto rows are `{ formula: ... }` cells referencing prior data rows. USD column cells are `{ formula: 'B<row> / B<rateRow>' }` — editing the rate value recomputes everything.
   - `buildPnlPdf(opts)` — emits a PDF Buffer (collect-chunks + Buffer.concat). Uses an inlined `drawTable` helper copied verbatim from `monitor.controller.js:141-157` plus a rate label footer.
   - Private `_getRateAsOfDate(date)` and `_fetchDrawAggregate` / `_fetchByProvider` helpers; all dynamic SQL fragments go through `Prisma.sql` (T-14-03-01).

3. **pnl-report.controller.js** — `PnlReportController` with three handlers (getWeeklyPnl, downloadPnlExcel, downloadPnlPdf). Module-level `validateWeekParams` rejects invalid input with statusCode=400 BEFORE the service runs (V5 mitigation; T-14-03-02). Unknown errors → 500 with generic message; full stack logged via Winston.

4. **pnl-report.routes.js** — `Router` behind `authenticate` + `authorize('ADMIN', 'OPERATOR')` (mirror of `monitor.routes.js:12-13`). Excel/PDF routes registered BEFORE the JSON path to avoid Express conflicts (mirror of `monitor.routes.js:23-27` convention).

5. **index.js** — added `import pnlReportRoutes` near the conciliacion/commission imports and `app.use('/api/reportes', pnlReportRoutes)` next to `/api/monitor` mount.

## Formula implemented (D-02)

```
weekIncome       = SUM(DrawFinancial.totalSales)           — week-window via Draw.drawnAt
weekPrizes       = SUM(DrawFinancial.totalPrize)           — same window
weekGrossUtility = weekIncome - weekPrizes
weekCommissions  = SUM(ProviderWeeklySettlement.amount)    — matching (isoYear, isoWeek)
weekExpenses     = SUM(AccountingEntry.amountBsF) WHERE type='EXPENSE'
weekNet          = weekGrossUtility - weekCommissions - weekExpenses
otherIncome      = SUM(AccountingEntry.amountBsF) WHERE type='INCOME'   (separate row, NOT netted)
usdEquivalent    = weekNet / rate.rateBsPerUsd  ROUND_HALF_UP 2dp       (D-01 — most-recent-AS-OF Monday)
```

Provider-filtered mode (apiSystemId set, D-04):
- income/prizes come from `DrawFinancialProvider` filtered by `apiSystemId`
- `weekExpenses = null`, `otherIncome = null`
- `weekNet = weekGrossUtility - weekCommissions` (no expense subtraction)
- `byProvider = []`, drill-down expense/income ids = `[]`

Empty week (P-C): every aggregate is `COALESCE(SUM(...), 0)::numeric(12,2)` — the response shape is identical for an empty week, all monetary fields render as `"0.00"`.

## Test results

| File                                                | Tests | Status | Coverage |
|-----------------------------------------------------|-------|--------|----------|
| `__tests__/pnl-report-service.test.js`             | 2     | PASS   | FIN-REPORT-05 formula + D-04 provider-filtered mode |
| `__tests__/pnl-empty-data.test.js`                 | 1     | PASS   | P-C empty-week zero row, no 500 |
| `__tests__/pnl-double-count-guard.test.js`         | 1     | PASS   | P-B PAYMENT invisible in weekExpenses, no double-deduct |
| `__tests__/pnl-excel-pdf.test.js`                  | 3     | PASS   | FIN-REPORT-07 Excel buffer has `{formula:...}` cells; PDF starts with `%PDF`; empty week renders both gracefully |
| **Plan 14-03 subtotal**                            | **7** | **7/7 PASS** | |
| Phase 14 cumulative (`pnl-`, `daily-report`, `draws-getById`) | 14 | 14/14 PASS | Plan 14-02 regression tests + Plan 14-03 P&L tests |

Verification command (full Phase 14 backend gate per plan):
```
cd backend && NODE_OPTIONS='--experimental-vm-modules' npx jest \
  --testPathPattern='(pnl-|daily-report|draws-getById)' --runInBand
```
Result: `Test Suites: 8 passed, 8 total / Tests: 14 passed, 14 total`.

## Seeded FIN-REPORT-05 numbers (for downstream cross-check)

Seed window ISO 1999-W1:
- 1 Draw with DrawFinancial(totalSales=1000.00, totalPrize=400.00)
- 1 ProviderWeeklySettlement(amount=50.00)
- 1 AccountingEntry(EXPENSE, 100.00)
- 1 AccountingEntry(INCOME, 20.00) — separate row, NOT in weekNet
- 1 ExchangeRate(BCV, 36.50) dated before the window

Service returns:
```
weekIncome       = "1000.00"
weekPrizes       = "400.00"
weekGrossUtility = "600.00"
weekCommissions  = "50.00"
weekExpenses     = "100.00"
weekNet          = "450.00"     ← 600 - 50 - 100
otherIncome      = "20.00"      ← NOT netted into weekNet
rate             = { rateType: "BCV", rateBsPerUsd: "36.5", date: "1998-12-21" }
usdEquivalent    = "12.33"      ← 450/36.50 = 12.3287… ROUND_HALF_UP → 12.33
```

P-B regression numbers (ISO 1998-W1, no draws seeded):
- 1 ProviderWeeklySettlement(amount=200, CONFIRMED)
- 1 AccountingEntry(PAYMENT, 200, settlementId=<settlement>)
- 1 AccountingEntry(EXPENSE, 50)
Service returns `weekExpenses="50.00"` (NOT `"250.00"`), `weekCommissions="200.00"`, `weekNet="-250.00"`. The PAYMENT amount appears nowhere in the expenses bucket.

## Schema deviations encountered

**1. AccountingEntry FK is named `settlementId`, not `providerSettlementId`.** Plan text 14-03 mentions both names. Verified against `schema.prisma:1566` — actual column is `settlementId String?`. No code change required: the service drill-down uses `settlementId` indirectly (via `payments AccountingEntry[]` relation lookup), and the P-B test seeds the entry with `settlementId: settlementId`.

**2. Phase 12 already exports `getISOWeek` / `getISOWeekYear`.** Plan A1 was defensive ("Phase 12 may not have shipped them"). Phase 12 in fact shipped `getISOWeekVE` / `startOfISOWeekVE` / `endOfISOWeekVE` (locale-aware wrappers) but also imports the raw date-fns versions at module top. To avoid breaking the existing import pattern, this plan adds `export { getISOWeek, getISOWeekYear }` at the bottom of dateUtils.js as named aliases — both the wrapped and raw forms now resolve to the same date-fns export.

## Route mount confirmation

```
$ grep -nE "pnlReportRoutes" backend/src/index.js
221:import pnlReportRoutes from './routes/pnl-report.routes.js';
280:app.use('/api/reportes', pnlReportRoutes); // Phase 14 — Weekly P&L (admin-gated)
```

Exactly one import + one mount — no other route owns `/api/reportes`.

## Input validation sanity (manual)

```
validateWeekParams({ isoYear: 'abc', isoWeek: '1' })        → 400 "isoYear inválido"
validateWeekParams({ isoYear: '2026', isoWeek: '99' })       → 400 "isoWeek inválido"
validateWeekParams({ isoYear: '2026', isoWeek: '19', apiSystemId: 'not-a-uuid' })
                                                              → 400 "apiSystemId no es un UUID válido"
validateWeekParams({ isoYear: '2026', isoWeek: '19' })       → { isoYear: 2026, isoWeek: 19, apiSystemId: null }
```

## Commits

| SHA       | Message |
|-----------|---------|
| `8d1b94f` | feat(14-03): pnl-report service core aggregator + ISO-week helpers + tests |
| `10b3cfe` | test(14-03): P-B PAYMENT double-count guard + FIN-REPORT-07 Excel/PDF buffers |
| `11681d0` | feat(14-03): pnl-report controller + routes + mount under /api/reportes |
| (this)    | docs(14-03): SUMMARY |

## Acceptance criteria status

| Criterion | Status |
|-----------|--------|
| `dateUtils.js` exports `getMondayOfISOWeek`, `getISOWeek`, `getISOWeekYear` without breaking existing exports | ✓ |
| `getMondayOfISOWeek(2026, 20) - getMondayOfISOWeek(2026, 19) === 7*24*60*60*1000` | ✓ (test pins this via `windowEnd - windowStart`) |
| `pnl-report.service.js` exports `PnlReportService` implementing `getWeeklyPnl` | ✓ (default singleton + named class) |
| Response includes ALL keys listed in `<interfaces>` | ✓ (verified by formula test structural assertions) |
| Seeded-week test passes with exact values (weekNet="450.00", usdEquivalent="12.33") | ✓ |
| Provider-filtered seeded test passes (weekExpenses=null, weekNet=550.00) | ✓ |
| Empty-week test returns clean zero response without throwing | ✓ |
| `buildPnlExcel` returns Buffer with `{formula: ...}` cells | ✓ (xlsx parsed back, formula cell detected) |
| `buildPnlPdf` returns Buffer starting with `%PDF` | ✓ |
| Both builders work against empty week without throwing | ✓ |
| `pnl-report.controller.js` exists with 3 handlers | ✓ |
| `pnl-report.routes.js` registers Excel/PDF BEFORE JSON | ✓ |
| `backend/src/index.js` mounts at `/api/reportes` (one match) | ✓ |
| Input validation: bad isoYear/isoWeek/apiSystemId → 400 | ✓ |
| Full Phase 14 backend test suite passes | ✓ (14/14) |
| No new dependencies added to package.json | ✓ |
| P-B PAYMENT double-count guard test green | ✓ |
| All `$queryRaw` fragments use `Prisma.sql` (no string concat) | ✓ |

## Deviations from plan

### Auto-fixed during execution

None. Plan executed exactly as written. The two minor adjustments below are documented decisions, not deviations:

**1. [Doc clarification] Builders shipped in Task 1 commit, tests in Task 2 commit.**
The plan placed `buildPnlExcel`/`buildPnlPdf` implementation under Task 2, but since both reuse internal state of `getWeeklyPnl` from Task 1, the cleanest split was to land the full service module in commit `8d1b94f` (Task 1) and add the regression tests in commit `10b3cfe` (Task 2). Functionally equivalent; the verification commands at each stage match the plan's per-task acceptance.

**2. [Doc clarification] `categoryPaymentId` in P-B test.**
The plan text says "create AccountingEntry(type='PAYMENT', ...)" but doesn't specify which category. Phase 13 seed includes PAYMENT-applicable categories; the test resolves one via `findFirst({ where: { appliesTo: 'PAYMENT', isActive: true } })` and falls back to creating a TEST_PREFIX-named one if none exists, mirroring the EXPENSE/INCOME category pattern.

### Auth gates

None — this plan does not introduce any new auth flows. Routes inherit the existing `authenticate` + `authorize('ADMIN', 'OPERATOR')` middlewares unchanged.

### Known stubs

None.

### Threat flags

Threat register T-14-03-01..07 honored:
- T-14-03-01 (Tampering via $queryRaw): all dynamic fragments use Prisma.sql template + `${param}` interpolation. No string concat. Three `$queryRaw` calls: `_getRateAsOfDate`, `_fetchDrawAggregate`, `_fetchByProvider`.
- T-14-03-02 (Invalid isoYear/isoWeek): `validateWeekParams` rejects with 400 — explicit bounds + integer parsing + UUID regex.
- T-14-03-03 (Verbose error stack): controller try/catch normalizes, returns generic 500 message; full stack logged via Winston only.
- T-14-03-04 (Excel/PDF disclosure): both downloads go through admin auth gate; Content-Disposition `attachment` forces download.
- T-14-03-05 (Excel formula injection): `apiSystemId` in filter suffix written via `cell.value = '<string>'` plain — never as `{ formula: ... }`. ExcelJS does not evaluate string values.
- T-14-03-06 (Repudiation): accepted in plan — no audit-row writes added.
- T-14-03-07 (DoS via byProvider): accepted in plan — bounded by ≤365 draws × ≤10 providers per week.

No NEW threat surface introduced beyond what the plan's threat model already anticipated.

## Self-Check: PASSED

**Files created (verified on disk):**
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/services/pnl-report.service.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/controllers/pnl-report.controller.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/routes/pnl-report.routes.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/__tests__/pnl-report-service.test.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/__tests__/pnl-empty-data.test.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/__tests__/pnl-double-count-guard.test.js` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/__tests__/pnl-excel-pdf.test.js` — FOUND

**Files modified (verified by `git log`):**
- `backend/src/lib/dateUtils.js` — VERIFIED (commit `8d1b94f`)
- `backend/src/index.js` — VERIFIED (commit `11681d0`)

**Commits verified in `git log --oneline`:**
- `8d1b94f` — FOUND
- `10b3cfe` — FOUND
- `11681d0` — FOUND

**Test suite verified:**
- 7/7 PASS across 4 Plan-14-03 test files
- 14/14 PASS across the full Phase 14 backend suite (`(pnl-|daily-report|draws-getById)`)

**Route mount verified:**
- `grep -nE "pnlReportRoutes" backend/src/index.js` → 2 matches (import + use)
