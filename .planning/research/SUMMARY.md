# Project Research Summary

**Project:** Tote-Web v1.3 — Capa Financiera y Contabilidad
**Domain:** Financial layer added to a live Venezuelan lottery operator — materialized aggregates, provider commissions, multi-currency accounting
**Researched:** 2026-05-15
**Confidence:** HIGH

---

## Executive Summary

v1.3 adds a financial intelligence layer on top of an already-operational lottery draw pipeline. The core problem is that all financial reporting currently runs O(N draws × M tickets) aggregations at query time over ~2,600+ historical draws — a bottleneck that grows with every new draw. The solution is a materialized `DrawFinancial` row populated by pg-boss workers at two hook points (draw close for sales, prize processing for P&L), which becomes the shared foundation for commission calculations and accounting reports. This is a "read-from-precalculated" refactor pattern, not a greenfield build: the domain logic already exists in `accounting-report.service.js`; the change is in where the aggregation happens.

The recommended approach builds in strict dependency order across four phases. Phase 1 creates the materialized aggregate foundation (including a historical backfill of ~2,600 draws). Phase 2 builds the commission engine on top of those aggregates. Phase 3 adds the multi-currency accounting ledger. Phase 4 completes the loop by refactoring existing report services to read from materialized data and adds the weekly P&L view. Each phase is independently deployable and gated by an env flag, so the live draw pipeline is never at risk. Two new npm packages are needed: `decimal.js` (commission math) and `multer` (receipt upload). Everything else is already installed.

The critical risks are: (1) the multi-draw ticket attribution bug — if the DrawFinancial worker aggregates via `Ticket.drawId` instead of `TicketDetail.drawId`, it replicates an existing data bug into the new canonical source of truth; (2) the pg-boss `createQueue` silent drop — prior incidents have been caused by registering a worker without first calling `boss.createQueue()`, which causes all queued jobs to return `null` and disappear silently; (3) the production `PUBLISHED` enum removal — the backfill script will crash immediately on VPS 94 if it references `PUBLISHED`, which no longer exists in the production enum. These three must be addressed in Phase 1 before any production data is touched.

---

## Key Findings

### Recommended Stack

The stack additions for this milestone are minimal. All report export tooling (ExcelJS 4.4.0, PDFKit 0.17.2), scheduling (date-fns 4.1.0, date-fns-tz 3.2.0), and ORM (Prisma with `Decimal @db.Decimal`) are already installed. The only two packages to add are `decimal.js` (for commission formula arithmetic with proper rounding modes) and `multer` (for receipt file upload). The frontend already has `recharts` for any chart needs; `Intl.NumberFormat` handles BsF/USD display formatting without adding a currency library.

**What to install — complete list:**

| Package | Version | Location | Command | Reason |
|---------|---------|----------|---------|--------|
| `decimal.js` | 10.6.0 | backend | `npm install decimal.js` | Prisma internally uses decimal.js — same type avoids conversion. Required for TIERED bracket rounding modes (ROUND_HALF_UP). |
| `multer` | 2.1.1 | backend | `npm install multer` | Receipt/invoice file upload for `AccountingEntry.attachmentUrl`. No upload middleware exists today. |

**What NOT to add:** dinero.js (overkill — BsF and USD are separate columns, not currency-typed), superjson (solves RSC problem this project does not have), MinIO/R2 (admin receipt volume is dozens/month; VPS local disk is adequate), Luxon (date-fns already covers ISO weeks), accounting.js/currency.js (Intl.NumberFormat is sufficient for display).

**Decimal column precision convention:**
- `Decimal @db.Decimal(15, 4)` for rate/percentage config fields (`commissionRate`, `rateBsPerUsd`, tiered bracket thresholds)
- `Decimal @db.Decimal(12, 2)` for final ledger amounts (`DrawFinancial.totalSales`, `AccountingEntry.amountBsF`)
- `NUMERIC(18, 8)` for commission ledger amounts in `ProviderCommissionLedger` — full precision to avoid rounding accumulation at settlement time

