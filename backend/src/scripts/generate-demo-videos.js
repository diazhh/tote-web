import { prisma } from '../lib/prisma.js';
import { generateDrawImage } from '../services/imageService.js';
import videoGeneratorService from '../services/video-generator.service.js';
import logger from '../lib/logger.js';

/**
 * Script para generar videos de demostración
 * 1. Busca sorteos publicados con ganador
 * 2. Genera imagen si no existe
 * 3. Genera video a partir de la imagen
 */
async function generateDemoVideos() {
  try {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   GENERACIÓN DE VIDEOS DE DEMOSTRACIÓN    ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // Inicializar servicio de videos
    await videoGeneratorService.initialize();

    // Buscar sorteos DRAWN con ganador
    const draws = await prisma.draw.findMany({
      where: {
        status: 'DRAWN',
        winnerItemId: { not: null }
      },
      include: {
        game: true,
        winnerItem: true
      },
      orderBy: { scheduledAt: 'desc' },
      take: 3 // Solo los últimos 3 sorteos
    });

    if (draws.length === 0) {
      console.log('❌ No hay sorteos con ganador para generar videos\n');
      console.log('💡 Sugerencia: Ejecutar sorteos primero o esperar a que se ejecuten automáticamente\n');
      return;
    }

    console.log(`📊 Encontrados ${draws.length} sorteos para procesar\n`);

    const results = [];

    for (const draw of draws) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎮 ${draw.game.name}`);
      console.log(`📅 ${draw.scheduledAt.toLocaleString('es-VE')}`);
      console.log(`🎯 Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      try {
        // Paso 1: Generar imagen si no existe
        let imageUrl = draw.imageUrl;

        if (!imageUrl) {
          console.log('📸 Generando imagen...');
          const imageResult = await generateDrawImage(draw.id);
          imageUrl = imageResult.imageUrl;
          console.log(`   ✅ Imagen generada: ${imageResult.filename}\n`);
        } else {
          console.log(`   ✅ Imagen ya existe: ${imageUrl}\n`);
        }

        // Paso 2: Generar video
        console.log('🎬 Generando video...');
        console.log('   ⏳ Esto puede tardar 10-30 segundos...\n');

        const videoPath = await videoGeneratorService.generateSimpleVideo(
          imageUrl,
          draw.id,
          {
            duration: 10,
            width: 1080,
            height: 1920,
            fps: 30,
            quality: 23
          }
        );

        // Actualizar base de datos
        await prisma.draw.update({
          where: { id: draw.id },
          data: {
            videoUrl: videoPath,
            videoGeneratedAt: new Date()
          }
        });

        const publicUrl = videoGeneratorService.getPublicUrl(videoPath);

        console.log('   ✅ Video generado exitosamente!\n');
        console.log(`   📁 Archivo: ${videoPath}`);
        console.log(`   🔗 URL: ${publicUrl}\n`);

        results.push({
          game: draw.game.name,
          drawId: draw.id,
          scheduledAt: draw.scheduledAt,
          winner: `${draw.winnerItem.number} - ${draw.winnerItem.name}`,
          imageUrl: imageUrl,
          videoPath: videoPath,
          publicUrl: publicUrl,
          success: true
        });

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);

        results.push({
          game: draw.game.name,
          drawId: draw.id,
          error: error.message,
          success: false
        });
      }
    }

    // Resumen final
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║           RESUMEN DE GENERACIÓN            ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Exitosos: ${successful.length}/${results.length}`);
    console.log(`❌ Fallidos: ${failed.length}/${results.length}\n`);

    if (successful.length > 0) {
      console.log('Videos generados:\n');
      successful.forEach((result, index) => {
        console.log(`${index + 1}. ${result.game}`);
        console.log(`   📅 ${result.scheduledAt.toLocaleString('es-VE')}`);
        console.log(`   🎯 ${result.winner}`);
        console.log(`   🔗 ${result.publicUrl}\n`);
      });
    }

    if (failed.length > 0) {
      console.log('Errores:\n');
      failed.forEach((result, index) => {
        console.log(`${index + 1}. ${result.game}: ${result.error}\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Los videos se encuentran en: storage/videos/');
    console.log('💡 Formato: 1080x1920 (vertical para TikTok/Reels)');
    console.log('💡 Duración: 10 segundos\n');

    return results;

  } catch (error) {
    console.error('❌ Error fatal:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar script
generateDemoVideos()
  .then((results) => {
    const exitCode = results && results.some(r => r.success) ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
