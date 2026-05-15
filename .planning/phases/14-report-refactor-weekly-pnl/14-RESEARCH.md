# Phase 14: Report Refactor + Weekly P&L — Research

**Researched:** 2026-05-15
**Domain:** Backend report aggregation refactor (DrawFinancial-backed) + new weekly P&L dashboard combining Phase 11/12/13 outputs
**Confidence:** HIGH (codebase + live DB inspected; documentation paths read end-to-end)

## Summary

Phase 14 has two distinct work streams that share the `REPORT_USE_MATERIALIZED` flag:

1. **Refactor existing report services** (`monitor.service.js#getDailyReport` and `accounting-report.service.js#getAccountingReport`) to branch on the flag. The materialized branch reads from `DrawFinancial` + `DrawFinancialProvider` (Phase 11), eliminating the v1.2 multi-draw attribution bug at line `monitor.service.js:497-508` and the mirror code at `accounting-report.service.js:100-107`. The legacy branch is a verbatim move of the current code so behavior under `flag=false` is guaranteed unchanged.
2. **Build a new weekly P&L dashboard** that joins `DrawFinancial` (revenue/prizes), `ProviderWeeklySettlement` (commissions, Phase 12), and `AccountingEntry` (expenses, Phase 13) into a single ISO-week row with USD equivalent.

**Primary recommendation:** Plan 14-01 must address an inventoried data-shape risk that D-05 does NOT cover (see *Pitfall P-D: Legacy NULL TicketDetail.drawId*). Without it, flipping `prizesProcessed=true` on the 5,804 historical draws and re-running the Phase 11 backfill produces `DrawFinancial.totalSales = 0` for ~5,704 draws and the shadow-comparison test (D-06) becomes a noisy false negative. **This is the single most important finding in this research and pre-empts the locked D-05 procedure.**

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `REPORT_USE_MATERIALIZED` flag read | API / Backend | — | Service-level branching; no client involvement |
| `getDailyReport` materialized branch | API / Backend | Database (DrawFinancial) | Replaces N-query aggregation with single DrawFinancial JOIN |
| `getAccountingReport` materialized branch | API / Backend | Database (DrawFinancial) | Same pattern as daily report |
| `getWeeklyPnl` aggregation | API / Backend | Database (3 tables) | Cross-phase aggregation; SQL-heavy |
| ExchangeRate lookup for USD column | API / Backend | — | Pure service helper; reuses Phase 13 row |
| P&L page UI | Frontend Server (Next.js SSR) | API | New `/admin/reportes/pnl-semanal` page |
| Draw financial card (FIN-REPORT-04) | Frontend (modal in browser) | API | Add to existing `DrawDetailModal.js` |
| Excel/PDF export | API / Backend | — | Server-side ExcelJS/PDFKit; mirrors Phase 12 |
| One-shot `prizesProcessed` UPDATE | Database (script) | — | Single SQL transaction, no app code path |
| `td.drawId` legacy backfill | Database (script) | — | New helper, see P-D below |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ExcelJS | ^4.4.0 | Excel export for P&L view | Already in `backend/package.json`; SUM-formula pattern in `accounting-report.service.js:248-261` |
| PDFKit | ^0.17.2 | PDF export for P&L view | Already installed; `drawTable` helper in `monitor.controller.js:141-157` |
| decimal.js | ^10.6.0 | Monetary math (ROUND_HALF_UP) | Phase 11/12 convention; `draw-financial.service.js` uses it |
| date-fns | ^4.1.0 | ISO week math (`getISOWeek`, `getISOWeekYear`) | Already installed; `dateUtils.js:6` already imports `format`/`parseISO`/`startOfDay`/`endOfDay` from it |
| date-fns-tz | ^3.2.0 | TZ-aware Monday boundary | Already installed |
| Prisma | (existing) | DB access via singleton `prisma` | Singleton at `backend/src/lib/prisma.js`; do NOT create a new instance |

**Installation:** `[VERIFIED: backend/package.json]` — nothing new needs installing. All required dependencies are already on disk.

**Version verification:**
```bash
cd backend && cat package.json | grep -E "exceljs|pdfkit|decimal|date-fns"
```
Returns `exceljs ^4.4.0, pdfkit ^0.17.2, decimal.js ^10.6.0, date-fns ^4.1.0, date-fns-tz ^3.2.0` — all current as of 2026-05-15.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Winston (`logger`) | (existing) | Service-layer logging | All service entry/exit lines per Phase 11 convention |
| Jest | ^29.7.0 | Shadow-comparison test (D-06) | Existing test pattern at `backend/src/__tests__/*.test.js` and `backend/src/queue/workers/__tests__/*.test.js` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma `groupBy` | `$queryRaw` | `groupBy` cannot reach `ticket.apiSystemId` across relations; Phase 11 already uses `$queryRaw` for the same shape (`draw-financial.service.js:85-94`). Reuse that pattern in `pnl-report.service.js`. |
| Compute USD on every render | Snapshot `usdAtMonday` on each P&L row | Snapshot would mean storing P&L per week; spec is "compute on render"; D-01 makes that cheap (one ExchangeRate lookup per week) |
| New ISO-week column on `DrawFinancial` | Compute on the fly via `getISOWeek(drawnAt)` | Adding a column is intrusive and bypasses Phase 11's frozen schema; query-time computation is acceptable for the row count (max 365 draws/week) |

## Architecture Patterns

### System Architecture Diagram

```
                  ┌─────────────────────────────────────────┐
                  │ /admin/reportes (existing)              │
                  │ /admin/reportes-contable (existing)     │
                  │ /admin/reportes/pnl-semanal (NEW)       │
                  └─────────────┬───────────────────────────┘
                                │
                                ▼
            ┌─────────────────────────────────────┐
            │ /api/monitor/reporte                │   shape UNCHANGED
            │ /api/monitor/reporte-contable       │   shape UNCHANGED
            │ /api/reportes/pnl-semanal (NEW)     │
            └────────────────┬────────────────────┘
                             │
                             ▼
                  ┌──────────────────────────┐
          ┌─ READ │ REPORT_USE_MATERIALIZED  │ FLAG
          │       │   env var                │
          │       └──────────────────────────┘
          │
   ┌──────┴──────┐
   │ flag=false  │                            ┌─── flag=true ──┐
   ▼             ▼                            ▼                ▼
  LEGACY path  LEGACY path                   MATERIALIZED      MATERIALIZED
  (verbatim    (verbatim                     branch reads      branch reads
  current)     current)                      DrawFinancial     DrawFinancial
  buggy on     buggy on                      (single source    + DrawFinancial
  multi-draw   multi-draw                    of truth)         Provider
  tickets      tickets

                                              │
                                              ▼
                                   ┌────────────────────────┐
                                   │ /api/reportes/pnl       │
                                   │ getWeeklyPnl(           │
                                   │   isoYear, isoWeek,     │
                                   │   apiSystemId?)         │
                                   └─────────┬──────────────┘
                                             │
                            ┌────────────────┼────────────────┐
                            ▼                ▼                ▼
                       DrawFinancial   ProviderWeekly    AccountingEntry
                       (Phase 11)      Settlement        (Phase 13)
                                       (Phase 12)
                                                    + ExchangeRate (D-01 helper)
```

