# Roadmap: Tote-Web

## Milestones

- ✅ **v1.0 Multi-Provider Webhook System** - Phases 1-4 (shipped 2026-04-01)
- ✅ **v1.1 Reports Dashboard** - Phases 5-7 (shipped 2026-04-07)
- 🚧 **v1.2 Webhook Provider Integration (Virtuales)** - Phases 8-10 (in progress)
- 🔜 **v1.3 Capa Financiera y Contabilidad** - Phases 11-14 (planned)

## Phases

<details>
<summary>✅ v1.0 Multi-Provider Webhook System (Phases 1-4) - SHIPPED 2026-04-01</summary>

### Phase 1: Schema Foundation
**Goal**: The database schema supports PUSH providers — ApiSystem can describe its mode and carry a token, and WebhookLog can store raw payloads with processing status
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03
**Success Criteria** (what must be TRUE):
  1. ApiSystem rows have slug, webhookToken, and mode fields; existing SRQ row has slug backfilled to 'srq' without breaking existing queries
  2. WebhookLog model exists and can store a raw payload, provider reference, processing status, and timestamp
  3. WebhookLog.status accepts exactly four values: DISCOVERED, PROCESSED, DUPLICATE, FAILED
  4. Prisma migration runs cleanly against both local and production schema without data loss
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Write schema (step 1: nullable slug) + backfill script + execute full 3-step local deployment
- [x] 01-02-PLAN.md — SSH production deployment + human health-check verification

### Phase 2: Webhook Backend Pipeline
**Goal**: Any provider with a valid token can send a POST to `/api/webhooks/:slug` and receive a safe, logged response — discovery mode captures unknown payloads, adapter routing creates tickets when an adapter exists, and the PULL sync cannot clobber PUSH tickets
**Depends on**: Phase 1
**Requirements**: WHOOK-01, WHOOK-02, WHOOK-03, WHOOK-04, WHOOK-05, WHOOK-06
**Success Criteria** (what must be TRUE):
  1. A POST to `/api/webhooks/:slug` with a valid `X-Webhook-Token` header returns 200 and creates a WebhookLog entry
  2. A POST with an invalid or missing token returns 401 and nothing is logged or created
  3. When no adapter file exists for the provider slug, the payload is logged with status DISCOVERED and the request returns 200
  4. When an adapter file exists, the payload is normalized and a Ticket is created in real-time; duplicate payloads (same drawId + externalTicketId) create a DUPLICATE log entry rather than a second Ticket
  5. Token comparison uses crypto.timingSafeEqual so timing attacks cannot distinguish valid from invalid tokens
  6. The sync-api-tickets job deleteMany is scoped to source='EXTERNAL_API' only, protecting PUSH-created tickets (source='WEBHOOK') from deletion
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Add @@unique([drawId, externalTicketId, source]) to Ticket + create adapters directory
- [x] 02-02-PLAN.md — Create webhook pipeline files (auth middleware, service, controller, routes)
- [x] 02-03-PLAN.md — Wire route in index.js, local smoke test, production deploy

### Phase 3: Admin Provider Management
**Goal**: Admin operators can manage providers entirely through the UI — creating PUSH providers with slugs, generating and rotating tokens, and seeing at a glance which providers are in discovery mode versus adapter-ready
**Depends on**: Phase 2
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Admin can create a new provider and select PULL or PUSH mode; the provider list shows a mode badge (PULL/PUSH) for every provider
  2. Admin can set or edit a provider's slug (auto-generated from name on creation, editable before save)
  3. Admin can generate a webhook token for a PUSH provider; the token is shown once in full immediately after generation, then masked in all subsequent views
  4. Admin can regenerate a token for an existing PUSH provider; the old token is immediately invalidated
  5. Each provider in the list shows an adapter status badge: "Ready" if an adapter file exists for its slug, "Discovery" if it does not
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Backend: extend controller (createSystem/updateSystem/generateToken/getAdapterStatus) + TDD tests for ADMIN-01..06
- [x] 03-02-PLAN.md — Frontend: mode + adapter badges in system list; extended SystemModal with slug/mode/token panel
- [x] 03-03-PLAN.md — Production deploy: git pull, pm2 restart, smoke test, human verification
**UI hint**: yes

