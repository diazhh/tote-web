/**
 * Phase 12 Backfill — ProviderCommissionLedger for all DRAWN draws from
 * 2026-04-17 (COMMISSION_GO_LIVE) to today.
 *
 * Safeguards:
 *   D-01 silent-skip surfaced — summary log includes skipped(no_config) count
 *   D-02 dry-run-required (refuses to write without --confirm)
 *   D-07 standalone CLI script, mirrors Phase 11 backfill-draw-financials.mjs
 *   F-17 triple defense:
 *     1. WHERE clause filters drawnAt >= COMMISSION_GO_LIVE
 *     2. Defense-in-depth COUNT check aborts with exit 3 if any pre-GO-LIVE
 *        ledger row already exists in the table
 *     3. Reconciliation CSV header carries GO_LIVE=2026-04-17 for audit trail
 *
 * Invocation (process.cwd() MUST be backend/):
 *   cd backend
 *   node src/scripts/backfill-provider-commissions.mjs                # exits 2, prints refusal
 *   node src/scripts/backfill-provider-commissions.mjs --dry-run      # inspects, writes nothing
 *   node src/scripts/backfill-provider-commissions.mjs --confirm      # real run
 *   node src/scripts/backfill-provider-commissions.mjs --confirm --chunk-size=200
 */

// Load .env BEFORE importing prisma — the Prisma client reads DATABASE_URL
// at constructor time. Server entry-point uses dotenv.config(); a standalone
// script needs the same bootstrap.
import 'dotenv/config';

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { computeAndUpsertLedgerForDraw } from '../services/commission.service.js';
import fs from 'fs/promises';
import path from 'path';

// F-17 — locked go-live date per REQUIREMENTS.md FIN-COMM-12. Backfill MUST
// abort if any candidate draw has drawnAt < this. Venezuela is UTC-4 (no DST).
const COMMISSION_GO_LIVE = new Date('2026-04-17T00:00:00-04:00');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CONFIRM = argv.includes('--confirm');

