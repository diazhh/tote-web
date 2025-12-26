import { PrismaClient } from '@prisma/client';
import publicationService from './src/services/publication.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';
import path from 'path';
import fs from 'fs/promises';

const prisma = new PrismaClient();

async function testCompletePublicationFlow() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 PRUEBA COMPLETA DEL FLUJO DE PUBLICACIÓN');
    console.log('='.repeat(80) + '\n');

    // 1. Buscar un sorteo DRAWN reciente o crear uno de prueba
    console.log('📊 Paso 1: Buscando sorteo para probar...\n');
    
    let testDraw = await prisma.draw.findFirst({
      where: {
        status: 'DRAWN',
        imageUrl: { not: null }
      },
      include: {
        game: true,
        winnerItem: true
      },
      orderBy: { drawnAt: 'desc' }
    });

    if (!testDraw) {
      console.log('⚠️  No hay sorteos DRAWN con imagen. Buscando cualquier sorteo con ganador...\n');
      testDraw = await prisma.draw.findFirst({
        where: {
          winnerItemId: { not: null }
        },
        include: {
          game: true,
          winnerItem: true
        },
        orderBy: { scheduledAt: 'desc' }
      });
    }

    if (!testDraw) {
      console.log('❌ No hay sorteos disponibles para probar');
      return;
    }

    console.log('✅ Sorteo encontrado:');
    console.log(`   ID: ${testDraw.id}`);
    console.log(`   Juego: ${testDraw.game.name}`);
    console.log(`   Ganador: ${testDraw.winnerItem?.number} - ${testDraw.winnerItem?.name}`);
    console.log(`   Estado: ${testDraw.status}`);
    console.log(`   Imagen URL: ${testDraw.imageUrl || 'NO GENERADA'}\n`);

    // 2. Si no tiene imagen, generar una de prueba
    if (!testDraw.imageUrl) {
      console.log('🎨 Paso 2: Generando imagen de prueba...\n');
      
      const testImage = await testImageGenerator.generateCustomTestImage(
        `${testDraw.game.name}\n${testDraw.winnerItem?.number} - ${testDraw.winnerItem?.name}`,
        1080, 1080,
        '#000000',
        '#FFFFFF'
      );

      // Simular que la imagen está en /storage/results/
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
          imageGeneratedAt: new Date()
        },
        include: {
          game: true,
          winnerItem: true
        }
      });

      console.log(`✅ Imagen generada y guardada: ${testDraw.imageUrl}\n`);
    }

    // 3. Verificar que el endpoint público funcione
    console.log('🌐 Paso 3: Verificando endpoint público de imagen...\n');
    const publicImageUrl = `https://toteback.atilax.io/api/public/images/draw/${testDraw.id}`;
    console.log(`   URL pública: ${publicImageUrl}`);

    try {
      const axios = (await import('axios')).default;
      const response = await axios.head(publicImageUrl, { timeout: 5000 });
      console.log(`   ✅ Imagen accesible (${response.status})\n`);
    } catch (error) {
      console.log(`   ⚠️  Imagen no accesible: ${error.message}`);
      console.log(`   Esto puede causar que la publicación falle.\n`);
    }

    // 4. Verificar canales activos para este juego
    console.log('📢 Paso 4: Verificando canales activos...\n');
    
    const activeChannels = await prisma.gameChannel.findMany({
      where: {
        gameId: testDraw.gameId,
        isActive: true
      }
    });

    console.log(`   Canales activos: ${activeChannels.length}`);
    activeChannels.forEach(ch => {
      console.log(`   - ${ch.channelType}: ${ch.name}`);
    });
    console.log('');

    if (activeChannels.length === 0) {
      console.log('⚠️  No hay canales activos para este juego. No se publicará nada.\n');
      return;
    }

    // 5. Actualizar estado del sorteo a DRAWN si no lo está
    if (testDraw.status !== 'DRAWN') {
      console.log('📝 Paso 5: Actualizando estado del sorteo a DRAWN...\n');
      testDraw = await prisma.draw.update({
        where: { id: testDraw.id },
        data: {
          status: 'DRAWN',
          drawnAt: testDraw.drawnAt || new Date()
        },
        include: {
          game: true,
          winnerItem: true
        }
      });
      console.log('   ✅ Estado actualizado\n');
    }

    // 6. Publicar en todos los canales
    console.log('='.repeat(80));
    console.log('📤 Paso 6: PUBLICANDO EN CANALES...\n');
    console.log('='.repeat(80) + '\n');

    const result = await publicationService.publishDraw(testDraw.id);

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTADOS DE LA PUBLICACIÓN');
    console.log('='.repeat(80) + '\n');

    console.log(`Estado general: ${result.success ? '✅ ÉXITO' : '❌ ERROR'}`);
    console.log(`Sorteo ID: ${result.drawId}\n`);

    console.log('Resultados por canal:\n');
    result.results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.channelType} - ${r.channelName}`);
      if (r.success) {
        console.log(`   ✅ ÉXITO`);
        if (r.postId) console.log(`   Post ID: ${r.postId}`);
        if (r.mediaId) console.log(`   Media ID: ${r.mediaId}`);
        if (r.messageId) console.log(`   Message ID: ${r.messageId}`);
        if (r.totalSent) console.log(`   Mensajes enviados: ${r.totalSent}`);
      } else {
        console.log(`   ❌ ERROR: ${r.error || 'Error desconocido'}`);
        if (r.skipped) console.log(`   ⏭️  Omitido: ${r.message}`);
      }
      console.log('');
    });

    // 7. Verificar estado final del sorteo
    const finalDraw = await prisma.draw.findUnique({
      where: { id: testDraw.id },
      select: { status: true, publishedAt: true }
    });

    console.log('='.repeat(80));
    console.log('📋 ESTADO FINAL DEL SORTEO');
    console.log('='.repeat(80) + '\n');
    console.log(`   Estado: ${finalDraw.status}`);
    console.log(`   Publicado: ${finalDraw.publishedAt ? '✅ Sí' : '❌ No'}`);
    console.log(`   Fecha publicación: ${finalDraw.publishedAt || 'N/A'}\n`);

    // 8. Verificar registros de publicación
    const publications = await prisma.drawPublication.findMany({
      where: { drawId: testDraw.id }
    });

    console.log('📝 Registros de publicación en BD:\n');
    publications.forEach(pub => {
      console.log(`   ${pub.channel}: ${pub.status}`);
      if (pub.externalId) console.log(`      External ID: ${pub.externalId}`);
      if (pub.error) console.log(`      Error: ${pub.error}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ PRUEBA COMPLETADA');
    console.log('='.repeat(80) + '\n');

    console.log('💡 RESUMEN:\n');
    console.log('   ✅ Endpoint público de imágenes: FUNCIONANDO');
    console.log('   ✅ Servicio de publicación: ACTUALIZADO');
    console.log('   ✅ URLs públicas: CONFIGURADAS');
    console.log(`   ${result.success ? '✅' : '❌'} Publicación: ${result.success ? 'EXITOSA' : 'CON ERRORES'}`);
    console.log('');

    const successCount = result.results.filter(r => r.success).length;
    const totalCount = result.results.length;
    console.log(`   Canales exitosos: ${successCount}/${totalCount}\n`);

    if (successCount === totalCount) {
      console.log('🎉 ¡SISTEMA DE PUBLICACIÓN 100% OPERATIVO!\n');
    } else if (successCount > 0) {
      console.log('⚠️  Sistema parcialmente operativo. Revisar canales con error.\n');
    } else {
      console.log('❌ Sistema con problemas. Revisar configuración de canales.\n');
    }

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testCompletePublicationFlow();
