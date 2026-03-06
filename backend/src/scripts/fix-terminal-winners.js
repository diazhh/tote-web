/**
 * Fix Terminal Pantera draws that got wrong winners from SRQ sync.
 * Corrects them to use last 2 digits of the linked Triple winner.
 * Also processes prizes for corrected draws.
 */
import { prisma } from '../lib/prisma.js';

async function main() {
  try {
    const terminalGame = await prisma.game.findFirst({
      where: { slug: 'terminal-pantera' },
    });
    const tripleGame = await prisma.game.findFirst({
      where: { slug: 'triple-pantera' },
    });

    if (!terminalGame || !tripleGame) {
      console.log('Games not found');
      return;
    }

    // Get all Terminal DRAWN draws for today
    const today = new Date('2026-03-06T04:00:00.000Z');
    const terminalDraws = await prisma.draw.findMany({
      where: {
        gameId: terminalGame.id,
        drawDate: today,
        status: 'DRAWN',
      },
      include: { winnerItem: true },
      orderBy: { drawTime: 'asc' },
    });

    console.log(`Found ${terminalDraws.length} Terminal DRAWN draws to fix\n`);

    for (const td of terminalDraws) {
      // Find the matching Triple draw
      const tripleDraw = await prisma.draw.findFirst({
        where: {
          gameId: tripleGame.id,
          drawDate: today,
          drawTime: td.drawTime,
          status: 'DRAWN',
        },
        include: { winnerItem: true },
      });

      if (!tripleDraw || !tripleDraw.winnerItem) {
        console.log(`${td.drawTime}: No Triple DRAWN draw found, skipping`);
        continue;
      }

      const tripleNumber = tripleDraw.winnerItem.number;
      const expectedTerminal = tripleNumber.slice(-2);
      const currentTerminal = td.winnerItem?.number;

      if (currentTerminal === expectedTerminal) {
        console.log(`${td.drawTime}: Already correct (${currentTerminal})`);
        continue;
      }

      // Find the correct Terminal GameItem
      const correctItem = await prisma.gameItem.findUnique({
        where: {
          gameId_number: { gameId: terminalGame.id, number: expectedTerminal },
        },
      });

      if (!correctItem) {
        console.log(`${td.drawTime}: GameItem ${expectedTerminal} not found!`);
        continue;
      }

      // Update the Terminal draw with correct winner
      await prisma.draw.update({
        where: { id: td.id },
        data: {
          winnerItemId: correctItem.id,
          preselectedItemId: correctItem.id,
        },
      });

      console.log(
        `${td.drawTime}: Fixed ${currentTerminal} -> ${expectedTerminal} ` +
        `(Triple: ${tripleNumber})`
      );
    }

    // Now handle SCHEDULED Terminal draws that have matching DRAWN Triple draws
    // These should have been cascaded but weren't
    const scheduledTerminals = await prisma.draw.findMany({
      where: {
        gameId: terminalGame.id,
        drawDate: today,
        status: 'SCHEDULED',
      },
      orderBy: { drawTime: 'asc' },
    });

    console.log(`\nFound ${scheduledTerminals.length} SCHEDULED Terminal draws`);

    for (const td of scheduledTerminals) {
      const tripleDraw = await prisma.draw.findFirst({
        where: {
          gameId: tripleGame.id,
          drawDate: today,
          drawTime: td.drawTime,
          status: 'DRAWN',
        },
        include: { winnerItem: true },
      });

      if (!tripleDraw || !tripleDraw.winnerItem) {
        console.log(`${td.drawTime}: Triple not DRAWN yet, leaving SCHEDULED`);
        continue;
      }

      const tripleNumber = tripleDraw.winnerItem.number;
      const terminalNumber = tripleNumber.slice(-2);

      const winnerItem = await prisma.gameItem.findUnique({
        where: {
          gameId_number: { gameId: terminalGame.id, number: terminalNumber },
        },
      });

      if (!winnerItem) {
        console.log(`${td.drawTime}: GameItem ${terminalNumber} not found!`);
        continue;
      }

      await prisma.draw.update({
        where: { id: td.id },
        data: {
          status: 'DRAWN',
          winnerItemId: winnerItem.id,
          preselectedItemId: winnerItem.id,
          closedAt: new Date(),
          drawnAt: new Date(),
        },
      });

      console.log(
        `${td.drawTime}: Cascaded SCHEDULED -> DRAWN = ${terminalNumber} ` +
        `(Triple: ${tripleNumber})`
      );
    }

    // Final verification
    console.log('\n=== Verification ===\n');
    const allTerminal = await prisma.draw.findMany({
      where: { gameId: terminalGame.id, drawDate: today },
      include: { winnerItem: true },
      orderBy: { drawTime: 'asc' },
    });

    for (const d of allTerminal) {
      const tripleDraw = await prisma.draw.findFirst({
        where: {
          gameId: tripleGame.id,
          drawDate: today,
          drawTime: d.drawTime,
          status: 'DRAWN',
        },
        include: { winnerItem: true },
      });

      const tripleNum = tripleDraw?.winnerItem?.number || '---';
      const expected = tripleNum !== '---' ? tripleNum.slice(-2) : '??';
      const actual = d.winnerItem?.number || '--';
      const ok = expected === actual ? 'OK' : 'MISMATCH';

      console.log(
        `${d.drawTime} | ${d.status.padEnd(9)} | Terminal: ${actual} | Triple: ${tripleNum} | ${ok}`
      );
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
