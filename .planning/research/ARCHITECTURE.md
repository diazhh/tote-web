# Architecture Research — v1.3 Financial Layer

**Domain:** Financial aggregates, provider commissions, and multi-currency accounting added to an existing Express/Prisma/pg-boss lottery system
**Researched:** 2026-05-15
**Confidence:** HIGH — based on direct inspection of all relevant source files

---

## System Context

The existing draw pipeline is:

```
cron Linux → trigger-pgboss-cron.mjs → boss.send(queueName)
                                              ↓
                              pg-boss workers inside tote-backend
                                              ↓
close-and-ingest → (preselect) → execute-draw → step-generate-image
                                              → step-notify-admins
                                              → step-publish-draw
                                              → step-process-prizes ← CRITICAL
                                                      ↓
                                              step-calculate-stats
```

Each step chains to the next via `boss.send()` at the end of the worker. `step-process-prizes` is the last billable action — it sets `prizesProcessed = true` on Draw and increments `Ticket.totalPrize` / `TicketDetail.prize`. After it completes, the financial reality of a draw is fixed.

`step-calculate-stats` writes to `DrawStats` (one row per draw) and sets `statsCalculated = true` and `pipelineStatus = 'COMPLETED'`. It is currently the final step.

`getDailyReport` and `getAccountingReport` both aggregate Ticket + TicketDetail at query time. They load every ticket for every draw in the date range into Node memory and sum. For a 90-day report covering ~2,000 draws with 50-200 tickets each, this is a 100k+ row Node-side aggregation.

`DrawStats` already stores `totalSales`, `totalPrize`, `grossProfit`, `ticketCount` — but it aggregates ALL tickets regardless of provider, which makes it unsuitable for per-provider commission calculations. It also has the multi-draw ticket attribution bug: for WEBHOOK_PUSH tickets where `TicketDetail.drawId != Ticket.drawId`, the prize is attributed to the wrong draw.

---

## Question 1: Where in the Pipeline to Hook DrawFinancial

### Decision: Hook into step-process-prizes via boss.send after that worker completes

Do NOT create a new cron trigger for DrawFinancial. It belongs in the pipeline as a new worker step chained immediately after `step-process-prizes`.

**Rationale:**

`step-process-prizes` is the moment prize reality is written. Immediately after it sets `prizesProcessed = true` and calls `boss.send(STEP_CALCULATE_STATS, ...)`, it should also call `boss.send(STEP_CALCULATE_DRAW_FINANCIALS, { drawId })`. The two workers can run concurrently — `DrawFinancial` and `DrawStats` are independent materialized outputs.

**Two-phase materialization:**

DrawFinancial must be populated in TWO phases because sales and prizes are known at different times:

- **Phase A (on CLOSED):** `totalSales`, `ticketCount` are final the moment the draw closes (no more bets accepted). Hook point: `close-and-ingest.worker.js`, after the atomic `updateMany(status: CLOSED)` succeeds.
- **Phase B (on DRAWN/prizes processed):** `totalPrize`, `utility`, `totalizedAt` become final after `step-process-prizes`. Hook point: `step-process-prizes.worker.js`, alongside the existing `boss.send(STEP_CALCULATE_STATS)`.

**Implementation pattern — phase A:**

At the end of `close-and-ingest.worker.js`, after the status update succeeds and before the function returns, call `boss.send('calculate-draw-financials-sales', { drawId, phase: 'SALES' })`. This worker aggregates `TicketDetail.amount WHERE TicketDetail.drawId = drawId` (not Ticket.drawId — this fixes the multi-draw bug at the source level).

**Implementation pattern — phase B:**

At the end of `step-process-prizes.worker.js`, alongside the existing `boss.send(STEP_CALCULATE_STATS)`, add `boss.send('calculate-draw-financials', { drawId, phase: 'PRIZES' })`. This worker reads `TicketDetail.prize WHERE TicketDetail.drawId = drawId` and updates the existing DrawFinancial row (upsert by drawId).

**Alternatively — single worker, two phases via payload:**

Use one queue name `calculate-draw-financials` and route by `job.data.phase`. This is cleaner (one queue to register, one worker file, one constant). The worker checks phase:

```javascript
if (phase === 'SALES') {
  // aggregate TicketDetail amounts by drawId
  // upsert DrawFinancial(drawId, totalSales, ticketCount, closedAt)
}
if (phase === 'PRIZES') {
  // aggregate TicketDetail prizes by drawId
  // also aggregate by apiSystemId for commission worker input
  // upsert DrawFinancial(drawId, totalPrize, utility, totalizedAt)
  // then boss.send('calculate-provider-commission', { drawId })
}
```

Recommendation: single worker with phase routing. Simpler registration, same idempotency guarantees.

**Partial sales materialization if step-process-prizes fails:**

YES — materialize sales at close (phase A) unconditionally. If prizes never get processed (pipeline stuck in FAILED), sales are still available for monitoring. The DrawFinancial row will have `totalSales` set but `totalPrize = null` and `totalizedAt = null`, which is a clearly incomplete state. Reports should treat NULL totalizedAt rows as "draw in progress" and exclude them from finalized P&L calculations.

**Idempotency strategy:**

Use `prisma.drawFinancial.upsert({ where: { drawId }, update: {...}, create: {...} })`. The drawId constraint is the natural idempotency key. pg-boss retry will re-run the worker; upsert ensures it writes the same values again with no side effects. Do NOT add `financialsCalculated` boolean to Draw — that couples a new concern to the existing model. Instead, check `DrawFinancial.totalizedAt IS NOT NULL` to know if phase B completed.

---

## Question 2: Commission Worker Dependency Chain

### Decision: commission worker runs as a boss.send() from the DrawFinancial worker (phase B), not inline

The commission worker is a separate worker registered under `calculate-provider-commission`. The DrawFinancial worker (phase B) calls `boss.send('calculate-provider-commission', { drawId })` at the end of its execution, after the upsert completes.

**Why separate:**

Commission calculation requires DrawFinancial to be complete (needs `totalSales`, `totalPrize`, `utility`). It also requires `ProviderCommissionConfig` to exist for the draw's provider(s). Separating it means:
- Commission failures do not roll back DrawFinancial writes
- Commission can be retried independently
- If config is missing, commission fails gracefully without blocking anything upstream

**Failure mode when ProviderCommissionConfig is missing:**

Skip with log — do NOT block totalization. The worker should:

```javascript
const configs = await prisma.providerCommissionConfig.findMany({
  where: { apiSystemId: { in: providerIds }, isActive: true }
});
if (configs.length === 0) {
  logger.info(`[commission] No active configs for draw ${drawId}, skipping`);
  return { skipped: true, reason: 'no_config' };
}
```

This allows draws from providers with no commission agreement to process without error. The DLQ will not be triggered. Operators can add commission config retroactively — the commission worker can be manually re-triggered for past draws via a backfill script.

**Per-provider aggregation:**

The DrawFinancial worker phase B must aggregate sales and prizes by `Ticket.apiSystemId` (or by joining `TicketDetail.drawId → Ticket.apiSystemId`) so the commission worker has per-provider totals without another full-table scan. Store these breakdowns in a `DrawFinancialByProvider` table or as a JSONB column on `DrawFinancial`. Recommendation: separate `DrawFinancialProvider` table with `(drawFinancialId, apiSystemId, totalSales, totalPrize, utility)` — cleaner for commission worker joins.

**Which providers get commission records:**

Only providers with `Ticket.apiSystemId IS NOT NULL` — i.e., WEBHOOK_PUSH, EXTERNAL_SCRAPE, and EXTERNAL_API (SRQ) sources. TAQUILLA_ONLINE tickets (userId set, apiSystemId null) represent direct player bets with no provider to pay commission to.

---

## Question 3: Weekly Settlement Worker

### Decision: cron Linux Monday 6am VE time → trigger-pgboss-cron.mjs weekly-settlement-snapshot

**Schedule:** Monday 06:00 VE (= 10:00 UTC) → add to `/etc/cron.d/tote-triggers`:

```
0 10 * * 1 root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs weekly-settlement-snapshot >> /var/log/tote-triggers.log 2>&1
```

