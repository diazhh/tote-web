# Feature Landscape: v1.3 Financial Layer

**Domain:** Lottery operator financial management — draw P&L snapshots, provider commissions, multi-currency accounting, expense ledger
**Researched:** 2026-05-15
**Milestone:** v1.3 Capa Financiera y Contabilidad

---

## Category 1: Materialized Financial Aggregates per Draw (`DrawFinancial`)

### What This Replaces

The current `accounting-report.service.js` computes P&L by loading every `Ticket` and `TicketDetail` for every matching `Draw` at query time — O(N draws × M tickets). With ~2600+ DRAWN/PUBLISHED draws in production and growing, this is the primary report performance bottleneck.

The existing `DrawStats` model tracks sales/prizes/ticketCount at the draw level but lacks commissions accrued, provider attribution, and a `totalizedAt` timestamp. `DrawFinancial` is a purpose-built materialized row that survives `DrawStats` limitations and feeds commission calculation.

---

### Table Stakes (must have for v1.3 to be useful)

| Feature | Why Expected | Complexity | Model Dependencies |
|---------|--------------|------------|-------------------|
| `totalSales` per draw | Core revenue field — everything builds on this | S | `Ticket.totalAmount` (WHERE source != CANCELLED), scoped by `TicketDetail.drawId` |
| `totalPrize` per draw | Cost side of the P&L | S | `Ticket.totalPrize` + external TRIPLETA prize via `Ticket.prizeDrawId` |
| `utility` (= totalSales − totalPrize) | Operator's gross margin per draw | S | Derived from above two |
| `ticketCount` per draw | Volume metric; feeds commission `SALES_PCT` base | S | COUNT of non-CANCELLED Tickets for the draw |
| `closedAt` timestamp on snapshot | Audit trail of when the draw was totalized | S | `Draw.drawnAt` (copy at worker time) |
| `totalizedAt` timestamp | Idempotency key for commission worker chaining | S | Worker writes this on upsert |
| Worker `calculate-draw-financials` triggered post-prize-processing | Follows existing pg-boss pipeline pattern after `step-calculate-stats` | M | Chains from `step-calculate-stats.worker.js`; reads `Ticket` + `TicketDetail` + handles `prizeDrawId` TRIPLETA case |
| Backfill script for historical draws | ~2600 DRAWN/PUBLISHED draws need retroactive snapshots | M | Reads existing `DrawStats` + `Ticket` tables; safe read-only scan with upsert |
| `getDailyReport` and `getAccountingReport` refactored to read from `DrawFinancial` | Eliminates the O(N×M) hot path; fixes multi-draw ticket attribution bug | M | Replaces inline `prisma.draw.findMany({ include: { tickets } })` with `prisma.drawFinancial.findMany` |

### Differentiators (optional but valuable)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `refundedAmount` field | Track CANCELLED ticket value separately; needed if refund policies evolve | S | `Ticket.totalAmount WHERE status='CANCELLED'` |
| `detailCount` (bet line count) | Granularity below ticket; already in `DrawStats.detailCount` — worth promoting to `DrawFinancial` | S | Copy from `DrawStats` |
| Per-provider breakdown in snapshot | Commission worker needs `totalSales` by `apiSystemId` — storing this avoids a join at commission-calc time | M | `Json` field `salesByProvider: { [apiSystemId]: Decimal }` or separate `DrawFinancialByProvider` table |
| `profitMargin` % field | Visual metric for dashboard cards | S | Derived: `utility / totalSales * 100`, stored to avoid re-compute |

