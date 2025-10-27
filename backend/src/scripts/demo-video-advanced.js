import { prisma } from '../lib/prisma.js';
import videoGeneratorAdvanced from '../services/video-generator-advanced.service.js';
import logger from '../lib/logger.js';

/**
 * Script para generar videos avanzados de demostración
 * Crea videos con intro, countdown, resultado y outro
 */
async function generateAdvancedDemoVideos() {
  try {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   GENERACIÓN DE VIDEOS AVANZADOS (DEMO)      ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // Buscar sorteos recientes de cada juego
    const games = await prisma.game.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
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
        // Buscar sorteo más reciente con ganador
        const draw = await prisma.draw.findFirst({
          where: {
            gameId: game.id,
            winnerItemId: { not: null }
          },
          include: {
            game: true,
            winnerItem: true
          },
          orderBy: { scheduledAt: 'desc' }
        });

        if (!draw) {
          console.log(`⚠️  No hay sorteos con ganador para ${game.name}\n`);
          results.push({
            game: game.name,
            success: false,
            error: 'No hay sorteos con ganador'
          });
          continue;
        }

        console.log(`📅 Sorteo: ${draw.scheduledAt.toLocaleString('es-VE')}`);
        console.log(`🎯 Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}`);
        console.log(`🖼️  Imagen base: ${draw.imageUrl ? 'Sí' : 'No'}\n`);

        console.log('🎬 Generando video avanzado...');
        console.log('   Secuencia:');
        console.log('   • 0-2s: Intro del juego');
        console.log('   • 2-5s: Countdown 3-2-1');
        console.log('   • 5-10s: Resultado con ganador');
        console.log('   • 10-12s: Outro\n');
        console.log('   ⏳ Generando frames... (esto puede tardar 30-60 segundos)\n');

        const videoPath = await videoGeneratorAdvanced.generateAnimatedResultVideo(
          draw,
          `demo-${game.slug}-${Date.now()}`
        );

        // Actualizar BD (opcional para demo)
        await prisma.draw.update({
          where: { id: draw.id },
          data: {
            videoUrl: videoPath,
            videoGeneratedAt: new Date()
          }
        });

        const publicUrl = videoGeneratorAdvanced.getPublicUrl(videoPath);

        console.log('   ✅ Video generado exitosamente!\n');
        console.log(`   📁 Archivo: ${videoPath}`);
        console.log(`   🔗 URL: ${publicUrl}\n`);

        results.push({
          game: game.name,
          slug: game.slug,
          drawId: draw.id,
          winner: `${draw.winnerItem.number} - ${draw.winnerItem.name}`,
          videoPath: videoPath,
          publicUrl: publicUrl,
          success: true
        });

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
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
      console.log('   ✓ Intro con nombre del juego');
      console.log('   ✓ Countdown animado (3-2-1)');
      console.log('   ✓ Resultado destacado con ganador');
      console.log('   ✓ Outro con mensaje de cierre\n');
    }

    if (failed.length > 0) {
      console.log('❌ Errores:\n');
      failed.forEach((result, index) => {
        console.log(`${index + 1}. ${result.game}: ${result.error}\n`);
      });

      if (failed.some(r => r.error && r.error.includes('ffmpeg'))) {
        console.log('\n⚠️  NOTA: FFmpeg no está instalado\n');
        console.log('Para instalar FFmpeg:');
        console.log('   Ubuntu/Debian (WSL): sudo apt-get update && sudo apt-get install -y ffmpeg');
        console.log('   macOS: brew install ffmpeg\n');
        console.log('Después de instalar, ejecutar:');
        console.log('   npm run check:ffmpeg\n');
      }
    }

    return results;

  } catch (error) {
    console.error('❌ Error fatal:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar script
generateAdvancedDemoVideos()
  .then((results) => {
    const exitCode = results && results.some(r => r.success) ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
