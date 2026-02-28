import { prisma } from '../lib/prisma.js';

/**
 * Script one-time para crear PlayerMovement para tripletas existentes
 * que fueron creadas antes de que se implementara el registro de movimientos.
 *
 * Ejecutar: node --experimental-specifier-resolution=node src/scripts/backfill-tripleta-movements.js
 */
async function backfillTripletaMovements() {
  console.log('Buscando tripletas sin movimientos...');

  // Obtener todas las tripletas
  const tripletas = await prisma.tripleBet.findMany({
    select: {
      id: true,
      userId: true,
      amount: true,
      prize: true,
      status: true,
      multiplier: true,
      drawsCount: true,
      gameId: true,
      createdAt: true
    }
  });

  console.log(`Total tripletas en BD: ${tripletas.length}`);

  let created = 0;
  let skipped = 0;

  for (const tripleta of tripletas) {
    // Verificar si ya tiene movimiento BET
    const existingBet = await prisma.playerMovement.findFirst({
      where: {
        referenceType: 'TRIPLETA',
        referenceId: tripleta.id,
        type: 'BET'
      }
    });

    if (existingBet) {
      skipped++;
      continue;
    }

    // Obtener balance actual del usuario para el snapshot
    const user = await prisma.user.findUnique({
      where: { id: tripleta.userId },
      select: { balance: true }
    });

    if (!user) {
      console.log(`  Usuario ${tripleta.userId} no encontrado, skip tripleta ${tripleta.id}`);
      skipped++;
      continue;
    }

    const balanceCurrent = parseFloat(user.balance);
    const betAmount = -Math.abs(parseFloat(tripleta.amount));

    // Crear movimiento BET
    await prisma.playerMovement.create({
      data: {
        userId: tripleta.userId,
        type: 'BET',
        amount: betAmount,
        balanceBefore: balanceCurrent, // No podemos reconstruir el balance exacto historico
        balanceAfter: balanceCurrent,  // Usamos balance actual como aproximacion
        description: 'Apuesta de tripleta',
        referenceType: 'TRIPLETA',
        referenceId: tripleta.id,
        metadata: {
          gameId: tripleta.gameId,
          drawsCount: tripleta.drawsCount,
          backfilled: true
        },
        createdAt: tripleta.createdAt // Usar la fecha original de la tripleta
      }
    });
    created++;

    // Si la tripleta fue ganada, crear movimiento PRIZE tambien
    if (tripleta.status === 'WON' && parseFloat(tripleta.prize || 0) > 0) {
      const existingPrize = await prisma.playerMovement.findFirst({
        where: {
          referenceType: 'TRIPLETA',
          referenceId: tripleta.id,
          type: 'PRIZE'
        }
      });

      if (!existingPrize) {
        await prisma.playerMovement.create({
          data: {
            userId: tripleta.userId,
            type: 'PRIZE',
            amount: Math.abs(parseFloat(tripleta.prize)),
            balanceBefore: balanceCurrent,
            balanceAfter: balanceCurrent,
            description: 'Premio de tripleta',
            referenceType: 'TRIPLETA',
            referenceId: tripleta.id,
            metadata: {
              multiplier: tripleta.multiplier,
              backfilled: true
            },
            createdAt: tripleta.createdAt
          }
        });
        created++;
      }
    }

    console.log(`  Tripleta ${tripleta.id} (${tripleta.status}) -> movimiento(s) creado(s)`);
  }

  console.log(`\nResultado: ${created} movimientos creados, ${skipped} tripletas ya tenian movimientos`);
  await prisma.$disconnect();
}

backfillTripletaMovements().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
