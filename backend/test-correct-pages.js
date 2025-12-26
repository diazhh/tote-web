import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';
import instagramService from './src/services/instagram.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';

const prisma = new PrismaClient();

async function testCorrectPages() {
  try {
    console.log('🎯 PROBANDO LAS 2 PÁGINAS CORRECTAS\n');
    console.log('='.repeat(70) + '\n');

    // Generar imagen de prueba
    console.log('🎨 Generando imagen de prueba...');
    const imageResult = await testImageGenerator.generateBlackTestImage();
    const publicUrl = `https://toteback.atilax.io${imageResult.publicUrl}`;
    console.log(`✅ Imagen: ${publicUrl}\n`);

    console.log('='.repeat(70) + '\n');

    // 1. Probar Lotoanimalito (Facebook)
    console.log('📘 TEST 1: Facebook - Lotoanimalito\n');
    try {
      const result1 = await facebookService.publishPhoto(
        'fb-137321016700627',
        publicUrl,
        '🧪 Prueba de publicación - Lotoanimalito\n\n✅ Sistema funcionando correctamente.\n🕐 ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ÉXITO en Lotoanimalito (Facebook)');
      console.log(`   Photo ID: ${result1.photoId}`);
      console.log(`   Post ID: ${result1.post_id}`);
      console.log(`   Ver: https://facebook.com/137321016700627\n`);
    } catch (error) {
      console.error('❌ ERROR en Lotoanimalito (Facebook):', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }

    console.log('='.repeat(70) + '\n');

    // 2. Probar Lotto pantera (Facebook)
    console.log('📘 TEST 2: Facebook - Lotto pantera\n');
    try {
      const result2 = await facebookService.publishPhoto(
        'fb-116187448076947',
        publicUrl,
        '🧪 Prueba de publicación - Lotto Pantera\n\n✅ Sistema funcionando correctamente.\n🕐 ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ÉXITO en Lotto pantera (Facebook)');
      console.log(`   Photo ID: ${result2.photoId}`);
      console.log(`   Post ID: ${result2.post_id}`);
      console.log(`   Ver: https://facebook.com/116187448076947\n`);
    } catch (error) {
      console.error('❌ ERROR en Lotto pantera (Facebook):', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }

    console.log('='.repeat(70) + '\n');

    // 3. Probar @lotoanimalito (Instagram)
    console.log('📱 TEST 3: Instagram - @lotoanimalito\n');
    try {
      const result3 = await instagramService.publishPhoto(
        'ig-17841403596605091',
        publicUrl,
        '🧪 Prueba de publicación - Lotoanimalito ✅ ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ÉXITO en @lotoanimalito (Instagram)');
      console.log(`   Media ID: ${result3.mediaId}`);
      console.log(`   Ver: https://instagram.com/lotoanimalito\n`);
    } catch (error) {
      console.error('❌ ERROR en @lotoanimalito (Instagram):', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }

    console.log('='.repeat(70) + '\n');

    // 4. Probar @lottopantera (Instagram)
    console.log('📱 TEST 4: Instagram - @lottopantera\n');
    try {
      const result4 = await instagramService.publishPhoto(
        'ig-17841458238569617',
        publicUrl,
        '🧪 Prueba de publicación - Lotto Pantera ✅ ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ÉXITO en @lottopantera (Instagram)');
      console.log(`   Media ID: ${result4.mediaId}`);
      console.log(`   Ver: https://instagram.com/lottopantera\n`);
    } catch (error) {
      console.error('❌ ERROR en @lottopantera (Instagram):', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('\n📊 RESUMEN DE TOKENS USADOS:\n');

    // Mostrar tokens
    const fbLotoanimalito = await prisma.facebookInstance.findUnique({
      where: { instanceId: 'fb-137321016700627' }
    });
    const fbLottopantera = await prisma.facebookInstance.findUnique({
      where: { instanceId: 'fb-116187448076947' }
    });
    const igLotoanimalito = await prisma.instagramInstance.findUnique({
      where: { instanceId: 'ig-17841403596605091' }
    });
    const igLottopantera = await prisma.instagramInstance.findUnique({
      where: { instanceId: 'ig-17841458238569617' }
    });

    console.log('📘 Facebook - Lotoanimalito:');
    console.log(`   Token: ${fbLotoanimalito.pageAccessToken.substring(0, 50)}...`);
    console.log('');
    
    console.log('📘 Facebook - Lotto pantera:');
    console.log(`   Token: ${fbLottopantera.pageAccessToken.substring(0, 50)}...`);
    console.log('');
    
    console.log('📱 Instagram - @lotoanimalito:');
    console.log(`   Token: ${igLotoanimalito.accessToken.substring(0, 50)}...`);
    console.log(`   User ID: ${igLotoanimalito.userId}`);
    console.log('');
    
    console.log('📱 Instagram - @lottopantera:');
    console.log(`   Token: ${igLottopantera.accessToken.substring(0, 50)}...`);
    console.log(`   User ID: ${igLottopantera.userId}`);
    console.log('');

    console.log('✨ Prueba completada\n');

  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCorrectPages();