### Anti-Features (explicitly do not build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Tax withholding field on `DrawFinancial` | Tote operates outside regulated tax reporting; adds compliance noise with no operator benefit | Leave out of schema entirely — PROJECT.md explicitly excludes tax calculations |
| Unclaimed prize tracking | Relevant for state lotteries (multi-week jackpot). For same-draw resolution, prizes are processed immediately — there is no "unclaimed" concept | The prize processing pipeline already handles this synchronously |
| Accrual vs. cash distinction per draw | Single-entry ledger is declared scope; double-entry accrual tracking is double the model complexity for no operational gain at this scale | PROJECT.md explicitly excludes double-entry bookkeeping |
| Real-time streaming aggregate (PostgreSQL MATERIALIZED VIEW) | PG MATERIALIZED VIEW requires manual REFRESH and adds DDL complexity. pg-boss worker upsert achieves the same result with explicit control | Stick with worker-upserted table row; simpler, observable, retryable |

### Draw P&L UI — What Operators Expect

- **Per-draw drilldown:** admin clicks on a draw in the draws list → sees a financial card: Sales / Prizes / Utility / Ticket Count / Commission Accrued / Totalized At.
- **Daily rollup in `getAccountingReport`:** rows keyed by `(date, gameId)` — aggregates all draws for that day and game. This is the existing shape; `DrawFinancial` makes it O(1) per row.
- **Weekly P&L summary:** sum of daily rows over ISO week → Net Income (utility − commissions − expenses). This is the new v1.3 report.
- **Per-provider breakdown:** filter the accounting report by `apiSystemId` to see one provider's contribution. Already supported in `accounting-report.service.js`; `DrawFinancial` makes it fast.

---

## Category 2: Provider Commission Engine

### Context

`ApiSystem` is the provider model. Active providers: SRQ (PULL), premier (PUSH), virtuales (PUSH), maxplay (SCRAPE). Commission rates are per-`ApiSystem`, not per-game. The operator collects 100% of sales, then owes the provider a cut based on an agreed formula. Weekly settlement is the industry standard confirmed by US state lottery retailer programs (Oregon: 8% of weekly sales; Iowa: weekly cycle; Ohio: 5.5% weekly cycle).

---

### Table Stakes (must have for v1.3 to be useful)

| Feature | Why Expected | Complexity | Model Dependencies |
|---------|--------------|------------|-------------------|
| Commission formula config per `ApiSystem` | Different providers have different deals | S | New `ProviderCommissionConfig` model: `apiSystemId`, `formula`, `rate Decimal(5,4)`, `isActive`, `effectiveFrom` |
| Formula types: `SALES_PCT`, `UTILITY_PCT` | Two dominant models in betting reseller networks — % of gross sales (simple, auditable) or % of net utility (risk-sharing) | S | `CommissionFormula` enum on `ProviderCommissionConfig` |
| Formula type: `SALES_AND_UTILITY_PCT` | Hybrid: base % of sales + bonus % of utility above threshold | M | Requires `salesRate` + `utilityRate` + optional `utilityThreshold` fields on config |
| Per-draw commission ledger row | Audit trail: when was each commission calculated, for which draw, how much | M | New `ProviderCommissionLedger`: `apiSystemId`, `drawId`, `drawFinancialId`, `amount`, `formula`, `rate`, `calculatedAt` |
| Worker `calculate-provider-commission` | Runs post-`calculate-draw-financials`; reads `DrawFinancial`, applies formula, writes ledger | M | Chains from `calculate-draw-financials`; no-ops if no `ProviderCommissionConfig` for provider |
| Weekly settlement snapshot | Aggregates ledger rows over ISO week → one `ProviderWeeklySettlement` row per (provider, week) | M | New `ProviderWeeklySettlement`: `isoWeek` String, `apiSystemId`, `totalCommission`, `status PENDING/PAID` |
| Cron Linux trigger for weekly settlement | Follows existing `/etc/cron.d/tote-triggers` pattern; runs Monday morning for previous ISO week | S | New entry in cron file → `trigger-pgboss-cron.mjs` → new `weekly-settlement` worker |
| Admin UI: configure commission formula per provider | Admin sets formula type + rate in provider detail page | M | Frontend form in existing `/admin/proveedores/[slug]` page |
| Admin UI: commission ledger view | Table of per-draw commission entries filterable by provider and date range | M | New sub-route `/admin/proveedores/[slug]/comisiones` |
| Admin UI: weekly settlement view | List of settlement snapshots with status badges (PENDING / PAID) and manual mark-as-paid action | M | New sub-route `/admin/proveedores/liquidaciones` |

