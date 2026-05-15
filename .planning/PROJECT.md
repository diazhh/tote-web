# Tote-Web

## What This Is

A lottery management system with real-time draw execution, multi-channel result publication (Telegram, WhatsApp, Facebook, Instagram, TikTok), player betting, and prize processing. The codebase is split into a Node.js/Express backend and a Next.js frontend with PostgreSQL via Prisma ORM.

## Core Value

Reliable draw lifecycle management — draws execute on schedule, results publish to all channels, and prizes are processed correctly. Everything else builds on this.

## Current Milestone: v1.3 Capa Financiera y Contabilidad

**Goal:** Materializar agregados financieros por sorteo en DB para acelerar reportes, calcular comisiones automáticas por proveedor con liquidación semanal, e introducir un módulo contable multi-moneda (BsF funcional) con gestión de pagos, gastos y tasa de cambio.

**Target features:**

**Agregados materializados (`DrawFinancial`):**
- Tabla `DrawFinancial` (drawId, gameId, totalSales, totalPrize, utility, ticketCount, closedAt, totalizedAt)
- Worker pg-boss `calculate-draw-financials` triggered al cerrar y al totalizar
- Cron Linux → `trigger-pgboss-cron.mjs` siguiendo el patrón actual
- Refactor de `getDailyReport` y `getAccountingReport` para leer agregados
- Script de backfill para draws históricos
- Fix transparente del bug multi-draw (agregar por `TicketDetail.drawId`)

**Comisiones de proveedores:**
- Configuración por `apiSystemId` con fórmulas: `SALES_PCT`, `UTILITY_PCT`, `SALES_AND_UTILITY_PCT`, `TIERED`
- Tabla `ProviderCommissionLedger` (proveedor, sorteo, monto)
- Tabla `ProviderWeeklySettlement` (proveedor, semana ISO, total)
- Worker `calculate-provider-commission` post-totalización
- Cron Linux semanal para snapshot de liquidación
- UI admin: configurar fórmulas, ver ledger, ver liquidaciones

**Módulo contable multi-moneda (BsF funcional):**
- `ExchangeRate` (fecha, tasa BsF/USD, ingreso manual por admin, auditable)
- `AccountingEntry` (INCOME/EXPENSE/PAYMENT, amountBsF, originalAmount, originalCurrency, exchangeRateId, attachmentUrl)
- Upload de comprobantes/recibos
- Categorías configurables
- Reporte semanal: ingresos netos (post-comisiones) vs gastos → balance BsF + equivalente USD

## Requirements

### Validated

- Draw lifecycle (SCHEDULED -> CLOSED -> DRAWN) with automated execution
- Multi-channel publication (Telegram, WhatsApp, Facebook, Instagram, TikTok) with retry
- Player betting interface with balance management
- Prize processing pipeline (pg-boss queue)
- SRQ provider integration (PULL-based: planning sync + ticket import)
- Admin dashboard with draw management, monitoring, and reports
- Image generation for draw results (Sharp-based)
- Admin Telegram bot for notifications
- Multi-provider webhook system (PUSH-based) — v1.0
- Admin provider management UI — v1.0
- Webhook log viewer — v1.0
- Token generation for webhook auth — v1.0
- Reports dashboard with date range, game, and provider filters — v1.1
- PDF export of filtered reports — v1.1
- Slot-based draw resolution for webhook providers (48 fixed IDs → daily Draw UUID) — v1.2
- Animal/number → GameItem mapping from provider payloads — v1.2
- Ticket creation from webhook payloads with multi-play support — v1.2
- Draw status validation (reject bets for closed/drawn/cancelled draws) — v1.2
- Acceptance/rejection response contract for providers — v1.2

### Active

- [ ] Materialized draw financial aggregates (`DrawFinancial`) populated by pg-boss workers on close+totalize
- [ ] Backfill of historical draws into `DrawFinancial`
- [ ] Refactor of report services to read from `DrawFinancial` (fixes multi-draw ticket attribution bug)
- [ ] Per-provider commission configuration (SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED)
- [ ] Per-draw commission ledger calculated post-totalization
- [ ] Weekly provider settlement snapshots
- [ ] Admin UI for provider commission config and settlement viewing
- [ ] Daily exchange rate management (manual entry by admin, auditable)
- [ ] Accounting entries (income, expense, payment) with attachments and original-currency tracking
- [ ] Multi-currency reports in BsF (functional currency) with USD equivalents
- [ ] Weekly P&L view (income net of commissions vs expenses)

### Out of Scope

- Refactoring SRQ into adapter pattern — stays as-is (PULL), adapters are for new PUSH providers
- Queue-based webhook processing — tickets created real-time when adapter exists
- Commercial network hierarchy (comercializadora/banca/grupo) for webhook providers — not needed, userId stays null, providerData stores original payload
- Automatic exchange rate scraping/API — manual entry only this milestone (admin discipline preferred over flaky scrape)
- Double-entry bookkeeping / chart of accounts — single-entry ledger is enough for current operational scale
- Tax calculations / VAT reporting — not a regulated entity at this scale
- Multi-user accounting permissions — single admin role manages everything

## Context

- Existing `ApiSystem` and `ApiConfiguration` models handle SRQ integration
- SRQ is PULL-based: jobs fetch planning (6 AM) and tickets (every 5 min)
- New providers will PUSH bets via webhooks — different model entirely
- Each new provider has its own payload format (unknown until they start sending)
- `ApiSystem` needs new fields: `slug`, `webhookToken`, `mode` (PULL/PUSH)
- New `WebhookLog` model for raw payload storage
- Adapter pattern: `webhooks/adapters/{slug}.adapter.js` normalizes to internal format
- Admin dashboard already has 27+ sub-routes under `/app/admin/`

## Constraints

- **Tech stack**: Node.js/Express backend, Next.js 14 frontend, PostgreSQL/Prisma, TailwindCSS v4
- **Compatibility**: Must coexist with existing SRQ PULL system without breaking it
- **Auth**: Webhook auth via token in header (simple, per-provider)
- **Real-time**: When adapter exists, tickets created synchronously on webhook receipt

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single endpoint per provider slug | Scales better than one endpoint per provider; adapter pattern handles format differences | -- Pending |
| Log-first approach (discovery mode) | Can't know provider payloads upfront; logging lets us inspect before building adapters | -- Pending |
| Real-time processing (no queue) | Webhook volume expected to be low enough; simpler than adding queue layer | -- Pending |
| Extend ApiSystem (not new model) | Reuses existing provider infrastructure; just adds PUSH capability | -- Pending |
| Materialized aggregates over runtime sums | Reports currently aggregate ~2600+ draws of tickets at query time; pre-computing at close/totalize is O(1) lookup | -- Pending (v1.3) |
| Functional currency BsF, USD as display | Operation is in Venezuela; storing in BsF avoids drift from re-conversion; USD is computed view | -- Pending (v1.3) |
| Manual exchange rate entry | Tasa paralela volatility makes automated scraping unreliable; admin discipline is more auditable | -- Pending (v1.3) |
| pg-boss workers triggered by cron Linux | Reuse existing scheduling architecture (v1.2 migration); cron → trigger-pgboss-cron.mjs → workers | -- Pending (v1.3) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-15 after milestone v1.3 initialization*
