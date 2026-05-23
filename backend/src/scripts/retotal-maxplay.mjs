/**
 * Re-totalizar premios y comisiones de Maxplay para draws ya cerrados.
 *
 * Motivo (2026-05-23): Maxplay no scrapeó durante las primeras horas del día
 * por el bug del Turnstile. Los draws cerraron sin tickets EXTERNAL_SCRAPE,
 * por lo que el reporte de hoy queda sin las ventas/premios/comisiones de
 * ese proveedor.
 *
 * Lo que HACE:
 *   1. importMaxplayTickets(drawId)            — trae jugadas faltantes
 *   2. processPrizesForDraw(drawId, { skipBalanceUpdate: true })
 *                                              — marca WON/LOST + setea prize
 *                                                en los TicketDetail nuevos
 *   3. computeAndUpsertSales(drawId, closedAt) — re-agrega DrawFinancial[Provider].totalSales
 *   4. computeAndUpsertPrizes(drawId, drawnAt) — re-agrega DrawFinancial[Provider].totalPrize
 *   5. computeAndUpsertLedgerForDraw(drawId)   — recomputa ProviderCommissionLedger
 *                                                + materializa DrawFinancial.commission
 *
 * Lo que NO HACE (explícito):
 *   • NO toca Draw.winnerItemId — los ganadores quedan exactamente como están.
 *   • NO actualiza balances de usuarios PLAYER (skipBalanceUpdate=true).
 *   • NO envía notificaciones a jugadores (mismo guard).
 *   • NO publica a redes sociales (el prize-processor no las invoca).
 *   • NO notifica admins por Telegram.
 *
 * Idempotente: re-correr no duplica nada porque:
 *   - importMaxplayTickets usa upsert por externalTicketId
 *   - processPrizesForDraw solo toca details con status='ACTIVE' (los nuevos)
 *   - computeAndUpsert* sobreescribe agregados
 *   - computeAndUpsertLedger usa findFirst + update/create
 *
 * Uso:
 *   node src/scripts/retotal-maxplay.mjs                     # default: hoy VE
 *   node src/scripts/retotal-maxplay.mjs --date=2026-05-23
 *   node src/scripts/retotal-maxplay.mjs --dry-run           # lista, no toca nada
 *   node src/scripts/retotal-maxplay.mjs --draw-id=<uuid>    # solo ese draw
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import maxplayService from '../services/maxplay.service.js';
import prizeProcessorService from '../services/prize-processor.service.js';
import {
  computeAndUpsertSales,
  computeAndUpsertPrizes,
} from '../services/draw-financial.service.js';
import { computeAndUpsertLedgerForDraw } from '../services/commission.service.js';
import { getVenezuelaDateString } from '../lib/dateUtils.js';

dotenv.config();
const prisma = new PrismaClient();

const MAXPLAY_API_SYSTEM_ID = '744bac32-4010-4537-a07b-a95ca9cc1a8a';
const MAXPLAY_GAME_SLUGS = ['triple-pantera', 'terminal-pantera'];

function parseArgs() {
  const args = process.argv.slice(2);
  let date = getVenezuelaDateString(); // YYYY-MM-DD hoy VE
  let drawId = null;
  let dryRun = false;
  for (const arg of args) {
    if (arg.startsWith('--date=')) date = arg.slice(7);
    else if (arg.startsWith('--draw-id=')) drawId = arg.slice(10);
    else if (arg === '--dry-run') dryRun = true;
  }
  return { date, drawId, dryRun };
}

async function main() {
  const { date, drawId, dryRun } = parseArgs();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Re-totalizar premios y comisiones de Maxplay');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (drawId) {
    console.log(`  Draw:     ${drawId}`);
  } else {
    console.log(`  Fecha:    ${date}`);
    console.log(`  Juegos:   ${MAXPLAY_GAME_SLUGS.join(', ')}`);
  }
  console.log(`  Modo:     ${dryRun ? 'DRY RUN' : 'EJECUTAR'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1) Localizar draws candidato: solo DRAWN (ya cerrados, ya con winnerItem).
  const where = drawId
    ? { id: drawId }
    : {
        drawDate: new Date(`${date}T00:00:00.000Z`),
        status: 'DRAWN',
        game: { slug: { in: MAXPLAY_GAME_SLUGS } },
      };

  const draws = await prisma.draw.findMany({
    where,
    select: {
      id: true,
      drawTime: true,
      drawDate: true,
      closedAt: true,
      drawnAt: true,
      status: true,
      winnerItemId: true,
      game: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { drawTime: 'asc' },
  });

  if (draws.length === 0) {
    console.log('No hay draws candidato. Nada que hacer.');
    return;
  }

  console.log(`📊 ${draws.length} draws candidato:\n`);
  for (const d of draws) {
    console.log(`  • ${d.game.name.padEnd(18)} ${d.drawTime}  [${d.status}]${d.winnerItemId ? '' : ' ⚠️ SIN GANADOR — se omitirá'}`);
  }
  console.log('');

  if (dryRun) {
    console.log('🔍 Dry-run — sin cambios. Saliendo.');
    return;
  }

  let totalImported = 0;
  let totalDrawsOk = 0;
  const errors = [];

  for (const draw of draws) {
    const tag = `${draw.game.name} ${draw.drawTime}`;
    if (!draw.winnerItemId) {
      console.log(`⏭️  ${tag} — sin winnerItemId, saltando`);
      continue;
    }

    try {
      console.log(`\n▶ ${tag}`);

      // ─── 1. Importar jugadas faltantes desde Maxplay ──────────────────
      console.log('  1) maxplay import...');
      const importRes = await maxplayService.importMaxplayTickets(draw.id);
      if (importRes.ok) {
        console.log(`     ✓ ${importRes.imported} tickets (${importRes.product || '?'}, ${importRes.durationMs}ms)`);
        totalImported += importRes.imported || 0;
      } else {
        console.log(`     ⚠ scrape falló: ${importRes.reason} — sigo con lo que ya hay en DB`);
      }

      // ─── 2. Re-procesar premios de TicketDetail con status='ACTIVE' ───
      // skipBalanceUpdate:true → NO toca balances ni notifica jugadores.
      // skipStatusCheck:false → permite el guard (status debe ser DRAWN).
      console.log('  2) prizes...');
      const prizeRes = await prizeProcessorService.processPrizesForDraw(draw.id, {
        skipBalanceUpdate: true,
      });
      console.log(`     ✓ ${prizeRes.winnersCount} ganadores, ${prizeRes.losersCount} perdedores, $${prizeRes.totalPrizesAwarded.toFixed(2)} premios nuevos`);

      // ─── 3. Re-agregar DrawFinancial + DrawFinancialProvider (SALES) ──
      console.log('  3) DrawFinancial[Provider] SALES...');
      await computeAndUpsertSales(draw.id, draw.closedAt || draw.drawnAt);

      // ─── 4. Re-agregar DrawFinancial + DrawFinancialProvider (PRIZES) ─
      console.log('  4) DrawFinancial[Provider] PRIZES...');
      await computeAndUpsertPrizes(draw.id, draw.drawnAt);

      // ─── 5. Recomputar comisiones (ledger + DrawFinancial.commission) ─
      console.log('  5) ProviderCommissionLedger + DrawFinancial.commission...');
      const commRes = await computeAndUpsertLedgerForDraw(draw.id);
      console.log(`     ✓ ${commRes.providersProcessed} proveedores procesados, ${commRes.skipped} saltados`);

      // ─── 6. Snapshot final de DrawFinancialProvider de Maxplay para reportar
      const mp = await prisma.drawFinancialProvider.findFirst({
        where: { drawId: draw.id, apiSystemId: MAXPLAY_API_SYSTEM_ID },
        select: { totalSales: true, totalPrize: true, ticketCount: true },
      });
      if (mp) {
        console.log(`  📦 Maxplay slice: ventas=${mp.totalSales} premios=${mp.totalPrize} tickets=${mp.ticketCount}`);
      }

      totalDrawsOk++;
    } catch (err) {
      console.error(`  ❌ ${tag}: ${err.message}`);
      errors.push({ drawId: draw.id, tag, message: err.message });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Draws procesados OK:   ${totalDrawsOk}/${draws.length}`);
  console.log(`📥 Total tickets Maxplay importados: ${totalImported}`);
  if (errors.length > 0) {
    console.log(`❌ Errores:`);
    for (const e of errors) console.log(`   • ${e.tag} (${e.drawId}): ${e.message}`);
    process.exitCode = 1;
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('\n❌ FALLO GENERAL:');
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