### Component Responsibilities

| File | Responsibility | Status |
|------|---------------|--------|
| `backend/src/services/monitor.service.js` | `getDailyReport` — branch on flag, preserve legacy verbatim | MODIFY (add branch) |
| `backend/src/services/accounting-report.service.js` | `getAccountingReport` + Excel builder — branch on flag | MODIFY (add branch) |
| `backend/src/services/pnl-report.service.js` | `getWeeklyPnl({ isoYear, isoWeek, apiSystemId? })` + Excel/PDF builders | NEW |
| `backend/src/services/exchange-rate.service.js` | `getEffectiveRateForDate` (Phase 13) — extend if needed for D-01 | EXTEND or co-locate helper |
| `backend/src/controllers/pnl-report.controller.js` | thin REST: getWeeklyPnl, downloadPnlExcel, downloadPnlPdf | NEW |
| `backend/src/routes/pnl-report.routes.js` | `/api/reportes/pnl` mounted under admin auth | NEW |
| `backend/src/routes/monitor.routes.js` | unchanged | KEEP |
| `backend/src/lib/dateUtils.js` | ISO-week helpers (added by Phase 12); Phase 14 also adds `getMondayOfISOWeek(isoYear, isoWeek)` if not present | EXTEND |
| `backend/src/scripts/fix-prizes-processed.mjs` | one-shot D-05 task 1 — flip `prizesProcessed=true` | NEW (or inline in 14-01 task) |
| `backend/src/scripts/backfill-td-drawid.mjs` | NEW — fill `TicketDetail.drawId = ticket.drawId` WHERE NULL (see P-D) | NEW |
| `backend/src/scripts/backfill-draw-financials.mjs` | re-run as part of 14-01 task | REUSE (no change) |
| `frontend/app/admin/reportes/pnl-semanal/page.js` | new P&L dashboard page | NEW |
| `frontend/components/admin/DrawDetailModal.js` | add financial card section reading from `DrawFinancial` API | MODIFY |
| `frontend/app/admin/layout.js` | add sidebar item "P&L Semanal" under Reportes | MODIFY |
| `frontend/lib/api/monitor.js` | extend with `getDrawFinancial(drawId)` and `getWeeklyPnl` | EXTEND |

### Recommended Project Structure

```
backend/src/
├── services/
│   ├── monitor.service.js              # MODIFY: add useMaterialized branch
│   ├── accounting-report.service.js    # MODIFY: add useMaterialized branch
│   ├── pnl-report.service.js           # NEW: weekly P&L aggregation
│   └── exchange-rate.service.js        # Phase 13 — Phase 14 imports getEffectiveRateForDate
├── controllers/
│   └── pnl-report.controller.js        # NEW
├── routes/
│   └── pnl-report.routes.js            # NEW; mounted in index.js
└── scripts/
    ├── fix-prizes-processed.mjs        # NEW: one-shot D-05 step 1
    ├── backfill-td-drawid.mjs          # NEW: P-D prerequisite for backfill rerun
    └── backfill-draw-financials.mjs    # REUSE (Phase 11)

frontend/
├── app/admin/
│   ├── reportes/
│   │   ├── page.js                     # KEEP
│   │   └── pnl-semanal/page.js         # NEW
│   └── layout.js                       # MODIFY: sidebar entry
├── components/admin/
│   └── DrawDetailModal.js              # MODIFY: financial card section
└── lib/api/
    └── monitor.js                      # EXTEND with pnl helpers
```

### Pattern 1: Service-level Flag Branching (FIN-REPORT-01/03)

**What:** Each affected service function receives an explicit `useMaterialized` boolean (controller reads `process.env.REPORT_USE_MATERIALIZED === 'true'` and passes it in). The default is `false` until D-05 is verified.

**When to use:** Anywhere the legacy code currently lives in `monitor.service.js#getDailyReport` and `accounting-report.service.js#getAccountingReport`.

**Example:**
```javascript
// Source: extend monitor.service.js — pattern matches Phase 12 effective-config lookup signature
async getDailyReport({ date, dateFrom, dateTo, gameId, source, apiSystemId, useMaterialized = false } = {}) {
  if (useMaterialized) {
    return this._getDailyReportMaterialized({ dateFrom, dateTo, gameId, source, apiSystemId });
  }
  return this._getDailyReportLegacy({ date, dateFrom, dateTo, gameId, source, apiSystemId });
  // _getDailyReportLegacy is the CURRENT method body, moved verbatim
}
```

**Rationale:** The controller (not the service) decides the flag value, which is the standard Inversion of Control pattern. Tests can pass `useMaterialized: true|false` directly without setting env vars — this is what D-06 shadow-comparison needs.

### Pattern 2: Materialized Aggregation (replaces buggy Ticket.drawId join)

**Source:** `draw-financial.service.js:85-94` — adapt for daily/range queries.

```javascript
// Materialized daily/accounting report — single query, no per-ticket loop
const rows = await prisma.$queryRaw`
  SELECT d.id AS "drawId", d."drawDate", d."drawTime", d."gameId", g.name AS game,
         d.status, d."winnerItemId",
         df."totalSales", df."totalPrize", df.utility, df."ticketCount"
  FROM   "Draw" d
  JOIN   "Game" g  ON g.id = d."gameId"
  LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
  WHERE  d."drawDate" >= ${fromDate}::date
    AND  d."drawDate" <= ${toDate}::date
    ${gameId ? Prisma.sql`AND d."gameId" = ${gameId}` : Prisma.empty}
  ORDER  BY d."drawDate" ASC, d."drawTime" ASC
