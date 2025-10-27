import { prisma } from '../lib/prisma.js';
import videoGeneratorAdvanced from '../services/video-generator-advanced.service.js';
import logger from '../lib/logger.js';

/**
 * Script para generar videos de demostración usando datos mock
 * No requiere sorteos reales en la BD
 */
async function generateMockDemoVideos() {
  try {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   GENERACIÓN DE VIDEOS DE DEMOSTRACIÓN       ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // Obtener los juegos y sus items
    const games = await prisma.game.findMany({
      where: { isActive: true },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          take: 1 // Solo tomar un item de ejemplo
        }
      }
    });

    if (games.length === 0) {
      console.log('❌ No hay juegos activos\n');
      return [];
    }

    const results = [];

    for (const game of games) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎮 Juego: ${game.name}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      try {
        // Si no hay items, usar datos por defecto
        let winnerItem = game.items[0];

        if (!winnerItem) {
          console.log('⚠️  No hay items para este juego, usando datos de ejemplo...\n');
          winnerItem = {
            number: '00',
            name: 'EJEMPLO'
          };
        }

        // Crear un objeto de sorteo mock
        const mockDraw = {
          id: `demo-${game.slug}-${Date.now()}`,
          game: {
            name: game.name,
            slug: game.slug
          },
          winnerItem: {
            number: winnerItem.number,
            name: winnerItem.name
          },
          scheduledAt: new Date(),
          imageUrl: null // No usar imagen base por ahora
        };

        console.log(`🎯 Ganador de ejemplo: ${winnerItem.number} - ${winnerItem.name}\n`);

        console.log('🎬 Generando video avanzado...');
        console.log('   Secuencia:');
        console.log('   • 0-2s: Intro del juego');
        console.log('   • 2-5s: Countdown 3-2-1');
        console.log('   • 5-10s: Resultado con ganador');
        console.log('   • 10-12s: Outro\n');
        console.log('   ⏳ Generando frames y compilando... (30-60 segundos)\n');

        const videoPath = await videoGeneratorAdvanced.generateAnimatedResultVideo(
          mockDraw,
          mockDraw.id
        );

        const publicUrl = videoGeneratorAdvanced.getPublicUrl(videoPath);

        console.log('   ✅ Video generado exitosamente!\n');
        console.log(`   📁 Archivo: ${videoPath}`);
        console.log(`   🔗 URL: ${publicUrl}\n`);

        results.push({
          game: game.name,
          slug: game.slug,
          winner: `${winnerItem.number} - ${winnerItem.name}`,
          videoPath: videoPath,
          publicUrl: publicUrl,
          success: true
        });

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
        console.error(error.stack);

        results.push({
          game: game.name,
          success: false,
          error: error.message
        });
      }
    }

    // Resumen final
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║             RESUMEN DE GENERACIÓN            ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Exitosos: ${successful.length}/${results.length}`);
    console.log(`❌ Fallidos: ${failed.length}/${results.length}\n`);

    if (successful.length > 0) {
      console.log('Videos generados:\n');
      successful.forEach((result, index) => {
        console.log(`${index + 1}. ${result.game} (${result.slug})`);
        console.log(`   🎯 ${result.winner}`);
        console.log(`   📁 ${result.videoPath}`);
        console.log(`   🔗 ${result.publicUrl}\n`);
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📺 Características del video:');
      console.log('   • Duración: 12 segundos');
      console.log('   • Formato: 1080x1920 (vertical)');
      console.log('   • FPS: 30');
      console.log('   • Codec: H.264 (MP4)');
      console.log('   • Secuencia animada con transiciones\n');

      console.log('💡 Los videos incluyen:');
      console.log('   ✓ Intro con nombre del juego (azul)');
      console.log('   ✓ Countdown animado 3-2-1 (rojo)');
      console.log('   ✓ Resultado destacado con ganador (verde)');
      console.log('   ✓ Outro con mensaje de cierre (púrpura)\n');

      console.log('🎨 Personalización:');
      console.log('   Edita: src/services/video-generator-advanced.service.js');
      console.log('   Para cambiar colores, textos, fuentes, etc.\n');

      console.log('📁 Ubicación de los videos:');
      console.log('   storage/videos/\n');
    }

    if (failed.length > 0) {
      console.log('❌ Errores:\n');
      failed.forEach((result, index) => {
        console.log(`${index + 1}. ${result.game}: ${result.error}\n`);
      });
    }

    return results;

  } catch (error) {
    console.error('❌ Error fatal:', error);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar script
generateMockDemoVideos()
  .then((results) => {
    const exitCode = results && results.some(r => r.success) ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