### Phase 4: Webhook Log Viewer
**Goal**: Admin operators can see everything that has arrived via webhooks — browsing the full log table, filtering by provider or status, and inspecting individual payloads including raw headers
**Depends on**: Phase 3
**Requirements**: LOGS-01, LOGS-02, LOGS-03, LOGS-04
**Success Criteria** (what must be TRUE):
  1. Admin can navigate to the webhook log page and see a table of received payloads with columns: provider name, timestamp, status badge, and a truncated payload preview
  2. Admin can filter the log table by provider and by status (DISCOVERED, PROCESSED, DUPLICATE, FAILED) independently or in combination
  3. Admin can click any log entry to open an inspector modal showing the full raw JSON payload with readable formatting
  4. The inspector modal includes a headers section showing the HTTP request headers that arrived with the payload
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Backend endpoint (getWebhookLogs + route) + frontend logs page + tab link + TDD tests
- [x] 04-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: yes

</details>

---

<details>
<summary>✅ v1.1 Reports Dashboard (Phases 5-7) - SHIPPED 2026-04-07</summary>

### Phase 5: Backend Reports Foundation
**Goal**: The backend is ready to serve comprehensive report data — the crash is fixed and the endpoint supports date range, source, and provider filters plus game-level and provider-level aggregations
**Depends on**: Phase 4
**Requirements**: FIX-01, BACK-01, BACK-02, BACK-03
**Success Criteria** (what must be TRUE):
  1. /admin/reportes loads in the browser without a client-side crash or white screen
  2. GET /api/monitor/reporte accepts dateFrom and dateTo query params and returns draws within that range
  3. GET /api/monitor/reporte accepts source and apiSystemId query params and filters ticket aggregations accordingly
  4. The endpoint response includes a gameBreakdown array (one entry per game with sales/prizes/profit) and a providerBreakdown array (one entry per source with totals)
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — FIX-01 import fix + backend getDailyReport extension (BACK-01/02/03) + unit tests (TDD)
- [x] 05-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: no

### Phase 6: Reports Dashboard Frontend
**Goal**: Admin can explore draw financials through a rebuilt reports page — choosing date range, game, and provider, seeing summary cards, and drilling into a paginated sortable detail table
**Depends on**: Phase 5
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04, SUMM-01, SUMM-02, SUMM-03, DETL-01, DETL-02, DETL-03
**Success Criteria** (what must be TRUE):
  1. Admin can set a from/to date range and the summary cards and detail table both update to reflect only draws within that range
  2. Admin can filter by game (all or a specific game) and the entire page reflects only that game's data
  3. Admin can filter by source (Online, SRQ, Webhook) or by specific provider (ApiSystem), and totals recalculate
  4. Summary cards show correct total sales, total prizes, total profit, and ticket count for the active filters
  5. The breakdown tables show per-game and per-provider aggregated totals as separate rows
  6. The detail table lists each draw with date, time, game, winner, sales, prizes, balance, and ticket count; supports pagination and sorting by date/time
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — Rebuild reportes/page.js (filter bar, summary cards, breakdown tables, paginated+sortable detail table) + update monitor API client
- [x] 06-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: yes

### Phase 7: PDF Export + Production Deploy
**Goal**: Admin can download the current filtered report as a PDF and the feature is live in production
**Depends on**: Phase 6
**Requirements**: EXPO-01
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Download PDF" and a PDF file downloads to their machine containing the current filter state, summary cards, and detail table
  2. The PDF reflects the active filters (date range, game, provider) at the moment of download — not a static snapshot of all data
  3. The feature works correctly in production at 144.126.150.120
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Backend getReportePdf endpoint (PDFKit, streams PDF) + frontend Descargar PDF button (fetch+blob)
- [x] 07-02-PLAN.md — Production deploy: git push, VPS pull, frontend build, pm2 restart, human verification
**UI hint**: yes