### Differentiators (optional but valuable)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `TIERED` commission formula | Unlock higher rates at higher volume thresholds — common in large-network iGaming affiliates | L | Requires `ProviderCommissionTier` table with `(configId, minSales, rate)`; rate-lookup at calc time |
| Minimum settlement threshold | Skip settlement generation if total < X BsF | S | `minSettlementAmount Decimal?` on `ProviderCommissionConfig` |
| Settlement PDF export | Formal statement showing draw-by-draw breakdown, total owed | M | Reuse existing `ExcelJS` pattern from `accounting-report.service.js` |
| Commission approval workflow | Explicit human checkpoint: PENDING → APPROVED → PAID | S | Add `approvedBy String?`, `approvedAt DateTime?`, `paidAt DateTime?`, `paymentReference String?` to `ProviderWeeklySettlement` |
| Retroactive rate change with re-calculation | Correct a rate and re-run commission for affected draws | L | Requires versioned `ProviderCommissionConfig` with `validFrom/validTo` date range; complex |

### Anti-Features (explicitly do not build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automatic bank transfer initiation | Triggers banking API integration (Pago Móvil, wire) — compliance/legal surface area is enormous | Mark settlement as PAID manually; store `paymentReference` string |
| Multi-level commission chains (comercializadora → banca → grupo → taquilla) | Hierarchy models already exist in schema but are explicitly out of scope for this milestone per PROJECT.md | Commission is per `ApiSystem` (top-level provider); sub-entity commissions are a future milestone |
| CPA (cost-per-acquisition) commission model | Relevant for marketing affiliates, not betting resellers who own the customer relationship | Resellers in Venezuela operate on revenue-split, not CPA |
| Real-time commission display per webhook event | Adds latency to the hot webhook path; commissions are a batch operation post-draw | Commission is calculated by pg-boss worker after draw totalization, not inline on ticket receipt |

### Commission Formula Reference

- **SALES_PCT** — `commission = totalSales × rate`. Simplest, verifiable against ticket records. US lottery retailer standard (5–8% weekly). Recommended default.
- **UTILITY_PCT** — `commission = max(0, utility) × rate`. Risk-sharing: zero commission on a draw where prizes exceed sales. Floors at zero — operator never owes provider money for a losing draw.
- **SALES_AND_UTILITY_PCT** — `commission = (totalSales × salesRate) + max(0, (utility − threshold)) × utilityRate`. Hybrid for high-volume providers with a performance component.
- **TIERED** — rate table keyed by `totalSales` band. Rewards volume. Defer to v1.4.

---

## Category 3: Multi-Currency Accounting (BsF Functional, USD Secondary)

### Context

Venezuela is hyperinflationary (611% annual inflation as of April 2026; Euronews reports the parallel rate gap at ~480% vs official). The "dólar paralelo" is the real pricing anchor — most businesses set prices and mentally account in USD, but transact in BsF. As of 2026, the country is effectively de facto dollarized but legally still BsF-functional.

The architectural decision already in PROJECT.md is correct: store all values in BsF (functional currency); store the rate snapshot at transaction time; display USD as a computed view. This is consistent with IAS 21 / IAS 29 functional currency guidance for hyperinflationary economies — you do not re-translate historical transactions at the current rate.

---

### Table Stakes (must have for v1.3 to be useful)

