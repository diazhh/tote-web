import { prisma } from '../lib/prisma.js';
import videoGeneratorAdvanced from '../services/video-generator-advanced.service.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Script para generar PREVIEW de los frames del video (sin FFmpeg)
 * Esto te permite ver cómo se verán los frames antes de compilar el video
 */
async function previewVideoFrames() {
  try {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║       PREVIEW DE FRAMES DE VIDEO            ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    console.log('Este script genera los frames individuales que');
    console.log('compondrán el video final.\n');

    // Buscar un sorteo con ganador
    const draw = await prisma.draw.findFirst({
      where: {
        winnerItemId: { not: null }
      },
      include: {
        game: true,
        winnerItem: true
      },
      orderBy: { scheduledAt: 'desc' }
    });

    if (!draw) {
      console.log('❌ No hay sorteos con ganador para generar preview\n');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎮 Juego: ${draw.game.name}`);
    console.log(`📅 Sorteo: ${draw.scheduledAt.toLocaleString('es-VE')}`);
    console.log(`🎯 Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await videoGeneratorAdvanced.initialize();

    // Directorio de preview
    const previewDir = path.join(process.cwd(), 'storage', 'video-preview');
    await fs.mkdir(previewDir, { recursive: true });

    console.log('Generando frames:\n');

    // 1. Intro
    console.log('1️⃣  Generando frame INTRO (0-2s)...');
    const introBuffer = await videoGeneratorAdvanced.generateIntroFrame(draw.game.name);
    const introPath = path.join(previewDir, '01-intro.png');
    await fs.writeFile(introPath, introBuffer);
    console.log(`   ✅ Guardado: ${introPath}\n`);

    // 2. Countdown 3
    console.log('2️⃣  Generando frame COUNTDOWN 3 (2-3s)...');
    const count3Buffer = await videoGeneratorAdvanced.generateCountdownFrame(3);
    const count3Path = path.join(previewDir, '02-countdown-3.png');
    await fs.writeFile(count3Path, count3Buffer);
    console.log(`   ✅ Guardado: ${count3Path}\n`);

    // 3. Countdown 2
    console.log('3️⃣  Generando frame COUNTDOWN 2 (3-4s)...');
    const count2Buffer = await videoGeneratorAdvanced.generateCountdownFrame(2);
    const count2Path = path.join(previewDir, '03-countdown-2.png');
    await fs.writeFile(count2Path, count2Buffer);
    console.log(`   ✅ Guardado: ${count2Path}\n`);

    // 4. Countdown 1
    console.log('4️⃣  Generando frame COUNTDOWN 1 (4-5s)...');
    const count1Buffer = await videoGeneratorAdvanced.generateCountdownFrame(1);
    const count1Path = path.join(previewDir, '04-countdown-1.png');
    await fs.writeFile(count1Path, count1Buffer);
    console.log(`   ✅ Guardado: ${count1Path}\n`);

    // 5. Resultado/Ganador
    console.log('5️⃣  Generando frame GANADOR (5-10s)...');
    const winnerBuffer = await videoGeneratorAdvanced.generateWinnerFrame(draw);
    const winnerPath = path.join(previewDir, '05-winner.png');
    await fs.writeFile(winnerPath, winnerBuffer);
    console.log(`   ✅ Guardado: ${winnerPath}\n`);

    // 5b. Si hay imagen base, generar versión con overlay
    if (draw.imageUrl) {
      try {
        const imageExists = await fs.access(draw.imageUrl).then(() => true).catch(() => false);
        if (imageExists) {
          console.log('5️⃣b Generando frame con IMAGEN BASE + OVERLAY...');
          const overlayBuffer = await videoGeneratorAdvanced.addTextOverlay(
            draw.imageUrl,
            `${draw.winnerItem.number} - ${draw.winnerItem.name}`,
            { position: 'bottom', fontSize: 100 }
          );
          const overlayPath = path.join(previewDir, '05b-winner-with-image.png');
          await fs.writeFile(overlayPath, overlayBuffer);
          console.log(`   ✅ Guardado: ${overlayPath}\n`);
        }
      } catch (error) {
        console.log(`   ⚠️  No se pudo generar con imagen base: ${error.message}\n`);
      }
    }

    // 6. Outro
    console.log('6️⃣  Generando frame OUTRO (10-12s)...');
    const outroBuffer = await videoGeneratorAdvanced.generateOutroFrame();
    const outroPath = path.join(previewDir, '06-outro.png');
    await fs.writeFile(outroPath, outroBuffer);
    console.log(`   ✅ Guardado: ${outroPath}\n`);

    // Resumen
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║              PREVIEW GENERADO                ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    console.log(`📁 Los frames se guardaron en:`);
    console.log(`   ${previewDir}\n`);

    console.log('📺 Secuencia del video (12 segundos totales):\n');
    console.log('   • 01-intro.png (2s) - Intro del juego');
    console.log('   • 02-countdown-3.png (1s) - Countdown 3');
    console.log('   • 03-countdown-2.png (1s) - Countdown 2');
    console.log('   • 04-countdown-1.png (1s) - Countdown 1');
    console.log('   • 05-winner.png (5s) - Resultado con ganador');
    console.log('   • 06-outro.png (2s) - Outro/Cierre\n');

    console.log('💡 Próximos pasos:\n');
    console.log('   1. Revisa los frames generados');
    console.log('   2. Si te gustan, instala FFmpeg:');
    console.log('      sudo apt-get update && sudo apt-get install -y ffmpeg');
    console.log('   3. Ejecuta: npm run demo:video:advanced');
    console.log('   4. FFmpeg compilará estos frames en un video MP4\n');

    console.log('🎨 Personalización:\n');
    console.log('   Puedes editar src/services/video-generator-advanced.service.js');
    console.log('   para cambiar colores, textos, tamaños de fuente, etc.\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
previewVideoFrames()
  .then(() => {
    console.log('✅ Preview completado\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
