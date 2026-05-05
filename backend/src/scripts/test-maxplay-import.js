/**
 * Smoke test — invokes maxplayService.importMaxplayTickets() against a real Draw
 * and a running tote-scrape sidecar. Used to validate the integration end-to-end
 * before wiring the worker / cron.
 *
 * Usage: DRAW_ID=<uuid> node src/scripts/test-maxplay-import.js
 */
import maxplayService from '../services/maxplay.service.js';
import { prisma } from '../lib/prisma.js';

const drawId = process.env.DRAW_ID;
if (!drawId) {
  console.error('DRAW_ID env var is required');
  process.exit(2);
}

(async () => {
  console.log(`\n=== Maxplay smoke test for draw ${drawId} ===`);

  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { game: true },
  });
  if (!draw) {
    console.error('Draw not found');
    process.exit(1);
  }
  console.log(`  game:        ${draw.game.slug}`);
  console.log(`  scheduledAt: ${draw.scheduledAt?.toISOString?.() || draw.scheduledAt}`);
  console.log(`  drawDate:    ${draw.drawDate?.toISOString?.() || draw.drawDate}`);
  console.log(`  status:      ${draw.status}`);

  const t0 = Date.now();
  const result = await maxplayService.importMaxplayTickets(drawId);
  console.log(`\nResult (took ${Date.now() - t0}ms):`);
  console.log(JSON.stringify(result, null, 2));

  // Verify what landed in the DB
  const tickets = await prisma.ticket.findMany({
    where: { drawId, source: 'EXTERNAL_SCRAPE' },
    include: { details: { include: { gameItem: true } } },
    take: 5,
  });
  const totalCount = await prisma.ticket.count({ where: { drawId, source: 'EXTERNAL_SCRAPE' } });
  const totalSum = await prisma.ticket.aggregate({
    where: { drawId, source: 'EXTERNAL_SCRAPE' },
    _sum: { totalAmount: true },
  });

  console.log(`\nDB state for drawId=${drawId}:`);
  console.log(`  tickets count: ${totalCount}`);
  console.log(`  sum totalAmount: ${totalSum._sum.totalAmount?.toString?.() || totalSum._sum.totalAmount}`);
  console.log(`  apiSystemId on first ticket: ${tickets[0]?.apiSystemId || '(none)'}`);
  console.log(`  source on first ticket:      ${tickets[0]?.source || '(none)'}`);
  console.log(`  sample tickets:`);
  for (const t of tickets) {
    const d = t.details[0];
    console.log(`    jugada=${d?.gameItem?.number} amount=${t.totalAmount} item=${d?.gameItem?.name} extId=${t.externalTicketId}`);
  }

  await prisma.$disconnect();
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
