---
phase: 14
plan: 1
plan_name: report-refactor-prereq-data-fix
subsystem: backend / data-prep
type: execute
tags: [phase-14, db-fix, p-d, d-05, backfill]
requires:
  - .planning/phases/11-drawfinancial-foundation/11-04-SUMMARY.md (Phase 11 backfill script, idempotent upsert)
provides:
  - backend/src/scripts/backfill-td-drawid.mjs (P-D mitigation)
  - backend/src/scripts/fix-prizes-processed.mjs (D-05 step 1)
  - DB state: TicketDetail.drawId fully populated; DrawFinancial.totalizedAt covers every DRAWN+prizesProcessed=true draw with reconciliation==0
affects:
  - 14-02 plan (shadow comparison now produces meaningful results)
  - Local prod-mirror DB (data-only — no schema changes)
tech_stack:
  added: []
  patterns: [refuse-without-confirm CLI gate, static-SQL UPDATE...FROM, totalizedAt-NULL resume gate]
key_files:
  created:
    - backend/src/scripts/backfill-td-drawid.mjs
    - backend/src/scripts/fix-prizes-processed.mjs
  modified: []
key_decisions:
  - "Option A predicate (TicketDetail.prize > 0) replaces plan's EXISTS Prize predicate — the `Prize` table does not exist in this codebase; prizes are denormalized onto TicketDetail.prize. Operator-approved during checkpoint."
  - "Reset totalizedAt=NULL for 133 pre-P-D-fix DrawFinancial rows so they re-totalize against the now-correct TicketDetail.drawId data. The Phase 11 backfill's resume gate (`df.totalizedAt IS NULL`) made this the lowest-risk path; upsert is idempotent."
metrics:
  duration_seconds: 417
  duration_human: ~7 min
  tasks_completed: 3
  commits: 4
  completed_at: 2026-05-15
---

# Phase 14 Plan 01: Report Refactor Prereq Data Fix Summary

DB is now ready for 14-02 shadow tests: all 2,468 DRAWN+prizesProcessed=true draws have correct DrawFinancial rows with zero reconciliation mismatches, and `REPORT_USE_MATERIALIZED` stays disabled pending those tests.

## What was built

1. **`backend/src/scripts/backfill-td-drawid.mjs`** — Phase 14 P-D mitigation script. Single static-SQL UPDATE that fills `TicketDetail.drawId` from `Ticket.drawId` where NULL. Refuse-without-confirm gate, dry-run mode with 5-row sample, idempotency assertion (after-NULL-count must be 0).
2. **`backend/src/scripts/fix-prizes-processed.mjs`** — Phase 14 D-05 step 1 script. Single static-SQL UPDATE that flips `Draw.prizesProcessed=true` for DRAWN draws whose tickets have at least one winning detail (`TicketDetail.prize > 0`). Same safety pattern as Task 1.
3. **Executed three-step data-prep sequence** against the local prod-mirror DB (5,937 DRAWN draws, 175,805 tickets, 659,509 TicketDetail rows).

## Data fix results

| Metric | Before | After | Affected |
|---|---|---|---|
| TicketDetail rows with `drawId IS NULL` | 621,689 | 0 | 621,689 |
| DRAWN draws with `prizesProcessed=false` AND winning detail (Option A predicate) | 2,335 | 0 | 2,335 |
| DRAWN draws with `prizesProcessed=true` total | 133 | 2,468 | +2,335 |
| `DrawFinancial` row count | 133 | 2,468 | +2,335 |
| `DrawFinancial` rows with `ticketCount > 0 AND totalSales = 0` (P-D regression check) | — | 0 | — |

**Residual `prizesProcessed=false` after Option A: 3,469** — these are all-loser DRAWN draws (zero winning details). For each, `DrawFinancial.totalPrize` would be 0 even if flipped, which is the same value the legacy aggregation path computes. The 14-02 shadow comparison will still pass for these. They are out of scope for this plan and recorded here so the operator can triage later if needed.

## Reconciliation

| Round | Total rows | Mismatches | CSV |
|---|---|---|---|
| 1st backfill --confirm (post td.drawId + prizesProcessed fixes) | 2,468 | 133 | `backend/storage/backfill-reports/draw-financial-recon-2026-05-15T23-51-04-013Z.csv` |
| 2nd backfill --confirm (after reset of 133 stale totalizedAt) | 2,468 | **0** | `backend/storage/backfill-reports/draw-financial-recon-2026-05-15T23-51-48-579Z.csv` |

Awk-based independent count over the final CSV: `mismatches: 0` across 2,468 rows. **Reconciliation PASS.**

## Commits

| SHA | Message |
|---|---|
| `72513a4` | feat(14-01): backfill-td-drawid.mjs (P-D mitigation script) |
| `a5e3831` | feat(14-01): fix-prizes-processed.mjs (D-05 step 1 script) |
| `088f785` | fix(14-01): use TicketDetail.prize predicate (schema reality) |
| (this commit) | docs(14-01): SUMMARY + Option A deviation |

## Flag status

**`REPORT_USE_MATERIALIZED` flag remains DISABLED.** It is absent from `backend/.env` (defaults to legacy path). Flag flip is deferred to Plan 14-02 last task per `quality_gate` and 14-CONTEXT D-05.

