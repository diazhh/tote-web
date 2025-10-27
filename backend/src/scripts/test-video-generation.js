import { prisma } from '../lib/prisma.js';
import videoGeneratorService from '../services/video-generator.service.js';
import logger from '../lib/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script de prueba para generar videos de sorteos
 * Genera un video por cada juego usando el sorteo más reciente con imagen
 */
async function testVideoGeneration() {
  try {
    logger.info('=== Iniciando prueba de generación de videos ===\n');

    // Inicializar directorios
    await videoGeneratorService.initialize();

    // Obtener todos los juegos activos
    const games = await prisma.game.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    if (games.length === 0) {
      logger.warn('No hay juegos activos en la base de datos');
      return;
    }

    logger.info(`Encontrados ${games.length} juegos activos\n`);

    const results = [];

    // Generar video para cada juego
    for (const game of games) {
      logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`🎮 Juego: ${game.name} (${game.slug})`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      try {
        // Buscar el sorteo más reciente con imagen
        const draw = await prisma.draw.findFirst({
          where: {
            gameId: game.id,
            status: 'DRAWN',
            imageUrl: { not: null }
          },
          include: {
            game: true,
            winnerItem: true
          },
          orderBy: { drawnAt: 'desc' }
        });

        if (!draw) {
          logger.warn(`No hay sorteos ejecutados con imagen para ${game.name}`);
          results.push({
            game: game.name,
            success: false,
            error: 'No hay sorteos con imagen disponibles'
          });
          continue;
        }

        logger.info(`📅 Sorteo seleccionado: ${draw.scheduledAt.toLocaleString('es-VE')}`);
        logger.info(`🎯 Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}`);
        logger.info(`🖼️  Imagen: ${draw.imageUrl}\n`);

        // Generar video simple (más rápido para pruebas)
        logger.info('🎬 Generando video simple...');

        const videoPath = await videoGeneratorService.generateSimpleVideo(
          draw.imageUrl,
          draw.id,
          {
            duration: 10,
            width: 1080,
            height: 1920,
            fps: 30,
            quality: 23
          }
        );

        // Actualizar el sorteo con la URL del video
        await prisma.draw.update({
          where: { id: draw.id },
          data: {
            videoUrl: videoPath,
            videoGeneratedAt: new Date()
          }
        });

        logger.info(`✅ Video generado exitosamente`);
        logger.info(`📁 Ubicación: ${videoPath}`);
        logger.info(`🔗 URL pública: ${videoGeneratorService.getPublicUrl(videoPath)}\n`);

        results.push({
          game: game.name,
          success: true,
          videoPath: videoPath,
          publicUrl: videoGeneratorService.getPublicUrl(videoPath),
          drawId: draw.id,
          scheduledAt: draw.scheduledAt
        });

      } catch (error) {
        logger.error(`❌ Error generando video para ${game.name}:`, error.message);
        results.push({
          game: game.name,
          success: false,
          error: error.message
        });
      }
    }

    // Resumen final
    logger.info('\n\n═══════════════════════════════════════════');
    logger.info('        RESUMEN DE GENERACIÓN');
    logger.info('═══════════════════════════════════════════\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info(`✅ Exitosos: ${successful.length}/${results.length}`);
    logger.info(`❌ Fallidos: ${failed.length}/${results.length}\n`);

    if (successful.length > 0) {
      logger.info('Videos generados:\n');
      successful.forEach((result, index) => {
        logger.info(`${index + 1}. ${result.game}`);
        logger.info(`   📁 ${result.videoPath}`);
        logger.info(`   🔗 ${result.publicUrl}\n`);
      });
    }

    if (failed.length > 0) {
      logger.info('Errores:\n');
      failed.forEach((result, index) => {
        logger.info(`${index + 1}. ${result.game}: ${result.error}\n`);
      });
    }

    logger.info('\n═══════════════════════════════════════════\n');

    // Información adicional
    logger.info('💡 Notas:');
    logger.info('   - Los videos se guardan en: storage/videos/');
    logger.info('   - Para generar videos animados, usa generateAnimatedVideo()');
    logger.info('   - Asegúrate de tener los assets en: storage/video-assets/');
    logger.info('   - FFmpeg debe estar instalado en el sistema\n');

    return results;

  } catch (error) {
    logger.error('❌ Error en el script de prueba:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
testVideoGeneration()
  .then((results) => {
    const exitCode = results.some(r => r.success) ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    logger.error('Error fatal:', error);
    process.exit(1);
  });
