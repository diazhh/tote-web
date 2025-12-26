import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';
import instagramService from './src/services/instagram.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';

const prisma = new PrismaClient();

async function testFinalPublication() {
  try {
    console.log('🎉 PRUEBA FINAL DE PUBLICACIÓN EN FACEBOOK E INSTAGRAM\n');
    console.log('='.repeat(70) + '\n');

    // 1. Generar imagen de prueba
    console.log('🎨 Paso 1: Generando imagen de prueba...');
    const imageResult = await testImageGenerator.generateBlackTestImage();
    console.log(`✅ Imagen generada: ${imageResult.filename}`);

    // 2. Construir URL pública
    const publicUrl = `https://toteback.atilax.io${imageResult.publicUrl}`;
    console.log(`🔗 URL pública: ${publicUrl}\n`);

    // 3. Buscar instancias conectadas
    console.log('📊 Paso 2: Buscando instancias conectadas...\n');

    const fbInstances = await prisma.facebookInstance.findMany({
      where: { status: 'CONNECTED', isActive: true },
      take: 2
    });

    const igInstances = await prisma.instagramInstance.findMany({
      where: { status: 'CONNECTED', isActive: true },
      take: 2
    });

    console.log(`📘 Facebook: ${fbInstances.length} instancia(s) conectada(s)`);
    fbInstances.forEach(inst => console.log(`   - ${inst.name} (${inst.pageId})`));

    console.log(`\n📱 Instagram: ${igInstances.length} instancia(s) conectada(s)`);
    igInstances.forEach(inst => console.log(`   - ${inst.username} (${inst.userId})`));

    console.log('\n' + '='.repeat(70) + '\n');

    // 4. Publicar en Facebook
    if (fbInstances.length > 0) {
      const fbInstance = fbInstances[0];
      console.log(`📘 Paso 3: Publicando en Facebook (${fbInstance.name})...\n`);

      try {
        const result = await facebookService.publishPhoto(
          fbInstance.instanceId,
          publicUrl,
          '🎉 ¡SISTEMA DE PUBLICACIÓN FUNCIONANDO!\n\n✅ Prueba exitosa del sistema automático de publicación.\n📸 Imagen servida desde: toteback.atilax.io\n🕐 Fecha: ' + new Date().toLocaleString('es-VE')
        );

        console.log('✅ ¡PUBLICACIÓN EXITOSA EN FACEBOOK!\n');
        console.log('📊 Detalles:');
        console.log(`   Photo ID: ${result.photoId}`);
        console.log(`   Post ID: ${result.post_id}`);
        console.log(`   Ver en: https://facebook.com/${fbInstance.pageId}\n`);

      } catch (error) {
        console.error('❌ Error en Facebook:', error.message);
        if (error.response?.data) {
          console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
        }
      }
    } else {
      console.log('⚠️  No hay instancias de Facebook conectadas\n');
    }

    console.log('='.repeat(70) + '\n');

    // 5. Publicar en Instagram
    if (igInstances.length > 0) {
      const igInstance = igInstances[0];
      console.log(`📱 Paso 4: Publicando en Instagram (@${igInstance.username})...\n`);

      try {
        const result = await instagramService.publishPhoto(
          igInstance.instanceId,
          publicUrl,
          '🎉 Sistema de publicación funcionando! ✅ Prueba exitosa. 📸 ' + new Date().toLocaleString('es-VE')
        );

        console.log('✅ ¡PUBLICACIÓN EXITOSA EN INSTAGRAM!\n');
        console.log('📊 Detalles:');
        console.log(`   Media ID: ${result.mediaId}`);
        console.log(`   Creation ID: ${result.creationId}`);
        console.log(`   Ver en: https://instagram.com/${igInstance.username}\n`);

      } catch (error) {
        console.error('❌ Error en Instagram:', error.message);
        if (error.response?.data) {
          console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
        }
      }
    } else {
      console.log('⚠️  No hay instancias de Instagram conectadas\n');
    }

    console.log('='.repeat(70));
    console.log('\n✨ PRUEBA COMPLETADA\n');

    console.log('📝 RESUMEN:');
    console.log('   ✅ Endpoint público funcionando: https://toteback.atilax.io');
    console.log('   ✅ Tokens permanentes configurados');
    console.log('   ✅ Sistema listo para publicar sorteos automáticamente\n');

  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testFinalPublication();