**Decision Points requiring explicit resolution before any code is written:**
- **DP-1:** Decimal precision tiers (above) — must be consistent across all new models
- **DP-2:** Receipt storage URL: relative path `storage/receipts/YYYY-MM/uuid.ext` (not absolute, not full URL)
- **DP-3:** `ProviderWeeklySettlement` must have `@@unique([apiSystemId, isoYear, isoWeek])` for idempotent upsert on settlement cron re-run

### Expected Features

The four feature categories map cleanly to the four build phases. The dependency chain is strict: commissions cannot be calculated without DrawFinancial aggregates; the weekly P&L cannot be assembled without both commission ledgers and accounting entries; the report refactor is not safe without the backfill completing successfully.

**Must have (table stakes — v1.3 is not useful without these):**

DrawFinancial:
- `totalSales`, `totalPrize`, `utility`, `ticketCount`, `closedAt`, `totalizedAt` per draw
- Worker `calculate-draw-financials` hooked into the existing pipeline (phase A at close, phase B at prize processing)
- Backfill script for all ~2,600 historical DRAWN draws
- `getDailyReport` and `getAccountingReport` refactored behind `REPORT_USE_MATERIALIZED` flag

Commissions:
- Commission formula config per `ApiSystem`: `SALES_PCT`, `UTILITY_PCT`, `SALES_AND_UTILITY_PCT`
- Per-draw `ProviderCommissionLedger` rows written post-totalization
- Weekly `ProviderWeeklySettlement` snapshots on Monday cron
- Admin UI: configure formulas, view ledger, confirm settlements

Accounting:
- `ExchangeRate` table (one rate per day, manual entry, immutable, with `rateType` field)
- `AccountingEntry` (INCOME/EXPENSE/PAYMENT) in BsF with optional `originalAmount`/`originalCurrency`
- Receipt/voucher attachment upload (PDF/JPEG/PNG, 5MB max, UUID filename, stored outside web root)
- Weekly P&L view: draw income (from DrawFinancial) minus commissions (from settlement) minus expenses (from entries) = BsF balance + USD equivalent column

**Should have (build if time allows):**
- `DrawFinancialProvider` sub-table for per-provider sales/prize breakdown (needed for commission worker to avoid full-table join)
- Settlement PDF export (reuse existing ExcelJS pattern)
- Commission approval workflow: PENDING -> CONFIRMED -> PAID with `paymentReference` field
- `AccountingCategory` CRUD in admin settings (configurable categories without code change)
- Monthly cohort devaluation view

**Defer to v1.4:**
- `TIERED` commission formula (requires `ProviderCommissionTier` table; complex; low urgency for current providers)
- Recurring expense templates
- BCV rate auto-scraping (explicitly excluded in PROJECT.md)
- Retroactive rate change with commission re-calculation

**The ERP boundary (must not cross):** no double-entry bookkeeping, no chart of accounts, no tax calculations, no bank reconciliation, no payroll, no multi-entity consolidation, no budgeting.

### Architecture Approach

The architecture extends the existing cron Linux -> `trigger-pgboss-cron.mjs` -> pg-boss workers pipeline with three new workers, two new schema modules, and a flag-gated report refactor. All new workers are wired as pipeline chain steps (called via `boss.send()` from existing workers) or as new cron entries for periodic snapshots. The existing report service signatures are preserved; only the internal data source changes.

**Major components:**

1. **`calculate-draw-financials` worker** — Two-phase: phase SALES triggered from `close-and-ingest.worker.js` (best-effort, wrapped in try/catch), phase PRIZES triggered from `step-process-prizes.worker.js` alongside existing `STEP_CALCULATE_STATS`. Single worker file, routes by `job.data.phase`. Upserts `DrawFinancial` and `DrawFinancialProvider` by `drawId`. On phase PRIZES completion, chains to commission worker.

2. **`calculate-provider-commission` worker** — Reads `DrawFinancialProvider` for the draw, looks up `ProviderCommissionConfig` effective at `draw.drawnAt` (not current config), applies formula, upserts `ProviderCommissionLedger`. No-ops with log if no config exists for a provider — does not block the pipeline.

3. **`weekly-settlement-snapshot` worker** — Triggered by new Monday 06:00 VE cron entry. Sums `ProviderCommissionLedger.amount` by provider for the previous ISO week, upserts `ProviderWeeklySettlement(status: DRAFT)`. Admin manually confirms settlements.

