/**
 * Script para resetear sorteos del día
 * - Sorteos de 5pm en adelante: volver a estado PENDING (sin resultado)
 * - Sorteos de 3pm y 4pm: marcar como TOTALIZED
 */

import { PrismaClient } from '@prisma/client';
import { getVenezuelaDateAsUTC } from '../src/lib/dateUtils.js';

const prisma = new PrismaClient();

async function resetDrawsStatus() {
  try {
    console.log('🔄 Iniciando reseteo de sorteos...\n');

    // Obtener fecha de hoy en Venezuela
    const todayVE = getVenezuelaDateAsUTC();
    console.log(`📅 Fecha Venezuela: ${todayVE.toISOString()}\n`);

    // 1. Obtener sorteos del día
    const todayDraws = await prisma.draw.findMany({
      where: {
        drawDate: todayVE
      },
      orderBy: {
        drawTime: 'asc'
      },
      include: {
        game: true
      }
    });

    console.log(`📊 Total sorteos hoy: ${todayDraws.length}\n`);

    // 2. Resetear sorteos de 5pm en adelante (17:00 y después)
    const drawsToReset = todayDraws.filter(draw => {
      const hour = parseInt(draw.drawTime.split(':')[0]);
      return hour >= 17;
    });

    console.log(`🔄 Sorteos a resetear (5pm+): ${drawsToReset.length}`);
    for (const draw of drawsToReset) {
      console.log(`   - ${draw.drawTime} ${draw.game.name} (${draw.status})`);
    }
    console.log('');

    if (drawsToReset.length > 0) {
      const resetResult = await prisma.draw.updateMany({
        where: {
          id: {
            in: drawsToReset.map(d => d.id)
          }
        },
        data: {
          status: 'SCHEDULED',
          winnerItemId: null,
          closedAt: null,
          drawnAt: null,
          publishedAt: null,
          imageUrl: null,
          imageGenerated: false,
          imageGeneratedAt: null,
          videoUrl: null,
          videoGeneratedAt: null
        }
      });
      console.log(`✅ Reseteados ${resetResult.count} sorteos a SCHEDULED\n`);
    }

    // 3. Marcar sorteos de 3pm y 4pm como PUBLISHED
    const drawsToPublish = todayDraws.filter(draw => {
      const hour = parseInt(draw.drawTime.split(':')[0]);
      return hour === 15 || hour === 16;
    });

    console.log(`📊 Sorteos a publicar (3pm y 4pm): ${drawsToPublish.length}`);
    for (const draw of drawsToPublish) {
      console.log(`   - ${draw.drawTime} ${draw.game.name} (${draw.status})`);
    }
    console.log('');

    if (drawsToPublish.length > 0) {
      const publishResult = await prisma.draw.updateMany({
        where: {
          id: {
            in: drawsToPublish.map(d => d.id)
          }
        },
        data: {
          status: 'PUBLISHED'
        }
      });
      console.log(`✅ Publicados ${publishResult.count} sorteos\n`);
    }

    // 4. Mostrar estado final
    console.log('📋 Estado final de sorteos del día:');
    const finalDraws = await prisma.draw.findMany({
      where: {
        drawDate: todayVE
      },
      orderBy: {
        drawTime: 'asc'
      },
      include: {
        game: true
      }
    });

    for (const draw of finalDraws) {
      const hasWinner = draw.winningNumbers ? '✓' : '✗';
      console.log(`   ${draw.drawTime} ${draw.game.name.padEnd(15)} ${draw.status.padEnd(10)} Winner: ${hasWinner}`);
    }

    console.log('\n✅ Proceso completado exitosamente');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
resetDrawsStatus()
  .catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