</details>

---

### 🚧 v1.2 Webhook Provider Integration (Virtuales) (In Progress)

**Milestone Goal:** Build the complete webhook adapter for provider "virtuales" to process real-time bets — slot-based draw resolution, animal/number GameItem mapping, ticket creation with multi-play support, draw status validation, and acceptance/rejection response contract.

#### Phase 8: Adapter Implementation
**Goal**: The virtuales adapter fully processes incoming webhook payloads — resolving draw slots to daily Draw UUIDs, mapping numbers to GameItems, creating multi-play tickets, and rejecting invalid bets with clear reasons
**Depends on**: Phase 7
**Requirements**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, VALID-01, VALID-02, VALID-03, VALID-04
**Success Criteria** (what must be TRUE):
  1. A webhook payload with a valid `drawSlotId` (1-48) resolves to the correct daily Draw UUID for the correct game and draw time
  2. A webhook payload with `number: "05"` creates a Ticket linked to the GameItem whose `number` field equals "05" in the resolved game; the `animal` field is used as optional cross-validation
  3. A payload with `plays: [{...}, {...}]` creates one Ticket with one TicketDetail per play entry
  4. A payload with `drawSlotId` sent as a string (e.g., `"12"`) is parsed correctly and resolves the same as the integer `12`
  5. Payloads targeting a Draw with status `DRAWN`, `CANCELLED`, or `CLOSED` are rejected with a descriptive reason string rather than creating a ticket
  6. Payloads with a `drawSlotId` outside 1-48 or not present in the slots config are rejected with a clear reason
  7. Payloads with a `number` that matches no GameItem in the resolved game are rejected with a clear reason
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — TDD: Virtuales adapter (draw slot resolution, GameItem mapping, multi-play, all validations) + unit tests
- [x] 08-02-PLAN.md — Wire rejection handling + per-detail drawId into webhook.service.js + tests

#### Phase 9: Response Contract
**Goal**: The webhook endpoint returns structured acceptance/rejection data so providers know whether each bet was processed or why it was refused
**Depends on**: Phase 8
**Requirements**: RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. A successful ticket creation returns `{ received: true, logId, ticket: { id, status: "ACCEPTED" } }` in the response body
  2. A rejected bet (any validation failure) returns `{ received: true, logId, ticket: { status: "REJECTED", reason: "..." } }` where reason describes the specific failure
  3. A payload arriving with no adapter (discovery mode) continues to return `{ received: true, logId }` without a ticket field — existing behavior is unchanged
**Plans**: TBD

Plans:
- [ ] 09-01-PLAN.md — Update webhook.service.js + webhook.controller.js to thread ticket result through the response; verify discovery mode unchanged

#### Phase 10: Production Deployment
**Goal**: The virtuales adapter is live in production, end-to-end tested with the provider sending real payloads, and webhook tickets appear in reports
**Depends on**: Phase 9
**Requirements**: DEPL-01, DEPL-02
**Success Criteria** (what must be TRUE):
  1. The adapter file is renamed from `virtuales.adapter.draft.js` to `virtuales.adapter.js` on the VPS and the provider list shows the "Ready" badge for virtuales
  2. The provider sends a real test payload and the system returns `{ received: true, logId, ticket: { id, status: "ACCEPTED" } }` with the ticket visible in the database
  3. The provider sends a payload for a closed draw and receives `{ received: true, logId, ticket: { status: "REJECTED", reason: "..." } }` — no spurious ticket created
**Plans**: TBD

Plans:
- [ ] 10-01-PLAN.md — Production deploy (rename adapter, git pull, pm2 restart) + E2E test with provider + verify tickets appear in reports

---

## Phase Details

### 🔜 v1.3 Capa Financiera y Contabilidad

