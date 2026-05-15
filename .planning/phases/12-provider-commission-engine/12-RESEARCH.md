# Phase 12: Provider Commission Engine - Research

**Researched:** 2026-05-15
**Domain:** Backend financial pipeline (pg-boss workers + Prisma schema) + Admin UI (Next.js)
**Confidence:** HIGH (most claims VERIFIED against codebase; a few CITED-from-docs items flagged)

## Summary

Phase 12 replaces the no-op `calculate-provider-commission` placeholder (registered in Phase 11 / D-15) with a real worker that reads `DrawFinancialProvider` rows materialized by Phase 11 and writes per-(provider × draw) `ProviderCommissionLedger` rows. A second worker, `weekly-settlement-snapshot`, runs every Monday at 06:00 VE (cron Linux → `trigger-pgboss-cron.mjs` allowlist → pg-boss) and aggregates the ledger into `ProviderWeeklySettlement` rows keyed by `(apiSystemId, isoYear, isoWeek)`. Four formula types (`SALES_PCT`, `UTILITY_PCT`, `SALES_AND_UTILITY_PCT`, `TIERED`) resolve against an append-only `ProviderCommissionConfig` row whose `effectiveFrom <= draw.drawnAt`. TIERED brackets evaluate against weekly cumulative sales (Monday 00:00 VE reset). A standalone CLI script backfills from 2026-04-17 onward.

The whole feature plugs into existing established patterns: service-function workers (Phase 11), `findFirst + update/create` for nullable-FK upserts (D-08), `boss.createQueue()` before `boss.work()` (F-11), Excel via ExcelJS, PDF via PDFKit, admin auth via `authenticate + authorize('ADMIN')`. No new framework choices needed.

