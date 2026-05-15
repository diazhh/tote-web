---
phase: 14
phase_name: Report Refactor + Weekly P&L
created: 2026-05-15
status: locked
---

# Phase 14 Context — Report Refactor + Weekly P&L

<domain>
Refactor `getDailyReport` and `getAccountingReport` to read from materialized `DrawFinancial` rows (Phase 11) — eliminating the multi-draw attribution bug — gated by `REPORT_USE_MATERIALIZED` env flag for safe rollout. Add a weekly P&L dashboard combining draw income, commissions (Phase 12), and expenses (Phase 13) with drill-down to underlying ledger rows and Excel/PDF export. The dashboard answers: "did we make or lose money this week, and on what?".
</domain>

<requirements_lock>
**Locked by `.planning/REQUIREMENTS.md` — FIN-REPORT-01..07.** Planner MUST read REQUIREMENTS.md before generating plans.

Key locked elements:
- `REPORT_USE_MATERIALIZED` env flag gates new vs legacy path (FIN-REPORT-01/03)
- Endpoint response shapes UNCHANGED — legacy path preserved (FIN-REPORT-03)
- Per-draw financial card on existing draw detail page (FIN-REPORT-04)
- Weekly P&L = `draw income − commissions − expenses` in BsF with USD equivalent column (FIN-REPORT-05)
- Drill-down to commission ledger + accounting entries by week (FIN-REPORT-06)
- Excel + PDF export reusing Phase 12 ExcelJS/PDFKit pattern (FIN-REPORT-07)
- v1.2 multi-draw attribution bug closes transparently (FIN-REPORT-02)
</requirements_lock>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — FIN-REPORT-01..07 (MUST read before planning)
- `.planning/ROADMAP.md` lines 257-272 — Phase 14 spec, prerequisite gates, F-7 pitfall
- `.planning/phases/11-drawfinancial-foundation/11-CONTEXT.md` — DrawFinancial schema, totalSales/totalPrize/utility/ticketCount fields
- `.planning/phases/11-drawfinancial-foundation/11-04-SUMMARY.md` — backfill findings (only 133/5937 draws had `prizesProcessed=true` — relevant to D-05 below)
- `.planning/phases/12-provider-commission-engine/12-CONTEXT.md` — Phase 12 D-04 ISO week boundary (lunes 00:00 VE), settlement schema
- `.planning/phases/13-exchange-rate-accounting-ledger/13-CONTEXT.md` — ExchangeRate schema + D-01 last-loaded-of-day (different convention from this phase's D-01 — see explicit note below)
- `backend/src/services/draw-financial.service.js` — service-function pattern + decimal.js usage
- `backend/src/services/commission.service.js` (Phase 12) — Excel/PDF reusable builders
- `backend/src/services/accounting-report.service.js:248-261` — ExcelJS SUM-formula pattern (analog from Phase 12 PATTERNS.md)
- `backend/src/controllers/monitor.controller.js:141-157` — PDFKit `drawTable` helper analog
- `backend/src/lib/dateUtils.js` — Venezuela TZ + ISO week helpers (Phase 12 added `getISOWeekYear`)
- `backend/src/scripts/backfill-draw-financials.mjs` — Phase 11 backfill script (reused/re-run as part of D-05)
- `./CLAUDE.md` — project conventions, LOCAL ONLY this session
</canonical_refs>

<decisions>

## D-01 — Weekly P&L USD column uses the Monday-start-of-week ExchangeRate

The USD equivalent column on the weekly P&L row uses the `ExchangeRate` row for the Monday that opens the ISO week (the same day that closes the previous settlement window per Phase 12 D-04).

**Lookup logic** (in a new `pnl-report.service.js` helper):
```sql
SELECT * FROM "ExchangeRate"
WHERE date <= :mondayOfWeek
ORDER BY date DESC, "createdAt" DESC
LIMIT 1
```

If the Monday has no rate, fall back to the most recent prior date that has one. The rate's `rateType` is shown in the UI label so the operator knows which one was used (e.g., "USD eq @ 36.50 BCV de 2026-05-13").

**Note:** this is INTENTIONALLY different from Phase 13 D-01's "last loaded of the day". Phase 13 D-01 picks `createdAt DESC` for a SPECIFIC date (USD entry conversion); Phase 14 D-01 picks the most recent rate AS OF a date (week-display lookup). Different intent → different rule. Both are documented and the planner must not conflate them.

If NO ExchangeRate exists in the system at all (e.g., empty Phase 13 table), the USD column shows "—" rather than erroring. The report still works for BsF-only operators.

## D-02 — P&L expenses = `AccountingEntry.type = EXPENSE` only

The P&L expenses bucket counts only entries with `type = EXPENSE`. `PAYMENT` entries are EXCLUDED because their cost is already captured in the commissions bucket (subtracting `ProviderWeeklySettlement.amount`). Including PAYMENT would double-count.

**Formula:**
```
weekIncome      = SUM(DrawFinancial.totalSales)     WHERE draw in ISO week
weekPrizes      = SUM(DrawFinancial.totalPrize)     WHERE draw in ISO week
weekGrossUtility = weekIncome - weekPrizes
weekCommissions = SUM(ProviderWeeklySettlement.amount) WHERE isoYear+isoWeek match
weekExpenses    = SUM(AccountingEntry.amountBsF)    WHERE type = EXPENSE AND entryDate in ISO week
weekNet         = weekGrossUtility - weekCommissions - weekExpenses
```

Reversal entries (negative `amountBsF`) naturally net out via SUM — no special filter needed. Reversed pairs cancel each other.

**INCOME entries** are NOT added to `weekIncome` — the weekIncome bucket is strictly draw revenue (DrawFinancial.totalSales). Non-draw INCOME (e.g., loan, capital injection) shows in a separate "Other Income" row below the main P&L line, not netted into the formula. This row is computed via `SUM(AccountingEntry.amountBsF) WHERE type=INCOME` and labeled clearly.

## D-03 — UI placement: `/admin/reportes/pnl-semanal`

The weekly P&L dashboard is a new page under the existing `/admin/reportes` section:
- New menu item "P&L Semanal" added to the Reportes sub-navigation
- Page header: "Estado de resultados semanal"
- Filter bar: ISO year + ISO week picker (default: current week); optional Provider filter (D-04 below)
- Main table: one row per week showing weekIncome / weekPrizes / weekCommissions / weekExpenses / weekNet (BsF + USD eq)
- Below the main table: "Otros ingresos" row (D-02) and a "Detalle por proveedor" expandable section if a provider filter is NOT active
- Drill-down buttons per week: "Ver comisiones" → `/admin/comisiones/settlements?week=YYYY-Www`; "Ver gastos" → `/admin/contabilidad/asientos?week=YYYY-Www&type=EXPENSE`; "Ver ingresos otros" → `/admin/contabilidad/asientos?week=YYYY-Www&type=INCOME`
- Export buttons: Excel + PDF for the currently-filtered view

The existing daily report (`/admin/reportes`) and accounting report (`/admin/reportes-contable`) pages stay where they are — Phase 14 changes their SERVICE backing (FIN-REPORT-01/03) but NOT their URL or response shape.

## D-04 — Provider filter on P&L is optional, default = total aggregate

By default the P&L shows the company-wide weekly totals. A provider picker in the filter bar (sourced from `ApiSystem` rows) lets the operator narrow the view to "P&L attributable to provider X this week".

When a provider filter is active:
- `weekIncome` = `SUM(DrawFinancialProvider.totalSales)` for that apiSystemId in the week
- `weekPrizes` = `SUM(DrawFinancialProvider.totalPrize)` for that apiSystemId
- `weekCommissions` = `ProviderWeeklySettlement.amount` for that provider's settlement of that week
- `weekExpenses` = N/A (EXPENSE entries are not per-provider — show "—" with a tooltip)
- `weekNet` = `weekGrossUtility - weekCommissions` (no expense subtraction in provider mode)

The "Detalle por proveedor" expandable section (visible only in unfiltered mode) renders the same row computation per provider as inline pre-computed view, avoiding N+1 page loads.

## D-05 — `REPORT_USE_MATERIALIZED` flag is enabled only AFTER a one-shot Phase 11 backfill rerun

Phase 11's backfill against the local prod-mirror processed only 133 draws because `prizesProcessed = true` only on the last 3 days (Finding B from 11-04-SUMMARY). Of 5937 DRAWN draws, the other 5804 lack the flag despite having `Prize` rows.

To make `REPORT_USE_MATERIALIZED=true` produce correct totals over the historical window, Phase 14 Plan 14-01 includes a one-shot fix task:

1. **Retroactive fix:** `UPDATE "Draw" SET "prizesProcessed" = true WHERE status='DRAWN' AND "prizesProcessed" = false AND EXISTS (SELECT 1 FROM "Prize" p WHERE p."drawId" = "Draw".id)`. Captures count before/after.
2. **Re-run Phase 11 backfill:** invoke `node src/scripts/backfill-draw-financials.mjs --confirm --chunk-size=200` against local mirror. Expected: ~5937 DrawFinancial rows + corresponding DrawFinancialProvider rows.
3. **Sanity check:** `SELECT COUNT(*) FROM "DrawFinancial"` must equal `SELECT COUNT(*) FROM "Draw" WHERE status='DRAWN' AND "prizesProcessed"=true` (after step 1).
4. **Reconciliation:** the existing reconciliation CSV from Phase 11 must show zero mismatches across all 5937 rows.

Only after these 4 steps pass does Phase 14 set `REPORT_USE_MATERIALIZED=true` in `.env`. Until then, the flag stays off and tests cover both paths.

**This makes Phase 14 self-contained for local execution** — the operator does NOT need to remember a pre-step. Phase 14 owns the prerequisite fix.

**For production deploy** (out of session scope, documented in 14-DEPLOY.md): the same 4 steps run against prod, then a 2-week minimum-live-data window per ROADMAP gate before the flag flips.

## D-06 — Both paths tested side-by-side during the transition

Plan 14-02's verification includes a "shadow comparison" Jest test that calls `getDailyReport({ ..., useMaterialized: true })` AND `getDailyReport({ ..., useMaterialized: false })` for the SAME date and asserts:
- Total numbers match for single-provider draws
- For draws with multi-play webhook tickets, the materialized path returns the correct per-draw total while the legacy path returns the buggy total — the test specifically demonstrates the bug going away

This serves as a regression net during rollout and as documentation of why the refactor matters.

</decisions>

<scope_boundaries>

**IN scope (Phase 14):**
- `REPORT_USE_MATERIALIZED` env flag + branching in `getDailyReport` and `getAccountingReport` services (FIN-REPORT-01/03)
- Per-draw financial card component on the existing `/admin/sorteos/[id]` page (FIN-REPORT-04)
- New `pnl-report.service.js` with weekly aggregation across DrawFinancial + ProviderWeeklySettlement + AccountingEntry
- New `pnl-report.controller.js` + routes
- New page `/admin/reportes/pnl-semanal` with filters, drill-downs, Excel + PDF exports (FIN-REPORT-05/06/07)
- One-shot retroactive `prizesProcessed` fix + Phase 11 backfill rerun (D-05)
- Shadow-comparison Jest test (D-06)
- 14-DEPLOY.md documenting the prod deploy sequence (including the 2-week gate)
- Updated `.env.example` documenting the flag

**OUT of scope (deferred):**
- Real-time P&L (this is week-bucketed, not live) → backlog
- Monthly / quarterly / yearly P&L views → backlog (week is the smallest natural unit; year can be derived by summing weeks)
- Budget vs actual (compare planned vs realized expense per category) → backlog (no budgets table)
- Multi-currency beyond BsF/USD → out of milestone v1.3
- Email/PDF the weekly P&L to admin every Monday → backlog
- Drill-down into individual TicketDetail rows (sales detail) → not needed; commission/accounting drill-down is sufficient
- Comparative views (this week vs last week) → backlog
- Public/provider-facing P&L → out of scope (admin only)

</scope_boundaries>

<deferred>

Ideas surfaced during discussion:
- "Auto-email the weekly P&L to admin every Monday" — backlog (would need a cron + smtp wiring).
- "Comparative view: this-week-vs-last-week deltas" — backlog (clean addition after the base view is in).
- "Forecasting future weeks from trends" — out of scope (no statistical model in this milestone).
- "Audit table viewer in the report itself" — Phase 13 has the entry-detail audit; cross-entity audit viewer is backlog.
- "Provider self-service P&L" — out of scope (admin-only milestone).

</deferred>

<assumptions_for_planner>

Things the planner can assume without re-asking:
1. **Decimal precision:** monetary values use `decimal.js` ROUND_HALF_UP; persistence types follow Phase 11/12 NUMERIC(18,8).
2. **Week boundary:** ISO week aligned with Phase 12 D-04 — Monday 00:00:00 VE inclusive to next Monday 00:00:00 VE exclusive. Reuse `getISOWeek` + `getISOWeekYear` helpers from `dateUtils.js`.
3. **Service shape:** `pnl-report.service.js` exports `getWeeklyPnl({ isoYear, isoWeek, apiSystemId? })` returning a single row object. The frontend can call multiple weeks in parallel if it wants a multi-row table — but v1 is one row per request, multi-week support comes via list endpoint (planner decides whether a `getWeeklyPnlRange` is needed for the default view).
4. **Excel/PDF builders:** thin wrappers around Phase 12's existing `commission.service.js` builders — reuse the `ExcelJS SUM-formula` pattern, reuse the PDFKit `drawTable` helper. No new export libraries.
5. **Auth gate:** new routes mounted under `/api/reportes/pnl` go behind the same admin auth middleware used in Phase 12-13.
6. **Drill-down URLs:** confirmed via D-03; do NOT introduce new query params on Phase 12/13 list pages — the existing `?week=YYYY-Www` query param works.
7. **Legacy path preservation:** the `useMaterialized: false` branch in service code must remain functionally identical to the current production behavior — the planner copies the current query body verbatim into the `false` branch (no refactoring). Tests pin this.
8. **D-05 ordering:** Phase 14 Plan 14-01 Task 1 is the prizesProcessed fix + backfill rerun. Plan 14-02 (refactor of services) depends on this being done — but the env flag is NOT prended until 14-01 verifies completion. Until then, services use legacy path only.
9. **Phase 13 dependency:** uses `ExchangeRate` table from Phase 13. If executing strictly linearly (Phase 12 → 13 → 14), this is satisfied. If `ExchangeRate` is empty, the USD column shows "—" gracefully (D-01 fallback).

</assumptions_for_planner>

<pitfall_mitigations>

Pre-locked from ROADMAP.md:
- **F-7** — historical USD eq never re-converted. Phase 14 reads `entry.exchangeRateId` joined relation; never multiplies `amountBsF` by today's rate. Existing FIN-LEDGER-03 contract from Phase 13 is reused. Test: a 6-month-old EXPENSE row with a 2025 rate must show its 2025 USD eq, NOT a recomputed-with-current-rate value.

Phase-specific new pitfall:
- **P-A: Flag-gated regression** — when `REPORT_USE_MATERIALIZED=false` (legacy path), behavior MUST be unchanged. Plan 14-02 includes a regression test that pins the legacy response shape and totals using a frozen fixture from before the refactor. CI fails if response shape changes.
- **P-B: P&L double-counting trap** — D-02 explicitly excludes PAYMENT to avoid double-counting commissions. The planner must add a unit test that creates a PAYMENT linked to a settlement and confirms the SUM doesn't double-deduct.
- **P-C: Empty-data graceful** — a week with zero draws, zero settlements, zero entries must render a zero P&L row, NOT a 500 error. Test the empty case explicitly.

</pitfall_mitigations>

<next_steps>

1. Run `/gsd-plan-phase 14` to generate detailed plans (4 plans expected).
2. After plans, the milestone v1.3 plan tree is complete and we batch-execute Phases 12 → 13 → 14 in order.

</next_steps>
