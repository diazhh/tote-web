---
phase: 12
phase_name: Provider Commission Engine
created: 2026-05-15
status: locked
---

# Phase 12 Context — Provider Commission Engine

<domain>
Commissions are calculated automatically per draw (post-totalization), frozen in a weekly settlement ledger every Monday, and managed from the admin UI — including TIERED bracket formulas and a historical backfill from 2026-04-17. BsF only; USD multimoneda comes in Phase 13.
</domain>

<requirements_lock>
**Locked by `.planning/REQUIREMENTS.md` — FIN-COMM-01 through FIN-COMM-12.** Planner MUST read REQUIREMENTS.md before generating plans. Do not duplicate requirements text here.

Key locked elements (not up for re-discussion):
- 4 formula types: `SALES_PCT`, `UTILITY_PCT`, `SALES_AND_UTILITY_PCT`, `TIERED` (FIN-COMM-01)
- Append-only versioning via `effectiveFrom DateTime` (FIN-COMM-04)
- Pipeline trigger: pg-boss worker `calculate-provider-commission` (placeholder already registered in Phase 11)
- Weekly settlement: cron Linux + worker `weekly-settlement-snapshot`, Mondays 06:00 VE (FIN-COMM-07)
- Settlement statuses: `DRAFT` / `CONFIRMED` / `ADJUSTED` (FIN-COMM-09)
- Export Excel + PDF reusing ExcelJS/PDFKit (FIN-COMM-11)
- Backfill window: 2026-04-17 to deploy date (FIN-COMM-12)
- Aggregation source: `DrawFinancial` + `DrawFinancialProvider` (from Phase 11)
</requirements_lock>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — FIN-COMM-01..12 (locked — MUST read before planning)
- `.planning/ROADMAP.md` lines 223-242 — Phase 12 spec, pitfall mitigations, parallel-with-13 note
- `.planning/phases/11-drawfinancial-foundation/11-CONTEXT.md` — D-15 commission placeholder, queue naming, decimal.js usage
- `.planning/phases/11-drawfinancial-foundation/11-02-SUMMARY.md` — register.js + constants.js worker patterns
- `backend/prisma/schema.prisma` — DrawFinancial + DrawFinancialProvider models (Phase 11)
- `backend/src/queue/register.js` — commission-placeholder worker (this phase converts it to real)
- `backend/src/queue/constants.js` — queue name `QUEUES.CALCULATE_PROVIDER_COMMISSION`
- `backend/src/lib/dateUtils.js` — Venezuela TZ helpers (extend for ISO week boundary per F-15)
- `./CLAUDE.md` — cron Linux + pg-boss pattern, VPS 94 (LOCAL-ONLY for this session)
</canonical_refs>

<decisions>

## D-01 — No commission config → skip silencioso

When a draw totalizes and a provider participating in it has no `ProviderCommissionConfig` row whose `effectiveFrom ≤ draw.drawnAt`:
- **Behavior:** worker logs a warning via Winston (`logger.warn` with `{ drawId, apiSystemId, reason: 'no_config_at_drawnAt' }`) and **does NOT write a ledger row**.
- **Rationale:** simpler. No phantom SKIPPED rows polluting the ledger UI. The admin discovers gaps when comparing settlement totals to expected coverage — and the requirement FIN-COMM-06 only mandates "never blocks the pipeline" + "warning log", not a placeholder row.
- **Implication for backfill:** the backfill script must surface a count of "providers with draws but no effective config" so the operator sees how much is silently skipped.

## D-02 — `ADJUSTED` status is triggered only by two events

A `ProviderWeeklySettlement` moves from any state to `ADJUSTED` only when:
1. **Manual override by admin** — admin edits the settlement total via an explicit "Adjust" action that requires a written reason (stored in `adjustmentReason TEXT`). The original `amount` is preserved in `originalAmount NUMERIC(18,8)`; the override goes to `amount`.
2. **Re-totalization of a draw included in a CONFIRMED settlement** — if `calculate-draw-financials` re-runs for a draw whose `drawnAt` falls inside a settlement's ISO week AND that settlement is `CONFIRMED`, the worker leaves the CONFIRMED settlement frozen (per D-03) and marks it `ADJUSTED` to flag the drift. The recomputed ledger row for that draw goes into the **next week's** settlement as a delta line item (compensating row, F-9-style — but NOT auto-applied; admin reviews it explicitly).

