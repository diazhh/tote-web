# Phase 11: DrawFinancial Foundation - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Every completed draw has a materialized `DrawFinancial` row (totalSales, totalPrize, utility, ticketCount, closedAt, totalizedAt) plus a per-provider `DrawFinancialProvider` row (one per `apiSystemId`, with a synthetic NULL-apiSystemId row for TAQUILLA_ONLINE house sales). Rows are written by a new pg-boss worker `calculate-draw-financials` in two phases — SALES on draw close, PRIZES on prize processing — and by a one-shot backfill script that processes ~2,600 historical DRAWN draws during deploy. All aggregation goes through `TicketDetail.drawId` so the v1.2 multi-draw webhook attribution bug is fixed at the canonical source.

**In scope:** New Prisma models, two-phase worker, queue + cron wiring, idempotent upsert pattern, dry-run-gated chunked-resumable backfill, full reconciliation verification, placeholder registration of the Phase 12 commission queue.

**Out of scope:** Commission calculation logic (Phase 12), exchange rate / accounting ledger (Phase 13), flipping `REPORT_USE_MATERIALIZED=true` (Phase 14), late-cancellation compensating-entry mechanism (deferred — see Deferred Ideas).

</domain>

<decisions>
## Implementation Decisions

### Backfill Execution Strategy

- **D-01: Chunked + resumable** — Backfill processes draws in batches (~100/batch). Progress is checkpointed (file or DB column) so a killed/crashed run resumes without re-doing committed batches. Upsert pattern means any re-processed batch is idempotent.
- **D-02: Required dry-run gate** — Script refuses to write to the database unless (a) a prior `--dry-run` invocation completed without errors AND (b) the real run carries `--confirm`. Dry-run computes everything in-memory, prints sample DrawFinancial rows and totals, but does no INSERTs.
- **D-03: Backfill runs during the deploy window only** — Not a periodic operation. After Phase 11 migration applies, run the backfill as part of the deploy procedure, verify, declare phase done. This is a one-time historical fill, not maintenance.
- **D-04: Full reconciliation report verification** — Acceptance gate is stricter than ROADMAP's 10-draw spot check: after backfill, generate an SQL report comparing ALL ~2,600 `DrawFinancial.totalSales` against live `SUM(TicketDetail.amount WHERE drawId = X AND status != 'CANCELLED')`. Zero discrepancies required to mark backfill complete. Output goes to `backend/storage/backfill-reports/draw-financial-recon-{timestamp}.csv` for audit.
- **D-05: Historical `totalizedAt = Draw.drawnAt`** — Backfilled rows store the original draw timestamp in `totalizedAt`, not the script's NOW(). Time-series queries (e.g., weekly P&L by `totalizedAt`) work correctly across historical and live rows.

### House (TAQUILLA_ONLINE) Attribution

- **D-06: Synthetic house row in DrawFinancialProvider with `apiSystemId = NULL`** — Tickets with `Ticket.apiSystemId IS NULL` (TAQUILLA_ONLINE) aggregate into a single DrawFinancialProvider row per draw where `apiSystemId IS NULL`. SUM of all DrawFinancialProvider rows for a draw equals `DrawFinancial.totalSales`. Weekly P&L joins by apiSystemId for commissions — the NULL row naturally has no commission.
- **D-07: UI label for the NULL-apiSystemId bucket is "Taquilla / Online"** — Lock this for Phase 14 dashboards. Reuses existing TicketSource enum vocabulary; operators already know it.
- **D-08: Standard `@@unique([drawId, apiSystemId])` constraint** — Worker upsert logic enforces idempotency for the NULL case via `findFirst({drawId, apiSystemId: null}) → update | create`, NOT via Prisma's `upsert()` (which uses the unique index and treats NULLs as distinct in PostgreSQL). Worker code must be explicit; review carefully in code review.
- **D-09 (planner note):** Postgres 16 supports `CREATE UNIQUE INDEX ... NULLS NOT DISTINCT` (added in PG 15). Planner may evaluate adding that clause as a defense-in-depth migration to enforce uniqueness at the DB level, but the worker's findFirst/upsert pattern is the primary correctness mechanism.

### Worker Trigger Pattern