**Primary recommendation:** Build commission engine as **one service file** (`commission.service.js`) + **two pg-boss workers** + **one CLI backfill script** + **one Express router** (`/api/commissions`) + **two frontend pages** (existing `/admin/proveedores/[id]` extension tab + new `/admin/comisiones`). Trigger from `step-process-prizes.worker.js` as a **third** parallel `boss.send` next to the existing `STEP_CALCULATE_STATS` + `CALCULATE_DRAW_FINANCIALS` sends — NOT chained off `calculate-draw-financials.worker.js` completion (see Architecture Patterns §"Trigger chaining").

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Commission config CRUD (versioned, append-only) | API / Backend | DB (constraint enforcement) | Audit-grade — server is the only writer; UI is a thin form |
| Per-draw commission calculation | API / Backend (pg-boss worker) | DB (DrawFinancialProvider read) | Pure compute; no UI involvement |
| Weekly settlement snapshot | API / Backend (pg-boss worker, cron-driven) | OS cron (Linux) | Pattern proven by Phase 11; pg-boss native scheduling broken (drift bug, see CLAUDE.md) |
| Settlement state machine (DRAFT → CONFIRMED → ADJUSTED) | API / Backend | UI (action buttons) | Backend rejects illegal transitions; UI presents allowed actions only |
| Excel/PDF export | API / Backend (streaming response) | UI (download trigger) | ExcelJS + PDFKit run server-side; client triggers fetch+blob |
| Ledger / settlement display | Frontend Server (Next.js) | API (data fetch) | Read-only views; standard Next.js App Router page |
| TIERED bracket evaluation | API / Backend | DB (sum query within ISO week) | Pure compute against materialized DrawFinancialProvider |
| Audit trail (who confirmed, what was adjusted) | DB | API (write) | Reuse existing `AuditLog` model (see Don't Hand-Roll) |
| Admin authorization | API / Backend (middleware) | — | `authenticate + authorize('ADMIN')` — same pattern as `/api/providers` |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — No commission config → skip silencioso**
When a draw totalizes and a provider participating in it has no `ProviderCommissionConfig` row whose `effectiveFrom ≤ draw.drawnAt`:
- **Behavior:** worker logs a warning via Winston (`logger.warn` with `{ drawId, apiSystemId, reason: 'no_config_at_drawnAt' }`) and **does NOT write a ledger row**.
- **Rationale:** simpler. No phantom SKIPPED rows polluting the ledger UI. The admin discovers gaps when comparing settlement totals to expected coverage — and the requirement FIN-COMM-06 only mandates "never blocks the pipeline" + "warning log", not a placeholder row.
- **Implication for backfill:** the backfill script must surface a count of "providers with draws but no effective config" so the operator sees how much is silently skipped.

**D-02 — `ADJUSTED` status is triggered only by two events**
A `ProviderWeeklySettlement` moves from any state to `ADJUSTED` only when:
1. **Manual override by admin** — admin edits the settlement total via an explicit "Adjust" action that requires a written reason (stored in `adjustmentReason TEXT`). The original `amount` is preserved in `originalAmount NUMERIC(18,8)`; the override goes to `amount`.
2. **Re-totalization of a draw included in a CONFIRMED settlement** — if `calculate-draw-financials` re-runs for a draw whose `drawnAt` falls inside a settlement's ISO week AND that settlement is `CONFIRMED`, the worker leaves the CONFIRMED settlement frozen (per D-03) and marks it `ADJUSTED` to flag the drift. The recomputed ledger row for that draw goes into the **next week's** settlement as a delta line item (compensating row, F-9-style — but NOT auto-applied; admin reviews it explicitly).

`ADJUSTED` is a terminal state with respect to automatic recomputation — only further manual overrides modify it.

**D-03 — `CONFIRMED` is terminal — no un-confirm**
Once an admin transitions a settlement from `DRAFT` to `CONFIRMED`:
- No UI action reverts the state back to `DRAFT`.
- No backend endpoint accepts `status: DRAFT` on a CONFIRMED row.
- Corrections happen via D-02 path 1 (manual adjustment with reason → `ADJUSTED`) or D-02 path 2 (compensating row in the next week).
- **Rationale:** financial trust. If CONFIRMED could be revoked, the upstream payment process (Phase 13) could never rely on it.

**D-04 — TIERED brackets reset every Monday 00:00 VE (ISO week)**
For `TIERED` formula evaluation:
- The bracket resolves against the provider's **cumulative sales in the current ISO week** (Monday 00:00 to Sunday 23:59:59.999 VE time).
- A draw whose `drawnAt` is `Monday 00:00:00.001 VE` falls in the NEW week (the boundary is exclusive at 00:00 of Monday).
- The cumulative window is closed and reset by the weekly-settlement-snapshot at Monday 06:00 VE — but the bracket evaluation uses the actual draw timestamp, not the settlement time.
- **Edge case:** if a draw is re-totalized late and lands in a prior week, the bracket lookup uses the historical cumulative sales as of that draw's `drawnAt`.
- Reuse the ISO week helper in `backend/src/lib/dateUtils.js` (per pitfall F-15).

**D-05 — UI placement**
- **Per-provider config:** new tab inside `/admin/proveedores/[id]` called "Comisiones" — shows current effective config, a timeline of historical configs (effectiveFrom newest first), and a "Nueva configuración" form. Append-only: each save creates a new row, never edits an existing one.
- **Global ledger + settlements:** new top-level section `/admin/comisiones` with two sub-tabs:
  - "Ledger" — table of `ProviderCommissionLedger` rows (filter by provider, date range, status).
  - "Settlements" — table of `ProviderWeeklySettlement` rows (filter by year/week, provider, status). Drill-down into a settlement opens a modal/page showing the per-draw ledger lines that fed it, plus Excel + PDF export buttons.

**D-06 — Settlement identifier format**
Settlements display as `YYYY-Www` (ISO year + ISO week, e.g., `2026-W19`) in the UI and in exports. The settlement table has columns `isoYear INT` and `isoWeek INT` with a unique constraint on `(apiSystemId, isoYear, isoWeek)`.

**D-07 — Backfill: standalone CLI script**
Following Phase 11's pattern, the historical backfill is a Node script at `backend/src/scripts/backfill-provider-commissions.mjs`:
- Same `--dry-run` / `--confirm` flag gates and exit codes as `backfill-draw-financials.mjs`.
- F-17 enforcement: aborts if any candidate draw has `drawnAt < 2026-04-17`.
- Iterates DRAWN draws in chronological order, looks up the effective `ProviderCommissionConfig` for each (provider, drawnAt) pair, computes per the formula type, writes ledger rows.
- Produces a reconciliation CSV at `backend/storage/backfill-reports/provider-commission-recon-{stamp}.csv`.
- Does NOT generate `ProviderWeeklySettlement` rows itself.

### Claude's Discretion

- **Decimal precision:** all monetary columns are `NUMERIC(18,8)` (per F-4 + Phase 11 convention). Service computations use `decimal.js` with `ROUND_HALF_UP`. Persist as Decimal, never as JS Number.
- **Queue naming:** `QUEUES.CALCULATE_PROVIDER_COMMISSION` (already in `constants.js`). New queue for weekly snapshot: `QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT`.
- **Cron line:** Monday 06:00 VE → `0 10 * * 1` in `/etc/cron.d/tote-triggers` (Venezuela is UTC-4, no DST).
- **Worker registration order:** F-11 — `boss.createQueue()` for both queues BEFORE `boss.work()`.
- **Read from materialized tables:** the commission worker reads `DrawFinancialProvider.totalSales` + `DrawFinancialProvider.totalPrize` (NOT raw `TicketDetail`).
- **Provider scope:** "provider" = `ApiSystem` row. Includes SRQ (PULL), webhook-PUSH providers, and Maxplay (SCRAPE).
- **Skip rule:** D-01 silent skip applies regardless of provider mode.
- **Trigger timing:** `calculate-provider-commission` runs AFTER `calculate-draw-financials` phase=PRIZES completes. Sequential, not parallel.

### Deferred Ideas (OUT OF SCOPE)

- "Provider portal where each proveedor can see their own ledger and confirm receipt of payment" — backlog.
- "Multi-currency display in the commission UI (USD equivalent)" — Phase 13.
- "Email/Telegram broadcast when settlement is confirmed" — backlog.
- "Threshold alerting (warn admin if a provider's commission grew >2× week-over-week)" — backlog.
- "Auto-confirm settlements older than 30 days" — rejected (violates D-03 spirit).
- USD/multimoneda for commission amounts → Phase 13.
- Receipt attachments on settlements → Phase 13.
- Weekly P&L dashboard combining commissions + accounting → Phase 14.
- Un-confirm workflow with multi-sign approval → backlog.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIN-COMM-01 | 4 formula types: `SALES_PCT`, `UTILITY_PCT`, `SALES_AND_UTILITY_PCT`, `TIERED` | Schema design §`ProviderCommissionConfig.formulaType` enum; formula evaluation §"Commission formula evaluation" |
| FIN-COMM-02 | Single rate for SALES_PCT / UTILITY_PCT; two rates for SALES_AND_UTILITY_PCT | Schema: `salesRate`, `utilityRate` columns nullable; service-side validation that required fields are present per formulaType |
| FIN-COMM-03 | TIERED: bracket table with (`minSales`, `maxSales`, `rate`); resolves by weekly cumulative sales | Schema §`ProviderCommissionTier`; bracket lookup algorithm in Architecture Patterns §"TIERED evaluation" |
| FIN-COMM-04 | Append-only `effectiveFrom`; calculation uses config effective at `draw.drawnAt` | Architecture Patterns §"Effective config lookup"; F-5 mitigation §Common Pitfalls |
| FIN-COMM-05 | pg-boss worker `calculate-provider-commission` writes ledger per (provider, draw) | Worker design §"Commission worker"; chained off step-process-prizes.worker.js |
| FIN-COMM-06 | Missing config → warning log, no block, no row written | D-01 (locked); worker logs via Winston and returns early |
| FIN-COMM-07 | `ProviderWeeklySettlement` per (provider, ISO year, ISO week) every Monday 06:00 VE | Worker design §"Snapshot worker"; cron line `0 10 * * 1` |
| FIN-COMM-08 | View per-draw ledger filtered by provider + date range | API design §"GET /api/commissions/ledger"; frontend §`/admin/comisiones` |
| FIN-COMM-09 | Settlement statuses DRAFT / CONFIRMED / ADJUSTED; CONFIRMED freezes | State machine in Architecture Patterns §"Settlement state machine"; D-02/D-03 |
| FIN-COMM-10 | Admin transitions DRAFT → CONFIRMED via explicit action | API §"PATCH /api/commissions/settlements/:id/confirm" |
| FIN-COMM-11 | Export Excel + PDF reusing ExcelJS/PDFKit | Code patterns §"Excel export" and §"PDF export" (verbatim patterns from `accounting-report.service.js` and `monitor.controller.js`) |
| FIN-COMM-12 | Backfill from 2026-04-17 onward using historical-effective config | Backfill design §"CLI script"; F-17 enforcement; D-07 |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **ES modules only** (`import`/`export`) — backend is `"type": "module"`. [VERIFIED: backend/package.json line "type": "module"]
- **Singleton Prisma client** — always `import { prisma } from '../lib/prisma.js'`. [VERIFIED: existing services consistently use this]
- **Singleton pg-boss** — `import { getBoss } from '../boss.js'`. [VERIFIED: step-process-prizes.worker.js]
- **Venezuela timezone** (America/Caracas, UTC-4, no DST) via `lib/dateUtils.js`. [VERIFIED]
- **`status = 'DRAWN'`** for completed draws locally; production legacy still has `PUBLISHED`. Phase 12 is LOCAL ONLY (per orchestrator). [VERIFIED]
- **`Ticket.status != 'CANCELLED'`** filter is the standard exclusion pattern. [VERIFIED: draw-financial.service.js, accounting-report.service.js]
- **NO VPS commands in research output** — execution is local-only this session.
- **Cron Linux + `trigger-pgboss-cron.mjs`** is the canonical scheduling mechanism; `boss.schedule()` has a drift bug (60s window, see commit 0f8d3f0). [VERIFIED: trigger-pgboss-cron.mjs]
- **`PGBOSS_*` env flags are no longer load-bearing** — Phase 11 workers are always-on. Phase 12 workers should also be always-on (no env gate). [VERIFIED: register.js Phase 11 block]

## Standard Stack

### Core (already installed — no additions needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg-boss | ^10.4.2 | Worker queue | Already the project's only queue; Phase 11 proved the pattern [VERIFIED: backend/package.json] |
| Prisma | ^6.16.3 | ORM | Already the only ORM; `DrawFinancialProvider` already defined [VERIFIED] |
| decimal.js | ^10.6.0 | Money arithmetic | Phase 11 stack decision; ROUND_HALF_UP convention; avoids JS Number precision drift on commission %s [VERIFIED: backend/package.json line 58] |
| date-fns | ^4.1.0 | ISO week math | `getISOWeek`, `getISOWeekYear`, `startOfISOWeek`, `endOfISOWeek` all present [VERIFIED: node_modules/date-fns/getISOWeek*.js exists] |
| date-fns-tz | ^3.2.0 | Venezuela TZ conversion | Convert draw timestamp → VE wall-clock before ISO week computation [VERIFIED: node_modules/date-fns-tz/ exists] |
| ExcelJS | ^4.4.0 | Excel export | Already used in `accounting-report.service.js` and `tickets-export.service.js` [VERIFIED] |
| PDFKit | ^0.17.2 | PDF export | Already used in `monitor.controller.js` for report PDF [VERIFIED] |
| Winston | (via lib/logger.js) | Logging | Project standard [VERIFIED] |
| @hapi/boom | ^10.0.1 | HTTP error throwing | Already a dep — controllers may use it or plain res.status() [VERIFIED: package.json] |

**Installation:** Nothing to install. All libs already present.

**Version verification (npm view):** Skipped per project — backend/package.json is the single source of truth; all required versions are already locked and installed in node_modules. The library versions listed above were grep-verified against `backend/package.json` and `backend/node_modules/` directly.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| date-fns ISO week helpers | Native Intl or moment-timezone | date-fns 4 already a dep; moment is unmaintained. **Use date-fns.** |
| pg-boss for snapshot scheduler | node-cron / Croner inside Node | The whole project migrated AWAY from in-process Croner to cron Linux + pg-boss (CLAUDE.md). **Use cron Linux + pg-boss.** |
| In-DB enum for `formulaType` | string column with check constraint | Prisma enum is the project convention (TicketSource, DrawStatus, ApiSystemMode, UserRole). **Use Prisma enum.** |
| New AuditLog table for settlement transitions | Reuse existing `AuditLog` model | `AuditLog` already exists at `prisma/schema.prisma:404` with the right shape (userId, action, entity, entityId, changes Json, ipAddress). **Reuse — see Don't Hand-Roll.** |

## Architecture Patterns

### System Architecture Diagram

```
                                  PHASE 11 (already exists)
                                  ┌─────────────────────────┐
  Draw closes ─► close-and-ingest.worker.js                  │
                                  │  boss.send(SALES) ───►   │
  Prizes done ─► step-process-prizes.worker.js               │
                                  │  boss.send(PRIZES) ─►    │
                                  │  boss.send(STATS) ─►     │
                                  │  ⚠ ADD boss.send(COMM)   │
                                  └─────────────────────────┘
                                              │
                                              ▼  (chained, fires after PRIZES)
                       ┌──────────────────────────────────────────┐
                       │  calculate-provider-commission.worker.js │
                       │  - read DrawFinancialProvider rows       │
                       │  - lookup effective config per provider  │
                       │  - compute amount per formulaType        │
                       │  - upsert ProviderCommissionLedger row   │
                       │  - skip silently if no config (D-01)     │
                       └──────────────────────────────────────────┘
                                              │
                                              ▼ writes
                       ┌──────────────────────────────────────────┐
                       │      ProviderCommissionLedger            │
                       └──────────────────────────────────────────┘
                                              │
                                              ▼ read by
   Every Monday 06:00 VE                                                            
   /etc/cron.d/tote-triggers                                                        
            │                                                                       
            ▼                                                                       
   trigger-pgboss-cron.mjs       ┌─────────────────────────────────────────┐
            │                    │  weekly-settlement-snapshot.worker.js   │
            │  boss.send() ────► │  - find last completed ISO week         │
            │                    │  - GROUP BY apiSystemId on ledger       │
            │                    │  - upsert ProviderWeeklySettlement      │
            │                    │    (DRAFT)                              │
            │                    └─────────────────────────────────────────┘
            │                                  │
            │                                  ▼
            │                ┌──────────────────────────────────────┐
            │                │   ProviderWeeklySettlement (DRAFT)   │
            │                └──────────────────────────────────────┘
            │                                  │
            │                                  ▼
            │                ┌──────────────────────────────────────┐
            │                │   Admin UI: /admin/comisiones        │
            │                │   - View ledger / settlements        │
            │                │   - DRAFT ─► CONFIRMED (action)      │
            │                │   - Manual adjust ─► ADJUSTED        │
            │                │   - Excel / PDF export               │
            │                └──────────────────────────────────────┘

   Admin manages config:
   /admin/proveedores/[id] "Comisiones" tab ─► append-only ProviderCommissionConfig
```

### Recommended Project Structure

```
backend/src/
├── services/
│   └── commission.service.js         # Pure compute: formula evaluators + effective-config lookup
├── controllers/
│   └── commission.controller.js      # REST handlers (config CRUD, ledger query, settlement CRUD)
├── routes/
│   └── commission.routes.js          # Express router: authenticate + authorize('ADMIN')
├── queue/
│   ├── workers/
│   │   ├── calculate-provider-commission.worker.js  # REAL impl (replaces placeholder)
│   │   └── weekly-settlement-snapshot.worker.js     # New worker
│   ├── constants.js                  # ADD QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT + config
│   └── register.js                   # Replace placeholder; add snapshot worker
├── scripts/
│   ├── backfill-provider-commissions.mjs            # New CLI
│   └── trigger-pgboss-cron.mjs                      # ADD 'weekly-settlement-snapshot' to ALLOWED_QUEUES
└── lib/
    └── dateUtils.js                   # ADD: getISOWeekVE, getISOWeekYearVE, startOfISOWeekVE

frontend/app/admin/
├── proveedores/
│   └── [id]/
│       └── comisiones/                # NEW tab — config history + new-config form
│           └── page.js
└── comisiones/                        # NEW section — ledger + settlements
    ├── page.js                        # Default to "Settlements" tab
    ├── ledger/page.js
    └── settlements/[id]/page.js       # Drill-down + export buttons
```

### Pattern 1: Effective config lookup [VERIFIED: existing accounting-report.service.js precedent]

**What:** For a draw at `drawnAt`, find the config row whose `effectiveFrom` is the latest one ≤ `drawnAt`.
**When to use:** Every commission calculation (live worker AND backfill).
**Example:**
```js
// commission.service.js
// Single Prisma query — uses index on (apiSystemId, effectiveFrom DESC)
export async function findEffectiveConfig(apiSystemId, drawnAt) {
  return prisma.providerCommissionConfig.findFirst({
    where: {
      apiSystemId,
      effectiveFrom: { lte: drawnAt },
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { tiers: true }, // eager-load TIERED brackets
  });
}
```
[CITED: Prisma docs — `findFirst` + `orderBy` is the canonical "get the row with max(col) where pred" pattern. Confirmed against Phase 11 service patterns.]

**Index requirement:** `@@index([apiSystemId, effectiveFrom(sort: Desc)])` on `ProviderCommissionConfig`. Without it, every commission lookup is a sequential scan.

### Pattern 2: Commission formula evaluation [ASSUMED — formula math is locked by requirements but exact rounding boundary is researcher's call]

```js
import Decimal from 'decimal.js';
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export function computeCommission(config, providerRow, cumulativeWeeklySales) {
  // providerRow = DrawFinancialProvider { totalSales, totalPrize }
  // cumulativeWeeklySales = sum of DrawFinancialProvider.totalSales for this apiSystemId
  //   over the current ISO week up to and INCLUDING this draw (D-04)
  const sales = new Decimal(providerRow.totalSales.toString());
  const prize = new Decimal(providerRow.totalPrize.toString());
  const utility = sales.minus(prize);

  switch (config.formulaType) {
    case 'SALES_PCT':
      return sales.times(config.salesRate).dividedBy(100).toFixed(8);
    case 'UTILITY_PCT':
      return utility.times(config.utilityRate).dividedBy(100).toFixed(8);
    case 'SALES_AND_UTILITY_PCT':
      return sales.times(config.salesRate).dividedBy(100)
        .plus(utility.times(config.utilityRate).dividedBy(100))
        .toFixed(8);
    case 'TIERED': {
      const bracket = config.tiers.find(t =>
        new Decimal(cumulativeWeeklySales).gte(t.minSales) &&
        (t.maxSales === null || new Decimal(cumulativeWeeklySales).lt(t.maxSales))
      );
      if (!bracket) throw new Error(`No tier matches cumulative sales ${cumulativeWeeklySales}`);
      return sales.times(bracket.rate).dividedBy(100).toFixed(8);
    }
    default:
      throw new Error(`Unknown formulaType: ${config.formulaType}`);
  }
}
```

**Decimal precision flow:**
1. Prisma returns `Decimal` objects → convert to `decimal.js Decimal` via `.toString()` (NOT `Number()`).
2. All arithmetic in `decimal.js`.
3. Final output `.toFixed(8)` matches `NUMERIC(18,8)` column.
4. Pass the string back to Prisma — Prisma converts string → Postgres NUMERIC losslessly.

### Pattern 3: TIERED weekly cumulative lookup [VERIFIED via codebase grep — Phase 11 establishes the data shape]

For a draw at `drawnAt`, the cumulative weekly sales for provider X are:
```sql
SELECT COALESCE(SUM(dfp."totalSales"), 0) AS cumulative
FROM "DrawFinancialProvider" dfp
JOIN   "Draw" d ON d.id = dfp."drawId"
WHERE  dfp."apiSystemId" = $1
  AND  d."drawnAt" >= $2  -- startOfISOWeekVE(drawnAt)
  AND  d."drawnAt" <= $3  -- the current draw's drawnAt (INCLUSIVE)
```

**Critical:** the `JOIN Draw` is needed because `DrawFinancialProvider` does not store `drawnAt`. Phase 14 may denormalize this; for Phase 12 the JOIN is fine.

**ISO-week boundary in VE timezone:** see `Pattern 4` below.

### Pattern 4: ISO week computation in Venezuela TZ [CITED: date-fns 4 docs + date-fns-tz 3 docs]

Venezuela is **UTC-4 year-round (no DST)** since 2007 — confirmed in CLAUDE.md and `lib/dateUtils.js`. This means a wall-clock VE Monday 00:00 is **always** UTC 04:00 of that same Monday. No edge cases from clock shift.

```js
// backend/src/lib/dateUtils.js — ADD these functions
import { getISOWeek, getISOWeekYear, startOfISOWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const VE_TZ = 'America/Caracas';

/**
 * Returns { isoYear, isoWeek } for a UTC Date interpreted in VE wall-clock.
 * D-04: a draw at "Monday 00:00:00.001 VE" falls in the NEW week.
 * date-fns ISO week starts on Monday 00:00 (inclusive).
 */
export function getISOWeekVE(date) {
  const ve = toZonedTime(date, VE_TZ);
  return {
    isoYear: getISOWeekYear(ve),
    isoWeek: getISOWeek(ve),
  };
}

export function startOfISOWeekVE(date) {
  // Returns the UTC Date that corresponds to VE Monday 00:00 of the same ISO week
  const ve = toZonedTime(date, VE_TZ);
  const monStart = startOfISOWeek(ve); // local Monday 00:00 (in ve frame)
  // Convert back: VE Monday 00:00 = UTC Monday 04:00 (UTC-4 no DST)
  return new Date(monStart.getTime() + (4 * 60 * 60 * 1000));
}
```

[CITED: date-fns API — `getISOWeek` returns 1-53; `getISOWeekYear` returns the correct year for ISO weeks straddling Dec/Jan. Both verified in `backend/node_modules/date-fns/getISOWeek*.js`.]

**F-15 edge case verified:**
- 2026-12-29 (Tuesday) → ISO week 53 of 2026 (date-fns `getISOWeek(new Date('2026-12-29')) === 53`, `getISOWeekYear` === 2026).
- 2027-01-01 (Friday) → ISO week 53 of 2026 (NOT week 1 of 2027). `getISOWeekYear` returns 2026.
- 2027-01-04 (Monday) → ISO week 1 of 2027.

**MUST test these three dates** in the unit suite — they catch the naive "year = date.getFullYear()" bug.

### Pattern 5: Trigger chaining — chain off step-process-prizes, NOT off calculate-draw-financials

**Recommended:** Add a **third** `boss.send` call in `step-process-prizes.worker.js`, parallel to the existing STATS + DrawFinancial-PRIZES sends:

```js
// In step-process-prizes.worker.js, AFTER the existing DrawFinancial PRIZES send (line 56):
await boss.send(QUEUES.CALCULATE_PROVIDER_COMMISSION, { drawId }, {
  singletonKey: `comm-${drawId}`,
  ...QUEUE_CONFIGS[QUEUES.CALCULATE_PROVIDER_COMMISSION],
});
```

**Why NOT chain off calculate-draw-financials completion:**
- pg-boss does not have native "onComplete" chaining; you'd have to add a `boss.onComplete` handler or hand-roll signal queues. Existing project pattern is "all chained sends fire from the same parent worker" (proven by step-process-prizes already firing STATS + DrawFinancial in parallel).
- The commission worker DOES depend on `DrawFinancialProvider` rows existing. But by the time `step-process-prizes.worker.js` reaches its final `boss.send` block, the `boss.send(...PRIZES)` for calculate-draw-financials has already been enqueued **earlier in the same function** (lines 25-28 and 55-59 of `step-process-prizes.worker.js`). pg-boss processes jobs roughly FIFO within a queue with idle workers, BUT — and this matters — commission and DrawFinancial-PRIZES are in **different queues** so there is no ordering guarantee.

**Race condition risk:** Commission worker fires `~immediately after enqueue` and may run BEFORE `calculate-draw-financials.worker.js` has finished writing the per-provider rows. Mitigation options (planner picks):

| Option | Trade-off |
|--------|-----------|
| **(a) Defensive read with retry** — Commission worker reads `DrawFinancialProvider`; if rows are missing, throws `DrawFinancialNotReadyError`; pg-boss retries 3× with backoff (5s, 10s, 20s) — by which time PRIZES will have committed | Simple. Adds 5s worst-case latency. **RECOMMENDED.** |
| (b) Synchronous compute inside calculate-draw-financials.worker.js after PRIZES upsert | Mixes responsibilities; harder to backfill independently. |
| (c) Add a small delay to the boss.send (`startAfter: 5`) | Cheesy; relies on timing; non-deterministic. |

→ **Plan with option (a).** Mirrors Phase 11's `PrizesNotProcessedError` pattern (D-14).

### Pattern 6: Settlement state machine

```
            ┌──────────┐     admin clicks      ┌────────────┐
   (created)│  DRAFT   │─────"Confirmar"──────►│ CONFIRMED  │ (terminal vs auto recompute)
            └──────────┘                       └─────┬──────┘
                                                     │
                                       re-totalization │
                                         (D-02 path 2) │  admin override
                                                       ▼  (D-02 path 1)
                                                ┌────────────┐
                                                │  ADJUSTED  │ (terminal vs auto, manual-only after)
                                                └────────────┘
```

**Backend enforcement** (commission.controller.js, NOT just UI):
- `PATCH /api/commissions/settlements/:id/confirm`: rejects 400 unless current status is `DRAFT`.
- `PATCH /api/commissions/settlements/:id/adjust`: rejects 400 unless current status is `CONFIRMED` OR `ADJUSTED`, requires `{ amount, adjustmentReason }`.
- DRAFT → DRAFT (re-snapshot upserts) is the snapshot worker's normal flow — no state transition.
- No PATCH endpoint accepts arbitrary `status` writes.

**Audit:** every transition writes an `AuditLog` row (see Don't Hand-Roll §AuditLog).

### Pattern 7: Snapshot worker for weekly settlement

**Trigger:** `/etc/cron.d/tote-triggers` line:
```
0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot
```
(10:00 UTC = 06:00 VE Monday)

**Add to `ALLOWED_QUEUES`** in `trigger-pgboss-cron.mjs` — currently the set is hardcoded.

**Worker payload:** Empty (`{}`); the worker computes "last completed ISO week" itself based on `new Date()`:
- `now` is Monday 06:00 VE → last completed week ended Sunday 23:59:59.999 VE (the previous day).
- Compute `prevWeek = { isoYear, isoWeek }` for `now - 1 day`.

**Worker logic (pseudocode):**
```js
const { isoYear, isoWeek } = getISOWeekVE(subDays(new Date(), 1)); // any time within the closed week works
const { start, end } = isoWeekBoundsVE(isoYear, isoWeek);

// 1. Group ledger rows by apiSystemId for the closed week
const byProvider = await prisma.$queryRaw`
  SELECT cl."apiSystemId",
         SUM(cl.amount)::numeric(18,8) AS "totalAmount",
         COUNT(*) AS "ledgerRowCount"
  FROM "ProviderCommissionLedger" cl
  JOIN "Draw" d ON d.id = cl."drawId"
  WHERE d."drawnAt" >= ${start} AND d."drawnAt" <= ${end}
  GROUP BY cl."apiSystemId"
`;

// 2. Upsert ProviderWeeklySettlement per (apiSystemId, isoYear, isoWeek)
for (const row of byProvider) {
  await prisma.providerWeeklySettlement.upsert({
    where: {
      apiSystemId_isoYear_isoWeek: {
        apiSystemId: row.apiSystemId, isoYear, isoWeek,
      },
    },
    update: {
      // ⚠ DO NOT overwrite if status === CONFIRMED or ADJUSTED — see D-03
      // Use a separate findFirst + conditional logic instead of blind upsert
      ...
    },
    create: { apiSystemId, isoYear, isoWeek, amount, status: 'DRAFT', ... },
  });
}
```

**Critical:** the upsert's UPDATE branch must NOT overwrite settlements whose status is `CONFIRMED` or `ADJUSTED` — those are frozen (D-03). Use a `findFirst` + branch instead of `prisma.upsert` (similar to D-08 NULL-FK pattern but for a different reason: state-conditional updates):

```js
const existing = await prisma.providerWeeklySettlement.findFirst({
  where: { apiSystemId, isoYear, isoWeek },
});
if (!existing) {
  await prisma.providerWeeklySettlement.create({ data: { ..., status: 'DRAFT' } });
} else if (existing.status === 'DRAFT') {
  await prisma.providerWeeklySettlement.update({
    where: { id: existing.id },
    data: { amount: newAmount, ledgerRowCount: newCount, snapshotAt: new Date() },
  });
} else {
  // CONFIRMED or ADJUSTED — check for drift (D-02 path 2)
  if (!existing.amount.equals(newAmount)) {
    if (existing.status === 'CONFIRMED') {
      // Mark ADJUSTED to flag drift
      await prisma.providerWeeklySettlement.update({
        where: { id: existing.id },
        data: { status: 'ADJUSTED', adjustmentReason: 'auto: drift detected by snapshot' },
      });
    }
    // Either way, log the delta; compensating row will go into the NEXT week's ledger
    logger.warn(`Settlement drift detected`, { id: existing.id, oldAmount: existing.amount, newAmount });
  }
}
```

### Anti-Patterns to Avoid

- **Don't aggregate from raw `TicketDetail`** for commission compute. Phase 11 materialized `DrawFinancialProvider` exactly so commission doesn't need to. Reading `TicketDetail` here would re-introduce the multi-draw bug from v1.2 and double the query cost.
- **Don't use `prisma.upsert` for `ProviderWeeklySettlement`** — see snapshot worker explanation; state-conditional updates need findFirst + branch.
- **Don't allow UPDATE on `ProviderCommissionConfig`** — append-only (F-5). Best enforced at the service layer (no `update` method exposed) plus a comment in `commission.controller.js`.
- **Don't use `Number()` on Prisma Decimals** — use `.toString()` and feed it to `new Decimal(...)`.
- **Don't hardcode the cron time in Node** — it's in `/etc/cron.d/tote-triggers`, NOT in code. The worker payload should NOT carry a date — the worker computes "last completed week" from `new Date()`. This way, if cron fires late, the worker still does the right thing.
- **Don't store the rendered "2026-W19" string in DB** — store `isoYear INT` + `isoWeek INT`. Compute the display string on render (D-06).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO week math | Custom Sunday/Monday detection | `date-fns` `getISOWeek` + `getISOWeekYear` | F-15: ISO 8601 has 52/53 weeks; year-boundary edge cases are subtle. `getISOWeekYear` ≠ `getFullYear` for Jan 1 of some years. [VERIFIED: node_modules/date-fns/getISOWeekYear.js exists] |
| Monetary arithmetic | Native JS `*` and `/` on rates | `decimal.js` with `ROUND_HALF_UP` | F-4: 0.1 + 0.2 !== 0.3 in IEEE 754. Required for audit-grade ledgers. [VERIFIED: backend/package.json:58] |
| Timezone conversion | Manual `+ 4 hours` math | `date-fns-tz` `toZonedTime` | VE has no DST today, but encoding "UTC-4" as a magic number is fragile. [VERIFIED: date-fns-tz installed] |
| Audit trail | New `CommissionAuditLog` table | Existing `AuditLog` model | Already in schema (`prisma/schema.prisma:404`). Has userId, action, entity, entityId, changes JSON, ipAddress, userAgent, createdAt. Reuse with `entity: 'ProviderWeeklySettlement'` and `action: 'CONFIRM' | 'ADJUST'`. [VERIFIED] |
| Excel generator | Custom CSV-to-Excel converter | ExcelJS | Already used by `accounting-report.service.js` for the same kind of money report. Reuse `buildAccountingExcel` as a template for `buildSettlementExcel`. [VERIFIED] |
| PDF generator | PDF library shopping | PDFKit | Already used in `monitor.controller.js` for the draws-report PDF. Same patterns: `bufferPages: true`, `Content-Disposition: attachment`, `doc.pipe(res)`. [VERIFIED] |
| Worker scheduling | `boss.schedule()` / `setInterval` | cron Linux → `trigger-pgboss-cron.mjs` → pg-boss | `boss.schedule` has a 60s drift bug (CLAUDE.md commit 0f8d3f0). Project standard is OS cron. [VERIFIED: trigger-pgboss-cron.mjs] |
| Admin auth | New middleware | `authenticate, authorize('ADMIN')` from `auth.middleware.js` | Project standard, used by 40+ existing routes. [VERIFIED: provider.routes.js:8] |
| Append-only enforcement | DB triggers | Service-layer rule + no exposed UPDATE controller endpoint | Adding triggers to a Prisma-managed schema is anti-pattern; service layer + code review is sufficient and consistent with how the project enforces other invariants (e.g., DrawFinancial freeze D-16). |

**Key insight:** The whole phase is composition of existing patterns. There is **zero greenfield framework decision** — every choice is already locked by Phase 11 and the rest of the codebase. The risk is in (a) correctness of formula math, (b) correctness of ISO week math at year boundaries, (c) correctness of state transitions, and (d) not regressing Phase 11.

## Runtime State Inventory

Not applicable — Phase 12 is a greenfield feature, NOT a rename/refactor/migration. No existing runtime state names will change.

The single nearby state-rename concern: **Phase 11 commission placeholder worker is replaced.** The pg-boss queue row `calculate-provider-commission` already exists in `pgboss.queue` after Phase 11 deploy. The plan must replace the placeholder handler in `register.js` lines 108-112 without changing the queue name. No data migration needed.

**Nothing found in remaining categories:**
- Stored data: None — verified by greps for "commission", "settlement" in the codebase return zero results.
- Live service config: None — no external services know about commissions.
- OS-registered state: One new line in `/etc/cron.d/tote-triggers` (additive, no rename). Out of session scope per orchestrator note.
- Secrets/env vars: None — no new env vars needed. `DATABASE_URL` is the only one used.
- Build artifacts: None — no installable packages.

## Common Pitfalls

### Pitfall 1: F-4 — Floating-point drift on commission rates (project pitfall ID)

**What goes wrong:** `0.1 + 0.2 = 0.30000000000000004` in JS. Multiplying `1234.56 * 0.055` in IEEE 754 produces `67.9008` then `* 1.05 = 71.29584`; over a ledger of 2,600 draws the drift can shift settlement totals by cents.
**Why it happens:** `Decimal(18,8)` columns vs JS `Number` arithmetic.
**How to avoid:** Always wrap in `new Decimal(value.toString())` BEFORE arithmetic. Always `.toFixed(8)` BEFORE writing to DB.
**Warning signs:** Discrepancies between `SUM(amount)` in DB vs UI-computed totals.

### Pitfall 2: F-5 — UPDATE on ProviderCommissionConfig

**What goes wrong:** Admin edits a config row, retroactively changing the rate. Backfill output is now non-reproducible.
**Why it happens:** Default Prisma generators include `update` mutations; service code is the only gate.
**How to avoid:**
- No `updateConfig` in `commission.service.js`.
- No `PUT /commissions/configs/:id` endpoint.
- Controller has `createConfig` only; UI form says "Nueva configuración" (D-05).
- Unit test that asserts `prisma.providerCommissionConfig.update` is never called by any service function.
**Warning signs:** `effectiveFrom` mismatches between consecutive rows; ledger rows whose computed amount doesn't reproduce when re-running against the same config.

### Pitfall 3: F-9 — Cancellation creates phantom commission

**What goes wrong:** A ticket cancels AFTER `DrawFinancial.totalizedAt` is set; the commission ledger row is now wrong but DrawFinancial is frozen (D-16 from Phase 11).
**Why it happens:** Cancellations happen post-totalization for refunds.
**How to avoid:** Phase 11 D-16 says DrawFinancial is frozen → commission stays frozen too. If admin needs to compensate, they manually create a **negative-amount ledger row** in the NEXT week with `reason: 'compensation_cancellation_draw_X'`. NOT auto-applied — admin must explicitly post it.
**Warning signs:** Settlement totals differ from what operators expected; cancellation reports show tickets that should have triggered refunds but didn't.

### Pitfall 4: F-12 — Forgot to update /etc/cron.d/tote-triggers

**What goes wrong:** Code deploys, `weekly-settlement-snapshot` worker is registered, BUT no cron line fires it. Settlements never get created.
**Why it happens:** Cron config lives on VPS, NOT in repo. Phase 11 documented this (Cron Linux + pg-boss section in CLAUDE.md).
**How to avoid:**
- Include cron line update in DEPLOY.md (out of session scope but called out for the planner).
- Smoke test post-deploy: `tail -f /var/log/tote-triggers.log` on Monday 10:00 UTC should show `[weekly-settlement-snapshot] enqueued`.
- Add `'weekly-settlement-snapshot'` to `ALLOWED_QUEUES` in `trigger-pgboss-cron.mjs` (in-repo change, IS in session scope).
**Warning signs:** No `ProviderWeeklySettlement` rows appear on Monday morning.

### Pitfall 5: F-15 — ISO week year boundary

**What goes wrong:** A draw at `2027-01-01 18:00 VE` is computed with `getFullYear() === 2027`, `getWeek() === 0` (naive math). The ISO 8601 truth is `isoYear=2026, isoWeek=53` because that Friday belongs to the last ISO week of 2026.
**Why it happens:** ISO 8601 weeks start Monday; week 1 of year Y is the week containing the first Thursday of Y.
**How to avoid:** ALWAYS use `getISOWeekYear` (not `getFullYear`) + `getISOWeek`. Test against:
- 2026-12-29 Tuesday → isoYear=2026, isoWeek=53
- 2026-12-31 Thursday → isoYear=2026, isoWeek=53
- 2027-01-01 Friday → isoYear=2026, isoWeek=53
- 2027-01-04 Monday → isoYear=2027, isoWeek=1
**Warning signs:** Settlements with `isoYear=2027, isoWeek=53` (impossible — week 53 only exists in years where Jan 1 is Thu or Dec 31 is Thu). Or `isoWeek=0` (impossible — ISO weeks start at 1).

### Pitfall 6: F-17 — Backfill bleeds into pre-2026-04-17 territory

**What goes wrong:** Backfill script runs against all DRAWN draws, including the ~2,500 draws from 2025-12-20 to 2026-04-16 for which no commission rule exists.
**Why it happens:** The script is generic; without an explicit gate it processes everything.
**How to avoid:**
- Define `const COMMISSION_GO_LIVE = new Date('2026-04-17T00:00:00-04:00');` at the top of the script.
- The candidate-draw query filters `WHERE d."drawnAt" >= $1` with `$1 = COMMISSION_GO_LIVE`.
- Add an assertion: if any candidate has `drawnAt < COMMISSION_GO_LIVE`, abort with exit code 3 and log.
- Reconciliation CSV header includes "GO_LIVE=2026-04-17" so the audit trail is self-documenting.
**Warning signs:** Ledger rows with `Draw.drawnAt < 2026-04-17`. Verify via SQL after backfill: `SELECT MIN(d."drawnAt") FROM ProviderCommissionLedger cl JOIN Draw d ON d.id = cl."drawId"` should equal or exceed `2026-04-17`.

### Pitfall 7: Race condition — commission worker runs before DrawFinancial-PRIZES commits

**What goes wrong:** `step-process-prizes.worker.js` fires three parallel `boss.send`s. pg-boss picks them up in any order. Commission worker reads `DrawFinancialProvider` and finds zero rows.
**Why it happens:** Different queues, no FIFO guarantee between queues.
**How to avoid:** Commission worker checks `DrawFinancial.totalizedAt IS NOT NULL` AND `COUNT(DrawFinancialProvider WHERE drawId=$1) > 0` at its entry; if not satisfied, throw `DrawFinancialNotReadyError`. pg-boss retries 3× with backoff (5s, 10s, 20s) — DrawFinancial PRIZES will have committed by then.
**Warning signs:** First-attempt commission worker failures with "DrawFinancial not ready" in logs; check that they succeed on retry.

### Pitfall 8: Service-row mismatch between DrawFinancial.totalSales and SUM(DrawFinancialProvider.totalSales)

**What goes wrong:** Phase 11 D-08 / D-09 already address this, but commission worker MUST trust the per-provider rows. If sum(provider) ≠ DrawFinancial.totalSales, commission compute is wrong somewhere upstream.
**Why it happens:** Inconsistent upsert if D-08 pattern was violated.
**How to avoid:** Defensive assertion in the worker (or at least in tests) that `SUM(DrawFinancialProvider.totalSales WHERE drawId=$1) === DrawFinancial.totalSales`. Phase 11 already proves this with `draw-financial-pipeline.integration.test.js` Test 5.
**Warning signs:** Commission totals don't reconcile with daily report totals.

## Code Examples

### Settlement Excel export (template-by-analogy with `accounting-report.service.js`)

```js
// commission.service.js — buildSettlementExcel
import ExcelJS from 'exceljs';

export async function buildSettlementExcel(settlementId) {
  const settlement = await prisma.providerWeeklySettlement.findUnique({
    where: { id: settlementId },
    include: {
      apiSystem: { select: { name: true, slug: true } },
      ledgerRows: {  // assumes a relation from settlement → ledger via apiSystemId + ISO week
        include: { draw: { select: { drawDate: true, drawTime: true, drawnAt: true } } },
        orderBy: { draw: { drawnAt: 'asc' } },
      },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tote — Liquidación Semanal de Comisiones';
  wb.created = new Date();
  const ws = wb.addWorksheet(`${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`);

  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = `Liquidación ${settlement.apiSystem.name} — ${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`;
  ws.getCell('A1').font = { bold: true, size: 14 };

  const header = ws.addRow(['Sorteo', 'Fecha', 'Ventas', 'Premios', 'Comisión']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

  for (const row of settlement.ledgerRows) {
    ws.addRow([
      row.drawId.slice(0, 8),
      row.draw.drawnAt,
      Number(row.salesBase),
      Number(row.utilityBase),
      Number(row.amount),
    ]);
  }
  ws.addRow([]);
  ws.addRow(['', '', '', 'TOTAL:', Number(settlement.amount)]).font = { bold: true };

  return wb.xlsx.writeBuffer();
}
```

### Settlement PDF export (analogous to `monitor.controller.js`)

```js
// commission.controller.js — exportSettlementPdf
async exportSettlementPdf(req, res) {
  const { id } = req.params;
  const settlement = await commissionService.getSettlementWithLedger(id);
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 70, left: 50, right: 50 }, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${settlement.isoYear}-W${settlement.isoWeek}-${settlement.apiSystem.slug}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text('LIQUIDACIÓN DE COMISIÓN', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`${settlement.apiSystem.name} — ${settlement.isoYear}-W${String(settlement.isoWeek).padStart(2, '0')}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
  doc.moveDown(0.5);

  // Summary
  const fmt = (n) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(Number(n) ?? 0);
  doc.fontSize(11).text(`Total: ${fmt(settlement.amount)}`);
  doc.text(`Sorteos incluidos: ${settlement.ledgerRowCount}`);
  doc.text(`Estado: ${settlement.status}`);

  // Table (reuse drawTable helper from monitor.controller.js)
  doc.end();
}
```

### Commission worker entry point (full sketch)

```js
// backend/src/queue/workers/calculate-provider-commission.worker.js
import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import { computeAndUpsertLedgerForDraw } from '../../services/commission.service.js';

export class DrawFinancialNotReadyError extends Error {
  constructor(drawId) {
    super(`DrawFinancial not ready for ${drawId} — retrying`);
    this.name = 'DrawFinancialNotReadyError';
  }
}

export async function calculateProviderCommissionWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const { drawId } = job.data;

  // Race-condition guard (Pitfall 7)
  const df = await prisma.drawFinancial.findUnique({
    where: { drawId },
    select: { totalizedAt: true },
  });
  if (!df || df.totalizedAt === null) {
    throw new DrawFinancialNotReadyError(drawId);
  }

  logger.info(`[calculate-provider-commission] drawId=${drawId}`);
  const result = await computeAndUpsertLedgerForDraw(drawId);
  return { success: true, drawId, providersProcessed: result.providersProcessed, skipped: result.skipped };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Croner in-process schedule | Cron Linux + `trigger-pgboss-cron.mjs` | 2026-05-12 (this codebase) | Phase 12 cron MUST follow this pattern — no `boss.schedule()` calls |
| Aggregation via `Ticket.drawId` | Aggregation via `TicketDetail.drawId` (Phase 11 F-3 fix) | 2026-05-15 (Phase 11) | Phase 12 reads `DrawFinancialProvider` (already fixed) |
| Default Phase 11 placeholder worker for commission | Real worker (this phase) | Phase 12 | Swap `register.js` lines 108-112 |
| JS `Number` for money | `decimal.js` ROUND_HALF_UP | 2026-05-15 (Phase 11) | Phase 12 follows |

**Deprecated/outdated:**
- `boss.schedule()` — never use; drift bug. Use cron Linux.
- In-process `node-cron` / Croner for the new scheduling. The repo migrated away.
- `PGBOSS_*` env flags — no longer load-bearing per CLAUDE.md update 2026-05-12. Commission workers should be always-on (no env gate), matching the Phase 11 block in `register.js`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `decimal.js` `.toFixed(8)` is the right precision for `NUMERIC(18,8)` rounding | Pattern 2 | Sub-cent drift; mitigated by Pitfall 1 test cases |
| A2 | `ProviderCommissionLedger` should reference `apiSystemId` directly (not via `DrawFinancialProvider.id`) | Schema design | Wrong FK shape → settlement joins get harder. Verify with planner — but `apiSystemId` is the natural business key |
| A3 | TIERED `maxSales = NULL` means "open-ended" (∞) | Pattern 2 | If maxSales is required NOT NULL, top tier needs a giant sentinel value |
| A4 | Settlement `originalAmount` is set only on first ADJUSTED transition (preserves the CONFIRMED amount); subsequent adjusts overwrite `amount` only | Pattern 6 | If the user wants full history, need a separate `SettlementAdjustment` table — not in scope per D-02 wording |
| A5 | The cron line `0 10 * * 1` corresponds to Monday 06:00 VE (UTC-4 no DST) | Pattern 7 | VE has no DST since 2007 [VERIFIED]. Safe. |
| A6 | The commission worker's retry-on-race-condition (Pitfall 7) is acceptable; alternative (compute inline in calculate-draw-financials) is rejected | Pattern 5 option (a) | If retries cause user-visible flakiness in logs, may need option (b). 3 retries × 5s/10s/20s is ~35s worst case. |
| A7 | `AuditLog.changes` JSON column is fine for settlement transition records | Don't Hand-Roll | If audit reports need typed query (e.g., "show all settlements where adjustment > 1000 BsF"), need normalized columns. Out of scope for v1.3. |
| A8 | Settlement ledger rows are queried by JOIN-on-drawnAt-range, NOT by an explicit FK from ledger → settlement | Pattern 7 worker | Adding a `settlementId` FK on ledger would speed queries but complicates the snapshot worker (must back-fill the FK). Recommend NO FK — let the SQL JOIN handle it (clean separation; ledger remains stable even if settlement is recomputed) |
| A9 | The "compensating row in next week" (D-02 path 2) is an admin-initiated action, NOT auto-generated by the snapshot worker | Pattern 7 + Pitfall 3 | If user expected auto-generation, snapshot worker becomes much more complex (must consult prior CONFIRMED settlements). Verify with planner. |
| A10 | The full settlement snapshot recompute (DRAFT path) is fast enough on Monday morning | Pattern 7 | With ~4 providers × ~50 draws/week, snapshot is < 1s. Scales linearly. Safe. |

**Confirm A2, A4, A8, A9 with the planner or via user clarification** — these affect schema and worker shape.

## Open Questions

1. **Per-formula required fields validation**
   - What we know: `SALES_PCT` needs `salesRate`; `UTILITY_PCT` needs `utilityRate`; `SALES_AND_UTILITY_PCT` needs both; `TIERED` needs tier rows.
   - What's unclear: schema enforcement — store all rate columns nullable and validate in service, OR split into separate tables?
   - Recommendation: keep nullable columns + service validation. Splitting would explode schema for marginal type safety.

2. **Should `ProviderCommissionLedger` store the `formulaType` + snapshot of rate/tier used at the time?**
   - What we know: requirement says config is looked up by effectiveFrom; ledger has a calculated `amount`.
   - What's unclear: for audit, do we need to denormalize "this commission was computed with rate=5.5% at the time"?
   - Recommendation: YES — add `configSnapshot Json` column on ledger with `{ formulaType, salesRate, utilityRate, tier: {minSales, maxSales, rate} | null }`. Cheap insurance; backfill reproducibility relies on it.

3. **Where does the per-week TIERED cumulative-sales SQL JOIN go — service or worker?**
   - What we know: the SQL is straightforward (see Pattern 3).
   - What's unclear: lifecycle — compute once for the whole batch, or once per provider per draw?
   - Recommendation: once per provider per draw. With ~4 providers × 6 draws/day, performance is fine. Optimize later if needed.

4. **DEPLOY.md cron line — what user runs it?**
   - The cron line: `0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot`
   - Out of session scope per orchestrator — but should be in DEPLOY.md for the eventual prod deploy.

5. **What does the UI show for a `DRAFT` settlement on Tuesday morning if Monday's cron didn't run?**
   - What we know: `ProviderWeeklySettlement` won't exist.
   - Recommendation: UI page for "this week" should detect missing snapshot and show a manual "Recompute" button (calls the snapshot worker directly). Optional UX polish; planner decides.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All backend code | ✓ | (system) | — |
| PostgreSQL 16 | Prisma + pg-boss | ✓ | 16 (docker) | — |
| pg-boss | Workers | ✓ | ^10.4.2 [VERIFIED] | — |
| decimal.js | Money math | ✓ | ^10.6.0 [VERIFIED] | — |
| date-fns | ISO week | ✓ | ^4.1.0 [VERIFIED] | — |
| date-fns-tz | VE timezone | ✓ | ^3.2.0 [VERIFIED] | — |
| ExcelJS | Excel export | ✓ | ^4.4.0 [VERIFIED] | — |
| PDFKit | PDF export | ✓ | ^0.17.2 [VERIFIED] | — |
| Phase 11 schema (DrawFinancial + DrawFinancialProvider) | Read source for compute | ✓ | Migrated locally per Phase 11 [VERIFIED via prisma/schema.prisma:1149,1178] | — |
| Phase 11 worker (calculate-draw-financials) | Generates source rows | ✓ | [VERIFIED: backend/src/queue/workers/calculate-draw-financials.worker.js] | — |
| Phase 11 commission queue placeholder | Pre-registered queue row | ✓ | [VERIFIED: register.js:108-112 + constants.js:18] | — |
| cron Linux on VPS | Prod weekly trigger | (LOCAL session — N/A) | — | DEPLOY.md handles it; out of session scope |
| Jest + `unstable_mockModule` | Tests | ✓ | (existing test infra used by Phase 11) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest with `NODE_OPTIONS='--experimental-vm-modules'` (ES modules) — already configured |
| Config file | `backend/package.json` script `test` |
| Quick run command | `cd backend && npm test -- --testPathPattern=commission` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIN-COMM-01 | All 4 formula types implemented | unit | `npm test -- --testPathPattern=commission.service` | ❌ Wave 0 |
| FIN-COMM-02 | SALES_PCT / UTILITY_PCT / SALES_AND_UTILITY_PCT math correct (table-driven) | unit | same | ❌ Wave 0 |
| FIN-COMM-03 | TIERED bracket resolution by cumulative weekly sales | unit | same | ❌ Wave 0 |
| FIN-COMM-04 | Effective config lookup picks correct historical row | unit | same | ❌ Wave 0 |
| FIN-COMM-05 | Worker writes ledger row after PRIZES | integration | `npm test -- --testPathPattern=calculate-provider-commission` | ❌ Wave 0 |
| FIN-COMM-06 | No config → warning logged, no row written | unit | same | ❌ Wave 0 |
| FIN-COMM-07 | Snapshot worker creates DRAFT settlement | integration | `npm test -- --testPathPattern=weekly-settlement-snapshot` | ❌ Wave 0 |
| FIN-COMM-08 | GET /api/commissions/ledger filters work | integration | `npm test -- --testPathPattern=commission.controller` | ❌ Wave 0 |
| FIN-COMM-09 | CONFIRMED settlement can't auto-update | unit | `commission.service.test.js` | ❌ Wave 0 |
| FIN-COMM-10 | PATCH confirm endpoint changes status | integration | `commission.controller.test.js` | ❌ Wave 0 |
| FIN-COMM-11 | Excel + PDF export buffer non-empty | unit | `commission.service.test.js` | ❌ Wave 0 |
| FIN-COMM-12 | Backfill aborts on pre-2026-04-17 draws | unit (script-driven) | manual: `node src/scripts/backfill-provider-commissions.mjs --dry-run` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern=commission`
- **Per wave merge:** `npm test` (full suite — includes Phase 11 regression coverage)
- **Phase gate:** Full suite green AND backfill `--dry-run` clean against local prod-mirror

### Wave 0 Gaps

- [ ] `backend/src/services/__tests__/commission.service.test.js` — covers FIN-COMM-01, 02, 03, 04, 06, 09
- [ ] `backend/src/queue/workers/__tests__/calculate-provider-commission.worker.test.js` — covers FIN-COMM-05, race-condition guard (Pitfall 7)
- [ ] `backend/src/queue/workers/__tests__/weekly-settlement-snapshot.worker.test.js` — covers FIN-COMM-07
- [ ] `backend/src/controllers/__tests__/commission.controller.test.js` — covers FIN-COMM-08, 10, 11
- [ ] `backend/src/queue/workers/__tests__/commission-pipeline.integration.test.js` — end-to-end live-DB test (mirror Phase 11 pattern)
- [ ] Manual: ISO week edge-case tests for `getISOWeekVE` (2026-12-29, 2027-01-01, 2027-01-04) within commission.service.test.js

Framework install: None needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse existing JWT `authenticate` middleware (`auth.middleware.js`) — no changes |
| V3 Session Management | yes | Same as above — JWT session, already in place |
| V4 Access Control | yes | `authorize('ADMIN')` on every `/api/commissions/*` route. Provider self-service is OUT OF SCOPE (D-deferred). |
| V5 Input Validation | yes | Service-layer validation on formula payloads (rate ranges 0-100, tier ordering, no negative amounts on snapshot writes). Reject `status` writes from clients. |
| V6 Cryptography | no | No crypto in this phase. (Webhook signature concerns are Phase 2 / Phase 9.) |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation: PROVIDER user reads other providers' ledger | Information Disclosure | `authorize('ADMIN')` on ALL commission routes. PROVIDER role explicitly NOT permitted in Phase 12 (provider portal deferred). |
| State tampering: client sends `{status: 'DRAFT'}` to un-confirm | Tampering | Backend has no PUT/PATCH endpoint that accepts `status` directly. Only dedicated `:id/confirm` and `:id/adjust` endpoints with their own validation. |
| Race condition: double-confirm leads to inconsistent audit | Tampering | `prisma.providerWeeklySettlement.update` with `where: { id, status: 'DRAFT' }` (compound where) — atomic; if status is already CONFIRMED, update affects 0 rows, controller returns 409. |
| Reproducibility attack: editing a config retroactively to inflate past commissions | Repudiation | Append-only `ProviderCommissionConfig` (F-5). `configSnapshot` JSON on ledger (Open Question #2) — even if append-only enforcement fails somewhere, the snapshot proves what was used. |
| Decimal precision attack on rate input | Tampering | Service validates `rate` is in `[0, 100]` with `decimal.js`; rejects scientific notation, NaN, Infinity. |
| Backfill running with stale code on prod-data import | Repudiation | Backfill writes reconciliation CSV with timestamps + script hash; CSV is the audit trail. |
| Missing CONFIRMED-state check on snapshot worker upsert | Tampering | Snapshot worker uses `findFirst + branch` (Pattern 7) — never blind upsert. |

## Sources

### Primary (HIGH confidence)

- `backend/prisma/schema.prisma` — Phase 11 DrawFinancial + DrawFinancialProvider definitions (lines 1149-1196), AuditLog (line 404), ApiSystem (line 428), UserRole enum (line 391)
- `backend/src/queue/register.js` — Phase 12 placeholder location (lines 108-112)
- `backend/src/queue/constants.js` — QUEUES + QUEUE_CONFIGS shape (already includes CALCULATE_PROVIDER_COMMISSION line 18)
- `backend/src/queue/workers/calculate-draw-financials.worker.js` — two-phase router pattern (D-13)
- `backend/src/queue/workers/step-process-prizes.worker.js` — chained boss.send pattern (lines 19-29, 49-59)
- `backend/src/services/draw-financial.service.js` — service-function pattern + D-08 findFirst+update/create
- `backend/src/services/accounting-report.service.js` — ExcelJS pattern
- `backend/src/controllers/monitor.controller.js` — PDFKit pattern (lines 130-200)
- `backend/src/middlewares/auth.middleware.js` — `authenticate` + `authorize` (lines 7-80)
- `backend/src/scripts/backfill-draw-financials.mjs` — Phase 11 backfill template
- `backend/src/scripts/trigger-pgboss-cron.mjs` — ALLOWED_QUEUES location (lines 32-45)
- `backend/src/lib/dateUtils.js` — VE timezone helpers (no ISO week yet — must add)
- `.planning/phases/11-drawfinancial-foundation/11-02-SUMMARY.md` — service+worker contract documented
- `.planning/phases/11-drawfinancial-foundation/11-03-SUMMARY.md` — pipeline wiring patterns

### Secondary (MEDIUM confidence)

- date-fns 4.1 `getISOWeek`, `getISOWeekYear`, `startOfISOWeek` — API verified in `node_modules/date-fns/getISOWeek*.js` (files present)
- date-fns-tz 3.2 `toZonedTime` — package installed; API behavior CITED from upstream README convention

### Tertiary (LOW confidence)

- None — every claim in this research either grep-verified against the codebase OR cited from a well-known stable library API. Items marked `[ASSUMED]` are assumption-log entries, NOT factual claims about external state.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs already installed and verified via grep
- Architecture: HIGH — every pattern has a Phase 11 (or earlier) precedent in the same codebase
- Pitfalls: HIGH — F-IDs come from project's own PITFALLS.md; concrete mitigations grounded in Phase 11 evidence
- Formula math: MEDIUM — locked by REQUIREMENTS.md but exact rounding boundaries depend on user-locked precision conventions (researcher's `.toFixed(8)` is consistent with Phase 11 decimal pattern, but planner should verify against an admin-supplied test vector if one exists)
- ISO week edge cases: HIGH — date-fns 4 API is stable and `getISOWeekYear` semantics are well-documented

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days — stack is stable, no library churn expected)
