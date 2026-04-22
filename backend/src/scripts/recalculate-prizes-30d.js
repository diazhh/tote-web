// backend/src/scripts/recalculate-prizes-30d.js
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import prizeProcessor from '../services/prize-processor.service.js';
import drawStatsService from '../services/draw-stats.service.js';

dotenv.config();

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '\n🔍 DRY RUN — nothing will be written\n' : '\n🔧 Recalculating prizes for last 30 days...\n');

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const draws = await prisma.draw.findMany({
    where: {
      status: { in: ['DRAWN', 'PUBLISHED'] },
      drawDate: { gte: since },
    },
    include: { game: { select: { name: true } } },
    orderBy: { drawDate: 'asc' },
  });

  console.log(`Found ${draws.length} draws\n`);

  let processed = 0;
  let failed = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const draw of draws) {
    const label = `${draw.game.name} ${draw.drawDate.toISOString().split('T')[0]} (${draw.id.slice(0, 8)})`;
    try {
      // Compute "before" totals
      const beforeAgg = await prisma.ticketDetail.aggregate({
        where: { ticket: { drawId: draw.id } },
        _sum: { prize: true },
      });
      const prizeBefore = parseFloat(beforeAgg._sum.prize || 0);
      totalBefore += prizeBefore;

      if (DRY_RUN) {
        console.log(`🔍 ${label} — current prize total: ${prizeBefore.toFixed(2)}`);
        processed++;
        continue;
      }

      // Step 1: Sync TicketDetail.multiplier → current GameItem.multiplier
      const details = await prisma.ticketDetail.findMany({
        where: { ticket: { drawId: draw.id } },
        include: { gameItem: { select: { multiplier: true } } },
      });
      for (const d of details) {
        if (d.gameItem) {
          await prisma.ticketDetail.update({
            where: { id: d.id },
            data: { multiplier: d.gameItem.multiplier },
          });
        }
      }

      // Step 2: Reset TicketDetails to ACTIVE with prize=0
      await prisma.ticketDetail.updateMany({
        where: { ticket: { drawId: draw.id } },
        data: { prize: 0, status: 'ACTIVE' },
      });

      // Step 3: Reset Tickets
      const ticketIds = [...new Set(details.map(d => d.ticketId))];
      if (ticketIds.length > 0) {
        await prisma.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { totalPrize: 0, status: 'ACTIVE' },
        });
      }

      // Step 4: Reset draw processing flags
      await prisma.draw.update({
        where: { id: draw.id },
        data: { prizesProcessed: false, statsCalculated: false },
      });

      // Step 5: Reprocess prizes (skip status check + balance update)
      await prizeProcessor.processPrizesForDraw(draw.id, {
        skipStatusCheck: true,
        skipBalanceUpdate: true,
      });

      // Step 6: Recalculate draw stats
      await drawStatsService.calculateDrawStats(draw.id);

      // Compute "after" totals
      const afterAgg = await prisma.ticketDetail.aggregate({
        where: { ticket: { drawId: draw.id } },
        _sum: { prize: true },
      });
      const prizeAfter = parseFloat(afterAgg._sum.prize || 0);
      totalAfter += prizeAfter;

      const delta = prizeAfter - prizeBefore;
      console.log(`✅ ${label} — antes: ${prizeBefore.toFixed(2)} / después: ${prizeAfter.toFixed(2)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`);
      processed++;
    } catch (err) {
      console.error(`❌ ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${DRY_RUN ? '🔍' : '✅'} ${processed} processed, ${failed} failed`);
  if (!DRY_RUN) {
    const delta = totalAfter - totalBefore;
    console.log(`  Total prizes before: ${totalBefore.toFixed(2)}`);
    console.log(`  Total prizes after:  ${totalAfter.toFixed(2)}`);
    console.log(`  Net delta:           ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
  }
  if (DRY_RUN) console.log('\nRun without --dry-run to apply.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
