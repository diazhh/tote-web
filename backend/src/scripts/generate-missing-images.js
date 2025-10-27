import { prisma } from '../lib/prisma.js';
import { generateDrawImage } from '../services/imageService.js';
import logger from '../lib/logger.js';

/**
 * Generar imágenes faltantes para sorteos finalizados
 */
async function generateMissingImages() {
  try {
    console.log('🖼️  Buscando sorteos finalizados sin imagen...\n');

    // Buscar sorteos finalizados sin imagen
    const draws = await prisma.draw.findMany({
      where: {
        status: {
          in: ['DRAWN', 'PUBLISHED']
        },
        imageGenerated: false,
        winnerItemId: {
          not: null
        },
        game: {
          slug: {
            in: ['lotoanimalito', 'lottopantera', 'triple-pantera'] // Todos los juegos con imágenes
          }
        }
      },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        winnerItem: {
          select: {
            number: true,
            name: true
          }
        }
      },
      orderBy: {
        scheduledAt: 'desc'
      },
      take: 50 // Limitar a los últimos 50
    });

    console.log(`📊 Encontrados ${draws.length} sorteos sin imagen\n`);

    if (draws.length === 0) {
      console.log('✅ Todos los sorteos tienen imagen generada');
      return;
    }

    let successful = 0;
    let failed = 0;

    for (const draw of draws) {
      try {
        console.log(`\n🎲 Generando imagen para sorteo:`);
        console.log(`   - ID: ${draw.id}`);
        console.log(`   - Juego: ${draw.game.name}`);
        console.log(`   - Fecha: ${draw.scheduledAt}`);
        console.log(`   - Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}`);

        const result = await generateDrawImage(draw.id);

        console.log(`   ✅ Imagen generada: ${result.filename}`);
        successful++;

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN:');
    console.log(`   Total procesados: ${draws.length}`);
    console.log(`   ✅ Exitosos: ${successful}`);
    console.log(`   ❌ Fallidos: ${failed}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error general:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
generateMissingImages()
  .then(() => {
    console.log('\n✅ Proceso completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });
