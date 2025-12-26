import { PrismaClient } from '@prisma/client';
import publicationService from './src/services/publication.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';
import path from 'path';
import fs from 'fs/promises';

const prisma = new PrismaClient();

async function testPublicationLotoanimalito() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 PRUEBA DE PUBLICACIÓN - LOTOANIMALITO');
    console.log('='.repeat(80) + '\n');

    // 1. Buscar el juego LOTOANIMALITO
    const game = await prisma.game.findFirst({
      where: { name: 'LOTOANIMALITO' }
    });

    if (!game) {
      console.log('❌ Juego LOTOANIMALITO no encontrado');
      return;
    }

    console.log(`✅ Juego encontrado: ${game.name} (${game.id})\n`);

    // 2. Verificar canales activos
    const channels = await prisma.gameChannel.findMany({
      where: {
        gameId: game.id,
        isActive: true
      }
    });

    console.log(`📢 Canales activos: ${channels.length}`);
    channels.forEach(ch => {
      console.log(`   - ${ch.channelType}: ${ch.name}`);
      if (ch.channelType === 'FACEBOOK') console.log(`     Instance: ${ch.facebookInstanceId}`);
      if (ch.channelType === 'INSTAGRAM') console.log(`     Instance: ${ch.instagramInstanceId}`);
    });
    console.log('');

    // 3. Buscar o crear sorteo de prueba
    let testDraw = await prisma.draw.findFirst({
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

    if (!testDraw) {
      console.log('⚠️  No hay sorteos con ganador. Creando uno de prueba...\n');
      
      // Obtener un item del juego
      const item = await prisma.gameItem.findFirst({
        where: { gameId: game.id }
      });

      if (!item) {
        console.log('❌ No hay items para el juego');
        return;
      }

      testDraw = await prisma.draw.create({
        data: {
          gameId: game.id,
          scheduledAt: new Date(),
          drawDate: new Date().toISOString().split('T')[0],
          drawTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
          status: 'DRAWN',
          winnerItemId: item.id,
          drawnAt: new Date()
        },
        include: {
          game: true,
          winnerItem: true
        }
      });
    }

    console.log('✅ Sorteo para probar:');
    console.log(`   ID: ${testDraw.id}`);
    console.log(`   Ganador: ${testDraw.winnerItem?.number} - ${testDraw.winnerItem?.name}`);
    console.log(`   Estado: ${testDraw.status}\n`);

    // 4. Generar imagen de prueba
    console.log('🎨 Generando imagen de prueba...\n');
    
    const testImage = await testImageGenerator.generateCustomTestImage(
      `${testDraw.game.name}\n\n${testDraw.winnerItem?.number}\n${testDraw.winnerItem?.name}`,
      1080, 1080,
      '#1a1a1a',
      '#FFD700'
    );

    // Guardar en /storage/results/
    const resultsDir = path.join(process.cwd(), 'storage', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    
    const filename = `draw-${testDraw.id}-test.png`;
    const destPath = path.join(resultsDir, filename);
    await fs.copyFile(testImage.filepath, destPath);

    // Actualizar sorteo con la URL de la imagen
    testDraw = await prisma.draw.update({
      where: { id: testDraw.id },
      data: {
        imageUrl: `/storage/results/${filename}`,
        imageGenerated: true,
        imageGeneratedAt: new Date(),
        status: 'DRAWN' // Asegurar que esté en DRAWN
      },
      include: {
        game: true,
        winnerItem: true
      }
    });

    console.log(`✅ Imagen generada: ${testDraw.imageUrl}\n`);

    // 5. Verificar endpoint público
    console.log('🌐 Verificando endpoint público...\n');
    const publicImageUrl = `https://toteback.atilax.io/api/public/images/draw/${testDraw.id}`;
    console.log(`   URL: ${publicImageUrl}`);

    try {
      const axios = (await import('axios')).default;
      const response = await axios.head(publicImageUrl, { timeout: 5000 });
      console.log(`   ✅ Accesible (${response.status})\n`);
    } catch (error) {
      console.log(`   ❌ No accesible: ${error.message}\n`);
    }

    // 6. Publicar en canales
    console.log('='.repeat(80));
    console.log('📤 PUBLICANDO EN CANALES...\n');
    console.log('='.repeat(80) + '\n');

    const result = await publicationService.publishDraw(testDraw.id);

    // 7. Mostrar resultados
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTADOS');
    console.log('='.repeat(80) + '\n');

    console.log(`Estado: ${result.success ? '✅ ÉXITO' : '❌ ERROR'}\n`);

    result.results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.channelType} - ${r.channelName}`);
      if (r.success) {
        console.log(`   ✅ PUBLICADO`);
        if (r.postId) console.log(`   Post ID: ${r.postId}`);
        if (r.mediaId) console.log(`   Media ID: ${r.mediaId}`);
      } else {
        console.log(`   ❌ ERROR: ${r.error}`);
        if (r.skipped) console.log(`   ⏭️  ${r.message}`);
      }
      console.log('');
    });

    // 8. Verificar estado final
    const finalDraw = await prisma.draw.findUnique({
      where: { id: testDraw.id },
      select: { status: true, publishedAt: true }
    });

    console.log('='.repeat(80));
    console.log('✅ PRUEBA COMPLETADA\n');
    console.log(`   Estado final: ${finalDraw.status}`);
    console.log(`   Publicado: ${finalDraw.publishedAt ? 'Sí' : 'No'}`);
    
    const successCount = result.results.filter(r => r.success).length;
    console.log(`   Canales exitosos: ${successCount}/${result.results.length}\n`);

    if (successCount === result.results.length) {
      console.log('🎉 ¡TODOS LOS CANALES FUNCIONANDO!\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testPublicationLotoanimalito();