`ADJUSTED` is a terminal state with respect to automatic recomputation — only further manual overrides modify it.

## D-03 — `CONFIRMED` is terminal — no un-confirm

Once an admin transitions a settlement from `DRAFT` to `CONFIRMED`:
- No UI action reverts the state back to `DRAFT`.
- No backend endpoint accepts `status: DRAFT` on a CONFIRMED row.
- Corrections happen via D-02 path 1 (manual adjustment with reason → `ADJUSTED`) or D-02 path 2 (compensating row in the next week).
- **Rationale:** financial trust. If CONFIRMED could be revoked, the upstream payment process (Phase 13) could never rely on it. The deferred ideas list includes "admin role expansion for un-confirm with multi-sign approval" if that ever becomes needed — not in this phase.

## D-04 — TIERED brackets reset every Monday 00:00 VE (ISO week)

For `TIERED` formula evaluation:
- The bracket resolves against the provider's **cumulative sales in the current ISO week** (Monday 00:00 to Sunday 23:59:59.999 VE time).
- A draw whose `drawnAt` is `Monday 00:00:00.001 VE` falls in the NEW week (the boundary is exclusive at 00:00 of Monday).
- The cumulative window is closed and reset by the weekly-settlement-snapshot at Monday 06:00 VE — but the bracket evaluation uses the actual draw timestamp, not the settlement time.
- **Edge case:** if a draw is re-totalized late and lands in a prior week, the bracket lookup uses the historical cumulative sales as of that draw's `drawnAt`. This is consistent with D-02 (re-totalization in a closed week triggers ADJUSTED, not silent re-calculation).
- Reuse the ISO week helper in `backend/src/lib/dateUtils.js` (per pitfall F-15).

## D-05 — UI placement

- **Per-provider config:** new tab inside `/admin/proveedores/[id]` called "Comisiones" — shows current effective config, a timeline of historical configs (effectiveFrom newest first), and a "Nueva configuración" form. Append-only: each save creates a new row, never edits an existing one.
- **Global ledger + settlements:** new top-level section `/admin/comisiones` with two sub-tabs:
  - "Ledger" — table of `ProviderCommissionLedger` rows (filter by provider, date range, status).
  - "Settlements" — table of `ProviderWeeklySettlement` rows (filter by year/week, provider, status). Drill-down into a settlement opens a modal/page showing the per-draw ledger lines that fed it, plus Excel + PDF export buttons.

## D-06 — Settlement identifier format

Settlements display as `YYYY-Www` (ISO year + ISO week, e.g., `2026-W19`) in the UI and in exports. The settlement table has columns `isoYear INT` and `isoWeek INT` (per FIN-COMM-07 phrasing) with a unique constraint on `(apiSystemId, isoYear, isoWeek)`. Both columns are queried directly; no humanized date-range column is stored (computed on render).

## D-07 — Backfill: standalone CLI script

Following Phase 11's pattern, the historical backfill is a Node script at `backend/src/scripts/backfill-provider-commissions.mjs`:
- Same `--dry-run` / `--confirm` flag gates and exit codes as `backfill-draw-financials.mjs`.
- F-17 enforcement: aborts if any candidate draw has `drawnAt < 2026-04-17` (the locked go-live date for the commission ledger).
- Iterates DRAWN draws in chronological order, looks up the effective `ProviderCommissionConfig` for each (provider, drawnAt) pair, computes per the formula type, writes ledger rows.
- Produces a reconciliation CSV at `backend/storage/backfill-reports/provider-commission-recon-{stamp}.csv` with columns: `drawId, apiSystemId, formulaType, salesBase, utilityBase, computedAmount, configEffectiveFrom`.
- Does NOT generate `ProviderWeeklySettlement` rows itself — those are produced by the regular weekly snapshot worker once the ledger is populated (or via a one-shot `--snapshot-historical-weeks` flag, decided in the planner stage).

</decisions>

<scope_boundaries>

**IN scope (Phase 12):**
- `ProviderCommissionConfig` (versioned, append-only) + `ProviderCommissionTier` (TIERED brackets) tables
- `ProviderCommissionLedger` table (per provider × draw)
- `ProviderWeeklySettlement` table (per provider × ISO week)
- pg-boss worker `calculate-provider-commission` (replace Phase 11 placeholder)
- cron-triggered worker `weekly-settlement-snapshot` (Monday 06:00 VE via `/etc/cron.d/tote-triggers`)
- Admin UI: provider config tab + global `/admin/comisiones` section + export buttons
- Backfill script + DEPLOY.md