**Milestone Goal:** Materializar agregados financieros por sorteo en DB para acelerar reportes, calcular comisiones automáticas por proveedor con liquidación semanal, e introducir un módulo contable multi-moneda (BsF funcional) con gestión de pagos, gastos y tasa de cambio.

**Build order rationale:** DrawFinancial aggregates (Phase 11) are the foundation that commission calculations (Phase 12) read from. Exchange rates and accounting entries (Phase 13) can begin as soon as Phase 12's schema migration lands — the only cross-phase FK dependency is `AccountingEntry → ProviderWeeklySettlement`, so Phase 13 schema work runs in parallel with Phase 12 workers and UI. The report refactor (Phase 14) is gated last because flipping `REPORT_USE_MATERIALIZED=true` before the Phase 11 backfill is validated would expose zeros for all historical draws.

---

### Phase 11: DrawFinancial Foundation
**Goal**: Every completed draw has a materialized `DrawFinancial` row in the database — including all ~2600 historical draws — computed via `TicketDetail.drawId` so multi-draw tickets are correctly attributed from day one
**Depends on**: Phase 10 (v1.2 complete)
**Requirements**: FIN-AGG-01, FIN-AGG-02, FIN-AGG-03, FIN-AGG-04, FIN-AGG-05, FIN-AGG-06, FIN-AGG-07
**Success Criteria** (what must be TRUE):
  1. After a draw closes, a `DrawFinancial` row exists with `totalSales` and `ticketCount` populated; after prizes process, the same row is updated with `totalPrize`, `utility`, and `totalizedAt`
  2. For any draw, `SELECT SUM(amount) FROM TicketDetail WHERE drawId = :id` matches `DrawFinancial.totalSales` — discrepancies flag that the worker aggregated via `Ticket.drawId` instead
  3. Re-running the worker for an existing draw updates the row (upsert) rather than throwing a duplicate-key error
  4. The worker refuses to write `totalPrize` for a draw where `Draw.prizesProcessed = false` and throws an explicit error instead of writing a zero-prize row
  5. After running the backfill script, `SELECT COUNT(*) FROM DrawFinancial` matches the count of DRAWN draws in the database; a 10-draw spot-check SQL confirms totals match manual `TicketDetail` sums
**Plans**: 4 plans

Plans:
- [ ] 11-01-PLAN.md — Prisma schema additions (DrawFinancial + DrawFinancialProvider) + [BLOCKING] local migration + decimal.js
- [ ] 11-02-PLAN.md — draw-financial.service.js (TicketDetail.drawId aggregation, NULL-aware upsert, PrizesNotProcessedError) + calculate-draw-financials.worker.js (two-phase routing) + constants.js + register.js (real worker + Phase 12 commission placeholder) + unit tests
- [ ] 11-03-PLAN.md — Pipeline integration: phase-SALES boss.send in close-and-ingest (3 return paths) + phase-PRIZES boss.send in step-process-prizes + integration test against live local DB
- [ ] 11-04-PLAN.md — backfill-draw-financials.mjs (chunked + resumable, --dry-run + --confirm gates, F-10 enum guard, full reconciliation CSV) + 11-DEPLOY.md production deploy procedure
**Pitfall mitigations**: F-1 (prizesProcessed guard), F-2 (upsert pattern in both worker and backfill), F-3 (TicketDetail.drawId aggregation), F-10 (DRAWN-only enum check in backfill), F-11 (boss.createQueue before boss.work), F-13 (service function pattern, not Croner class)

---