`;
```

For per-provider drill-down (when `apiSystemId` filter is active):
```javascript
// Join DrawFinancialProvider on the SAME draw set
SELECT df."drawId", dfp."apiSystemId", dfp."totalSales", dfp."totalPrize", dfp."ticketCount"
FROM "DrawFinancialProvider" dfp
JOIN "DrawFinancial" df ON df."drawId" = dfp."drawId"
WHERE dfp."apiSystemId" = ${apiSystemId} AND df."drawId" IN (...)
```

### Pattern 3: Weekly P&L Aggregation

```javascript
// pnl-report.service.js — getWeeklyPnl({ isoYear, isoWeek, apiSystemId? })

// Step 1: resolve ISO week bounds (Monday 00:00 VE inclusive → next Monday exclusive)
const mondayVE = getMondayOfISOWeek(isoYear, isoWeek); // Date in UTC representing Monday 00:00 Caracas
const nextMondayVE = addDays(mondayVE, 7);

// Step 2: drawIncome + drawPrizes from DrawFinancial (or DrawFinancialProvider when filtered)
// Use Draw.drawnAt for the week-window join (drawnAt is the canonical totalizedAt timestamp).
const drawAgg = await prisma.$queryRaw`
  SELECT COALESCE(SUM(df."totalSales"), 0)::numeric(18,2) AS "weekIncome",
         COALESCE(SUM(df."totalPrize"), 0)::numeric(18,2) AS "weekPrizes"
  FROM   "DrawFinancial" df
  JOIN   "Draw" d ON d.id = df."drawId"
  WHERE  d."drawnAt" >= ${mondayVE}
    AND  d."drawnAt" <  ${nextMondayVE}
    AND  df."totalizedAt" IS NOT NULL
`;

// Step 3: commissions from ProviderWeeklySettlement (Phase 12) — direct lookup by (isoYear, isoWeek)
const commissions = await prisma.providerWeeklySettlement.aggregate({
  where: { isoYear, isoWeek, ...(apiSystemId && { apiSystemId }) },
  _sum: { amount: true },
});

// Step 4: expenses from AccountingEntry (Phase 13) — by entryDate in the same window
//         D-02: type = EXPENSE only. Reversals net naturally via SUM.
const expenses = await prisma.accountingEntry.aggregate({
  where: { type: 'EXPENSE', entryDate: { gte: mondayVE, lt: nextMondayVE } },
  _sum: { amountBsF: true },
});

// Step 5: D-02 "Other Income" (separate row, not in formula)
const otherIncome = await prisma.accountingEntry.aggregate({
  where: { type: 'INCOME', entryDate: { gte: mondayVE, lt: nextMondayVE } },
  _sum: { amountBsF: true },
});

// Step 6: ExchangeRate for USD column — D-01 lookup
const rate = await prisma.$queryRaw`
  SELECT id, "rateBsPerUsd", "rateType", date
  FROM   "ExchangeRate"
  WHERE  date <= ${mondayVE}::date
  ORDER  BY date DESC, "createdAt" DESC
  LIMIT  1
`;
```

### Anti-Patterns to Avoid

- **DO NOT delete the legacy code path.** D-05 requires the legacy branch under `flag=false` to be *bit-identical* to the current behavior. Tests will pin it (P-A). Refactoring tempts come during the move — resist.
- **DO NOT compute weekIncome with `Ticket.drawId` join in the materialized branch.** That re-introduces the bug. Always go through `DrawFinancial`.
- **DO NOT trust `accounting-report.service.js`'s tripleta handling as a reference for the materialized branch.** The tripleta logic at lines `113-123` is a TICKET-level branch that does not exist in DrawFinancial because tripleta `prizeDrawId` attribution is upstream in the prize-processor that fed Phase 11. The materialized branch reads totals "as they were settled" — already correct.
- **DO NOT add a `paid` status to ProviderWeeklySettlement.** Phase 12 D-03 made CONFIRMED terminal; phase 13 D-03 made payment-paid implicit via SUM aggregation. Phase 14 must not introduce a fourth status.
- **DO NOT re-convert historical USD on display.** F-7 mandates `amountBsF / historicalRate` from `entry.exchangeRateId`. The P&L row may use Monday-of-week rate (D-01) for the WEEK TOTAL display, but per-entry drill-downs keep their snapshot.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO week math (year + week) | A custom Sunday/Monday `Math.floor` | `getISOWeek(date)` + `getISOWeekYear(date)` from `date-fns` (already imported in `dateUtils.js`) | Edge: 2026-12-29 belongs to ISO week 53 of 2026 OR week 1 of 2027 depending on day-of-week math; date-fns gets it right (Phase 12 F-15 already locked this). |
| Monday-of-week date computation | Day-of-week subtraction | `startOfISOWeek(date)` from `date-fns` (returns Monday 00:00 local) | Combine with `date-fns-tz#zonedTimeToUtc('America/Caracas')` for correct VE TZ math. |
| ExchangeRate "most recent as-of" lookup | New query per call site | Phase 13 should already ship `getEffectiveRateForDate(date)` — see assumption #3 in 13-CONTEXT. If the signature does NOT match Phase 14 D-01 ("most recent AS OF a date" — *not* "same date only"), Phase 14 EXTENDS the service with `getRateAsOfDate(date)` rather than inlining the query. | Phase 13's D-01 lookup is `date = entryDate` (same day only); Phase 14 D-01 is `date <= mondayOfWeek` (most recent prior). The semantics differ — write a new helper. |
| Excel SUM formula | Hand-summed numeric cells | `accounting-report.service.js:248-261` SUM-formula pattern | Auditable: opens the .xlsx and the totals row shows `=SUM(C5:C20)` not a literal number. Operator can verify cells. |
| PDF tabular layout | New PDFKit pagination logic | `monitor.controller.js:141-157` `drawTable` helper (copy verbatim into the P&L controller) | Already handles page break at `y > 720`, headers, columns. |
| Multer/MIME/file upload | (not applicable in Phase 14) | — | No file upload in Phase 14. |

**Key insight:** The Phase 11 backfill script is REUSED. Don't write a new backfill. The Phase 12 Excel pattern is REUSED. Don't write a new Excel builder library. Phase 14 is composition over construction.

## Runtime State Inventory

