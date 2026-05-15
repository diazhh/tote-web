# Tote-Web — Milestone v1.3 Requirements

**Milestone:** v1.3 Capa Financiera y Contabilidad
**Created:** 2026-05-15
**Goal:** Materializar agregados financieros por sorteo en DB para acelerar reportes, calcular comisiones automáticas por proveedor con liquidación semanal, e introducir un módulo contable multi-moneda (BsF funcional) con gestión de pagos, gastos y tasa de cambio.

---

## v1.3 Requirements

### Materialized Draw Aggregates (FIN-AGG)

- [ ] **FIN-AGG-01**: System materializes `DrawFinancial` row (totalSales, ticketCount) automatically when a draw transitions to CLOSED via pg-boss worker chained from `close-and-ingest.worker.js`
- [ ] **FIN-AGG-02**: System materializes `DrawFinancial` row (totalPrize, utility, totalizedAt) automatically when prizes finish processing via pg-boss worker chained from `step-process-prizes.worker.js`
- [ ] **FIN-AGG-03**: Materialized aggregates attribute sales and prizes via `TicketDetail.drawId` (not `Ticket.drawId`), resolving the multi-draw webhook ticket bug at the source of truth
- [ ] **FIN-AGG-04**: System materializes `DrawFinancialProvider` rows (one per `apiSystemId` per draw) with per-provider sales/prizes breakdown to feed commission calculations
- [ ] **FIN-AGG-05**: Operator can run a backfill script that populates `DrawFinancial` and `DrawFinancialProvider` for all historical DRAWN draws (~2600+) without colliding with the live pipeline
- [ ] **FIN-AGG-06**: Worker is idempotent — re-running it for a draw updates (upserts) the existing row instead of duplicating
- [ ] **FIN-AGG-07**: Worker refuses to compute `totalPrize`/`utility` when `Draw.prizesProcessed = false`, returning an explicit error rather than writing a zero-prize row

### Provider Commission Engine (FIN-COMM)

- [ ] **FIN-COMM-01**: Admin can configure a commission formula per provider with type `SALES_PCT`, `UTILITY_PCT`, `SALES_AND_UTILITY_PCT`, or `TIERED`
- [ ] **FIN-COMM-02**: For `SALES_PCT` / `UTILITY_PCT`, admin sets a single rate (e.g. 5.5%); for `SALES_AND_UTILITY_PCT`, admin sets two rates
- [ ] **FIN-COMM-03**: For `TIERED`, admin configures a bracket table (`minSales`, `maxSales`, `rate`) stored in a `ProviderCommissionTier` table; brackets resolve by weekly cumulative sales of that provider
- [ ] **FIN-COMM-04**: Commission config is append-only with `effectiveFrom DateTime` — changing the formula creates a new row; commission calculation looks up the config effective at `draw.drawnAt`, not the current config
- [ ] **FIN-COMM-05**: System writes a `ProviderCommissionLedger` row per (provider, draw) automatically after prize processing completes via pg-boss worker `calculate-provider-commission`
- [ ] **FIN-COMM-06**: Missing or undated commission config for a provider produces a skipped ledger row with a warning log, never blocks the pipeline
- [ ] **FIN-COMM-07**: System produces a `ProviderWeeklySettlement` snapshot per (provider, ISO year, ISO week) every Monday at 06:00 VE via cron Linux + `weekly-settlement-snapshot` worker
- [ ] **FIN-COMM-08**: Admin can view per-draw commission ledger filtered by provider and date range
- [ ] **FIN-COMM-09**: Admin can view weekly settlements with status `DRAFT` / `CONFIRMED` / `ADJUSTED`; once confirmed, the settlement amount is frozen even if a draw is re-totalized
- [ ] **FIN-COMM-10**: Admin can transition a settlement from `DRAFT` to `CONFIRMED` via explicit action
- [ ] **FIN-COMM-11**: Admin can export a weekly settlement as Excel and PDF reusing existing ExcelJS/PDFKit pattern
- [ ] **FIN-COMM-12**: Operator can run a backfill script that calculates and writes commission ledger rows for all DRAWN draws between **2026-04-17** and the day of deployment, using the commission config effective at that historical date

### Exchange Rate Management (FIN-RATE)

- [ ] **FIN-RATE-01**: Admin can enter the daily BsF-per-USD exchange rate manually with required fields: `date` (unique), `rateBsPerUsd`, `rateType` (BCV / PARALELO / OTRO), and `notes` (optional)
- [ ] **FIN-RATE-02**: Exchange rate entries are immutable after creation — no UPDATE endpoint exists. To correct a rate, admin must insert a new row dated later
- [ ] **FIN-RATE-03**: All rate entries carry `createdById` (audit trail) and `createdAt` timestamp
- [ ] **FIN-RATE-04**: System rejects USD-denominated accounting entries when no `ExchangeRate` row exists for the entry's date — the operator must enter today's rate first
- [ ] **FIN-RATE-05**: Admin can view the historical exchange rate timeline with rate type filter

