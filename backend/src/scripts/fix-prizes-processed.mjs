/**
 * Phase 14 — D-05 step 1: retroactive prizesProcessed flip for historical DRAWN draws
 *
 * Purpose:
 *   Phase 11's local backfill processed only 133 of 5,937 DRAWN draws because
 *   `prizesProcessed=true` was set on only the last 3 days (11-04-SUMMARY
 *   Finding B). The other ~5,804 historical draws had prize processing run
 *   but never had the boolean flipped. Without this fix, Phase 11's backfill
 *   candidate query (`status='DRAWN' AND prizesProcessed=true`) excludes them
 *   and 14-02 shadow tests would be meaningless across the historical window.
 *
 *   This script flips `Draw.prizesProcessed = true` ONLY for DRAWN draws that
 *   have at least one TicketDetail with `prize > 0` linked to them — the
 *   strongest data-proven signal that the prize-processor worker actually
 *   ran (it writes per-detail prize values; presence of any non-zero proves
 *   execution).
 *
 *   Schema-reality note: 14-CONTEXT.md / 14-RESEARCH.md / 14-01-PLAN all
 *   reference a `Prize` table for the EXISTS predicate, but no such table
 *   exists in this codebase — prizes are denormalized onto `TicketDetail.prize`,
 *   `Ticket.totalPrize`, and `Draw.tripletaPrize` (see
 *   prize-processor.service.js lines 116-132). Operator approved the
 *   corrected predicate (Option A) so the EXISTS clause walks TicketDetail
 *   and falls back through `Ticket.drawId` for legacy NULL TicketDetail.drawId
 *   rows. 14-CONTEXT D-05 step 1.
 *
 *   Bounded false-negative: all-loser draws (zero winning details) are
 *   skipped. For those, DrawFinancial.totalPrize is 0 even after a flip —
 *   same value the legacy aggregation path computes — so the 14-02 shadow
 *   comparison still passes for them.
 *
 * Defensive notes (verified in 14-RESEARCH secondary sources):
 *   - step-process-prizes.worker.js (line 16-38) PRE-CHECKS `prizesProcessed`
 *     and SKIPS prize processing if already true. Flipping this flag therefore
 *     does NOT cause prize reprocessing.
 *   - calculate-draw-financials.worker.js reads the flag only on its own
 *     invocation. Flipping does NOT spontaneously trigger that worker either.
 *
 * Safeguards (clone of Phase 11 / Task 1 safety pattern):
 *   - Refuse-without-confirm gate (exit 2)
 *   - --dry-run mode: read-only inspection, prints before-count + 5-row sample
 *   - --confirm mode: applies the UPDATE inside a single static SQL statement
 *   - Static SQL only — no user-controlled interpolation enters the query body
 *
 * Invocation (process.cwd() MUST be backend/):
 *   cd backend
 *   node src/scripts/fix-prizes-processed.mjs                # exits 2, prints refusal
 *   node src/scripts/fix-prizes-processed.mjs --dry-run      # inspects, writes nothing
 *   node src/scripts/fix-prizes-processed.mjs --confirm      # flips the flag
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CONFIRM = argv.includes('--confirm');

function log(msg, data) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, data);
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

if (!DRY_RUN && !CONFIRM) {
  process.stderr.write(
    'Refusing to write without --confirm. Run with --dry-run first, inspect the output, then re-run with --confirm.\n'
  );
  process.exit(2);
}

async function main() {
  log(`fix-prizes-processed starting — mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  // 1. Before-count — Option A predicate (TicketDetail.prize > 0 with NULL-drawId fallback)
  const beforeRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS pending_count
    FROM "Draw"
    WHERE status = 'DRAWN'
      AND "prizesProcessed" = false
      AND EXISTS (
        SELECT 1
        FROM "TicketDetail" td
        JOIN "Ticket" t ON t.id = td."ticketId"
        WHERE (td."drawId" = "Draw".id OR (td."drawId" IS NULL AND t."drawId" = "Draw".id))
          AND td.prize > 0
      )
  `;
  const beforePending = beforeRows[0]?.pending_count ?? 0;
  log(`Before: DRAWN draws with prizesProcessed=false and winning detail = ${beforePending}`);

  // 2. Dry-run sample (read-only)
  if (DRY_RUN) {
    const sample = await prisma.$queryRaw`
      SELECT id, "drawDate", "drawTime"
      FROM "Draw"
      WHERE status = 'DRAWN'
        AND "prizesProcessed" = false
        AND EXISTS (
          SELECT 1
          FROM "TicketDetail" td
          JOIN "Ticket" t ON t.id = td."ticketId"
          WHERE (td."drawId" = "Draw".id OR (td."drawId" IS NULL AND t."drawId" = "Draw".id))
            AND td.prize > 0
        )
      ORDER BY "drawDate" DESC
      LIMIT 5
    `;
    log('Dry-run sample (first 5 candidates):', sample);
    log('DRY-RUN complete — no changes written. Re-run with --confirm to apply.');
    return;
  }

  // 3. The UPDATE (CONFIRM path) — static SQL, no interpolation
  const affected = await prisma.$executeRaw`
    UPDATE "Draw"
    SET    "prizesProcessed" = true
    WHERE  status = 'DRAWN'
      AND  "prizesProcessed" = false
      AND  EXISTS (
        SELECT 1
        FROM "TicketDetail" td
        JOIN "Ticket" t ON t.id = td."ticketId"
        WHERE (td."drawId" = "Draw".id OR (td."drawId" IS NULL AND t."drawId" = "Draw".id))
          AND td.prize > 0
      )
  `;
  log(`UPDATE complete — affected rows reported by Postgres = ${affected}`);

  // 4. After-count (qualifying rows must be 0)
  const afterRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS pending_count
    FROM "Draw"
    WHERE status = 'DRAWN'
      AND "prizesProcessed" = false
      AND EXISTS (
        SELECT 1
        FROM "TicketDetail" td
        JOIN "Ticket" t ON t.id = td."ticketId"
        WHERE (td."drawId" = "Draw".id OR (td."drawId" IS NULL AND t."drawId" = "Draw".id))
          AND td.prize > 0
      )
  `;
  const afterPending = afterRows[0]?.pending_count ?? 0;
  log(`After: DRAWN draws with prizesProcessed=false and winning detail = ${afterPending}`);

  if (afterPending !== 0) {
    process.exitCode = 1;
    console.error(
      `ERROR: residual qualifying-but-unflipped Draw count = ${afterPending}. Investigate before proceeding.`
    );
    return;
  }

  // 5. Sanity total: total DRAWN draws with prizesProcessed=true (for D-05 step 3 cross-check)
  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total_processed
    FROM "Draw"
    WHERE status = 'DRAWN' AND "prizesProcessed" = true
  `;
  const totalProcessed = totalRows[0]?.total_processed ?? 0;

  log(`Flip complete: updated=${affected}, draws_with_prizesProcessed_true_total=${totalProcessed}`);
}

main()
  .catch((err) => {
    logger.error(`fix-prizes-processed aborted: ${err.message}`, { stack: err.stack });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