- **D-10: Phase-SALES triggered via `boss.send()` best-effort from close-and-ingest** — After close+ingest succeeds in `close-and-ingest.worker.js`, fire `boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, {drawId, phase: 'SALES'})` inside try/catch. Failures log a warning but never block the close. Mirrors the existing chain pattern (e.g., step-process-prizes → step-calculate-stats).
- **D-11: Phase-PRIZES triggered alongside STEP_CALCULATE_STATS** — In `step-process-prizes.worker.js`, add a parallel `boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, {drawId, phase: 'PRIZES'})` next to the existing `boss.send(QUEUES.STEP_CALCULATE_STATS, ...)`. The two run independently; no ordering dependency between DrawStats and DrawFinancial.
- **D-12: Standard pg-boss retry policy** — `retryLimit: 3` with exponential backoff (same as STEP_CALCULATE_STATS in `QUEUE_CONFIGS`). After 3 failures the job sits in the dead-letter state; admin investigates manually. No sweep safety net in Phase 11 — if dead-letter accumulation becomes a real problem, add a sweep later.
- **D-13: Single worker file handles both phases via `job.data.phase`** — `calculate-draw-financials.worker.js` routes by `phase: 'SALES' | 'PRIZES'`. Phase SALES upserts `totalSales`, `ticketCount`, `closedAt`, and the DrawFinancialProvider sales rows. Phase PRIZES upserts `totalPrize`, `utility`, `totalizedAt`, and the DrawFinancialProvider prize rows. Service-function pattern, NOT a Croner-style class (F-13).
- **D-14: `prizesProcessed = true` guard for phase PRIZES** — Worker reads `Draw.prizesProcessed`; if false, throws an explicit `PrizesNotProcessedError` (not a silent zero-prize write). The error surfaces in pg-boss retry, eventually dead-letter — operator visibility, not silent corruption. (F-1)
- **D-15: Phase 12 commission queue registered as no-op placeholder** — `QUEUES.CALCULATE_PROVIDER_COMMISSION` added to `constants.js` in Phase 11. `register.js` calls `boss.createQueue(QUEUES.CALCULATE_PROVIDER_COMMISSION)` AND registers a no-op worker that logs "phase-12 placeholder, drawId={id}" and completes. Prevents F-11 (createQueue silent drop) from blocking Phase 12 deploy. Phase 12 just swaps the worker logic; no register.js change needed at that point.

### Cancellation / Re-aggregation Policy

- **D-16: DrawFinancial is frozen / immutable after `totalizedAt` is set** — Once phase PRIZES writes `totalizedAt`, the row is the audit truth at that moment. Late cancellations (ticket cancelled after totalizedAt) do NOT re-trigger the worker and do NOT mutate DrawFinancial. This keeps commission settlements stable — a CONFIRMED weekly settlement won't shift weeks later because of a delayed cancellation.
- **D-17: Aggregation excludes `Ticket.status = 'CANCELLED'`** — During the live SALES/PRIZES windows, aggregation SQL filters `WHERE t.status != 'CANCELLED'`. Matches existing `accounting-report.service.js` semantics. No separate `cancelledCount` / `cancelledAmount` columns in DrawFinancial (over-engineered for v1.3).
- **D-18: Phase-SALES re-writes are allowed within the close → totalize window** — Between phase SALES and phase PRIZES, `totalizedAt IS NULL`. If a cancellation happens in this window, the next phase trigger (PRIZES) naturally recomputes the totals on its own DrawFinancial upsert. No special cancellation event listener needed for Phase 11. The freeze is enforced only at `totalizedAt IS NOT NULL`.
- **D-19: Late cancellations treated as exceptional, not routine** — In normal operations, tickets cancel pre-draw or during execute-draw, never after totalizedAt. Late cancellation is an admin override that requires manual reconciliation. If it becomes operational, the compensating-entry mechanism (a CancellationLedger model) is deferred to v1.4. Phase 11 logs but does not auto-handle.

### Claude's Discretion