> Phase 14 is partial-refactor + new feature, not a rename. Runtime state inventory is mostly minimal but the `prizesProcessed` retroactive UPDATE has knock-on effects that must be inventoried.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 1) `Draw.prizesProcessed` boolean on 5,804 rows being flipped from `false` → `true`. 2) `DrawFinancial` table: re-running backfill will UPSERT over the existing 133 rows (idempotent — `draw-financial.service.js:97-101`). 3) `DrawFinancialProvider`: same upsert pattern (`findFirst + update/create`). | Data migration script (one-shot) + idempotent upsert via existing backfill script. |
| Live service config | None — Phase 14 does not modify pm2, n8n, cron Linux, or Datadog. The phase explicitly excludes deploy work. `/etc/cron.d/tote-triggers` is NOT touched (no new cron job). | None. |
| OS-registered state | None — no Windows Task Scheduler, no launchd, no systemd units involved. | None. |
| Secrets / env vars | NEW env var `REPORT_USE_MATERIALIZED` added to `.env.example`. Default is unset (= falsy = legacy path). Production deploy will flip it later (out of session scope). | Add to `.env.example`; document in 14-DEPLOY.md. |
| Build artifacts / installed packages | Prisma client must be regenerated after Phase 12+13 migrations land (Phase 11 found this issue — see `.planning/phases/11-drawfinancial-foundation/11-04-SUMMARY.md` "Bug surfaced"). Phase 14 should NOT re-migrate but MUST `npm run db:generate` if Phase 12/13 just landed in the same session. | Include `prisma generate` as a sanity step in 14-01 before invoking the backfill. |

**Verified empty categories:** None — every category has at least one item documented.

## Common Pitfalls

### Pitfall P-A: Flag-gated regression on legacy path
**What goes wrong:** While moving the current code into a `_getDailyReportLegacy` method, an "innocent improvement" (e.g., adding a missing field, normalizing a date format) silently changes the legacy response shape. Production rolls back to `flag=false` after Phase 14 ships, hits the modified legacy code, and totals drift.
**Why it happens:** Refactoring is harder than copy-paste; reviewers don't notice subtle JS diffs.
**How to avoid:** Plan 14-02 commits a SNAPSHOT fixture of the current response (capture once before the refactor begins, save to `__tests__/fixtures/legacy-report-snapshot.json`) and writes a Jest test that calls the legacy branch with that input and compares output byte-for-byte. Snapshot test fails on ANY diff.
**Warning signs:** A field name changed casing, a number got rounded, an array got reordered. Always-suspicious: `JSON.stringify(result)` differs.

### Pitfall P-B: P&L double-counting via PAYMENT entries
**What goes wrong:** PAYMENT entries in `AccountingEntry` represent cash outflows for settlement payments — but the settlement commission amount itself is ALREADY counted in `weekCommissions = SUM(ProviderWeeklySettlement.amount)`. If the P&L bucket sums all non-INCOME entries (PAYMENT + EXPENSE), commissions are counted twice.
**Why it happens:** "Money going out" feels like the same bucket conceptually. SQL is too permissive.
**How to avoid:** D-02 mandates `WHERE type = 'EXPENSE'` — explicit filter, never `type != 'INCOME'`. Plan 14-02 unit test creates a PAYMENT linked to a CONFIRMED settlement, runs `getWeeklyPnl`, and asserts the PAYMENT amount appears NOWHERE in `weekExpenses`.

### Pitfall P-C: Empty-data 500 error
**What goes wrong:** A week with zero draws + zero settlements + zero entries throws `Cannot read property 'totalSales' of undefined` because `prisma.$queryRaw` aggregation returns `[]` not `[{ weekIncome: 0 }]`, and `agg[0].weekIncome` is read directly.
**Why it happens:** Postgres returns no rows for aggregates ONLY when the WHERE clause matches zero rows; `SUM` over zero rows returns `NULL` per row, not zero, unless wrapped with `COALESCE`.
**How to avoid:** EVERY SQL aggregate in `pnl-report.service.js` uses `COALESCE(SUM(...), 0)::numeric(18,2)`. Plan 14-02 unit test runs `getWeeklyPnl({ isoYear: 2099, isoWeek: 1 })` and expects a clean zero row.

### Pitfall P-D: **Legacy NULL TicketDetail.drawId blocks D-05 re-backfill** *(critical, not in CONTEXT.md)*

**What goes wrong:** D-05's three-step procedure (flip `prizesProcessed=true` on 5,804 historical draws → re-run Phase 11 backfill → verify counts match) produces `DrawFinancial.totalSales = 0` for nearly all 5,704 of those historical draws. The shadow-comparison test (D-06) then shows materialized-vs-legacy diffs of 100% — not the 0% expected — for every historical day.

**Why it happens (VERIFIED against local prod-mirror DB):**

```
SELECT COUNT(*) FILTER (WHERE "drawId" IS NULL),
       COUNT(*) FILTER (WHERE "drawId" IS NOT NULL),
       COUNT(*) FROM "TicketDetail";
```
Returns:
| null_count | set_count | total |
|------------|-----------|-------|
| 621,689 | 37,820 | 659,509 |

That is, 94% of TicketDetail rows have `drawId IS NULL`. These are legacy single-draw tickets created BEFORE the Phase 8 multi-draw webhook adapter added per-detail drawId. For these tickets, the implicit draw association is `ticket.drawId` (one draw per ticket).

`draw-financial.service.js:67-92` aggregates `WHERE td."drawId" = ${drawId}` — there is no `COALESCE(td."drawId", t."drawId")`. Empirical test on 5 random historical draws:

| draw | tickets_via_ticket_drawid | sales_via_ticket_totalAmount | sales_via_td_drawid (PHASE 11 PATH) | sales_via_COALESCE |
|------|---------------------------|------------------------------|-------------------------------------|---------------------|
| 001b622b... | 51 | 3080.00 | **0** | 3080.00 |
| 0033cc35... | 7 | 850.00 | **0** | 850.00 |
| 00112b20... | 7 | 310.00 | **0** | 310.00 |
| 000dfe84... | 85 | 5770.00 | **0** | 5770.00 |
| 00271577... | 66 | 4770.00 | **0** | 4770.00 |

The Phase 11 backfill produced 133 correct rows BECAUSE those 133 draws happened to be from the last 3 days, when `TicketDetail.drawId` was being written by the new pipeline. The historical 5,704 are all in the NULL-drawId regime.

