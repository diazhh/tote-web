import videoGeneratorService from '../services/video-generator.service.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script simple para generar videos de demostración desde archivos de imagen existentes
 */
async function generateDemoFromFiles() {
  try {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║     GENERACIÓN DE VIDEOS DE DEMOSTRACIÓN   ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // Inicializar servicio
    await videoGeneratorService.initialize();

    const resultsDir = path.join(__dirname, '..', '..', 'storage', 'results');

    // Seleccionar 3 imágenes: una de cada tipo
    const testImages = [
      {
        file: 'animalitos_20251004_1700.png',
        type: 'LOTOANIMALITO',
        drawId: 'demo-animalitos-1'
      },
      {
        file: 'ruleta_20251004_1700.png',
        type: 'LOTTOPANTERA',
        drawId: 'demo-ruleta-1'
      },
      {
        file: 'triple_20251004_1700.png',
        type: 'TRIPLE PANTERA',
        drawId: 'demo-triple-1'
      }
    ];

    const results = [];

    for (const image of testImages) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎮 ${image.type}`);
      console.log(`🖼️  ${image.file}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      try {
        const imagePath = path.join(resultsDir, image.file);

        // Verificar que existe
        await fs.access(imagePath);

        console.log('🎬 Generando video...');
        console.log('   ⏳ Esto puede tardar 10-30 segundos...\n');

        // Generar video
        const videoPath = await videoGeneratorService.generateSimpleVideo(
          imagePath, // Path local de la imagen
          image.drawId,
          {
            duration: 10,
            width: 1080,
            height: 1920,
            fps: 30,
            quality: 23
          }
        );

        const publicUrl = videoGeneratorService.getPublicUrl(videoPath);

        console.log('   ✅ Video generado exitosamente!\n');
        console.log(`   📁 Archivo: ${videoPath}`);
        console.log(`   🔗 URL: ${publicUrl}\n`);

        // Obtener tamaño del archivo
        const stats = await fs.stat(videoPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        results.push({
          type: image.type,
          imageFile: image.file,
          videoPath: videoPath,
          publicUrl: publicUrl,
          sizeMB: sizeMB,
          success: true
        });

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);

        results.push({
          type: image.type,
          imageFile: image.file,
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
        console.log(`${index + 1}. ${result.type}`);
        console.log(`   📷 Imagen: ${result.imageFile}`);
        console.log(`   📁 Video: ${path.basename(result.videoPath)}`);
        console.log(`   📊 Tamaño: ${result.sizeMB} MB`);
        console.log(`   🔗 ${result.publicUrl}\n`);
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('💡 Ubicación: storage/videos/');
      console.log('💡 Formato: 1080x1920 (vertical TikTok/Reels)');
      console.log('💡 Duración: 10 segundos');
      console.log('💡 FPS: 30');
      console.log('💡 Codec: H.264 (MP4)\n');
    }

    if (failed.length > 0) {
      console.log('\n❌ Errores:\n');
      failed.forEach((result, index) => {
        console.log(`${index + 1}. ${result.type}`);
        console.log(`   ${result.error}\n`);
      });

      if (failed.some(r => r.error.includes('ffmpeg') || r.error.includes('FFmpeg'))) {
        console.log('\n⚠️  NOTA: FFmpeg no está instalado\n');
        console.log('Para instalar FFmpeg:');
        console.log('   Ubuntu/Debian (WSL): sudo apt-get update && sudo apt-get install -y ffmpeg');
        console.log('   macOS: brew install ffmpeg');
        console.log('   Windows: descargar desde ffmpeg.org\n');
        console.log('Después de instalar, ejecutar:');
        console.log('   npm run check:ffmpeg\n');
      }
    }

    return results;

  } catch (error) {
    console.error('❌ Error fatal:', error);
    throw error;
  }
}

// Ejecutar script
generateDemoFromFiles()
  .then((results) => {
    const exitCode = results && results.some(r => r.success) ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
