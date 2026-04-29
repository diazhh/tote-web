/**
 * Auditoría histórica de fallbacks y sorteos con pérdida.
 *
 * Identifica:
 * 1. Sorteos donde el pago superó las ventas (probable fallback losing)
 * 2. Distribución de números ganadores por rango (detecta sesgo)
 * 3. Cuentas (taquilla/comercial) que ganaron repetidamente con números bajos
 *
 * Uso:
 *   node src/scripts/audit-fallback-history.js [días=30] [gameSlug=triple-pantera]
 *
 * Ejemplos:
 *   node src/scripts/audit-fallback-history.js
 *   node src/scripts/audit-fallback-history.js 90
 *   node src/scripts/audit-fallback-history.js 30 lotoanimalito
 */

import { prisma } from '../lib/prisma.js';

const DAYS = parseInt(process.argv[2] || '30');
const GAME_SLUG = process.argv[3] || 'triple-pantera';

async function main() {
  console.log(`\n=== AUDITORÍA DE FALLBACKS — Últimos ${DAYS} días — Juego: ${GAME_SLUG} ===\n`);

  const game = await prisma.game.findFirst({ where: { slug: GAME_SLUG } });
  if (!game) {
    console.error(`Juego ${GAME_SLUG} no encontrado`);
    process.exit(1);
  }
  console.log(`Juego: ${game.name} (id: ${game.id}, type: ${game.type})\n`);

  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  // 1. Sorteos con pérdida (pago > ventas)
  console.log('--- 1. SORTEOS CON PÉRDIDA (pago > ventas) ---\n');
  const lossDraws = await prisma.$queryRawUnsafe(`
    SELECT
      d.id,
      d."drawDate"::text AS draw_date,
      d."drawTime" AS draw_time,
      wi.number AS winner_number,
      COALESCE(s.total, 0)::numeric AS sales,
      COALESCE(p.total, 0)::numeric AS prizes,
      CASE WHEN s.total > 0 THEN ROUND((p.total / s.total)::numeric, 2) ELSE 0 END AS ratio
    FROM "Draw" d
    LEFT JOIN "GameItem" wi ON wi.id = d."winnerItemId"
    LEFT JOIN LATERAL (
      SELECT SUM("totalAmount") AS total
      FROM "Ticket" WHERE "drawId" = d.id AND status != 'CANCELLED'
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT SUM(td.prize) AS total
      FROM "TicketDetail" td
      JOIN "Ticket" t ON t.id = td."ticketId"
      WHERE t."drawId" = d.id AND td.prize > 0
    ) p ON true
    WHERE d."gameId" = $1
      AND d.status IN ('DRAWN', 'PUBLISHED')
      AND d."drawDate" >= $2
      AND COALESCE(p.total, 0) > COALESCE(s.total, 0)
    ORDER BY ratio DESC
    LIMIT 50
  `, game.id, since);

  if (lossDraws.length === 0) {
    console.log('  (ninguno encontrado en este período)\n');
  } else {
    console.log('  ' + 'Fecha'.padEnd(12) + 'Hora'.padEnd(10) + 'Núm'.padEnd(6) + 'Ventas'.padEnd(14) + 'Pago'.padEnd(14) + 'Ratio');
    console.log('  ' + '-'.repeat(70));
    let totalLoss = 0;
    for (const r of lossDraws) {
      const loss = Number(r.prizes) - Number(r.sales);
      totalLoss += loss;
      console.log(
        '  ' +
        r.draw_date.padEnd(12) +
        r.draw_time.padEnd(10) +
        (r.winner_number || '?').padEnd(6) +
        ('$' + Number(r.sales).toFixed(2)).padEnd(14) +
        ('$' + Number(r.prizes).toFixed(2)).padEnd(14) +
        Number(r.ratio).toFixed(2) + 'x'
      );
    }
    console.log(`\n  Total sorteos con pérdida: ${lossDraws.length}`);
    console.log(`  Pérdida acumulada: $${totalLoss.toFixed(2)}\n`);
  }

  // 2. Distribución de ganadores por rango (solo si TRIPLE)
  if (game.type === 'TRIPLE') {
    console.log('--- 2. DISTRIBUCIÓN DE GANADORES POR CENTENA ---\n');
    const distribution = await prisma.$queryRawUnsafe(`
      SELECT
        FLOOR(CAST(wi.number AS INTEGER) / 100) AS centena,
        COUNT(*)::int AS total
      FROM "Draw" d
      JOIN "GameItem" wi ON wi.id = d."winnerItemId"
      WHERE d."gameId" = $1
        AND d.status IN ('DRAWN', 'PUBLISHED')
        AND d."drawDate" >= $2
      GROUP BY centena
      ORDER BY centena
    `, game.id, since);

    const totalDraws = distribution.reduce((sum, r) => sum + r.total, 0);
    const expectedPct = 10;
    console.log('  Centena   Cuenta    %       Diferencia esperada');
    console.log('  ' + '-'.repeat(50));
    for (let i = 0; i < 10; i++) {
      const row = distribution.find(r => Number(r.centena) === i);
      const count = row ? row.total : 0;
      const pct = totalDraws > 0 ? (count / totalDraws) * 100 : 0;
      const diff = pct - expectedPct;
      const flag = Math.abs(diff) > 5 ? ' ⚠️' : '';
      console.log(
        `  ${(i * 100).toString().padStart(3, '0')}-${(i * 100 + 99).toString().padStart(3, '0')}   ${count.toString().padStart(4)}    ${pct.toFixed(1).padStart(5)}%   ${(diff >= 0 ? '+' : '') + diff.toFixed(1)}%${flag}`
      );
    }
    console.log(`  Total sorteos: ${totalDraws}\n`);
  }

  // 3. Cuentas que ganaron repetidamente con números bajos
  console.log('--- 3. TAQUILLAS GANADORAS (>=2 PREMIOS EN ESTE PERÍODO) ---\n');
  const winners = await prisma.$queryRawUnsafe(`
    SELECT
      t."providerData"->>'taquillaID' AS taquilla,
      t."providerData"->>'comercialID' AS comercial,
      COUNT(DISTINCT t.id)::int AS wins,
      SUM(td.prize)::numeric AS total_won,
      AVG(CAST(wi.number AS INTEGER))::numeric AS avg_winning_number
    FROM "Ticket" t
    JOIN "TicketDetail" td ON td."ticketId" = t.id
    JOIN "Draw" d ON d.id = t."drawId"
    JOIN "GameItem" wi ON wi.id = d."winnerItemId"
    WHERE d."gameId" = $1
      AND d.status IN ('DRAWN', 'PUBLISHED')
      AND d."drawDate" >= $2
      AND td.prize > 0
      AND t.source = 'EXTERNAL_API'
    GROUP BY taquilla, comercial
    HAVING COUNT(DISTINCT t.id) >= 2
    ORDER BY total_won DESC
    LIMIT 20
  `, game.id, since);

  if (winners.length === 0) {
    console.log('  (sin taquillas con múltiples premios en este período)\n');
  } else {
    console.log('  Taquilla   Comercial   Wins   Total ganado   Promedio núm   Sospechoso');
    console.log('  ' + '-'.repeat(75));
    for (const w of winners) {
      const avg = Number(w.avg_winning_number);
      const suspicious = avg < 300 ? ' 🚩' : '';
      console.log(
        `  ${(w.taquilla || '?').padEnd(11)}${(w.comercial || '?').padEnd(12)}${w.wins.toString().padStart(5)}   $${Number(w.total_won).toFixed(2).padStart(12)}   ${avg.toFixed(0).padStart(5)}        ${suspicious}`
      );
    }
    console.log('\n  🚩 = promedio de números ganadores en rango sospechoso (< 300)\n');
  }

  // 4. Resumen
  console.log('--- 4. RESUMEN ---');
  const totalDraws = await prisma.draw.count({
    where: {
      gameId: game.id,
      status: { in: ['DRAWN', 'PUBLISHED'] },
      drawDate: { gte: since },
    },
  });
  console.log(`  Total sorteos analizados: ${totalDraws}`);
  console.log(`  Sorteos con pérdida: ${lossDraws.length} (${((lossDraws.length / totalDraws) * 100).toFixed(1)}%)`);
  console.log('');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
