/**
 * Phase 14 — P-D mitigation: backfill TicketDetail.drawId
 *
 * Purpose:
 *   Phase 14 RESEARCH (Pitfall P-D) verified empirically that ~94% of
 *   TicketDetail rows in the prod-mirror have drawId IS NULL (621,689 of
 *   659,509 rows). These are legacy single-draw tickets that pre-date the
 *   Phase 8 multi-draw webhook adapter. Phase 11's DrawFinancial backfill
 *   aggregates sales via `WHERE td."drawId" = ${drawId}` (no COALESCE), so
 *   re-running it BEFORE filling these NULLs would yield totalSales=0 for
 *   ~5,704 historical draws and contaminate the 14-02 D-06 shadow tests.
 *
 *   This script flips `TicketDetail.drawId = ticket.drawId` ONLY where
 *   `td."drawId" IS NULL`. Multi-draw webhook tickets already have
 *   per-detail drawId set explicitly by the Phase 8 adapter, so the
 *   WHERE clause skips them. Safe and idempotent.
 *
 * Safeguards (clone of Phase 11 backfill safety pattern):
 *   - Refuse-without-confirm gate (exit 2)
 *   - --dry-run mode: read-only inspection, prints before-count + 5-row sample
 *   - --confirm mode: applies the UPDATE inside a single static SQL statement
 *   - Static SQL only — no user-controlled interpolation enters the query body
 *   - Idempotency assertion: after-NULL-count MUST be 0 on success
 *
 * Invocation (process.cwd() MUST be backend/):
 *   cd backend
 *   node src/scripts/backfill-td-drawid.mjs                # exits 2, prints refusal
 *   node src/scripts/backfill-td-drawid.mjs --dry-run      # inspects, writes nothing
 *   node src/scripts/backfill-td-drawid.mjs --confirm      # writes the UPDATE
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
  log(`Phase 14 P-D — TicketDetail.drawId backfill starting — mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  // 1. Before-count
  const beforeRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS null_count
    FROM "TicketDetail"
    WHERE "drawId" IS NULL
  `;
  const beforeNull = beforeRows[0]?.null_count ?? 0;
  log(`Before: TicketDetail rows with drawId IS NULL = ${beforeNull}`);

  // 2. Dry-run sample (read-only)
  if (DRY_RUN) {
    const sample = await prisma.$queryRaw`
      SELECT td."ticketId", t."drawId" AS target_draw_id
      FROM "TicketDetail" td
      JOIN "Ticket" t ON t.id = td."ticketId"
      WHERE td."drawId" IS NULL
      LIMIT 5
    `;
    log('Dry-run sample (first 5 candidates):', sample);
    log('DRY-RUN complete — no changes written. Re-run with --confirm to apply.');
    return;
  }

  // 3. The UPDATE (CONFIRM path) — static SQL, no interpolation
  const affected = await prisma.$executeRaw`
    UPDATE "TicketDetail" td
    SET    "drawId" = t."drawId"
    FROM   "Ticket" t
    WHERE  td."ticketId" = t.id
      AND  td."drawId" IS NULL
  `;
  log(`UPDATE complete — affected rows reported by Postgres = ${affected}`);

  // 4. After-count
  const afterRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS null_count
    FROM "TicketDetail"
    WHERE "drawId" IS NULL
  `;
  const afterNull = afterRows[0]?.null_count ?? 0;
  log(`After: TicketDetail rows with drawId IS NULL = ${afterNull}`);

  // 5. Idempotency assertion
  if (afterNull !== 0) {
    process.exitCode = 1;
    console.error(
      `ERROR: residual TicketDetail.drawId NULL count = ${afterNull} after UPDATE. ` +
      'A Ticket with a NULL drawId itself would be the only cause — investigate before proceeding.'
    );
    return;
  }

  log(`Backfill complete: updated=${affected}, null_count_after=${afterNull}`);
}

main()
  .catch((err) => {
    logger.error(`backfill-td-drawid aborted: ${err.message}`, { stack: err.stack });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