The `weekly-settlement-snapshot` queue name must be added to:
1. `ALLOWED_QUEUES` set in `trigger-pgboss-cron.mjs`
2. `QUEUES` constant in `queue/constants.js`
3. `QUEUE_CONFIGS` in `queue/constants.js`
4. `register.js` with env flag `PGBOSS_WEEKLY_SETTLEMENT=true`

**"What week just closed" determination:**

ISO week number: the week that just closed is the week containing the Monday that just passed (i.e., the week PRIOR to the current week). Use `date-fns` (already available or trivially added):

```javascript
import { startOfISOWeek, endOfISOWeek, subWeeks } from 'date-fns';

const now = new Date();
const lastWeekStart = startOfISOWeek(subWeeks(now, 1)); // Monday 00:00 of last week
const lastWeekEnd   = endOfISOWeek(subWeeks(now, 1));   // Sunday 23:59 of last week
```

Store `isoWeek` as a string in format `YYYY-Www` (e.g. `2026-W20`) on `ProviderWeeklySettlement` for human readability and indexed lookup.

**Edge case: draw re-totalized after Monday:**

This happens when a draw's prizes are retroactively corrected (e.g., via the admin prize reprocessing endpoint) after the weekly snapshot already ran.

Recommended approach: the weekly settlement is a SNAPSHOT — it records the state as of Monday morning. If a draw is re-totalized, the `ProviderCommissionLedger` row is updated (upsert by drawId + apiSystemId), but the already-emitted `ProviderWeeklySettlement` is NOT automatically updated. Instead:

