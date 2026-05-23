/**
 * Recalcula comisiones de proveedor para un rango de fechas (drawnAt).
 *
 * Motivo (2026-05-22): cambio de fórmula `SALES_AND_UTILITY_PCT` a modelo
 * cascada. Ver commission.service.js#computeCommission y el commit
 * "fix(commission): SALES_AND_UTILITY_PCT now uses cascading formula".
 *
 * Qué hace:
 *   1. Itera todos los Draw con drawnAt entre FROM..TO y status terminado.
 *   2. Para cada uno llama computeAndUpsertLedgerForDraw(drawId) — esto
 *      reescribe ProviderCommissionLedger.amount con la nueva fórmula y
 *      actualiza DrawFinancial.commission (que es lo que /admin/reportes
 *      consume directamente).
 *   3. Recomputa ProviderWeeklySettlement (solo DRAFT — los CONFIRMED se
 *      respetan; el caller decide qué hacer con ellos).
 *
 * IMPORTANTE — NO toca ventas ni premios. Los valores `totalSales`, `totalPrize`
 * de Ticket / TicketDetail / DrawFinancial / DrawFinancialProvider quedan
 * intactos. Solo se recalcula `amount` en el ledger + `commission` materializada
 * en DrawFinancial + `amount` en los settlements DRAFT.
 *
 * Uso:
 *   node src/scripts/recalculate-commissions.mjs                    # default abril 1 → hoy
 *   node src/scripts/recalculate-commissions.mjs --from=2026-04-01 --to=2026-05-22
 *   node src/scripts/recalculate-commissions.mjs --dry-run          # solo lista
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import {
  computeAndUpsertLedgerForDraw,
  computeSettlementForWeek,
} from '../services/commission.service.js';
import { getISOWeekVE } from '../lib/dateUtils.js';

dotenv.config();
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let from = '2026-04-01';
  let to = new Date().toISOString().slice(0, 10);
  let dryRun = false;
  for (const arg of args) {
    if (arg.startsWith('--from=')) from = arg.slice(7);
    else if (arg.startsWith('--to=')) to = arg.slice(5);
    else if (arg === '--dry-run') dryRun = true;
  }
  return { from, to, dryRun };
}

async function main() {
  const { from, to, dryRun } = parseArgs();
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Recalcular comisiones de proveedor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Rango:    ${from} → ${to}`);
  console.log(`  Modo:     ${dryRun ? 'DRY RUN' : 'EJECUTAR'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const draws = await prisma.draw.findMany({
    where: {
      drawnAt: { gte: fromDate, lte: toDate },
      status: 'DRAWN',
    },
    select: { id: true, drawnAt: true, gameId: true },
    orderBy: { drawnAt: 'asc' },
  });

  console.log(`📊 Encontrados ${draws.length} sorteos a recalcular.\n`);

  if (dryRun) {
    console.log('🔍 Dry-run — sin cambios. Saliendo.');
    return;
  }

  let processed = 0;
  let totalProvidersProcessed = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const draw of draws) {
    try {
      const r = await computeAndUpsertLedgerForDraw(draw.id);
      totalProvidersProcessed += r.providersProcessed;
      totalSkipped += r.skipped;
      processed++;
      if (processed % 50 === 0) {
        process.stdout.write(`  Procesados: ${processed}/${draws.length}\r`);
      }
    } catch (err) {
      errors.push({ drawId: draw.id, message: err.message });
      console.error(`  ❌ draw ${draw.id}: ${err.message}`);
    }
  }
  console.log(`  ✓ Procesados: ${processed}/${draws.length}             `);
  console.log(`  ✓ Filas ledger upserted: ${totalProvidersProcessed}`);
  console.log(`  ⚠ Skipped (sin config): ${totalSkipped}`);
  if (errors.length > 0) {
    console.log(`  ❌ Errores: ${errors.length} — ver salida arriba.`);
  }

  // ─── Recalcular settlements DRAFT de las semanas afectadas ─────────────
  console.log('\n📅 Recomputando ProviderWeeklySettlement (solo DRAFT)...\n');

  const weeks = new Set();
  for (const d of draws) {
    const { isoYear, isoWeek } = getISOWeekVE(d.drawnAt);
    weeks.add(`${isoYear}-${isoWeek}`);
  }

  let settlementsUpdated = 0;
  let settlementsFrozen = 0;

  for (const wk of weeks) {
    const [isoYear, isoWeek] = wk.split('-').map(Number);
    const drafts = await prisma.providerWeeklySettlement.findMany({
      where: { isoYear, isoWeek, status: 'DRAFT' },
    });
    for (const s of drafts) {
      const r = await computeSettlementForWeek(s.apiSystemId, isoYear, isoWeek);
      await prisma.providerWeeklySettlement.update({
        where: { id: s.id },
        data: {
          amount: r.total,
          ledgerRowCount: r.ledgerRowCount,
          snapshotAt: new Date(),
        },
      });
      settlementsUpdated++;
    }
    const nonDraft = await prisma.providerWeeklySettlement.count({
      where: { isoYear, isoWeek, status: { not: 'DRAFT' } },
    });
    settlementsFrozen += nonDraft;
  }

  console.log(`  ✓ Settlements DRAFT actualizados: ${settlementsUpdated}`);
  if (settlementsFrozen > 0) {
    console.log(`  ⚠ Settlements CONFIRMED/ADJUSTED no tocados: ${settlementsFrozen}`);
    console.log('    (estos quedaron desfasados del ledger; resolver manualmente)');
  }

  console.log('\n✅ Recálculo terminado.');
}

main()
  .catch((e) => {
    console.error('\n❌ FALLO:');
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