4. **`accounting.service.js`** — Entry creation with currency conversion logic. Enforces rate lookup by `entryDate`. Blocks USD-denominated entries if no `ExchangeRate` row exists for today (does not default to yesterday's rate).

5. **Report refactor (flag-gated)** — `REPORT_USE_MATERIALIZED=true` env flag swaps the internal aggregation in `accounting-report.service.js` and `monitor.service.js` from `prisma.draw.findMany({ include: tickets })` to `prisma.drawFinancial.findMany()`. Old path kept for rollback. Report service signatures unchanged.

6. **New admin frontend section** — `/admin/financiero/` umbrella with sub-routes: `sorteos/` (per-draw financial view), `comisiones/` (commission config + ledger), `comisiones/liquidaciones/` (weekly settlements), `contabilidad/` (accounting entries + P&L), `contabilidad/tasa-cambio/` (exchange rates). Added to existing `layout.js` nav as "Financiero" section below "Reportes".

**Modified files (surgical, no regressions):**

| File | Change | Risk |
|------|--------|------|
| `queue/workers/close-and-ingest.worker.js` | One `boss.send()` inside try/catch after close | Low |
| `queue/workers/step-process-prizes.worker.js` | One `boss.send()` alongside existing chain | Low |
| `queue/constants.js` + `register.js` | Three new queue names + worker registrations | Additive |
| `scripts/trigger-pgboss-cron.mjs` | New queue names in `ALLOWED_QUEUES` | Additive |
| `services/accounting-report.service.js` | Flag-gated path swap | Medium — test required |
| `services/monitor.service.js` | Flag-gated path swap | Medium — test required |
| `frontend/app/admin/layout.js` | New nav section | Additive |
| VPS `/etc/cron.d/tote-triggers` | Monday settlement cron line | Deploy step, not in git |

**Untouched:** `step-calculate-stats.worker.js`, `execute-draw*.worker.js`, `prize-processor.service.js`, all webhook adapters, all SRQ sync workers.

### Critical Pitfalls

**Top 5 risks the roadmap MUST address — in order of severity:**

1. **F-3: Multi-draw ticket attribution bug replication (Phase 1)** — The existing `accounting-report.service.js` aggregates `Ticket.totalAmount` by `Ticket.drawId`, which overcounts sales for multi-play tickets. If the DrawFinancial worker does the same, the bug becomes canonical. The fix: aggregate via `TicketDetail.drawId` always: `SUM(td.amount) FROM TicketDetail td JOIN Ticket t ON t.id = td.ticketId WHERE td.drawId = :drawId AND t.status != 'CANCELLED'`. Must be the primary aggregation method from day one, enforced with a test.

2. **F-11: pg-boss createQueue silent job loss (Phase 1)** — `boss.work()` does NOT create the queue row in `pgboss.queue`. `boss.send()` returns `null` and the job disappears silently if the row does not exist. Every new worker registration in `register.js` must call `await boss.createQueue(QUEUES.X)` immediately before `await boss.work(QUEUES.X, ...)`. Smoke test after deploy: `SELECT name FROM pgboss.queue;` — all new queue names must be present.

3. **F-10: PUBLISHED enum error on production (Phase 2 — backfill)** — VPS 94 production enum is `{SCHEDULED, CLOSED, DRAWN, CANCELLED}` — `PUBLISHED` was removed. Any query with `status = 'PUBLISHED'` throws a PostgreSQL enum cast error (not 0 rows — a crash). Backfill script must filter by `status = 'DRAWN'` only, and must run an enum check as its first line.

4. **F-1: Aggregate written before prize processing completes (Phase 1)** — If the DrawFinancial worker runs when `draw.prizesProcessed = false`, it produces a row with `totalPrize = 0` and reports 100% margin. The worker must guard: `if (!draw.prizesProcessed) throw new Error('prizes not processed yet')`. Check phase B completion via `DrawFinancial.totalizedAt IS NOT NULL`, not by adding a new boolean to `Draw`.

5. **F-5: Commission config change retroactive application (Phase 2)** — `ProviderCommissionConfig` must be append-only with `effectiveFrom DateTime`. Commission calculation looks up the config effective at `draw.drawnAt`, not the current config. Settlement snapshots sum `ProviderCommissionLedger` rows (already computed at draw time), not re-apply the current config to the week's total.

**Additional pitfalls requiring design decisions (full details in PITFALLS.md):**
- F-4: Commission rounding accumulation — use `NUMERIC(18,8)` in `ProviderCommissionLedger`; apply formula to weekly aggregate total, not per-ticket
- F-6: Missing exchange rate — block USD-denominated entries if no rate exists for today; never silently default to yesterday
- F-7: Historical rate re-conversion — USD equivalent = `amountBsF / historicalRate` (immutable at entry time), never `originalAmount / currentRate`
- F-8: Tasa paralela vs BCV unlabeled — `ExchangeRate` needs `rateType` field from day one; reports must display which rate type was used
- F-13: Worker recursion via `.execute()` — implement all new logic as service functions, not Croner-style classes
- F-14: Receipt upload security — MIME type validation server-side, UUID filename, 5MB limit, store outside web root

---

## Implications for Roadmap

The dependency chain is rigid: commission calculation requires DrawFinancial aggregates; weekly P&L requires both commissions and accounting entries; the report refactor requires the backfill to be complete and validated. This dictates a four-phase order with no flexibility on sequencing.

### Phase 1: DrawFinancial Foundation

**Rationale:** Everything in this milestone depends on `DrawFinancial`. Data quality bugs (F-1, F-3) and infrastructure bugs (F-11) must be solved here — not retrofitted later after the commission and accounting layers are built on top of bad data.

**Delivers:**
- New Prisma models: `DrawFinancial`, `DrawFinancialProvider`
- Worker `calculate-draw-financials` (phase SALES + phase PRIZES) registered with `boss.createQueue()` and wired into existing pipeline
- Backfill script `backfill-draw-financials.mjs` with production-safe guards (enum check, prizesProcessed guard, upsert pattern)
- Commission queue registered as no-op placeholder (prevents F-11 from blocking Phase 2 deployment)
- `decimal.js` and `multer` added to `backend/package.json`

**Must implement correctly:**
- Aggregation via `TicketDetail.drawId` (fixes F-3 at the source)
- `prizesProcessed = true` guard (prevents F-1)
- `boss.createQueue()` before `boss.work()` (prevents F-11)
- `status = 'DRAWN'` only in backfill, with startup enum check (prevents F-10)
- Service function pattern, not Croner-style class (prevents F-13)

**Avoids deploying Phase 2 before:** Backfill completes and spot-check SQL confirms `DrawFinancial.totalSales` matches manual `SUM(TicketDetail.amount WHERE drawId = ...)` for at least 10 sampled draws.

### Phase 2: Provider Commission Engine

**Rationale:** Depends on Phase 1 (`DrawFinancial` + `DrawFinancialProvider` rows must exist). Commission config schema must be versioned from the start (F-5) — this cannot be retrofitted.

**Delivers:**
- New Prisma models: `ProviderCommissionConfig` (append-only, `effectiveFrom`), `ProviderCommissionLedger` (NUMERIC(18,8)), `ProviderWeeklySettlement` (DRAFT/CONFIRMED/ADJUSTED)
- Worker `calculate-provider-commission` — reads `DrawFinancialProvider`, applies formula with `decimal.js`, upserts ledger
- Worker `weekly-settlement-snapshot` — Monday cron trigger on VPS `/etc/cron.d/tote-triggers`
- API: commission config CRUD, ledger viewer, settlement list + confirm action
- Frontend: `/admin/financiero/comisiones/` + `/admin/financiero/comisiones/liquidaciones/`

**Must implement correctly:**
- `ProviderCommissionConfig` is append-only with `effectiveFrom` (F-5)
- `ProviderCommissionLedger.amount` as `NUMERIC(18,8)` (F-4)
- Missing config = skip with log, not error (pipeline must not block)
- Deploy checklist includes `/etc/cron.d/tote-triggers` update (F-12) and `pgboss.queue` verification (F-11)
- Commission go-live date as an explicit constant — do NOT write ledger rows for pre-go-live draws (F-17)

### Phase 3: Exchange Rate + Accounting Ledger

**Rationale:** Depends on commission model (an `AccountingEntry` of type PAYMENT optionally links to a `ProviderWeeklySettlement`). Schema-level can be developed in parallel with Phase 2 at the schema level, but the FK linkage requires Phase 2 models to exist.

**Delivers:**
- New Prisma models: `ExchangeRate` (with `rateType` field from day one, immutable after creation), `AccountingCategory`, `AccountingEntry`
- `multer` receipt upload middleware, stored at `storage/receipts/YYYY/MM/uuid.ext`
- `accounting.service.js` with rate-required validation for USD entries
- API: exchange rate CRUD, accounting entry CRUD, receipt upload + serve (auth-gated)
- Frontend: `/admin/financiero/contabilidad/` + `/admin/financiero/contabilidad/tasa-cambio/`

**Must implement correctly:**
- `rateType` field on `ExchangeRate` from day one — not added later (F-8)
- USD entries require `exchangeRateId` in schema, not only UI (F-6)
- Receipt security: server-side MIME validation, UUID filename, 5MB limit, stored outside web root (F-14)
- ExchangeRate rows are immutable after creation — no UPDATE endpoint, only INSERT

### Phase 4: Report Refactor + Weekly P&L View

**Rationale:** Requires all prior phases deployed AND backfill validated in production. This is the payoff — reports become O(1) per draw, the multi-draw bug disappears transparently, and the weekly P&L becomes possible.

**Prerequisite gate:** `REPORT_USE_MATERIALIZED` flag stays `false` until: (a) Phase 1 backfill confirmed complete, (b) at least 2 weeks of live DrawFinancial data collected, (c) spot-check of 10+ draws confirms DrawFinancial totals match raw Ticket sums.

**Delivers:**
- `REPORT_USE_MATERIALIZED=true` flag path in `accounting-report.service.js` and `monitor.service.js`
- Old aggregation path kept behind `if (!useMaterialized)` for rollback
- New API endpoint `GET /api/admin/financiero/reporte-semanal`
- Frontend: `/admin/financiero/sorteos/` (per-draw financial view), `/admin/financiero/reporte-semanal/` (weekly P&L dashboard)

**Must implement correctly:**
- `USD equivalent = amountBsF / historicalRate` — never `originalAmount / currentRate` (F-7)
- Report service tested with historical entries to confirm no retroactive re-conversion
- Old report endpoints (`/reportes/`, `/reportes-contable/`) remain untouched

### Phase Ordering Rationale

- **Strict data dependency chain:** DrawFinancial -> commission ledger -> settlement -> weekly P&L. Building out of order would require retroactive data fixes at each step.
- **Risk isolation:** Each phase is independently deployable behind env flags. If Phase 2 commission calculations produce unexpected results, Phases 3 and 4 are unaffected.
- **Backfill before refactor:** Flipping `REPORT_USE_MATERIALIZED=true` before the backfill completes would make existing reports show zeros for historical draws. Phase ordering enforces this cannot happen.
- **Schema decisions are permanent:** The `rateType` field (ExchangeRate), `effectiveFrom` (ProviderCommissionConfig), and `NUMERIC(18,8)` precision (ProviderCommissionLedger) must be baked into initial migrations. These cannot be added as follow-on migrations without re-running historical calculations.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1:** Codebase inspection is the primary source. Hook points, upsert pattern, worker registration, and pipeline chaining are all well-documented in existing workers. No new technology.
- **Phase 4:** Flag-gated service swap is a well-understood technique. No new technology.

Phases that may benefit from brief planning-phase research:
- **Phase 2 — TIERED commission formula:** If the operator wants TIERED in v1.3 (rather than v1.4), the `ProviderCommissionTier` table design needs a dedicated planning session before the schema migration is written.
- **Phase 3 — Receipt storage backup:** No backup procedure for VPS 94 has been documented for the `storage/` directory. Establish before Phase 3 deploys.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 2 new packages. Versions verified via npm. Prisma/decimal.js internal relationship confirmed. All other dependencies confirmed installed. |
| Features | HIGH | Feature list directly from PROJECT.md scope + codebase inspection of existing services. Venezuela economic context confirmed by multiple sources. |
| Architecture | HIGH | Based entirely on direct codebase inspection of all relevant workers, services, and queue infrastructure. Hook points, idempotency keys, and failure modes all verified against actual code. |
| Pitfalls | HIGH | All critical pitfalls are verified against production memory files (pg-boss bug, enum bug, recursion pattern). Not theoretical risks — documented prior incidents. |

**Overall confidence: HIGH**

### Open Questions to Address Before or During Planning

1. **TIERED tier schema shape:** FEATURES.md recommends deferring TIERED to v1.4. ARCHITECTURE.md's Phase 2 schema shows `ProviderCommissionConfig.tiers Json?` as a placeholder. If the operator needs TIERED in v1.3, a `ProviderCommissionTier(configId, minSales, maxSales, rate)` table is the correct design but adds a model and join. **Decision needed before Phase 2 schema migration is written.**

2. **TAQUILLA_ONLINE ticket attribution in DrawFinancialProvider:** Only tickets with `Ticket.apiSystemId IS NOT NULL` get `DrawFinancialProvider` rows. TAQUILLA_ONLINE tickets (online players, `apiSystemId = null`) are excluded from per-provider breakdown. The weekly P&L "income" comes from `DrawFinancial.totalSales` (all sources) while "commission expense" comes from `ProviderCommissionLedger` (provider tickets only). This is architecturally correct but the split must be clearly labeled in the UI — otherwise the admin will think commissions are charged on all ticket sales. **Decision needed: how to label these totals in the weekly P&L view.**

3. **Disk usage on VPS 94 for receipts:** At 50 files/month x 5MB max = 250MB/month theoretical max, roughly 3GB/year. **Action before Phase 3:** run `df -h` and `du -sh /var/proyectos/tote-web/backend/storage/` on VPS 94. If available disk is under 10GB, establish a retention policy or plan for disk expansion before enabling uploads.

4. **ProviderCommissionConfig go-live date:** Commission ledger rows should not be written for historical draws (F-17). The go-live date must be an explicit constant in the Phase 2 configuration or migration. **Decision needed:** exact ISO date from which commissions apply (typically the date Phase 2 deploys to production).

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `backend/src/queue/workers/step-process-prizes.worker.js` — pipeline chaining, prizesProcessed flag
- `backend/src/queue/workers/step-calculate-stats.worker.js` — parallel output pattern
- `backend/src/queue/workers/close-and-ingest.worker.js` — close atomicity, best-effort pattern
- `backend/src/queue/register.js` — worker registration pattern with env flags
- `backend/src/queue/constants.js` — queue naming conventions
- `backend/src/scripts/trigger-pgboss-cron.mjs` — ALLOWED_QUEUES pattern
- `backend/src/services/accounting-report.service.js` — current O(N x M) aggregation being replaced
- `backend/src/services/monitor.service.js` — getDailyReport aggregation
- `backend/prisma/schema.prisma` — existing model structure and Decimal field patterns
- `.claude/projects/.../memory/MEMORY.md` — pg-boss createQueue bug, PUBLISHED enum removal, worker recursion pattern (all confirmed prior incidents)

### Primary (HIGH confidence — npm verified)

- `decimal.js` 10.6.0 — npm view confirmed; Prisma internal usage confirmed via prisma/prisma issue #9170
- `multer` 2.1.1 — npm view confirmed; ESM interop confirmed
- `date-fns` 4.1.0 + `date-fns-tz` 3.2.0 — confirmed installed; ISO week functions verified present
- `exceljs` 4.4.0 — confirmed in `backend/package.json`

### Secondary (MEDIUM confidence — contextual)

- US state lottery retailer commission programs (Oregon OAR 177-040-0025, Iowa, Maine) — weekly settlement cycle and SALES_PCT formula range (5-8%)
- Venezuela economic context (Caracas Chronicles 2025-04-09, Euronews 2026-01-01) — parallel rate gap, de facto dollarization, IAS 21/IAS 29 functional currency guidance rationale
- Prisma money storage: Prisma discussion #10160, Crunchy Data "Working with Money in Postgres" — Decimal column recommendation, avoid `@db.Money`

---

*Research completed: 2026-05-15*
*Ready for roadmap: yes*