**How to avoid:** Plan 14-01 MUST add a NEW pre-backfill step:

```sql
-- backfill-td-drawid.mjs — fill TicketDetail.drawId from Ticket.drawId where NULL
UPDATE "TicketDetail" td
SET    "drawId" = t."drawId"
FROM   "Ticket" t
WHERE  td."ticketId" = t.id
  AND  td."drawId" IS NULL;
```

This is safe because:
1. For single-draw tickets (94% of population), `ticket.drawId` is the ONE draw the detail belongs to — no ambiguity.
2. Multi-draw tickets (1,752 instances per `SELECT COUNT(DISTINCT ...) HAVING > 1`) ALREADY have `td.drawId` set per-detail (Phase 8 adapter writes it explicitly). The UPDATE WHERE clause skips them.
3. The Phase 11 service then aggregates correctly via the same `td.drawId` keyed query — no service change needed.

**Order of operations for Plan 14-01:**
1. `prisma generate` (defensive — Phase 11 issue).
2. **NEW STEP (P-D mitigation):** `node src/scripts/backfill-td-drawid.mjs --confirm` — fills `TicketDetail.drawId`. Capture before/after row counts.
3. `UPDATE "Draw" SET "prizesProcessed"=true WHERE ...` (D-05 task 1).
4. `node src/scripts/backfill-draw-financials.mjs --confirm --chunk-size=200` (D-05 task 2).
5. Sanity COUNT check (D-05 task 3).
6. Reconciliation CSV inspection (D-05 task 4).

**Warning signs to look for:** After step 4, if `SELECT MIN(totalSales) FROM "DrawFinancial" WHERE totalSales > 0` shows 0 for the historical range, P-D has not been mitigated. Also: any `DrawFinancial` row with `ticketCount > 0 AND totalSales = 0` is a P-D footprint.

### Pitfall P-E: Excessive ExchangeRate fetches in a multi-week table
**What goes wrong:** If the P&L page renders a multi-week table (e.g., 12 weeks), the naive implementation issues 12 separate ExchangeRate queries.
**How to avoid:** Plan 14-03 (frontend) makes ONE backend call with `dateFrom`/`dateTo` and the backend batch-fetches rates upfront, mapping by Monday key. Spec v1 is one-row-per-request, so this is only relevant if a `getWeeklyPnlRange` is added — call it out for the planner.

### Pitfall P-F: Re-running backfill on existing DrawFinancial rows
**What goes wrong:** Anxiety that re-running `backfill-draw-financials.mjs --confirm` after the 133-row earlier run will duplicate rows or violate uniqueness.
**How to avoid:** Confirmed safe by reading `draw-financial.service.js:97-101` and `:104-123` — both use `prisma.upsert` (single-column unique) and explicit `findFirst → update/create` (for the NULL-allowing composite). Idempotent by design (Phase 11 D-08).

## Code Examples

Verified patterns from official sources / existing code:

### Branch on flag inside service (Phase 14 refactor)
```javascript
// Source: extend monitor.service.js#getDailyReport (this file lines 443-612)
async getDailyReport({ ..., useMaterialized = false } = {}) {
  if (useMaterialized) {
    return this._getDailyReportMaterialized({ /* same params */ });
  }
  return this._getDailyReportLegacy({ /* same params */ });
}
```

### Materialized daily report inner method
```javascript
// Source: pattern adapted from draw-financial.service.js:85-94 (verified)
async _getDailyReportMaterialized({ dateFrom, dateTo, gameId, source, apiSystemId }) {
  // Resolve push vs pull provider, same as legacy (the resolution itself can stay shared)
  let pushProviderFilter = false;
  if (apiSystemId) { /* same as line 463-485 of current method */ }

  // Query DrawFinancial joined with Draw — single query
  const rows = await prisma.$queryRaw`
    SELECT d.id AS "drawId", d."drawDate", d."drawTime", d."gameId",
           g.name AS game, d.status, d."winnerItemId",
           COALESCE(df."totalSales", 0)::numeric(12,2) AS "totalSales",
           COALESCE(df."totalPrize", 0)::numeric(12,2) AS "totalPrize",
           (COALESCE(df."totalSales", 0) - COALESCE(df."totalPrize", 0))::numeric(12,2) AS balance,
           COALESCE(df."ticketCount", 0)::int AS "ticketCount"
    FROM   "Draw" d
    JOIN   "Game" g ON g.id = d."gameId"
    LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
    WHERE  d."drawDate" >= ${new Date(dateFrom + 'T00:00:00.000Z')}
      AND  d."drawDate" <= ${new Date(dateTo + 'T00:00:00.000Z')}
      ${gameId ? Prisma.sql`AND d."gameId" = ${gameId}` : Prisma.empty}
    ORDER  BY d."drawDate" ASC, d."drawTime" ASC
  `;

  // ... apply per-provider filter via DrawFinancialProvider, then compose response shape
  // (totals, byGame, bySource) — RESPONSE SHAPE UNCHANGED from legacy.
}
```

### ExchangeRate lookup helper for D-01 (Phase 14)
```javascript
// Source: new helper, signature derived from Phase 13 D-01 ("createdAt DESC" same-date pattern)
// Goes either in exchange-rate.service.js (Phase 13) or pnl-report.service.js — recommendation: extend Phase 13's service.
export async function getRateAsOfDate(targetDate) {
  const rate = await prisma.$queryRaw`
    SELECT id, "rateBsPerUsd", "rateType", date, "createdAt"
    FROM   "ExchangeRate"
    WHERE  date <= ${targetDate}::date
    ORDER  BY date DESC, "createdAt" DESC
    LIMIT  1
  `;
  return rate[0] ?? null; // null when no rate exists — D-01 fallback ("—" in UI)
}
```