| Feature | Why Expected | Complexity | Model Dependencies |
|---------|--------------|------------|-------------------|
| Daily exchange rate entry by admin | Operator needs one rate per day (tasa paralela) to anchor all that day's transactions | S | New `ExchangeRate`: `id`, `date Date @unique`, `rateBsPerUsd Decimal(14,4)`, `source String?` (e.g., "BCV oficial", "Paralelo"), `enteredBy String`, `createdAt` |
| Rate history view | Audit trail; lets operator verify or correct a rate | S | Admin table at `/admin/contabilidad/tasas` |
| `exchangeRateId` FK on every `AccountingEntry` | Locks the USD equivalent at entry time; immune to future rate changes | S | FK on `AccountingEntry`; auto-populated from `ExchangeRate.findFirst({ where: { date: entryDate } })` |
| USD equivalent display on entries and reports | Core value: "Bs 150,000 / tasa 40 = $3,750 USD" alongside BsF amount | S | Computed in service layer: `amountBsF / rate.rateBsPerUsd`; not stored |
| Weekly P&L in both BsF and USD equivalent | Admin sees income BsF, expenses BsF, balance BsF — plus the USD column per week | M | Report query joins `AccountingEntry → ExchangeRate`; aggregates weekly |
| `originalAmount` + `originalCurrency` fields | Store what was actually invoiced if a vendor billed in USD | S | `originalAmount Decimal?`, `originalCurrency String?` enum: `BsF\|USD\|EUR` on `AccountingEntry` |
| Missing-rate warning | If admin creates an entry for a date with no rate, surface a warning | S | Service checks `ExchangeRate.findUnique({ where: { date } })` before save; returns `{ warning: 'no_rate_for_date' }` |

### Differentiators (optional but valuable)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Monthly cohort view (BsF vs USD per month) | Shows devaluation impact: "January $5,000 USD equivalent; March $3,200 at same BsF volume = 36% real devaluation" | M | Group entries by month, show `totalBsF + avgRate + usdEquivalent` per month |
| Rate delta alert on entry | If today's rate is >N% different from yesterday's, warn admin before save | S | Configurable threshold in `SystemConfig`; check on `ExchangeRate` save |
| Historical rate sparkline | Visual trend in admin UI | S | Frontend only; data already in `ExchangeRate` |
| Rate auto-suggest from BCV official feed | Pre-populate the BCV rate; admin confirms or overrides with parallel rate | M | Scrape `bcv.org.ve`; explicitly deferred in PROJECT.md to v1.4 |

### Anti-Features (explicitly do not build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automatic rate scraping or API polling | Explicitly excluded in PROJECT.md for v1.3. Parallel rate sources are informal (dolartoday, monitordolar) and legally grey in Venezuela | Manual entry only; admin enters once per day |
| USD as functional currency | BsF is required for local compliance. Switching functional currency mid-stream creates historical re-statement complexity and is not needed | Keep BsF as functional; show USD as a display column |
| EUR or COP columns in reports | Operator transacts in BsF and occasionally USD. Adding currencies multiplies the rate table and UI | `originalCurrency` enum supports EUR for edge cases but P&L is always BsF + USD equivalent |
| IFRS/IAS 29 price-level restatement tooling | Standard for regulated multinationals in hyperinflationary economies. Overkill for a single-entity operator | Not a regulated accounting entity at this scale |

---

## Category 4: Expense / Income Ledger with Receipts (`AccountingEntry`)

### Context

This is the lightest of the four modules but the one the admin will touch most frequently. The mental model is the physical notebook the admin currently keeps: "today I paid Bs 20,000 for internet, received Bs 450,000 from draw sales, paid premier Bs 15,000 commission." The goal is to replace that notebook with a searchable, auditable digital ledger that shows USD equivalents.

---

### Table Stakes (must have for v1.3 to be useful)