### Phase 12: Provider Commission Engine
**Goal**: Commissions are calculated automatically per draw, frozen in a weekly settlement ledger, and fully manageable from the admin UI — including TIERED bracket formulas and a historical backfill from 2026-04-17
**Depends on**: Phase 11 (DrawFinancial rows and DrawFinancialProvider rows must exist)
**Requirements**: FIN-COMM-01, FIN-COMM-02, FIN-COMM-03, FIN-COMM-04, FIN-COMM-05, FIN-COMM-06, FIN-COMM-07, FIN-COMM-08, FIN-COMM-09, FIN-COMM-10, FIN-COMM-11, FIN-COMM-12
**Success Criteria** (what must be TRUE):
  1. Admin can create a commission config for a provider, choose formula type (SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, or TIERED), enter rates/brackets, and the config appears in the provider list immediately; changing the formula creates a new versioned row without altering the previous one
  2. After a draw totalizes, a `ProviderCommissionLedger` row appears for each provider that has tickets in that draw, with `amount` calculated using the commission config effective at `draw.drawnAt` (not the current config)
  3. A provider with no commission config produces a warning log and a skipped ledger entry — the draw pipeline does not stop or retry
  4. Every Monday at 06:00 VE, a `ProviderWeeklySettlement` row appears (status DRAFT) for each provider with ledger activity in the previous ISO week; re-running the cron upserts rather than duplicating
  5. Admin can view per-draw commission ledger filtered by provider and date range, drill into a weekly settlement, confirm it (status moves to CONFIRMED, amount frozen), and export to Excel/PDF
  6. After running the commission backfill script for 2026-04-17 to deployment date, `ProviderCommissionLedger` contains rows only for draws on or after that date; no ledger rows exist for older draws
**Plans**: TBD
**Pitfall mitigations**: F-4 (NUMERIC(18,8) precision, decimal.js ROUND_HALF_UP), F-5 (effectiveFrom append-only config), F-9 (compensating negative rows for cancellations), F-12 (/etc/cron.d/tote-triggers update in deploy checklist), F-15 (ISO week boundary pinned in dateUtils.js), F-17 (go-live constant 2026-04-17; no ledger rows before this date)
**Note on parallel execution**: Phase 13 schema migration can begin once this phase's Prisma migration (`ProviderWeeklySettlement`) is deployed. Phase 13 does not need Phase 12's workers or UI to be complete.
**UI hint**: yes

---

### Phase 13: Exchange Rate + Accounting Ledger
**Goal**: Admin can record daily exchange rates (immutable, typed by BCV/PARALELO/OTRO) and create accounting entries in BsF or USD with receipt attachments — all stored with full audit trail and linked to commission settlements when applicable
**Depends on**: Phase 12 schema migration (ProviderWeeklySettlement model must exist for the PAYMENT→settlement FK); can run in parallel with Phase 12 workers and UI work
**Requirements**: FIN-RATE-01, FIN-RATE-02, FIN-RATE-03, FIN-RATE-04, FIN-RATE-05, FIN-LEDGER-01, FIN-LEDGER-02, FIN-LEDGER-03, FIN-LEDGER-04, FIN-LEDGER-05, FIN-LEDGER-06, FIN-LEDGER-07, FIN-LEDGER-08, FIN-LEDGER-09
**Success Criteria** (what must be TRUE):
  1. Admin can enter a daily rate with date, rateBsPerUsd, rateType (BCV/PARALELO/OTRO), and optional notes; the rate is visible in the historical timeline immediately; attempting to POST to the same date again creates a new row, it does not overwrite the existing one
  2. Submitting a USD-denominated accounting entry on a date with no `ExchangeRate` row is blocked — the UI shows "No hay tasa de cambio para [date] — ingrese la tasa primero" and the submit button is disabled; the backend rejects it too
  3. Admin can create an INCOME, EXPENSE, or PAYMENT entry; USD entries automatically populate `amountBsF` using the rate for `entryDate`; the stored `amountBsF` never changes when a later rate is entered
  4. Admin can upload a PDF, JPG, or PNG receipt (max 5MB); the file is stored as `storage/receipts/YYYY/MM/{uuid}.ext`; uploading an `.html` or `.php` file is rejected with a 422 error
  5. Receipt files are served only through an admin-authenticated route; a direct URL to `storage/receipts/` without auth returns 401
