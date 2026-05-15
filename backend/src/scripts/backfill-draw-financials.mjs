/**
 * Phase 11 Backfill — DrawFinancial + DrawFinancialProvider for all DRAWN draws.
 *
 * Safeguards:
 *   D-01 chunked + resumable via LEFT JOIN on DrawFinancial.totalizedAt IS NULL
 *   D-02 dry-run-required (refuses to write without --confirm)
 *   D-03 deploy-window only (operator-supervised)
 *   D-04 full reconciliation CSV, zero-mismatch gate
 *   D-05 historical totalizedAt = Draw.drawnAt (NOT new Date())
 *   F-10 enum guard: aborts if DrawStatus enum still contains PUBLISHED
 *
 * Invocation (process.cwd() MUST be backend/):
 *   cd backend
 *   node src/scripts/backfill-draw-financials.mjs                # exits 2, prints refusal
 *   node src/scripts/backfill-draw-financials.mjs --dry-run      # inspects, writes nothing
 *   node src/scripts/backfill-draw-financials.mjs --confirm      # real run
 *   node src/scripts/backfill-draw-financials.mjs --confirm --chunk-size=200
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import {
  computeAndUpsertSales,
  computeAndUpsertPrizes,
  PrizesNotProcessedError,
} from '../services/draw-financial.service.js';
import fs from 'fs/promises';
import path from 'path';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CONFIRM = argv.includes('--confirm');

const chunkArg = argv.find((a) => a.startsWith('--chunk-size='));
const rawChunk = chunkArg ? parseInt(chunkArg.split('=')[1], 10) : 100;
const CHUNK_SIZE = Number.isFinite(rawChunk) ? Math.min(500, Math.max(50, rawChunk)) : 100;

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
  log(`Phase 11 Backfill starting — mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}, chunkSize=${CHUNK_SIZE}`);

  // 1. Enum verification (F-10) — MUST be first DB call.
  const enumRows = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"DrawStatus")) AS v`;
  const enumValues = enumRows.map((r) => r.v);
  for (const row of enumRows) {
    if (row.v === 'PUBLISHED') {
      throw new Error('Unexpected PUBLISHED enum value detected — DB not migrated. Aborting.');
    }
  }
  log(`Enum DrawStatus verified: ${enumValues.join(', ')}`);

  // 2. Load remaining work (D-01 resumable).
  const remaining = await prisma.$queryRaw`
    SELECT d.id, d."drawnAt", d."closedAt"
    FROM "Draw" d
    LEFT JOIN "DrawFinancial" df ON df."drawId" = d.id
    WHERE d.status = 'DRAWN'
      AND d."prizesProcessed" = true
      AND df."totalizedAt" IS NULL
    ORDER BY d."drawDate" ASC, d."drawTime" ASC
  `;
  log(`Remaining draws to backfill: ${remaining.length} (chunk size ${CHUNK_SIZE})`);

  // 3. Chunked processing loop (D-01).
  let processed = 0;
  let errors = 0;
  const totalChunks = Math.ceil(remaining.length / CHUNK_SIZE);
  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const slice = remaining.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);
    for (const draw of slice) {
      if (DRY_RUN) {
        processed++;
        continue;
      }
      try {
        await computeAndUpsertSales(draw.id, draw.closedAt);
        // D-05: pass drawnAt (historical) — NOT new Date()
        await computeAndUpsertPrizes(draw.id, draw.drawnAt);
        processed++;
      } catch (err) {
        if (err instanceof PrizesNotProcessedError) {
          log(`Skip draw=${draw.id} — prizes not processed (defensive)`, { reason: err.message });
        } else {
          errors++;
          logger.error(`Backfill error draw=${draw.id}: ${err.message}`, { stack: err.stack });
        }
      }
    }
    log(`Chunk ${chunkIdx + 1}/${totalChunks}: processed ${processed}/${remaining.length}`);
  }

  // Dry-run sample print for operator inspection
  if (DRY_RUN && remaining.length > 0) {
    const sample = remaining.slice(0, 5).map((d) => ({ id: d.id, drawnAt: d.drawnAt }));
    log('Dry-run sample (first 5 candidates):', sample);
  }

  // 4. Dry-run early exit.
  if (DRY_RUN) {
    log('DRY-RUN complete — no changes written. Re-run with --confirm to apply.');
    return;
  }

  if (errors > 0) {
    log(`WARN: ${errors} draws failed during backfill. Proceeding to reconciliation.`);
  }

  // 5. Reconciliation CSV (D-04).
  const reportDir = path.join(process.cwd(), 'storage', 'backfill-reports');
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `draw-financial-recon-${stamp}.csv`);

  const reconRows = await prisma.$queryRaw`
    SELECT df."drawId",
           df."totalSales"::text AS materialized_sales,
           (SELECT COALESCE(SUM(td.amount), 0)::numeric(12,2)
            FROM "TicketDetail" td
            JOIN "Ticket" t ON t.id = td."ticketId"
            WHERE td."drawId" = df."drawId"
              AND t.status != 'CANCELLED')::text AS live_sales
    FROM "DrawFinancial" df
  `;

  let mismatches = 0;
  const lines = ['drawId,materialized_sales,live_sales,diff'];
  for (const row of reconRows) {
    const materialized = Number(row.materialized_sales);
    const live = Number(row.live_sales);
    const diff = Number((materialized - live).toFixed(2));
    if (diff !== 0) mismatches++;
    lines.push(`${row.drawId},${row.materialized_sales},${row.live_sales},${diff}`);
  }
  await fs.writeFile(reportPath, lines.join('\n') + '\n', 'utf8');

  log(`Reconciliation CSV: ${reportPath} — total=${reconRows.length}, mismatches=${mismatches}`);

  if (mismatches > 0) {
    process.exitCode = 1;
    console.error(
      `ERROR: ${mismatches} draws have materialized != live SUM. Investigate before declaring backfill complete.`
    );
  } else {
    log('Reconciliation PASS — zero mismatches.');
  }
}

main()
  .catch((err) => {
    logger.error(`Backfill aborted: ${err.message}`, { stack: err.stack });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