**OUT of scope (deferred to other phases):**
- USD/multimoneda for commission amounts → Phase 13
- Receipt attachments on settlements → Phase 13 (`AccountingEntry` ↔ settlement FK)
- Weekly P&L dashboard combining commissions + accounting → Phase 14
- Un-confirm workflow with multi-sign approval → backlog
- Provider self-service viewing of their own settlements → backlog
- Email/Telegram notification to provider on settlement confirm → backlog

</scope_boundaries>

<deferred>

Ideas surfaced during discussion that belong elsewhere:
- "Provider portal where each proveedor can see their own ledger and confirm receipt of payment" — out of scope; backlog.
- "Multi-currency display in the commission UI (USD equivalent)" — Phase 13 will own the rate engine; revisit then.
- "Email/Telegram broadcast when settlement is confirmed" — backlog.
- "Threshold alerting (warn admin if a provider's commission grew >2× week-over-week)" — backlog.
- "Auto-confirm settlements older than 30 days" — explicitly rejected (violates D-03 spirit; admin must consciously confirm).

</deferred>

<assumptions_for_planner>

Things the planner can assume without re-asking:
1. **Decimal precision:** all monetary columns are `NUMERIC(18,8)` (per F-4 + Phase 11 convention). Service computations use `decimal.js` with `ROUND_HALF_UP`. Persist as Decimal, never as JS Number.
2. **Queue naming:** `QUEUES.CALCULATE_PROVIDER_COMMISSION` (already in `constants.js` from Phase 11). New queue for weekly snapshot: `QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT`.
3. **Cron line:** Monday 06:00 VE → `0 10 * * 1` in `/etc/cron.d/tote-triggers` (Venezuela is UTC-4, so 06:00 VE = 10:00 UTC).
4. **Worker registration order:** F-11 — `boss.createQueue()` for both queues BEFORE `boss.work()`. Pattern proven in Phase 11.
5. **Read from materialized tables:** the commission worker reads `DrawFinancialProvider.totalSales` + `DrawFinancialProvider.totalPrize` (NOT raw `TicketDetail`). This is the whole point of Phase 11 — single source of truth.
6. **Provider scope:** "provider" = `ApiSystem` row. Includes SRQ (PULL), webhook-PUSH providers, and Maxplay (SCRAPE). All three sources flow through `DrawFinancialProvider`.
7. **Skip rule:** D-01 silent skip applies regardless of provider mode. If SRQ has no config, SRQ is silently skipped just like a webhook provider.
8. **Trigger timing:** `calculate-provider-commission` runs AFTER `calculate-draw-financials` phase=PRIZES completes. Sequential, not parallel — DrawFinancialProvider must exist before commission worker reads it. Wire as a chained `boss.send` from inside the prizes worker.

</assumptions_for_planner>

<pitfall_mitigations>

Pre-locked from ROADMAP.md (planner must verify each in plan acceptance criteria):
- **F-4** — `NUMERIC(18,8)` precision; service uses decimal.js `ROUND_HALF_UP`.
- **F-5** — `effectiveFrom` append-only; UPDATE on ProviderCommissionConfig is forbidden (Prisma has no `update` permission for that model? — planner decides between app-level rule + audit trigger).
- **F-9** — compensating negative rows for cancellations (re-totalization path in D-02).
- **F-12** — `/etc/cron.d/tote-triggers` MUST be updated as a deploy step; not just code push.
- **F-15** — ISO week boundary via `dateUtils.js`. Test edge: 2026-12-29 (could be ISO week 53 of 2026 OR week 1 of 2027). Use `date-fns.getISOWeek` + `getISOWeekYear`, not naive Sunday-Monday math.
- **F-17** — go-live constant `COMMISSION_GO_LIVE = '2026-04-17T00:00:00-04:00'`. Backfill aborts if any candidate draw is older.

</pitfall_mitigations>

<next_steps>

1. Run `/gsd-plan-phase 12` to generate detailed plans.
2. Planner reads: this file, REQUIREMENTS.md, ROADMAP.md, and the canonical refs above.
3. After plans created, execute with `/gsd-execute-phase 12` (worktree mode, parallel where possible).
4. All execution LOCAL ONLY — validated against the prod-mirror DB. No VPS 94 deploys this session.

</next_steps>