### Shadow-comparison Jest test (D-06)
```javascript
// Source: new __tests__/pnl-shadow-comparison.test.js
// Pattern: matches backend/src/queue/workers/__tests__/draw-financial-pipeline.integration.test.js
// Real DB required (uses Phase 11 integration test helpers).
describe('D-06 shadow comparison — getDailyReport materialized vs legacy', () => {
  test('single-provider day: totals match within 0.01 BsF', async () => {
    const date = '2026-05-15'; // a day with single-provider draws
    const materialized = await monitorService.getDailyReport({ dateFrom: date, dateTo: date, useMaterialized: true });
    const legacy       = await monitorService.getDailyReport({ dateFrom: date, dateTo: date, useMaterialized: false });
    expect(materialized.totals.totalSales).toBeCloseTo(legacy.totals.totalSales, 2);
    expect(materialized.totals.totalPrize).toBeCloseTo(legacy.totals.totalPrize, 2);
  });

  test('multi-draw webhook day: materialized correctly splits, legacy overcounts originating draw', async () => {
    // SEED a Virtuales-style ticket with details spanning 2 draws (drawSlotId 12 + 18 → different draws)
    const ticket = await prisma.ticket.create({
      data: {
        drawId: drawA.id,     // originating draw (legacy attributes all here)
        source: 'WEBHOOK_PUSH',
        apiSystemId: virtualesSystem.id,
        totalAmount: 200,
        details: { create: [
          { gameItemId: itemX.id, amount: 100, multiplier: 50, drawId: drawA.id },
          { gameItemId: itemY.id, amount: 100, multiplier: 50, drawId: drawB.id },  // different draw
        ]},
      },
    });
    await computeAndUpsertSales(drawA.id, drawA.closedAt);
    await computeAndUpsertSales(drawB.id, drawB.closedAt);

    const materialized = await monitorService.getDailyReport({ dateFrom: dateStr, dateTo: dateStr, useMaterialized: true });
    const legacy       = await monitorService.getDailyReport({ dateFrom: dateStr, dateTo: dateStr, useMaterialized: false });

    // Materialized: drawA = 100, drawB = 100 (correct)
    // Legacy:       drawA = 200, drawB = 0   (BUG — full ticket attributed to originating draw)
    const matA = materialized.draws.find(d => d.drawId === drawA.id);
    const legA = legacy.draws.find(d => d.drawId === drawA.id);
    expect(matA.totalSales).toBe(100);
    expect(legA.totalSales).toBe(200);  // demonstrates bug is still present in legacy
  });
});
```

### Per-draw financial card on DrawDetailModal (FIN-REPORT-04)
```javascript
// Source: extension to DrawDetailModal.js — add a section reading from a new GET /api/monitor/draw/:drawId/financial endpoint
// (Or extend the existing draws.getById response — recommendation: extend, lower friction)

// In drawData useEffect:
const financial = drawData?.financial; // DrawFinancial join + DrawFinancialProvider[]
if (financial) {
  // Render summary card: Ventas / Premios / Utilidad / Tickets
  // Below: per-provider breakdown table reading drawFinancialProviders[]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Aggregating tickets at query time via `prisma.draw.findMany({ include: { tickets } })` | Reading materialized `DrawFinancial` rows | Phase 11 (2026-05-15) | Eliminates the multi-draw attribution bug at the source; reports become near-instant single-table reads |
| `Ticket.drawId` as the de-facto attribution key | `TicketDetail.drawId` (per-detail) is canonical | Phase 8 (2026-04+) adapter; Phase 11 service codified it | Multi-play webhook tickets correctly span draws |
| Manually wiring weekly snapshots in Croner | pg-boss worker + cron Linux trigger | 2026-05-12 (Phase 12 builds on this) | Phase 14 does NOT add jobs — reads only |
| Per-page-load Excel building with manual SUM | ExcelJS SUM-formula pattern | Phase 6/7 (Reports Dashboard) | Excel exports remain auditable in the spreadsheet itself |

**Deprecated / outdated:**
- The `draws` table query-time aggregation in `monitor.service.js#getDailyReport` (lines 497-508) — replaced by materialized branch but retained verbatim for rollback. The bug at line 497-508 is the v1.2 attribution issue: `include: { tickets }` joins on `Ticket.drawId`, missing per-detail attribution.
- `accounting-report.service.js:100-107` — same bug, mirror code.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 12 will ship `getISOWeek` + `getISOWeekYear` in `dateUtils.js` per Phase 12 D-04/F-15. `[ASSUMED]` — verified not yet present (`grep` returned nothing); locked by Phase 12 plan but not executed at research time. | Standard Stack | Phase 14 cannot compute week boundaries → Plan 14-02 must add them itself if Phase 12 hasn't landed yet. Fallback: copy from `date-fns` directly (`getISOWeek`/`getISOWeekYear` are stdlib in date-fns 4). |
| A2 | Phase 13 will ship `exchange-rate.service.js` with at least `getEffectiveRateForDate(date)` (Phase 13 D-01: same-date `createdAt DESC LIMIT 1`). `[ASSUMED]` — Phase 13 not yet executed. | Don't Hand-Roll | Phase 14 must implement `getRateAsOfDate` (different semantics) regardless. If Phase 13 helper doesn't exist, Phase 14 adds BOTH helpers in `exchange-rate.service.js`. |
| A3 | `ProviderWeeklySettlement` will have columns `isoYear INT, isoWeek INT, apiSystemId String, amount Decimal(18,8)` per Phase 12 D-06 and Phase 12-01 plan. `[ASSUMED]` — Phase 12 schema not yet migrated; schema confirmed absent from `prisma/schema.prisma`. | Pattern 3 | If the column names differ (e.g., `weekYear` vs `isoYear`), Plan 14-02 must adapt the query. Low risk — locked by Phase 12 D-06. |
| A4 | `AccountingEntry` will have columns `entryDate DateTime, type AccountingEntryType (INCOME/EXPENSE/PAYMENT), amountBsF Decimal(18,8), categoryId, exchangeRateId String?` per Phase 13 schema. `[ASSUMED]` — Phase 13 not yet migrated. | Pattern 3 | Aggregation query needs the column names to be exact. Phase 13 D-01 + FIN-LEDGER-01 lock these. |
| A5 | Re-running the Phase 11 backfill against ~5937 draws does NOT collide with the active pipeline (none is running in this local-only session). `[VERIFIED: planning/CONTEXT — Phase 14 is LOCAL ONLY]` | Pitfalls | None — verified. |
| A6 | The "DrawFinancial row count must equal DRAWN draw count after Phase 14-01" sanity check (D-05 task 3) will succeed AFTER P-D mitigation. `[ASSUMED — based on the empirical SQL diagnosis above]` | P-D mitigation | If the UPDATE skips a draw with a fresh-but-still-NULL detail row (extreme edge), recon CSV will surface it. Low risk. |
| A7 | `Draw.drawnAt` is the canonical timestamp for week-windowing P&L aggregation (not `closedAt` or `drawDate`). `[ASSUMED — Phase 11 D-05 set DrawFinancial.totalizedAt = Draw.drawnAt]` | Pattern 3 | If `drawnAt` is NULL for some draws (cancelled→drawn races), they leak across week boundaries. Defensive query should `WHERE d.drawnAt IS NOT NULL`. |
| A8 | The P&L UI uses `apiSystemId` (UUID) for the provider filter dropdown, populating from `GET /providers/systems` (already implemented per `reportes/page.js:58`). `[VERIFIED: code inspection]` | UI placement | None — verified. |

