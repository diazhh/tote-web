/**
 * Phase 12 — weekly-settlement-snapshot pg-boss worker.
 *
 * Cron-triggered every Monday 06:00 VE via /etc/cron.d/tote-triggers (Plan 12-03
 * adds the allowlist entry to trigger-pgboss-cron.mjs). Payload is empty —
 * worker computes the target ISO week from new Date().
 *
 * Reference date is "yesterday" — guarantees we're inside the prior ISO week
 * even if cron fires a few minutes late.
 *
 * State-conditional logic (NO upsert call — D-03 freeze requires explicit
 * branch on existing.status):
 *   - no existing row  → CREATE DRAFT
 *   - existing DRAFT   → UPDATE amount + ledgerRowCount + snapshotAt
 *   - existing CONFIRMED + no drift → freeze (no change)
 *   - existing CONFIRMED + drift    → mark ADJUSTED (D-02 path 2) with
 *                                     adjustmentReason 'auto: drift detected by snapshot'
 *                                     and warn log; amount is NOT overwritten
 *   - existing ADJUSTED → freeze (terminal vs automatic recomputation)
 */

import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import Decimal from 'decimal.js';
import { subDays } from 'date-fns';
import {
  getISOWeekVE,
  startOfISOWeekVE,
  endOfISOWeekVE,
} from '../../lib/dateUtils.js';

export async function weeklySettlementSnapshotWorker(jobs) {
  // pg-boss v10 — jobs may arrive as an array. Payload is empty for cron-triggered.
  // We still unwrap defensively so the handler tolerates both shapes.
  // eslint-disable-next-line no-unused-vars
  const job = Array.isArray(jobs) ? jobs[0] : jobs;

  // Cron fires Monday 06:00 VE → reference yesterday so we firmly sit inside the
  // prior ISO week even if cron fires late.
  const referenceDate = subDays(new Date(), 1);
  const { isoYear, isoWeek } = getISOWeekVE(referenceDate);
  const start = startOfISOWeekVE(referenceDate);
  const end = endOfISOWeekVE(referenceDate);

  logger.info(
    `[weekly-settlement-snapshot] isoYear=${isoYear} isoWeek=${isoWeek} range=${start.toISOString()}..${end.toISOString()}`,
  );

  // GROUP BY apiSystemId across the closed week's ledger rows. JOIN to Draw
  // because ProviderCommissionLedger does not store drawnAt.
  const byProvider = await prisma.$queryRaw`
    SELECT cl."apiSystemId",
           SUM(cl.amount)::numeric(18,8) AS "totalAmount",
           COUNT(*)::int                  AS "ledgerRowCount"
    FROM   "ProviderCommissionLedger" cl
    JOIN   "Draw" d ON d.id = cl."drawId"
    WHERE  d."drawnAt" >= ${start}
      AND  d."drawnAt" <= ${end}
    GROUP  BY cl."apiSystemId"
  `;

  let created = 0;
  let updated = 0;
  let frozen = 0;
  let drifted = 0;

  for (const row of byProvider) {
    const existing = await prisma.providerWeeklySettlement.findFirst({
      where: { apiSystemId: row.apiSystemId, isoYear, isoWeek },
    });

    if (!existing) {
      await prisma.providerWeeklySettlement.create({
        data: {
          apiSystemId: row.apiSystemId,
          isoYear,
          isoWeek,
          amount: row.totalAmount,
          ledgerRowCount: row.ledgerRowCount,
          status: 'DRAFT',
          snapshotAt: new Date(),
        },
      });
      created++;
      continue;
    }

    if (existing.status === 'DRAFT') {
      await prisma.providerWeeklySettlement.update({
        where: { id: existing.id },
        data: {
          amount: row.totalAmount,
          ledgerRowCount: row.ledgerRowCount,
          snapshotAt: new Date(),
        },
      });
      updated++;
      continue;
    }

    // CONFIRMED or ADJUSTED — D-03 freeze. Check drift (D-02 path 2).
    const existingAmt = new Decimal(existing.amount.toString());
    const newAmt = new Decimal(row.totalAmount.toString());
    const drift = !existingAmt.equals(newAmt);

    if (drift && existing.status === 'CONFIRMED') {
      await prisma.providerWeeklySettlement.update({
        where: { id: existing.id },
        data: {
          status: 'ADJUSTED',
          adjustmentReason: 'auto: drift detected by snapshot',
        },
      });
      drifted++;
      logger.warn('[weekly-settlement-snapshot] drift_detected', {
        id: existing.id,
        apiSystemId: row.apiSystemId,
        isoYear,
        isoWeek,
        oldAmount: existing.amount.toString(),
        newAmount: row.totalAmount.toString(),
      });
      continue;
    }

    // CONFIRMED no-drift OR ADJUSTED (any state) — freeze.
    frozen++;
  }

  logger.info(
    `[weekly-settlement-snapshot] done isoYear=${isoYear} isoWeek=${isoWeek} created=${created} updated=${updated} frozen=${frozen} drifted=${drifted}`,
  );

  return { isoYear, isoWeek, created, updated, frozen, drifted };
}
