/**
 * Add admin user to TERMINAL PANTERA game notifications
 */
import { prisma } from '../lib/prisma.js';

async function main() {
  const terminalGame = await prisma.game.findFirst({ where: { slug: 'terminal-pantera' } });
  if (!terminalGame) { console.log('Terminal game not found'); return; }

  // Get all active admin users who have notify on other games
  const existingAdmins = await prisma.userGame.findMany({
    where: { notify: true, user: { isActive: true, telegramChatId: { not: null } } },
    include: { user: true },
    distinct: ['userId'],
  });

  let created = 0;
  for (const admin of existingAdmins) {
    const exists = await prisma.userGame.findFirst({
      where: { userId: admin.userId, gameId: terminalGame.id },
    });
    if (exists) {
      console.log(`${admin.user.username} already has Terminal access`);
      continue;
    }

    await prisma.userGame.create({
      data: {
        userId: admin.userId,
        gameId: terminalGame.id,
        role: admin.role,
        notify: true,
      },
    });
    console.log(`Added ${admin.user.username} to TERMINAL PANTERA (notify=true)`);
    created++;
  }

  console.log(`\nDone: ${created} admins added to Terminal`);
  await prisma.$disconnect();
}

main();
