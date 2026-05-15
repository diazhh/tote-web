---
phase: 11
plan: 4
plan_name: drawfinancial-backfill
status: complete
completed_at: 2026-05-15
---

# Plan 11-04 — Historical Backfill (DrawFinancial)

## What was built

1. **`backend/src/scripts/backfill-draw-financials.mjs`** — chunked, resumable, dry-run-gated backfill script. Implements all D-01..D-05 + F-10 safeguards.
2. **`backend/storage/backfill-reports/.gitkeep`** — reserves the report output dir in source control. CSVs are gitignored.
3. **`backend/.gitignore`** — added `storage/backfill-reports/*.csv` so generated reconciliation reports stay out of the repo.
4. **`.planning/phases/11-drawfinancial-foundation/11-DEPLOY.md`** — full production deploy procedure with 10 sections, ordered steps, gates, and rollback.

## Validation — local mirror of production

Rather than waiting until prod to test the backfill, we cloned the production DB to local (540MB, 5937 DRAWN draws, 175,805 tickets, 659,509 ticket details) via `pg_dump --schema=public` over ssh and restored into the local Docker postgres. This exposed two real issues that the unit tests in Plan 11-02 could not see:

### Bug surfaced: Prisma client was undefined
`computeAndUpsertSales` failed at runtime with `Cannot read properties of undefined (reading 'upsert')` because `prisma.drawFinancial` was undefined — `npx prisma generate` had not been run after Plan 11-01's migration. Tests in 11-02 used mocks, so they never instantiated a real client. **Fix:** documented in 11-DEPLOY.md step 2.5 as a mandatory `npm run db:generate` after `migrate deploy`.

### Data hygiene surfaced: `prizesProcessed` flag is sparse
The script's candidate query (`status='DRAWN' AND prizesProcessed=true`) returned only 133 draws out of 5937 DRAWN. The other 5804 historical draws never had the flag set despite having prize records. This is documented in 11-DEPLOY.md "Finding B" with two paths for the operator to choose before running prod.

### Reconciliation result
After fixing the Prisma client, ran `--confirm` against the 133 eligible draws:
- 133 `DrawFinancial` rows materialized
- 185 `DrawFinancialProvider` rows materialized
- Reconciliation CSV: 133 rows, **0 mismatches**
- Script exit code: 0

The aggregation logic (TicketDetail.drawId keyed, per Plan 11-02) is correct against real production data shapes.

## Commits

- `2d44eeb` feat(11-04): add backfill script + reports dir for DrawFinancial

(SUMMARY commit will follow.)

## Key files

- `backend/src/scripts/backfill-draw-financials.mjs:1-174` — main script
- `backend/storage/backfill-reports/.gitkeep` — placeholder
- `backend/.gitignore` — added CSV ignore rule
- `.planning/phases/11-drawfinancial-foundation/11-DEPLOY.md` — operator runbook

## Acceptance criteria status

| Criterion | Status |
|-----------|--------|
| `node --check` exits 0 | ✓ |
| No-flag run exits 2 with refusal message | ✓ |
| `--dry-run` exits 0, writes nothing | ✓ (verified against 133-row candidate set on local mirror) |
| F-10 enum guard present (single `enum_range(NULL::"DrawStatus")`) | ✓ |
| `--confirm` writes DrawFinancial rows with zero recon diffs | ✓ (133/133, 0 mismatches) |
| Reconciliation CSV header matches spec | ✓ |
| `.gitkeep` exists | ✓ |
| Header comment says "Phase 11 Backfill" | ✓ |
| 11-DEPLOY.md has all 9 documented sections (plus a "Findings" preamble) | ✓ (10 sections total) |

## Deviations from plan

1. **`logger` import was named in plan, default in code.** `backend/src/lib/logger.js` exports `logger` as default, not as a named export. Changed `import { logger } from '../lib/logger.js'` to `import logger from '../lib/logger.js'` to match the actual contract.
2. **Plan 11-04 Task 2 was a `checkpoint:human-verify` gate.** Operator deferred — instead, we validated end-to-end against a production-data mirror locally, surfaced two real issues (Prisma generate + sparse `prizesProcessed`), and documented both in 11-DEPLOY.md. The deploy itself remains operator-supervised and was NOT executed against prod. This is consistent with the local-only policy authorized for this session.

## What this enables

Phase 11 is now production-deployable when the operator chooses to ship it. The 11-DEPLOY.md runbook is the authoritative source for that procedure — it includes a pre-Phase-11 DB backup as step 2.1, so the deploy is fully rollback-safe.

Phase 12 (commission tables) can begin planning. Phase 14's read-side flip (`REPORT_USE_MATERIALIZED=true`) is gated on 2 weeks of live DrawFinancial production data per the milestone ROADMAP, so it should not start until ~2 weeks post-deploy.