| Feature | Why Expected | Complexity | Model Dependencies |
|---------|--------------|------------|-------------------|
| Entry types: `INCOME`, `EXPENSE`, `PAYMENT` | Three fundamental transaction types: money in, money out for costs, money out for provider settlement | S | `AccountingEntryType` enum on `AccountingEntry` |
| `amountBsF Decimal(14,2)` | All entries stored in BsF | S | Large range required — at 611% inflation, amounts in millions of BsF are routine |
| `exchangeRateId` FK | Rate snapshot at entry time | S | FK to `ExchangeRate`; auto-populated |
| `category` field | "Servicios", "Infraestructura", "Nómina", "Comisión proveedor", "Ingreso sorteo" | S | FK to `AccountingCategory` table with `name` + `type` (INCOME/EXPENSE/PAYMENT) |
| `description` text | Free-form note | S | String on `AccountingEntry` |
| `entryDate Date` | The date the transaction occurred, not `createdAt`; back-dateable | S | `@db.Date`; defaults to today in UI |
| Receipt/voucher attachment upload | Photo of receipt or PDF of invoice | M | `attachmentUrl String?` on `AccountingEntry`; multipart upload to `backend/storage/receipts/` or S3-compatible |
| Entry list view with date-range filter | Admin sees all entries for a week/month, sorted by `entryDate` | S | Admin route `/admin/contabilidad/entradas` |
| Weekly P&L summary: income − commissions − expenses = balance | Core weekly report; shown in BsF with USD column | M | Query `AccountingEntry` grouped by ISO week; join `ExchangeRate` for USD column |
| `apiSystemId` tag on PAYMENT entries | Links a payment to the provider being settled | S | Optional FK to `ApiSystem` on `AccountingEntry` |

### Differentiators (optional but valuable)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Configurable categories via `AccountingCategory` CRUD | Admin adds/renames categories without code change | S | Simple CRUD in admin settings |
| `drawId` tag on INCOME entries | Links income to a specific draw; enables reconciliation | S | Optional FK to `Draw` on `AccountingEntry` |
| Recurring expense template | Internet, hosting, office rent — create once, auto-generate monthly entries | M | `RecurringExpense` model with `dayOfMonth`, `amount`, `category`; monthly pg-boss trigger |
| `createdBy` field for multi-user audit | Who entered each record | S | Already pattern in other models (e.g., `DrawItemQuota.createdBy`) |
| Entry edit history / immutable append | If admin corrects an amount, old value is preserved | M | JSON `changeLog` field or separate `AccountingEntryHistory` table |

### Anti-Features (explicitly do not build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| OCR receipt scanning | Requires Google Vision, AWS Textract, or Tesseract — external API dependency with meaningful complexity; payoff is small for a single-admin operation where the admin typed the amount anyway | Admin manually types the amount; attaches photo as visual reference |
| Bank statement reconciliation | Requires Open Banking API or manual CSV import + matching algorithm; enormous complexity for marginal gain | The ledger is the source of truth, not the bank |
| Chart of accounts / double-entry bookkeeping | Explicitly excluded in PROJECT.md | Single-entry ledger is sufficient |
| Purchase order / approval workflow | This is a single-admin operation; pre-authorization workflow adds UI complexity with no beneficiary | No workflow; admin enters directly |
| Tax line items (IGTF, IVA, ISLR) | Explicitly excluded in PROJECT.md | Add a `notes` field for manual tax references if ever needed |
| GL account codes | Needed for auditor hand-off; not an operational need now | Possible future field on `AccountingCategory` |
| Inventory or cost-of-goods tracking | Not applicable to a digital lottery operator | Not applicable |

---

## Feature Dependencies Map

