# Phase 11: DrawFinancial Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 11-DrawFinancial Foundation
**Areas discussed:** Backfill execution strategy, TAQUILLA_ONLINE attribution, Phase-SALES trigger pattern, Cancellation / re-aggregation policy

---

## Backfill Execution Strategy

### Q1: How should the historical backfill of ~2,600 DRAWN draws be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Chunked + resumable | Process N draws per batch with checkpointing; safest on live prod | ✓ |
| Single-shot script | One mjs loop; simpler code; restarts re-do work | |
| pg-boss-driven | Enqueue one job per draw; uses normal worker machinery | |

**User's choice:** Chunked + resumable

### Q2: Should the backfill script require a --dry-run pass before the real run?

| Option | Description | Selected |
|--------|-------------|----------|
| Required dry-run first | Refuses to write without --confirm + prior clean dry-run | ✓ |
| Optional dry-run | Available but not required | |
| No dry-run | Trust upsert + chunked safety | |

**User's choice:** Required dry-run first

### Q3: When should the backfill execute against production?

| Option | Description | Selected |
|--------|-------------|----------|
| Off-peak window | 04:00–06:00 VE | |
| Anytime | Chunked design tolerates contention | |
| During the deploy window only | Part of Phase 11 deploy procedure | ✓ |

**User's choice:** During the deploy window only

### Q4: What's the verification gate before declaring the backfill 'done'?

| Option | Description | Selected |
|--------|-------------|----------|
| Count match + 10-draw spot-check | ROADMAP-default verification | |
| Count match only | Trust worker tests | |
| Count match + full reconciliation report | All 2,600 rows compared; flag discrepancies | ✓ |

**User's choice:** Count match + full reconciliation report
**Notes:** User wants audit-grade confidence in the v1.3 foundation before Phase 12 builds commissions on top. Full CSV report to be written to `backend/storage/backfill-reports/`.

### Q5: For historical draws backfilled, what value should `totalizedAt` get?

| Option | Description | Selected |
|--------|-------------|----------|
| Use Draw.drawnAt | Semantic correctness for time-series queries | ✓ |
| Use NOW() | Makes backfilled vs live distinguishable | |
| Add a separate backfilledAt column | Both | |

**User's choice:** Use Draw.drawnAt

---

## TAQUILLA_ONLINE Attribution

### Q6: How should DrawFinancialProvider treat tickets where Ticket.apiSystemId IS NULL?

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic 'house' row with NULL apiSystemId | One row per (drawId, apiSystemId-or-NULL); single table | ✓ |
| Skip entirely | Only provider tickets in DrawFinancialProvider; compute house by arithmetic | |
| Separate 'house' pseudo-ApiSystem row | Seed a fake ApiSystem with slug='house' | |

**User's choice:** Synthetic 'house' row with NULL apiSystemId

### Q7: How should the 'NULL apiSystemId' row be labeled in the Phase 14 weekly P&L UI?

| Option | Description | Selected |
|--------|-------------|----------|
| 'Taquilla / Online' | Matches TicketSource enum naming | ✓ |
| 'Casa' / 'House' | Operator-centric framing | |
| Decide later in Phase 14 | Schema vs label split | |

**User's choice:** 'Taquilla / Online'

### Q8: Should DrawFinancialProvider have a UNIQUE constraint that includes NULL apiSystemId?

| Option | Description | Selected |
|--------|-------------|----------|
| @@unique([drawId, apiSystemId]) | Standard Prisma; PG treats NULLs as distinct | ✓ |
| Partial unique index with COALESCE | Guarantees one 'house' row per draw at DB level | |
| Sentinel UUID for house | Avoid NULL altogether | |