## Acceptance criteria status

| Criterion | Status |
|---|---|
| `node --check` exits 0 for both scripts | ✓ |
| Refuse-without-confirm exits 2 for both scripts | ✓ |
| `SELECT COUNT(*) FROM "TicketDetail" WHERE "drawId" IS NULL` = 0 | ✓ |
| No DRAWN draw with winning detail has `prizesProcessed=false` | ✓ |
| `COUNT(*) DrawFinancial` == `COUNT(*) DRAWN+prizesProcessed=true` | ✓ (both 2,468) |
| P-D regression: `DrawFinancial.ticketCount > 0 AND totalSales = 0` count = 0 | ✓ |
| Reconciliation CSV mismatches = 0 | ✓ |
| `backend/.env` REPORT_USE_MATERIALIZED unset/false | ✓ (absent) |
| `npm run db:generate` exits 0 | ✓ |

## Deviations from plan

### Auto-fixed during execution

**1. [Rule 1 / Rule 4 — schema mismatch] `Prize` table does not exist; switched predicate to Option A (TicketDetail.prize > 0)**

- **Found during:** Task 3 step 1 (baseline count query)
- **Issue:** 14-01-PLAN.md, 14-CONTEXT.md (D-05), and 14-RESEARCH.md all use the predicate `EXISTS (SELECT 1 FROM "Prize" p WHERE p."drawId" = "Draw".id)`. No `Prize` table exists in `backend/prisma/schema.prisma` — prizes are denormalized onto:
  - `Ticket.totalPrize` (Decimal, line 1002)
  - `Ticket.prizeDrawId` (String?, tripleta override, line 1009)
  - `TicketDetail.prize` (Decimal, line 1044)
  - `Draw.tripletaPrize` (Decimal, line 1156)
- **Fix:** Stopped before any DB write and returned a `checkpoint:decision`. Operator approved Option A (`EXISTS TicketDetail JOIN Ticket WITH TicketDetail.drawId fallback to Ticket.drawId, requiring td.prize > 0`). Updated `fix-prizes-processed.mjs`.
- **Files modified:** `backend/src/scripts/fix-prizes-processed.mjs`
- **Commit:** `088f785`
- **Impact on counts:** Original plan expected ~5,804 flips. Option A flipped **2,335** — the difference (3,469) is the all-loser-DRAWN-draws population that Option A intentionally excludes (no data signal that prize processing ran). Bounded false-negative documented in script header and above.

**2. [Rule 1 — bug surfaced by P-D fix] 133 pre-existing DrawFinancial rows had stale totals (materialized < live SUM after td.drawId backfill)**

- **Found during:** Task 3 step 8 (first Phase 11 backfill `--confirm` run) — reconciliation reported 133 mismatches.
- **Issue:** Those 133 rows were materialized BEFORE the td.drawId backfill ran. Their stored `totalSales` reflects the pre-P-D-fix world (sub-counted tickets that lacked TicketDetail.drawId). The Phase 11 backfill's resume gate (`LEFT JOIN DrawFinancial df ... WHERE df.totalizedAt IS NULL`) skips already-totalized rows, so it didn't recompute them.
- **Fix:** Used `awk` to extract the 133 mismatch drawIds from the recon CSV, applied `UPDATE "DrawFinancial" SET "totalizedAt"=NULL WHERE "drawId" IN (...)`, and re-ran the Phase 11 backfill --confirm. The upsert path then recomputed correct totals. Second reconciliation: 0 mismatches.
- **Files modified:** none (one-off SQL via `docker exec ... psql`; not committed because no source change needed)
- **Why this was safe:** Phase 11's `computeAndUpsertSales` and `computeAndUpsertPrizes` are idempotent (verified in 11-04-SUMMARY); the row identities (drawId PK) are preserved; only `totalizedAt`, `totalSales`, `totalPrize`, `utility`, `ticketCount` were rewritten with correct values.

### Auth gates

None.

### Known stubs

None.

### Threat flags

None — no new network surface, no schema changes, no new trust boundaries. STRIDE register from plan applied; T-14-01-04 (lock during 621k-row UPDATE) realized at ~8s, well within the acceptable budget.

## Self-Check: PASSED

**Files created (verified on disk):**
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/scripts/backfill-td-drawid.mjs` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/src/scripts/fix-prizes-processed.mjs` — FOUND
- `/Users/diazhh/Documents/GitHub/tote-web/backend/storage/backfill-reports/.gitkeep` — FOUND (pre-existing from Phase 11)
- `/Users/diazhh/Documents/GitHub/tote-web/backend/storage/backfill-reports/draw-financial-recon-2026-05-15T23-51-48-579Z.csv` — FOUND (2,468 rows, 0 mismatches)

**Commits verified in `git log`:**
- `72513a4` — FOUND
- `a5e3831` — FOUND
- `088f785` — FOUND

**DB state verified via `docker exec tote_postgres psql ...`:**
- TicketDetail.drawId NULL count = 0 — VERIFIED
- DrawFinancial count == DRAWN+prizesProcessed=true count (both 2,468) — VERIFIED
- P-D regression count = 0 — VERIFIED