**If this table is non-empty:** A1–A4 are the "Phase 12+13 land first" assumptions. They will become VERIFIED once those phases ship. A8 is verified.

## Open Questions

1. **Should `getWeeklyPnl` support a date range (multiple weeks) or stay single-week per request?**
   - What we know: 14-CONTEXT assumption #3 says "v1 is one row per request, multi-week support comes via list endpoint — planner decides whether a `getWeeklyPnlRange` is needed for the default view".
   - What's unclear: D-03 says the dashboard has a "main table: one row per week" — does the default view show a SINGLE week or the LAST N weeks?
   - Recommendation: ship v1 with a single ISO week per request. UI defaults to current week. Add `getWeeklyPnlRange({ fromIsoWeek, toIsoWeek })` only if the UI explicitly needs multi-row default — planner can decide this in 14-04 (frontend plan) without re-research.

2. **Where does the per-draw financial card live — modal or new `[id]` route?**
   - What we know: `frontend/app/admin/sorteos/` has NO `[id]/page.js`, only `page.js` (list). Detail is shown via `DrawDetailModal` (component) opened from the list page. CONTEXT.md says "existing draw detail page" but no dedicated page exists.
   - What's unclear: Plan can either (a) add card to `DrawDetailModal.js` (low friction, matches current UX) or (b) build a new `/admin/sorteos/[id]/page.js` (more work, deeper integration).
   - Recommendation: option (a) — extend `DrawDetailModal.js` (lines 1-886). Add a "Financiero" section reading from a new endpoint or extended `drawsAPI.getById` response that includes `draw.financial` + `draw.financialProviders`. Aligns with FIN-REPORT-04 "on the existing draw detail page".

3. **Should we use a NEW endpoint `GET /api/monitor/draw/:drawId/financial` or extend `drawsAPI.getById` response?**
   - What we know: `drawsAPI.getById` is called from `DrawDetailModal:45` already and returns rich draw data.
   - Recommendation: extend the existing endpoint's response (no new route surface). The financial fields are cheap to join via `include: { financial: true, financialProviders: { include: { apiSystem: true } } }`. This is consistent with the relation already declared at `schema.prisma:156-157`.

4. **Does the legacy code path also need the apiSystemId provider resolution helper extracted, or stay inline?**
   - Recommendation: extract `resolveApiSystemFilter(apiSystemId)` into a shared helper in `monitor.service.js` because BOTH the legacy and materialized branches need identical PULL-vs-PUSH/SCRAPE resolution. Reduces duplication.

## Environment Availability

> Phase 14 has no external dependencies beyond what Phase 11/12/13 already use.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | DrawFinancial reads, P&L aggregation | ✓ | 16 (local Docker `tote_postgres`) | — |
| Node.js | Backend services + scripts | ✓ | 25 (per assumptions in Phase 13) | — |
| Prisma client | All DB access | ✓ | (existing) | — |
| ExcelJS | P&L Excel export | ✓ | ^4.4.0 | — |
| PDFKit | P&L PDF export | ✓ | ^0.17.2 | — |
| decimal.js | Monetary math | ✓ | ^10.6.0 | — |
| date-fns + date-fns-tz | ISO week + TZ math | ✓ | ^4.1.0 / ^3.2.0 | — |
| Jest | Shadow-comparison test | ✓ | ^29.7.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest ^29.7.0 (ES Modules via `NODE_OPTIONS='--experimental-vm-modules'`) |
| Config file | `backend/jest.config.*` (testEnvironment: node, testMatch: `**/__tests__/**/*.test.js`) |
| Quick run command | `cd backend && npm test -- --testPathPattern=pnl` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FIN-REPORT-01 | `getDailyReport({useMaterialized:true})` reads from DrawFinancial | integration | `npm test -- --testPathPattern=daily-report-materialized` | ❌ Wave 0 |
| FIN-REPORT-02 | Multi-draw webhook ticket: materialized correct, legacy buggy | integration | `npm test -- --testPathPattern=pnl-shadow-comparison` | ❌ Wave 0 |
| FIN-REPORT-03 | Legacy branch response shape unchanged (snapshot) | unit | `npm test -- --testPathPattern=daily-report-legacy-snapshot` | ❌ Wave 0 |
| FIN-REPORT-04 | Draw detail returns financial + financialProviders | integration | `npm test -- --testPathPattern=draws-getById-financial` | ❌ Wave 0 |
| FIN-REPORT-05 | `getWeeklyPnl` formula: income − prizes − commissions − expenses | unit | `npm test -- --testPathPattern=pnl-report-service` | ❌ Wave 0 |
| FIN-REPORT-06 | Drill-down URLs include `week=YYYY-Www` query param | unit (frontend) | manual UI smoke + Jest snapshot of constructed URLs | ❌ Wave 0 |
| FIN-REPORT-07 | Excel export contains SUM formula, PDF renders table | unit | `npm test -- --testPathPattern=pnl-excel-pdf` | ❌ Wave 0 |
| P-A | Legacy response is byte-identical to pre-refactor snapshot | snapshot | `npm test -- --testPathPattern=daily-report-legacy-snapshot` | ❌ Wave 0 |
| P-B | PAYMENT entries not double-counted in expenses | unit | `npm test -- --testPathPattern=pnl-double-count-guard` | ❌ Wave 0 |
| P-C | Empty week returns zero row, not 500 | unit | `npm test -- --testPathPattern=pnl-empty-data` | ❌ Wave 0 |
| P-D | After `backfill-td-drawid` + `backfill-draw-financials`, all 5,937 DrawFinancial rows have totalSales > 0 (where tickets exist) | data-recon | `node src/scripts/backfill-draw-financials.mjs --confirm` then inspect recon CSV | uses existing script |

### Sampling Rate

- **Per task commit:** `cd backend && npm test -- --testPathPattern=<just-added>` (quick targeted)
- **Per wave merge:** `cd backend && npm test` (full backend suite, including new P&L tests)
- **Phase gate:** Full suite green; recon CSV from Plan 14-01 shows zero mismatches across all 5,937 draws