1. Add a `status` field to `ProviderWeeklySettlement`: `DRAFT | CONFIRMED | ADJUSTED`
2. Settlements start as `DRAFT` until admin manually confirms them
3. If a late retotalization touches a draw within a DRAFT settlement, the settlement's `status` returns to `DRAFT` and `adjustedAt` is set
4. If the settlement was already `CONFIRMED`, create an `ADJUSTED` correction record (don't mutate historical confirmed data)

This mirrors standard accounting: closed periods don't change, adjustments go in a new period. For now (MVP), it is acceptable to simply mark settlements as `DRAFT` and let the admin confirm before it becomes "locked."

---

## Question 4: Report Service Refactor

### Decision: swap internals of existing methods, keep signatures identical

Do NOT create new endpoints or deprecate the existing ones. The signature of `getDailyReport({ dateFrom, dateTo, gameId, source, apiSystemId })` and `getAccountingReport({ dateFrom, dateTo, gameId, source, apiSystemId })` must remain identical.

**Why keep the signature:** the frontend `app/admin/reportes/` and `app/admin/reportes-contable/` pages call these endpoints. Changing the API means frontend changes that create no user value.

**Refactor internals:**

Replace the `prisma.draw.findMany({ include: { tickets: ... } })` aggregation with:

```javascript
const rows = await prisma.drawFinancial.findMany({
  where: {
    draw: {
      drawDate: { gte: ..., lte: ... },
      ...(gameId && { gameId }),
    },
    totalizedAt: { not: null }, // only finalized draws
  },
  include: {
    draw: { select: { gameId: true, drawDate: true, drawTime: true, status: true, winnerItem: true } }
  }
});
```

For provider-filtered queries (`apiSystemId`), join to `DrawFinancialProvider`:

```javascript
const rows = await prisma.drawFinancialProvider.findMany({
  where: { apiSystemId, drawFinancial: { draw: { drawDate: { gte, lte } } } },
  include: { drawFinancial: { include: { draw: ... } } }
});
```

**Feature parity requirements:**

Both existing methods handle: date range filter, optional gameId filter, optional source filter, optional apiSystemId filter (with PUSH vs PULL mode routing), tripleta prize attribution, and cross-game aggregation. The refactored version must reproduce all of these. Specifically:

- **Multi-draw ticket attribution bug fix:** the refactored version reads from `DrawFinancial` which is populated by aggregating `TicketDetail.drawId` — not `Ticket.drawId`. This is the transparent fix described in PROJECT.md.
- **PULL provider routing:** `DrawFinancialProvider` rows are keyed by `apiSystemId`. For SRQ (PULL), tickets have `source=EXTERNAL_API` but `apiSystemId` is set (it's the SRQ ApiSystem UUID). So PULL vs PUSH distinction in reporting collapses — everything goes through `DrawFinancialProvider`.
- **No-source filter:** when `source = null` and `apiSystemId = null`, sum all `DrawFinancialProvider` rows for the draw or use the `DrawFinancial` totals directly.

**Backward compatibility guard:**

Add a feature flag `REPORT_USE_MATERIALIZED=true` (read from env). When false, keep the old aggregation path live. This lets you deploy the new schema + worker first, run the backfill, validate in production, then flip the flag. Rollback = set flag to false.

**Backfill strategy:**

One-shot script `backend/src/scripts/backfill-draw-financials.mjs`:

```
1. Find all draws WHERE status IN ('DRAWN', 'PUBLISHED') AND prizesProcessed = true
   ORDER BY drawDate ASC — oldest first
2. For each draw:
   a. Aggregate TicketDetail WHERE drawId = draw.id, status != CANCELLED
      → totalSales (sum amounts), totalPrize (sum prizes), ticketCount
   b. Per-provider: GROUP BY Ticket.apiSystemId
   c. Upsert DrawFinancial + DrawFinancialProvider rows
3. Log progress every 100 draws
4. Idempotent: can be re-run; upsert ensures no duplicates
```

Run time estimate: ~2,648 historical draws (per production stats). With ~50ms per draw (Prisma query + upsert), total runtime is ~2 minutes. Safe to run during off-peak. No downtime required.

---

## Question 5: Accounting Module File Storage

### Decision: local filesystem `backend/storage/receipts/` with UUID filename, path stored in AccountingEntry

Do NOT introduce S3/object storage for this milestone. The system already serves `backend/storage/bases/` for game images with no external storage. A similar pattern for receipts is consistent and avoids new infrastructure dependencies.

**File path structure:**

```
backend/storage/receipts/
  {year}/
    {month}/
      {accountingEntryId}-{originalFilename}
```

Example: `backend/storage/receipts/2026/05/uuid-factura-antel.pdf`

**Serving:** Express static middleware or a dedicated route `GET /api/admin/accounting/receipts/:entryId`. The dedicated route is preferred — it allows auth checks (only ADMIN can access receipts), whereas static middleware bypasses auth.

**Upload endpoint:** `POST /api/admin/accounting/entries/:id/receipt` using `multer` with `diskStorage`. Multer is not currently in the project — add it as a dependency.

**AccountingEntry schema:**

```
AccountingEntry {
  id
  type              INCOME | EXPENSE | PAYMENT
  amountBsF         Decimal  // functional currency
  originalAmount    Decimal? // populated if paid in non-BsF currency
  originalCurrency  String?  // "USD", "EUR", null if BsF
  exchangeRateId    String?  // FK to ExchangeRate used for conversion
  exchangeRate      ExchangeRate? @relation
  categoryId        String
  category          AccountingCategory @relation
  description       String
  referenceDate     DateTime  // when the transaction actually occurred
  attachmentUrl     String?   // relative path or null
  attachmentMime    String?   // "application/pdf", "image/jpeg", etc.
  // For linking to settlements
  providerId        String?   // FK to ApiSystem (nullable — not all entries are provider-related)
  apiSystem         ApiSystem? @relation
  weeklySettlementId String?  // FK to ProviderWeeklySettlement (nullable)
  weeklySettlement  ProviderWeeklySettlement? @relation
  createdBy         String    // admin userId
  createdAt         DateTime
  updatedAt         DateTime
}
```

**Multi-currency approach:**

Store `amountBsF` as the canonical value (functional currency). When the original transaction was in USD, store `originalAmount`, `originalCurrency = 'USD'`, and `exchangeRateId` pointing to the `ExchangeRate` row valid on the transaction date. This way:

- Reports can always sum `amountBsF` directly — no runtime conversion
- USD equivalent is computable as `amountBsF / exchangeRate.rateBsfPerUsd`
- Historical rates are immutable once set — no retroactive drift
- If the admin enters the amount directly in BsF (e.g., a local expense), `originalAmount` and `originalCurrency` are null and `exchangeRateId` is null

**ExchangeRate schema:**

```
ExchangeRate {
  id
  date        DateTime @db.Date @unique  // one rate per day
  rateBsfPerUsd Decimal @db.Decimal(16, 4)  // e.g. 98.50
  source       String?  // "BCV" | "PARALELA" | "MANUAL" — informational only
  notes        String?
  setBy        String   // admin userId
  createdAt    DateTime
  updatedAt    DateTime
  
  entries AccountingEntry[]
  @@index([date])
}
```

---

## Question 6: Admin UI Structure

### Decision: new top-level sections under /admin, not under /reportes

The existing `reportes` and `reportes-contable` routes are read-only reporting views. The new modules mix configuration + read, which does not belong under a "reportes" namespace.

**New frontend routes:**

```
frontend/app/admin/
  financiero/                    # NEW: umbrella section
    sorteos/page.js              # DrawFinancial per-draw view (replaces raw reportes-contable)
    comisiones/
      page.js                    # Commission config per provider
      liquidaciones/page.js      # Weekly settlement list
    contabilidad/
      page.js                    # AccountingEntry list + create modal
      tasa-cambio/page.js        # ExchangeRate management
    reporte-semanal/page.js      # Weekly P&L view (net income vs expenses)
```

**Admin nav integration:**

The existing admin `layout.js` has a nav list. Add a new "Financiero" section below the existing "Reportes" section. The new section contains: Sorteos Financieros, Comisiones, Liquidaciones, Contabilidad, Tasa de Cambio, Reporte Semanal.

**Existing report pages:**

`reportes/` and `reportes-contable/` remain untouched in this milestone. They will eventually become read-from-DrawFinancial once the backfill is validated. That migration is controlled by `REPORT_USE_MATERIALIZED` env flag.

---

## Question 7: Build Order

Dependencies govern this order strictly. Each phase must be deployable to production independently.

### Phase 1: DrawFinancial materialization (foundation for everything else)

**Schema changes:**
- `DrawFinancial` model: `(id, drawId @unique, gameId, totalSales, totalPrize, utility, ticketCount, closedAt, totalizedAt, createdAt, updatedAt)`
- `DrawFinancialProvider` model: `(id, drawFinancialId, apiSystemId, totalSales, totalPrize, utility, ticketCount, @@unique([drawFinancialId, apiSystemId]))`
- Add relations to `Draw` and `ApiSystem`

**New worker:**
- `backend/src/queue/workers/calculate-draw-financials.worker.js`
- Handles `phase: 'SALES'` (called from close-and-ingest) and `phase: 'PRIZES'` (called from step-process-prizes)
- Upserts `DrawFinancial` and `DrawFinancialProvider`
- On phase PRIZES: calls `boss.send('calculate-provider-commission', { drawId })` (the queue exists but is a no-op until Phase 2)

**Modified existing files:**
- `backend/src/queue/constants.js`: add `CALCULATE_DRAW_FINANCIALS: 'calculate-draw-financials'`
- `backend/src/queue/register.js`: register worker under `PGBOSS_DRAW_FINANCIALS=true` env flag
- `backend/src/queue/workers/close-and-ingest.worker.js`: add `boss.send('calculate-draw-financials', { drawId, phase: 'SALES' }, { singletonKey: \`df-sales-${drawId}\` })` after the status update — best-effort (wrapped in try/catch, failure does not stop close)
- `backend/src/queue/workers/step-process-prizes.worker.js`: add `boss.send('calculate-draw-financials', { drawId, phase: 'PRIZES' }, { singletonKey: \`df-prizes-${drawId}\` })` alongside the existing `boss.send(STEP_CALCULATE_STATS)`
- `backend/src/scripts/trigger-pgboss-cron.mjs`: add `calculate-draw-financials` to `ALLOWED_QUEUES` (needed for manual re-triggers from scripts)

**New backfill script:**
- `backend/src/scripts/backfill-draw-financials.mjs`
- Processes all `status IN ('DRAWN', 'PUBLISHED')` draws with `prizesProcessed = true`
- Idempotent upserts, safe to re-run

**Deliverable:** DrawFinancial populated going forward. Backfill script available. Report services unchanged (still use live queries). Commission queue registered but no worker logic yet.

### Phase 2: Provider commission engine

**Schema changes:**
- `ProviderCommissionConfig`: `(id, apiSystemId @unique, formulaType ENUM(SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED), pctSales Decimal?, pctUtility Decimal?, tiers Json?, isActive Boolean, createdAt, updatedAt)`
- `ProviderCommissionLedger`: `(id, apiSystemId, drawFinancialId, drawId @index, isoWeek String, amountBsF Decimal, formula Json, calculatedAt, @@unique([apiSystemId, drawFinancialId]))`
- `ProviderWeeklySettlement`: `(id, apiSystemId, isoWeek String @index, totalAmountBsF Decimal, status ENUM(DRAFT, CONFIRMED, ADJUSTED), snapshotAt DateTime, confirmedAt DateTime?, adjustedAt DateTime?, @@unique([apiSystemId, isoWeek]))`

**New workers:**
- `backend/src/queue/workers/calculate-provider-commission.worker.js`
  - Reads `DrawFinancialProvider` for the draw, applies commission formula per provider, upserts `ProviderCommissionLedger`
  - Missing config = skip with log (not an error)
- `backend/src/queue/workers/weekly-settlement-snapshot.worker.js`
  - Triggered Monday 06:00 VE by cron Linux
  - Determines last ISO week, sums `ProviderCommissionLedger.amountBsF` by provider
  - Upserts `ProviderWeeklySettlement(status: DRAFT)`

**Modified existing files:**
- `backend/src/queue/constants.js`: add `CALCULATE_PROVIDER_COMMISSION`, `WEEKLY_SETTLEMENT_SNAPSHOT`
- `backend/src/queue/register.js`: register both workers under `PGBOSS_COMMISSIONS=true`
- `backend/src/scripts/trigger-pgboss-cron.mjs`: add `weekly-settlement-snapshot` to `ALLOWED_QUEUES`
- VPS `/etc/cron.d/tote-triggers`: add Monday 06:00 UTC line

**New API:**
- `GET/POST /api/admin/financiero/comisiones` — commission config CRUD
- `GET /api/admin/financiero/ledger?apiSystemId&dateFrom&dateTo` — ledger viewer
- `GET/PUT /api/admin/financiero/liquidaciones` — settlement list + confirm action

**New frontend:**
- `app/admin/financiero/comisiones/page.js` — commission config table per provider
- `app/admin/financiero/comisiones/liquidaciones/page.js` — settlement list with confirm button

**Deliverable:** Commission calculated automatically post-totalization. Weekly settlements snapshotted Monday morning. Admin can confirm/view settlements.

### Phase 3: Exchange rate + accounting module

**Schema changes:**
- `ExchangeRate`: as specified above
- `AccountingCategory`: `(id, name, type INCOME|EXPENSE, isActive Boolean)`
- `AccountingEntry`: as specified above (including FK to ApiSystem and ProviderWeeklySettlement)

**New API:**
- `GET/POST /api/admin/financiero/tasa-cambio` — daily rate management
- `GET/POST/PATCH /api/admin/financiero/contabilidad` — accounting entries CRUD
- `POST /api/admin/financiero/contabilidad/:id/receipt` — file upload via multer
- `GET /api/admin/financiero/contabilidad/:id/receipt` — serve receipt file (auth-gated)

**New dependency:**
- Add `multer` to `backend/package.json`

**New service:**
- `backend/src/services/accounting.service.js` — entry creation with currency conversion logic, rate lookup by date

**New frontend:**
- `app/admin/financiero/contabilidad/page.js` — entry list, create/edit modal
- `app/admin/financiero/tasa-cambio/page.js` — rate table with inline add form

**Deliverable:** Manual accounting entries with receipt upload. Exchange rates tracked by day. Functional currency BsF throughout.

### Phase 4: Report services refactor + weekly P&L view

**Prerequisites:** Phases 1–3 deployed + backfill script executed successfully in production.

**Modified existing files:**
- `backend/src/services/accounting-report.service.js`: add `REPORT_USE_MATERIALIZED` flag path. When true, read from `DrawFinancial` + `DrawFinancialProvider` instead of aggregating tickets. Keep old path behind `if (!useMateriailized)` for rollback safety.
- `backend/src/services/monitor.service.js`: same treatment for `getDailyReport`. The existing `DrawStats` model is kept (it has different fields like `winnerCount`, `profitMargin` that are not in `DrawFinancial`). Only the `totalSales`/`totalPrize`/`utility`/`ticketCount` aggregation is swapped to read from `DrawFinancial`.

**New API:**
- `GET /api/admin/financiero/reporte-semanal?dateFrom&dateTo` — returns: per-provider commissions, gross income, net income (gross - commissions), accounting expenses/payments by category, final BsF balance, USD equivalent

**New frontend:**
- `app/admin/financiero/sorteos/page.js` — per-draw financial view with totalSales, totalPrize, utility, commissions breakdown
- `app/admin/financiero/reporte-semanal/page.js` — weekly P&L dashboard

**Deliverable:** Reports read from materialized aggregates (fast, O(1) per draw). Multi-draw bug fixed transparently. Weekly P&L view combining commissions + accounting expenses.

---

## Component Map: New vs Modified

### New files (additive only)

| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` additions | DrawFinancial, DrawFinancialProvider, ProviderCommissionConfig, ProviderCommissionLedger, ProviderWeeklySettlement, ExchangeRate, AccountingCategory, AccountingEntry |
| `queue/workers/calculate-draw-financials.worker.js` | Phase A+B materialization |
| `queue/workers/calculate-provider-commission.worker.js` | Per-draw commission calculation |
| `queue/workers/weekly-settlement-snapshot.worker.js` | Monday settlement snapshot |
| `services/accounting.service.js` | Currency conversion, entry creation |
| `scripts/backfill-draw-financials.mjs` | One-shot historical backfill |
| `routes/financiero.routes.js` | New admin financial API routes |
| `controllers/financiero.controller.js` | Handler layer for above |
| `frontend/app/admin/financiero/**` | All new financial UI pages |

### Modified files (surgical additions only)

| File | What Changes | Risk |
|------|-------------|------|
| `queue/constants.js` | Add 3 new queue names + configs | Additive, low |
| `queue/register.js` | Register 3 new workers under env flags | Additive, low |
| `scripts/trigger-pgboss-cron.mjs` | Add queue names to ALLOWED_QUEUES | Additive, low |
| `queue/workers/close-and-ingest.worker.js` | Add best-effort boss.send for phase A | 1 try/catch block added |
| `queue/workers/step-process-prizes.worker.js` | Add boss.send for phase B alongside existing STEP_CALCULATE_STATS | 1 boss.send added |
| `services/accounting-report.service.js` | Flag-gated path swap in getAccountingReport | Medium — needs thorough test |
| `services/monitor.service.js` | Flag-gated path swap in getDailyReport | Medium — needs thorough test |
| `frontend/app/admin/layout.js` | Add Financiero nav section | Additive |
| VPS `/etc/cron.d/tote-triggers` | Add Monday settlement line | Deploy step |

### Untouched (zero changes)

| File | Why Safe |
|------|----------|
| `queue/workers/step-calculate-stats.worker.js` | DrawStats and DrawFinancial are parallel outputs; stats worker not modified |
| `queue/workers/execute-draw*.worker.js` | Upstream of all new logic; no changes needed |
| `services/prize-processor.service.js` | No changes; step-process-prizes wrapper unchanged except for one boss.send |
| `routes/admin.routes.js` | Existing report endpoints unchanged |
| `webhooks/` directory | Commission is per-apiSystem, not per-webhook mechanism |
| SRQ sync workers | Commission picks up SRQ tickets via apiSystemId on Ticket, already set |

---

## Idempotency and Failure Mode Reference

| Worker | Idempotency Key | Failure Mode | Recovery |
|--------|----------------|--------------|---------|
| `calculate-draw-financials` (SALES) | `singletonKey: df-sales-{drawId}` | If fails, draw is CLOSED but DrawFinancial has no sales row. Retry via pg-boss. | Manual: re-send job from admin or backfill script |
| `calculate-draw-financials` (PRIZES) | `singletonKey: df-prizes-{drawId}` | If fails, DrawFinancial exists with NULL totalizedAt. Commission not triggered. | Retry via pg-boss; if exhausted, re-send manually |
| `calculate-provider-commission` | `@@unique([apiSystemId, drawFinancialId])` via upsert | If fails, ledger row missing for this draw. Settlement snapshot will undercount. | Re-send for specific drawId; settlement recalculates |
| `weekly-settlement-snapshot` | `@@unique([apiSystemId, isoWeek])` via upsert + status DRAFT | If runs twice, second upsert is idempotent (same values). | Safe to re-trigger |
| Report flag swap | `REPORT_USE_MATERIALIZED` env | If DrawFinancial incomplete (backfill not run), reports show zeros | Flip flag back to false; run backfill; flip forward again |

---

## Data Flow Diagram: New Pipeline Steps

```
cron Linux (every draw time)
    ↓
trigger-pgboss-cron.mjs close-and-ingest-sweep
    ↓
close-and-ingest.worker [MODIFIED]
    ├── atomic close (status: CLOSED)
    ├── SRQ ingest passes
    └── boss.send('calculate-draw-financials', { phase:'SALES' })  ← NEW (best-effort)
              ↓
         calculate-draw-financials.worker (phase SALES)  ← NEW
              ↓
         DrawFinancial.upsert(totalSales, closedAt)
         DrawFinancialProvider.upsert(per-provider sales)

[later — draw execution]
step-process-prizes.worker [MODIFIED]
    ├── processPrizesForDraw()
    ├── draw.prizesProcessed = true
    ├── boss.send(STEP_CALCULATE_STATS)          ← existing
    └── boss.send('calculate-draw-financials', { phase:'PRIZES' })  ← NEW
              ↓
         calculate-draw-financials.worker (phase PRIZES)  ← NEW
              ├── DrawFinancial.upsert(totalPrize, utility, totalizedAt)
              ├── DrawFinancialProvider.upsert(per-provider prizes)
              └── boss.send('calculate-provider-commission', { drawId })  ← NEW
                        ↓
                   calculate-provider-commission.worker  ← NEW
                        ├── load ProviderCommissionConfig per provider
                        ├── apply formula (SALES_PCT / UTILITY_PCT / TIERED)
                        └── ProviderCommissionLedger.upsert per provider

cron Linux (Monday 06:00 VE)
    ↓
trigger-pgboss-cron.mjs weekly-settlement-snapshot  ← NEW cron line
    ↓
weekly-settlement-snapshot.worker  ← NEW
    ├── sum ProviderCommissionLedger by provider for last ISO week
    └── ProviderWeeklySettlement.upsert(status: DRAFT)
```

---

## Scalability Considerations

| Concern | Current (2,600+ draws) | With DrawFinancial |
|---------|----------------------|-------------------|
| getDailyReport 90-day range | Loads ~50k+ Ticket rows into Node | Reads ~500 DrawFinancial rows — 100x faster |
| getAccountingReport 30-day | Loads ~15k+ Ticket rows | Reads ~150 DrawFinancial rows |
| Commission calculation | N/A | O(providers per draw) — typically 2-4 rows |
| Weekly settlement | N/A | O(providers) — sum over ~7 * draws_per_day rows |

---

## Sources

All findings are from direct codebase inspection. No external sources consulted.

- `backend/src/queue/workers/step-process-prizes.worker.js` — pipeline chaining pattern, idempotency flag
- `backend/src/queue/workers/step-calculate-stats.worker.js` — parallel output pattern, statsCalculated flag
- `backend/src/queue/workers/close-and-ingest.worker.js` — close atomicity pattern, best-effort pattern for SRQ
- `backend/src/queue/register.js` — worker registration pattern with env flags
- `backend/src/queue/constants.js` — queue naming conventions and QUEUE_CONFIGS shape
- `backend/src/scripts/trigger-pgboss-cron.mjs` — ALLOWED_QUEUES pattern, cron trigger mechanism
- `backend/src/services/accounting-report.service.js` — current aggregation approach, filter branching
- `backend/src/services/monitor.service.js` — getDailyReport aggregation approach
- `backend/prisma/schema.prisma` — Draw, Ticket, TicketDetail, DrawStats, ApiSystem, ProviderStats models

---

*Architecture research for: v1.3 Financial Layer in tote-web*
*Researched: 2026-05-15*