**User's choice:** @@unique([drawId, apiSystemId])
**Notes:** Worker upsert logic must use explicit findFirst + update/create for the NULL case (not Prisma's upsert). Planner can evaluate a defense-in-depth `NULLS NOT DISTINCT` clause (Postgres 16 supports it).

---

## Phase-SALES Trigger Pattern

### Q9: How should close-and-ingest.worker.js trigger the phase-SALES aggregation?

| Option | Description | Selected |
|--------|-------------|----------|
| boss.send() best-effort | Try/catch around boss.send; log on failure; close unaffected | ✓ |
| Synchronous inline service call | Tight consistency; close fails if aggregation fails | |
| Sweep-only | Decoupled scheduled sweep finds missing rows | |

**User's choice:** boss.send() best-effort

### Q10: What's the retry policy for the calculate-draw-financials worker?

| Option | Description | Selected |
|--------|-------------|----------|
| Standard pg-boss retries (3, exp) | Same as STEP_CALCULATE_STATS | ✓ |
| Higher retry limit (5–10) | More resilience; masks real bugs | |
| Standard + sweep safety net | Adds periodic sweep for missed jobs | |

**User's choice:** Standard pg-boss retries (3 attempts, exponential)

### Q11: Should phase-PRIZES chain off step-process-prizes the same way phase-SALES chains off close?

| Option | Description | Selected |
|--------|-------------|----------|
| boss.send() alongside STEP_CALCULATE_STATS | Parallel chain; no ordering dependency | ✓ |
| Chain after STEP_CALCULATE_STATS | Serialized; couples unrelated workers | |
| Inline into step-process-prizes | Skip the new worker entirely | |

**User's choice:** Yes — boss.send() alongside STEP_CALCULATE_STATS

### Q12: Should Phase 11 also register the Phase 12 commission queue as a no-op placeholder?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — register placeholder now | createQueue + no-op worker that logs and completes | ✓ |
| No — Phase 12 registers its own | Cleaner separation | |
| Register queue but no worker | Lightest placeholder | |

**User's choice:** Yes — register placeholder now
**Notes:** F-11 (pg-boss createQueue silent drop) is a prior production incident. Preemptive registration eliminates a Phase 12 deploy risk.

---

## Cancellation / Re-aggregation Policy

### Q13: If a ticket is cancelled AFTER DrawFinancial.totalizedAt is set, what should happen to the materialized row?

| Option | Description | Selected |
|--------|-------------|----------|
| Frozen / immutable after totalizedAt | Audit truth; commission settlements stable | ✓ |
| Live truth — recompute on cancellation event | Always reflects current state; shifts historicals | |
| Hybrid — recompute only before totalizedAt | Captures normal window; freezes downstream | |

**User's choice:** Frozen / immutable after totalizedAt

### Q14: How are cancelled tickets handled in the initial aggregation (during the live SALES/PRIZES windows)?

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude where Ticket.status = 'CANCELLED' | Matches existing report service | ✓ |
| Include all tickets; separate cancelledSales column | Over-engineered for v1.3 | |
| Exclude + track cancelledCount/cancelledAmount columns | Gross vs net story | |

**User's choice:** Exclude where Ticket.status = 'CANCELLED'

### Q15: Are late ticket cancellations (after totalizedAt) actually expected in this operation?

| Option | Description | Selected |
|--------|-------------|----------|
| Rare / not in normal flow | Exceptional admin override; log + manual reconciliation | ✓ |
| Possible — build a compensating entry mechanism | CancellationLedger model now | |
| Unknown — defer the cancellation flow design | Capture as deferred idea | |

**User's choice:** Rare / not in normal flow

### Q16: Should phase-SALES re-write be allowed if a cancellation happens between close and prize processing?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — upsert refreshes on every SALES trigger | Phase PRIZES naturally picks up new totals | ✓ |
| Require explicit re-enqueue on cancellation events | Prisma event hook; tighter consistency | |

**User's choice:** Yes — upsert refreshes totalSales on every SALES trigger

---

## Claude's Discretion

- Exact backfill chunk size (50–500 range; planner tunes from observed performance)
- Final column shape of DrawFinancial / DrawFinancialProvider (researcher proposes; follow project Decimal precision conventions)
- Whether to denormalize `gameId` onto DrawFinancial for Phase 14 query convenience
- Logging format / observability hooks (counters and timers via Winston)
- Backfill progress checkpoint storage (in-process state file vs `BackfillRun` audit row)

## Deferred Ideas

- Compensating-entry mechanism for late cancellations (CancellationLedger model) → v1.4 if it becomes operationally common
- Sweep safety net for missed calculate-draw-financials jobs → add later if dead-letter accumulation appears
- Denormalized `gameId` column on DrawFinancial → additive migration if Phase 14 weekly P&L queries are slow
- `BackfillRun` audit table → not in Phase 11 scope (backfill is one-shot)
- `cancelledCount` / `cancelledAmount` columns on DrawFinancial → reject for v1.3; revisit only if "gross vs net" reporting becomes a real ask