### Wave 0 Gaps

- [ ] `backend/src/__tests__/pnl-report-service.test.js` — unit tests for `getWeeklyPnl` (covers FIN-REPORT-05, P-B, P-C)
- [ ] `backend/src/__tests__/pnl-shadow-comparison.test.js` — D-06 shadow test (covers FIN-REPORT-02)
- [ ] `backend/src/__tests__/daily-report-materialized.test.js` — materialized branch correctness (FIN-REPORT-01)
- [ ] `backend/src/__tests__/daily-report-legacy-snapshot.test.js` — pinned legacy fixture (P-A, FIN-REPORT-03)
- [ ] `backend/src/__tests__/fixtures/legacy-report-snapshot.json` — captured BEFORE refactor begins
- [ ] `backend/src/__tests__/pnl-excel-pdf.test.js` — buffer smoke tests for FIN-REPORT-07
- [ ] `backend/src/scripts/backfill-td-drawid.mjs` — P-D mitigation script (NEW)
- [ ] `backend/src/scripts/fix-prizes-processed.mjs` — D-05 task 1 (NEW)
- [ ] Framework install: none — Jest already installed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `authenticate` middleware on all new routes (`pnl-report.routes.js`) |
| V3 Session Management | yes | Existing JWT pattern reused |
| V4 Access Control | yes | `authorize('ADMIN')` — P&L is admin-only (consistent with reportes routes at `monitor.routes.js:13`) |
| V5 Input Validation | yes | Reject non-integer `isoYear`/`isoWeek`; reject `isoWeek` outside 1-53; reject UUID-not-UUID `apiSystemId` |
| V6 Cryptography | no | No cryptographic operations in P&L domain |

### Known Threat Patterns for {Node.js + Express + Prisma + Next.js admin}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `$queryRaw` | Tampering | Prisma `${...}` interpolation IS parameterized; use `Prisma.sql` for dynamic fragments. Existing pattern at `draw-financial.service.js:85-94`. |
| BOLA (broken object-level auth) on draw financial card | Authorization | Already gated: `monitor.routes.js:13` requires ADMIN/OPERATOR. Draw financial reuses the same gate. |
| Info disclosure via verbose error in P&L response | Disclosure | Wrap controller in try/catch and return generic 500 (pattern at `monitor.controller.js:79-83`). Log full stack via Winston. |
| CSRF on POST endpoints | Tampering | No POSTs in Phase 14 — read-only domain. N/A. |
| Excel formula injection (CSV/XLSX) | Tampering | Values passed to ExcelJS go through `cell.value = ` which does NOT execute. Existing pattern at `accounting-report.service.js:230-244`. SUM formulas use explicit `{ formula: ... }` shape. |

## Sources

### Primary (HIGH confidence)
- `backend/src/services/draw-financial.service.js` — full file inspected; service shape, decimal handling, NULL-aware upsert, prizesProcessed guard
- `backend/src/services/monitor.service.js` — full file inspected; identified `Ticket.drawId` join at lines 497-508 as the v1.2 multi-draw bug location
- `backend/src/services/accounting-report.service.js` — full file inspected; identified same bug at line 100-107; SUM-formula Excel pattern at 248-261
- `backend/src/controllers/monitor.controller.js` — full file inspected; identified PDFKit `drawTable` helper at 141-157 for P&L PDF reuse
- `backend/src/routes/monitor.routes.js` — full file inspected; admin auth pattern locked
- `backend/src/scripts/backfill-draw-financials.mjs` — full file inspected; confirmed idempotent upsert path safe to re-run
- `backend/src/lib/dateUtils.js` — confirmed `getISOWeek` / `getISOWeekYear` are NOT yet present (must come from Phase 12 or be added in Phase 14)
- `backend/prisma/schema.prisma` lines 1149-1196 — DrawFinancial + DrawFinancialProvider models verified
- `frontend/components/admin/DrawDetailModal.js` — full file structure inspected (886 lines); FIN-REPORT-04 placement decision
- `frontend/app/admin/layout.js` — sidebar navigation pattern verified
- `frontend/app/admin/reportes/page.js` + `frontend/app/admin/reportes-contable/page.js` — filter-bar + Excel-download patterns verified
- `backend/package.json` — verified versions of ExcelJS / PDFKit / decimal.js / date-fns / date-fns-tz / Jest
- Local prod-mirror PostgreSQL via Docker — empirical SQL queries that uncovered P-D
- `.planning/phases/14-report-refactor-weekly-pnl/14-CONTEXT.md` — locked decisions D-01..D-06
- `.planning/REQUIREMENTS.md` — FIN-REPORT-01..07
- `.planning/phases/11-drawfinancial-foundation/11-04-SUMMARY.md` — Finding B (sparse prizesProcessed)
- `.planning/phases/12-provider-commission-engine/12-CONTEXT.md` — ProviderWeeklySettlement schema expectations
- `.planning/phases/13-exchange-rate-accounting-ledger/13-CONTEXT.md` — ExchangeRate + AccountingEntry expectations

### Secondary (MEDIUM confidence)
- `backend/src/webhooks/adapters/virtuales.adapter.draft.js` — confirmed multi-draw `details: [{ drawId }]` output contract (basis for D-06 fixture)
- `backend/src/queue/workers/calculate-draw-financials.worker.js` — confirmed worker reads `prizesProcessed` only on its own invocation (no spontaneous reaction to UPDATE)
- `backend/src/queue/workers/step-process-prizes.worker.js` — confirmed flipping `prizesProcessed=true` does not re-trigger prize processing (worker pre-checks the flag and skips)

### Tertiary (LOW confidence)
- Phase 12/13 final schema details (Decimal precision, exact column names) — not yet executed; planner must verify when those phases land

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified in `backend/package.json`; no new installs needed
- Architecture: HIGH — current service shapes read end-to-end; refactor targets identified at specific line numbers
- Pitfalls: HIGH — P-D verified empirically against local prod-mirror; P-A/B/C derived from D-02/D-05 + Phase 11/12 prior art
- Phase 12/13 schema assumptions: MEDIUM — assumed-but-not-executed; locked by CONTEXT.md decisions

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days — codebase stable; schema changes for Phase 12/13 may invalidate column-name assumptions when those phases execute)