```
Ticket + TicketDetail + Draw (existing)
        ↓
DrawFinancial worker (calculate-draw-financials)
  — triggered post step-calculate-stats in pg-boss pipeline
        ↓ feeds
ProviderCommissionLedger worker (calculate-provider-commission)
  — reads DrawFinancial.totalSales + DrawFinancial.utility
  — reads ProviderCommissionConfig for the apiSystem
        ↓ feeds
ProviderWeeklySettlement snapshot (weekly-settlement worker via Monday cron)
        ↓ feeds
Weekly P&L report
  — AccountingEntry (income/expense) + ProviderWeeklySettlement (commissions) + DrawFinancial (draw-level income)

ExchangeRate (daily manual entry by admin)
        ↓ required by
AccountingEntry (every entry requires a rate row for its entryDate)
        ↓ feeds
Weekly P&L USD column
```

Key constraint: `ProviderCommissionConfig` must exist for an `ApiSystem` before `calculate-provider-commission` does anything for that provider. The worker should no-op (log a notice, not fail the pipeline) if no config exists for that provider's draws.

---

## MVP Prioritization for v1.3

**Phase 1 — Foundation (unblocks everything else):**
1. `DrawFinancial` schema migration + `calculate-draw-financials` worker
2. Backfill script for historical draws
3. `ExchangeRate` schema + admin rate entry UI

**Phase 2 — Commission engine (highest operator value):**
4. `ProviderCommissionConfig` schema + admin config UI in existing provider page
5. `ProviderCommissionLedger` + `calculate-provider-commission` worker chained to Phase 1 worker
6. `ProviderWeeklySettlement` + weekly cron trigger + admin settlements UI

**Phase 3 — Accounting ledger + report refactor:**
7. `AccountingCategory` + `AccountingEntry` schema + attachment upload
8. Admin CRUD UI for entries + weekly P&L view
9. Refactor `getDailyReport` and `getAccountingReport` to read from `DrawFinancial` (the backfill from Phase 1 makes this safe)

**Defer to v1.4:**
- Tiered commission formula — complex, low urgency
- Recurring expense templates — convenience feature
- OCR receipt scanning — external API dependency
- Automatic rate scraping from BCV — explicitly deferred in PROJECT.md
- Monthly cohort devaluation view — valuable but not blocking any operation

---

## The ERP Trap — Explicit Boundary

The highest risk for this milestone is scope creep into full ERP territory. The following requests must be deferred or rejected:

1. **Double-entry bookkeeping** — Single-entry ledger is sufficient. No chart of accounts, no trial balance, no debit/credit pairs.
2. **Tax reporting** — No IGTF, IVA, or ISLR calculations. No tax schedule generation.
3. **Payroll** — No employee salary tracking, no payroll journal.
4. **Bank reconciliation** — The ledger is the source of truth; no bank feed.
5. **Multi-entity consolidation** — One operator, one ledger.
6. **Budgeting/forecasting** — Reports are historical only.

If any of these are requested during v1.3 implementation, they belong in a future milestone or a dedicated accounting system. The goal of v1.3 is an *operational dashboard for the operator*, not a system for an external auditor.

---

## Sources

- Codebase: `backend/prisma/schema.prisma` — existing model structure and field patterns
- Codebase: `backend/src/services/accounting-report.service.js` — current O(N×M) computation pattern being replaced
- Codebase: `backend/src/queue/workers/step-calculate-stats.worker.js` — worker chaining pattern to follow
- Project: `.planning/PROJECT.md` — v1.3 explicit scope decisions and out-of-scope list
- US state lottery retailer commission programs (Oregon OAR 177-040-0025, Iowa Lottery Retailer Compensation Rules, Maine Lottery Retailer Guide) — weekly cycle and SALES_PCT formula confirmation (5–8% of weekly gross sales)
- iGaming affiliate models (Scaleo.io, PartnerMatrix) — tiered and hybrid model pattern documentation
- Venezuela economic context (Caracas Chronicles 2025-04-09, Euronews 2026-01-01, IAS Plus 2014 Venezuela accounting considerations) — parallel rate gap, de facto dollarization, functional currency guidance
- ERP scope creep research (TechTarget, abas ERP, Kwixand) — anti-pattern framing for single-entry vs double-entry scope decision