const chunkArg = argv.find((a) => a.startsWith('--chunk-size='));
const rawChunk = chunkArg ? parseInt(chunkArg.split('=')[1], 10) : 100;
const CHUNK_SIZE = Number.isFinite(rawChunk)
  ? Math.min(500, Math.max(50, rawChunk))
  : 100;

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
  log(
    `Phase 12 Backfill starting — mode=${
      DRY_RUN ? 'DRY-RUN' : 'WRITE'
    }, chunkSize=${CHUNK_SIZE}, COMMISSION_GO_LIVE=${COMMISSION_GO_LIVE.toISOString()}`
  );

  // 1. F-17 defense-in-depth check — assert NO existing ledger row points to
  //    a pre-GO-LIVE draw. If this fires, the schema invariant has been
  //    breached and the operator MUST investigate before proceeding.
  const preGoLiveRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM "Draw" d
    WHERE d.status = 'DRAWN'
      AND d."prizesProcessed" = true
      AND d."drawnAt" < ${COMMISSION_GO_LIVE}
      AND EXISTS (
        SELECT 1 FROM "ProviderCommissionLedger" cl
        WHERE cl."drawId" = d.id
      )
  `;
  const preGoLiveCount = preGoLiveRows[0]?.n ?? 0;
  if (preGoLiveCount > 0) {
    logger.error(
      `F-17 DEFENSE-IN-DEPTH BREACH: ${preGoLiveCount} ProviderCommissionLedger rows reference draws with drawnAt < ${COMMISSION_GO_LIVE.toISOString()}`
    );
    console.error(
      `\nABORTING. Investigate the offending rows before re-running:\n` +
        `  SELECT cl."drawId", d."drawnAt"\n` +
        `  FROM "ProviderCommissionLedger" cl\n` +
        `  JOIN "Draw" d ON d.id = cl."drawId"\n` +
        `  WHERE d."drawnAt" < '${COMMISSION_GO_LIVE.toISOString()}'\n` +
        `  LIMIT 10;\n`
    );
    process.exit(3);
  }
  log(`F-17 defense-in-depth check passed (0 pre-GO_LIVE ledger rows).`);

  // 2. Candidate draws — DRAWN, prizes processed, no existing ledger row,
  //    AND has at least one DrawFinancialProvider with apiSystemId. Filter
  //    is keyed on drawnAt >= COMMISSION_GO_LIVE (F-17 primary defense).
  const remaining = await prisma.$queryRaw`
    SELECT d.id, d."drawnAt"
    FROM "Draw" d
    WHERE d.status = 'DRAWN'
      AND d."prizesProcessed" = true
      AND d."drawnAt" >= ${COMMISSION_GO_LIVE}
      AND NOT EXISTS (
        SELECT 1 FROM "ProviderCommissionLedger" cl
        WHERE cl."drawId" = d.id
      )
      AND EXISTS (
        SELECT 1 FROM "DrawFinancialProvider" dfp
        WHERE dfp."drawId" = d.id
          AND dfp."apiSystemId" IS NOT NULL
      )
    ORDER BY d."drawnAt" ASC
  `;
  log(`Remaining draws to backfill: ${remaining.length} (chunk size ${CHUNK_SIZE})`);

  // Belt-and-suspenders: if anything slipped through the SQL, abort.
  for (const draw of remaining) {
    if (new Date(draw.drawnAt) < COMMISSION_GO_LIVE) {
      logger.error(
        `F-17 PRIMARY FILTER BYPASS: draw ${draw.id} drawnAt=${draw.drawnAt} is before GO_LIVE`
      );
      process.exit(3);
    }
  }

  // 3. Chunked processing loop.
  let processed = 0;
  let totalSkipped = 0; // D-01 silent-skip count (no effective config)
  let errors = 0;
  const totalChunks = Math.ceil(remaining.length / CHUNK_SIZE);

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const slice = remaining.slice(
      chunkIdx * CHUNK_SIZE,
      (chunkIdx + 1) * CHUNK_SIZE
    );
    for (const draw of slice) {
      if (DRY_RUN) {
        processed++;
        continue;
      }
      try {
        const r = await computeAndUpsertLedgerForDraw(draw.id);
        processed++;
        totalSkipped += r.skipped || 0;
      } catch (err) {
        errors++;
        logger.error(`Backfill error draw=${draw.id}: ${err.message}`, {
          stack: err.stack,
        });
      }
    }
    log(
      `Chunk ${chunkIdx + 1}/${totalChunks}: processed ${processed}/${remaining.length}, errors=${errors}, skipped(no_config)=${totalSkipped}`
    );
  }

  // 4. Reconciliation CSV — written for BOTH dry-run and confirm so the operator
  //    can inspect the candidate set before approving the write.
  const reportDir = path.join(process.cwd(), 'storage', 'backfill-reports');
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(
    reportDir,
    `provider-commission-recon-${stamp}.csv`
  );

  let csvRows;
  if (DRY_RUN) {
    // For dry-run: project what would be written by re-loading the effective
    // config for each (provider, drawnAt) pair. This is read-only.
    const projection = await prisma.$queryRaw`
      WITH candidates AS (
        SELECT d.id AS "drawId", d."drawnAt"
        FROM "Draw" d
        WHERE d.status = 'DRAWN'
          AND d."prizesProcessed" = true
          AND d."drawnAt" >= ${COMMISSION_GO_LIVE}
          AND NOT EXISTS (
            SELECT 1 FROM "ProviderCommissionLedger" cl
            WHERE cl."drawId" = d.id
          )
        ORDER BY d."drawnAt" ASC
      )
      SELECT
        c."drawId",
        dfp."apiSystemId",
        dfp."totalSales"::text  AS "salesBase",
        (dfp."totalSales" - dfp."totalPrize")::text AS "utilityBase",
        cfg."formulaType"::text AS "formulaType",
        cfg."salesRate"::text    AS "salesRate",
        cfg."utilityRate"::text  AS "utilityRate",
        cfg."effectiveFrom"      AS "configEffectiveFrom",
        c."drawnAt"
      FROM candidates c
      JOIN "DrawFinancialProvider" dfp
        ON dfp."drawId" = c."drawId" AND dfp."apiSystemId" IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT *
        FROM "ProviderCommissionConfig" pc
        WHERE pc."apiSystemId" = dfp."apiSystemId"
          AND pc."effectiveFrom" <= c."drawnAt"
        ORDER BY pc."effectiveFrom" DESC
        LIMIT 1
      ) cfg ON TRUE
    `;
    csvRows = projection.map((p) => {
      // Naive computed amount projection — only SALES_PCT / UTILITY_PCT /
      // SALES_AND_UTILITY_PCT. TIERED is left as 'TIERED-pending-compute'
      // because cumulative-weekly-sales depends on the actual write order.
      let computed = '';
      const sales = Number(p.salesBase || 0);
      const util = Number(p.utilityBase || 0);
      const sr = Number(p.salesRate || 0);
      const ur = Number(p.utilityRate || 0);
      if (!p.formulaType) {
        computed = '(no_config)';
      } else if (p.formulaType === 'SALES_PCT') {
        computed = ((sales * sr) / 100).toFixed(8);
      } else if (p.formulaType === 'UTILITY_PCT') {
        computed = ((util * ur) / 100).toFixed(8);
      } else if (p.formulaType === 'SALES_AND_UTILITY_PCT') {
        computed = ((sales * sr) / 100 + (util * ur) / 100).toFixed(8);
      } else if (p.formulaType === 'TIERED') {
        computed = 'TIERED-pending-compute';
      }
      return {
        drawId: p.drawId,
        apiSystemId: p.apiSystemId,
        formulaType: p.formulaType || '',
        salesBase: p.salesBase || '',
        utilityBase: p.utilityBase || '',
        computedAmount: computed,
        configEffectiveFrom: p.configEffectiveFrom
          ? new Date(p.configEffectiveFrom).toISOString()
          : '',
      };
    });
  } else {
    // After --confirm: emit one row per ledger row written this run (and
    // pre-existing rows in scope, for full audit).
    const written = await prisma.$queryRaw`
      SELECT cl."drawId",
             cl."apiSystemId",
             cl."configSnapshot"->>'formulaType' AS "formulaType",
             cl."salesBase"::text     AS "salesBase",
             cl."utilityBase"::text   AS "utilityBase",
             cl."amount"::text        AS "computedAmount",
             cfg."effectiveFrom"      AS "configEffectiveFrom"
      FROM "ProviderCommissionLedger" cl
      JOIN "Draw" d ON d.id = cl."drawId"
      LEFT JOIN "ProviderCommissionConfig" cfg ON cfg.id = cl."configId"
      WHERE d."drawnAt" >= ${COMMISSION_GO_LIVE}
      ORDER BY d."drawnAt" ASC
    `;
    csvRows = written.map((w) => ({
      drawId: w.drawId,
      apiSystemId: w.apiSystemId,
      formulaType: w.formulaType || '',
      salesBase: w.salesBase || '',
      utilityBase: w.utilityBase || '',
      computedAmount: w.computedAmount || '',
      configEffectiveFrom: w.configEffectiveFrom
        ? new Date(w.configEffectiveFrom).toISOString()
        : '',
    }));
  }

  // F-17 audit trail in CSV header.
  const csvHeader = `# GO_LIVE=${COMMISSION_GO_LIVE.toISOString()} mode=${
    DRY_RUN ? 'dry-run' : 'confirm'
  } generated=${new Date().toISOString()}`;
  const lines = [
    csvHeader,
    'drawId,apiSystemId,formulaType,salesBase,utilityBase,computedAmount,configEffectiveFrom',
  ];
  for (const r of csvRows) {
    lines.push(
      [
        r.drawId,
        r.apiSystemId,
        r.formulaType,
        r.salesBase,
        r.utilityBase,
        r.computedAmount,
        r.configEffectiveFrom,
      ]
        .map((v) => String(v ?? '').replace(/,/g, ';'))
        .join(',')
    );
  }
  await fs.writeFile(reportPath, lines.join('\n') + '\n', 'utf8');

  // 5. Summary line — surfaces D-01 silent-skip count per the plan.
  log(
    `Reconciliation CSV: ${reportPath} — rows=${csvRows.length}, mode=${
      DRY_RUN ? 'dry-run' : 'confirm'
    }`
  );
  log(
    `SUMMARY: ledgerWritten=${
      DRY_RUN ? 0 : processed - errors
    }, skipped(no_config)=${totalSkipped}, errors=${errors}, drawsConsidered=${remaining.length}`
  );

  if (DRY_RUN) {
    log('DRY-RUN complete — no changes written. Re-run with --confirm to apply.');
  } else if (errors > 0) {
    log(`WARN: ${errors} draws failed during backfill — see error logs above.`);
    process.exitCode = 1;
  } else {
    log('Backfill complete — no errors.');
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