- Exact chunk size for backfill (likely 100, but 50–500 range is fine — planner can tune based on observed performance).
- Exact column shape of `DrawFinancial` beyond what's explicitly listed in REQUIREMENTS.md / SUMMARY.md — researcher should propose final field list following the project's existing Decimal precision conventions (`@db.Decimal(12, 2)` for amounts).
- Whether to include a `gameId` denormalized column on DrawFinancial for query convenience (Draw has it; could be denormalized for the weekly P&L view in Phase 14). Researcher to evaluate.
- Logging format / observability hooks (Winston is already wired). Counter/timer metrics for backfill progress and live worker latency are nice-to-have.
- Where to store backfill progress checkpoint (in-process state file vs DB column on a `BackfillRun` audit row).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.3 Project Research (read all — researcher should not re-research what's here)
- `.planning/research/SUMMARY.md` — Executive summary, stack additions, four-phase rationale, open questions for v1.3
- `.planning/research/ARCHITECTURE.md` — Worker placement, hook points, pipeline chain pattern, schema sketches
- `.planning/research/PITFALLS.md` — F-1, F-2, F-3, F-10, F-11, F-13 in full detail — all relevant to Phase 11
- `.planning/research/STACK.md` — `decimal.js` 10.6.0 + `multer` 2.1.1 versions, precision conventions
- `.planning/research/FEATURES.md` — Must-have vs should-have vs deferred features

### Requirements + Roadmap
- `.planning/REQUIREMENTS.md` §"Materialized Draw Aggregates (FIN-AGG)" — FIN-AGG-01..07 (the locked phase requirements)
- `.planning/ROADMAP.md` §"Phase 11: DrawFinancial Foundation" — Goal, depends-on, success criteria, pitfall mitigation map
- `.planning/PROJECT.md` — v1.3 milestone scope and out-of-scope list

### Codebase Hook Points (researcher should read these to confirm hook patterns)
- `backend/src/queue/workers/close-and-ingest.worker.js` — Phase-SALES trigger lives here (D-10)
- `backend/src/queue/workers/step-process-prizes.worker.js` — Phase-PRIZES trigger lives here, alongside existing `boss.send(STEP_CALCULATE_STATS)` (D-11)
- `backend/src/queue/workers/step-calculate-stats.worker.js` — Parallel-output pattern to mirror
- `backend/src/queue/register.js` — Worker registration; must add `boss.createQueue()` for both new queues + commission placeholder (D-15)
- `backend/src/queue/constants.js` — `QUEUES` and `QUEUE_CONFIGS`; add `CALCULATE_DRAW_FINANCIALS` and `CALCULATE_PROVIDER_COMMISSION`
- `backend/src/queue/trigger-pgboss-cron.mjs` — If any new queue gets cron-driven, add to `ALLOWED_QUEUES` (Phase 11 itself shouldn't need this — both new queues are event-chained, not cron-triggered)
- `backend/src/services/accounting-report.service.js` — Existing O(N×M) aggregation logic; phase-PRIZES worker should compute equivalent values via `TicketDetail.drawId` (F-3 fix). Reference for SQL shape only; Phase 14 swaps it out behind a flag.
- `backend/prisma/schema.prisma` — Existing Decimal field patterns; TicketSource enum; `Ticket.apiSystemId` nullable FK to ApiSystem; `Draw.prizesProcessed` boolean

### Production Operations
- VPS `/etc/cron.d/tote-triggers` — Phase 11 does NOT modify this. Both new queues are event-chained, not scheduled. (Phase 12 will add the Monday settlement cron line.)
- Backfill execution context: VPS 94, `/var/proyectos/tote-web/backend`, run via `node src/scripts/backfill-draw-financials.mjs`
- DB connection: `postgresql://tote_user:***@localhost:5433/tote_db` — Postgres 16, enum `DrawStatus` is `{SCHEDULED, CLOSED, DRAWN, CANCELLED}` (NO `PUBLISHED` — F-10)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Ticket.status != 'CANCELLED'` filter** — Pattern is consistent across `accounting-report.service.js` and `monitor.service.js`; new worker SQL follows the same convention (D-17).
- **Pipeline chain pattern via `boss.send()` inside try/catch** — `step-process-prizes.worker.js` already does this for `STEP_CALCULATE_STATS`. Phase 11 mirrors it exactly for both new triggers (D-10, D-11).
- **`Winston` logger** — Existing log pattern via `lib/logger.js`; backfill progress, dead-letter cases, and PrizesNotProcessedError all log through it.
- **Prisma `Decimal @db.Decimal` precision conventions** — Project standard (per `STACK.md`): `Decimal(12, 2)` for ledger amounts, `Decimal(15, 4)` for rates/percentages, `Decimal(18, 8)` for commission ledger amounts (Phase 12). DrawFinancial amounts = `Decimal(12, 2)`.

### Established Patterns
- **Service-function workers, NOT Croner-style classes** (F-13) — D-13 explicit. Worker file is a plain async function exported and registered in `register.js`.
- **`boss.createQueue()` before `boss.work()`** (F-11) — Mandatory for every new queue. Smoke-test step in deploy: `SELECT name FROM pgboss.queue;` must include both new queue names + the Phase 12 placeholder.
- **`status = 'DRAWN'` only on production** (F-10) — Backfill script's first executable line is an enum verification: `SELECT unnest(enum_range(NULL::"DrawStatus"))` — script aborts if `PUBLISHED` is unexpectedly present (i.e., running against an old non-migrated DB).
- **Idempotent upsert with explicit findFirst+update/create for NULL FK cases** (D-08) — Worker code pattern: don't use Prisma's `upsert()` when the conflict target includes a nullable column.

### Integration Points
- **`close-and-ingest.worker.js` line ~22 / ~114** (where `status: 'CLOSED'` is set) — Insert `boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, {drawId, phase: 'SALES'})` immediately after the close transaction commits, inside try/catch.
- **`step-process-prizes.worker.js` line ~20** (the existing `boss.send(QUEUES.STEP_CALCULATE_STATS, ...)`) — Insert the parallel `boss.send(QUEUES.CALCULATE_DRAW_FINANCIALS, {drawId, phase: 'PRIZES'})` right next to it.
- **`register.js`** — Add three lines (two real queues + commission placeholder), all wrapped in proper `await boss.createQueue(...)` before `await boss.work(...)`.
- **`constants.js`** — Add `CALCULATE_DRAW_FINANCIALS` and `CALCULATE_PROVIDER_COMMISSION` to `QUEUES`; add `QUEUE_CONFIGS` entries matching the `STEP_CALCULATE_STATS` shape (retryLimit: 3, retryBackoff: true).

</code_context>

<specifics>
## Specific Ideas

- **Full reconciliation report on backfill (D-04)** — Stricter than ROADMAP's 10-draw spot check. The user wants an audit-grade CSV of every backfilled draw vs live SUM, so the v1.3 financial foundation has zero doubt before Phase 12 builds commissions on top. Researcher/planner: design the report query and write it to `backend/storage/backfill-reports/`.
- **`totalizedAt = Draw.drawnAt` for historical rows (D-05)** — Time-series correctness over audit-trail visibility. If audit of "which rows are backfilled vs live" is ever needed, the operator can derive it: `WHERE NOT EXISTS (matching live worker log)` or by running a separate `BackfillRun` audit table — but this is not built in Phase 11.
- **"Frozen after totalizedAt" mental model (D-16)** — User explicitly endorsed this framing. Use it consistently in code comments and CONTEXT docs: "totalizedAt = closed book". Reports show net-of-cancellation truth at the moment of totalization; downstream consumers (Phase 12 commissions, Phase 14 weekly P&L) inherit that stability.
- **Phase 12 commission queue placeholder (D-15)** — User accepted this preemptive register because F-11 is a real prior incident. Important: the placeholder worker must NOT throw — it logs and completes. Otherwise Phase 11 dead-letters Phase 12's first test send.

</specifics>

<deferred>
## Deferred Ideas

- **Compensating-entry mechanism for late cancellations** — If late ticket cancellations (after totalizedAt) become operationally common, add a `CancellationLedger` model in v1.4 that records the late event and offsets DrawFinancial in reports without mutating it. Phase 11 logs late cancellations but does not auto-correct.
- **Sweep safety net for missed calculate-draw-financials jobs** — A periodic sweep that finds DRAWN draws missing a DrawFinancial row and re-enqueues them. Not built in Phase 11 (D-12); add if dead-letter accumulation becomes a real problem in production.
- **Denormalized `gameId` column on DrawFinancial** — Optional, marked as Claude's discretion. If Phase 14 weekly P&L queries by game show poor performance, add it as an additive migration.
- **`BackfillRun` audit table** — Track each backfill execution with start/end timestamps, row counts, error counts. Not in Phase 11 scope; backfill is one-shot.
- **`cancelledCount` / `cancelledAmount` columns on DrawFinancial** — Considered (option in D-17) and rejected as over-engineered for v1.3. If "gross vs net" reporting becomes a real ask, add later.

</deferred>

---

*Phase: 11-DrawFinancial Foundation*
*Context gathered: 2026-05-15*