### Multi-Currency Accounting Ledger (FIN-LEDGER)

- [ ] **FIN-LEDGER-01**: Admin can create an `AccountingEntry` of type `INCOME`, `EXPENSE`, or `PAYMENT` with required fields: `entryDate`, `categoryId`, `amountBsF`, `description`
- [ ] **FIN-LEDGER-02**: Admin can specify entry amount in either BsF or USD; if USD, system computes `amountBsF` using the `ExchangeRate` for `entryDate` and stores `originalAmount`, `originalCurrency`, and `exchangeRateId` for auditability
- [ ] **FIN-LEDGER-03**: Reports always display the historical BsF amount and the historical USD equivalent (`amountBsF / historicalRate`) — never re-converts using today's rate
- [ ] **FIN-LEDGER-04**: Admin can upload a receipt or invoice file (PDF, JPG, PNG, max 5MB) attached to an entry; files are stored at `backend/storage/receipts/YYYY/MM/{uuid}.{ext}` with server-side MIME validation
- [ ] **FIN-LEDGER-05**: Receipt files are served via an admin-only auth-gated route, not directly from the filesystem
- [ ] **FIN-LEDGER-06**: Admin can configure expense categories (CRUD) — categories are not hard-coded in the schema
- [ ] **FIN-LEDGER-07**: Admin can link a `PAYMENT` entry to a `ProviderWeeklySettlement` to mark it paid
- [ ] **FIN-LEDGER-08**: Admin can view and filter accounting entries by date range, type, category, and linked provider/settlement
- [ ] **FIN-LEDGER-09**: Admin can edit non-financial fields (description, category, attachment) on an existing entry; `amountBsF`, `entryDate`, and `exchangeRateId` are immutable after creation (corrections require a reversal entry)

### Report Refactor and Weekly P&L (FIN-REPORT)

- [ ] **FIN-REPORT-01**: `getDailyReport` and `getAccountingReport` services read from `DrawFinancial` instead of aggregating tickets at query time, gated by `REPORT_USE_MATERIALIZED` env flag
- [ ] **FIN-REPORT-02**: When `REPORT_USE_MATERIALIZED=true`, daily/accounting reports show per-draw totals correctly for multi-draw webhook tickets (the v1.2 bug disappears transparently)
- [ ] **FIN-REPORT-03**: The legacy aggregation code path is preserved behind the env flag for rollback; report endpoint signatures and response shapes are unchanged
- [ ] **FIN-REPORT-04**: Admin can view a per-draw financial card on the existing draw detail page showing materialized sales, prizes, utility, ticket count, and per-provider breakdown
- [ ] **FIN-REPORT-05**: Admin can view a weekly P&L dashboard: total draw income (from `DrawFinancial`) minus commissions (from `ProviderWeeklySettlement`) minus expenses (from `AccountingEntry`) = net balance in BsF with USD equivalent column
- [ ] **FIN-REPORT-06**: Weekly P&L view drill-down links to the underlying commission ledger and accounting entry lists for the selected week
- [ ] **FIN-REPORT-07**: Admin can export the weekly P&L view as Excel and PDF

---

## Future Requirements (deferred)

These were considered for v1.3 but deferred to v1.4+:

- Automated exchange rate scraping (BCV/paralelo APIs) — manual entry preferred for auditability and tasa paralela volatility
- OCR receipt scanning for `AccountingEntry`
- Recurring expense templates
- Bank statement reconciliation
- Monthly cohort devaluation view (inflation impact visualization)
- Commission tier configurator UI with drag-to-reorder brackets (v1.3 ships with basic CRUD)
- Multi-user accounting permissions (audit log of who entered what beyond `createdById`)
- Provider notification on settlement confirmation
- Retroactive rate change with full commission re-calculation

## Out of Scope

Explicit exclusions with reasoning:

- **Double-entry bookkeeping and chart of accounts** — single-entry ledger is sufficient for current operational scale; double-entry adds complexity without operator-perceived value
- **Tax calculations / VAT reporting** — not a regulated entity at this scale
- **Payroll** — handled outside the system
- **Multi-entity / consolidation** — single operator entity only
- **Budgeting and forecasting** — not in operator workflow
- **Multi-user accounting permissions beyond single admin role** — current operator team is small enough that role granularity adds friction without value
- **Real-time per-webhook commission display** — would add latency to the hot path; commission is calculated post-totalization
- **Automatic bank transfer to providers for settlement payment** — settlements are paid manually outside the system; legal/compliance surface area not justified
- **Multi-level commission chains (sub-affiliates)** — provider hierarchy not in current business model
- **Refund / cancellation P&L tracking beyond CANCELLED ticket exclusion** — refund flow does not exist in the current product

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| (Filled by roadmapper) | | |