**Plans**: TBD
**Pitfall mitigations**: F-6 (block USD entry when no rate for date), F-7 (historical USD eq = amountBsF / historicalRate, never re-converted), F-8 (rateType field on ExchangeRate from day one), F-14 (MIME validation, UUID filename, 5MB limit, storage outside web root), F-16 (no Account model; categories are configurable strings only)
**UI hint**: yes

---

### Phase 14: Report Refactor + Weekly P&L
**Goal**: Reports read from materialized `DrawFinancial` data eliminating the multi-draw attribution bug, and admin can view a weekly P&L dashboard combining draw income, commissions, and accounting entries with drill-down and export
**Depends on**: Phases 11, 12, 13 all complete AND Phase 11 backfill validated in production (2 weeks minimum of live DrawFinancial data; 10-draw spot-check passes)
**Requirements**: FIN-REPORT-01, FIN-REPORT-02, FIN-REPORT-03, FIN-REPORT-04, FIN-REPORT-05, FIN-REPORT-06, FIN-REPORT-07
**Success Criteria** (what must be TRUE):
  1. With `REPORT_USE_MATERIALIZED=true`, the daily report and accounting report return the same totals as before for draws with single-provider tickets; for draws with multi-play webhook tickets the per-draw figures are now correct (the multi-draw attribution bug is gone)
  2. Setting `REPORT_USE_MATERIALIZED=false` reverts to the previous aggregation path with unchanged response shapes — existing `/reportes/` and `/reportes-contable/` endpoints remain untouched
  3. The draw detail page shows a financial card with materialized sales, prizes, utility, ticket count, and per-provider breakdown sourced from `DrawFinancial` + `DrawFinancialProvider`
  4. Admin can view a weekly P&L dashboard: draw income (from DrawFinancial) minus commissions (from ProviderWeeklySettlement) minus expenses (from AccountingEntry) equals net BsF balance with a USD equivalent column; the rate type used is labeled on screen
  5. Admin can click a week row to drill down into the underlying commission ledger entries and accounting entries for that week; each drill-down opens a filtered list
**Plans**: TBD
**Prerequisite gate**: Do NOT flip `REPORT_USE_MATERIALIZED=true` until: (a) Phase 11 backfill confirmed complete via `SELECT COUNT(*) FROM DrawFinancial` vs DRAWN draw count, (b) at least 2 weeks of live DrawFinancial rows collected after Phase 11 deploy, (c) 10-draw spot-check SQL passes. Document gate passage in deploy notes before enabling.
**Pitfall mitigations**: F-7 (USD equivalent = amountBsF / historicalRate, tested with 6-month-old entries)
**UI hint**: yes

---

## Progress

**Execution Order:**
Phases 1-10 execute in numeric order. v1.3 phases: 11 → 12 → 13 (in parallel after Phase 12 schema) → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 2/2 | Complete | 2026-04-01 |
| 2. Webhook Backend Pipeline | v1.0 | 3/3 | Complete | 2026-04-01 |
| 3. Admin Provider Management | v1.0 | 3/3 | Complete | 2026-04-01 |
| 4. Webhook Log Viewer | v1.0 | 2/2 | Complete | 2026-04-01 |
| 5. Backend Reports Foundation | v1.1 | 2/2 | Complete | 2026-04-07 |
| 6. Reports Dashboard Frontend | v1.1 | 2/2 | Complete | 2026-04-07 |
| 7. PDF Export + Production Deploy | v1.1 | 2/2 | Complete | 2026-04-07 |
| 8. Adapter Implementation | v1.2 | 0/2 | Not started | - |
| 9. Response Contract | v1.2 | 0/1 | Not started | - |
| 10. Production Deployment | v1.2 | 0/1 | Not started | - |
| 11. DrawFinancial Foundation | v1.3 | 0/TBD | Not started | - |
| 12. Provider Commission Engine | v1.3 | 0/TBD | Not started | - |
| 13. Exchange Rate + Accounting Ledger | v1.3 | 0/TBD | Not started | - |
| 14. Report Refactor + Weekly P&L | v1.3 | 0/TBD | Not started | - |
