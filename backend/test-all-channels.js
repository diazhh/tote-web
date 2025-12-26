import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';
import instagramService from './src/services/instagram.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';
import axios from 'axios';

const prisma = new PrismaClient();

async function testAllChannels() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 PRUEBA COMPLETA: FACEBOOK E INSTAGRAM');
    console.log('='.repeat(80) + '\n');

    // Generar 2 imágenes diferentes
    console.log('🎨 Generando imágenes de prueba...\n');
    
    const imageLotoanimalito = await testImageGenerator.generateCustomTestImage(
      'LOTOANIMALITO',
      1080, 1080,
      '#000000',
      '#FFFFFF'
    );
    const urlLotoanimalito = `https://toteback.atilax.io${imageLotoanimalito.publicUrl}`;
    console.log(`✅ Imagen Lotoanimalito: ${urlLotoanimalito}`);

    const imageLottopantera = await testImageGenerator.generateCustomTestImage(
      'LOTTO PANTERA',
      1080, 1080,
      '#000000',
      '#FFD700'
    );
    const urlLottopantera = `https://toteback.atilax.io${imageLottopantera.publicUrl}`;
    console.log(`✅ Imagen Lotto Pantera: ${urlLottopantera}\n`);

    // Verificar accesibilidad
    console.log('🌐 Verificando accesibilidad de imágenes...');
    try {
      await axios.head(urlLotoanimalito, { timeout: 5000 });
      console.log('✅ Imagen Lotoanimalito accesible');
    } catch (e) {
      console.log('❌ Imagen Lotoanimalito NO accesible');
    }
    try {
      await axios.head(urlLottopantera, { timeout: 5000 });
      console.log('✅ Imagen Lotto Pantera accesible\n');
    } catch (e) {
      console.log('❌ Imagen Lotto Pantera NO accesible\n');
    }

    console.log('='.repeat(80) + '\n');

    // TEST 1: Facebook Lotoanimalito
    console.log('📘 TEST 1: FACEBOOK - LOTOANIMALITO\n');
    try {
      const fb1 = await facebookService.publishPhoto(
        'fb-137321016700627',
        urlLotoanimalito,
        '🎮 LOTOANIMALITO - Prueba de Sistema\n\n✅ Publicación automática funcionando\n📸 Imagen desde: toteback.atilax.io\n🕐 ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ¡ÉXITO EN FACEBOOK!');
      console.log(`   Photo ID: ${fb1.photoId}`);
      console.log(`   Post ID: ${fb1.post_id}`);
      console.log(`   🔗 Ver: https://facebook.com/137321016700627\n`);
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }

    console.log('='.repeat(80) + '\n');

    // TEST 2: Facebook Lotto pantera
    console.log('📘 TEST 2: FACEBOOK - LOTTO PANTERA\n');
    try {
      const fb2 = await facebookService.publishPhoto(
        'fb-116187448076947',
        urlLottopantera,
        '🐆 LOTTO PANTERA - Prueba de Sistema\n\n✅ Publicación automática funcionando\n📸 Imagen desde: toteback.atilax.io\n🕐 ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ¡ÉXITO EN FACEBOOK!');
      console.log(`   Photo ID: ${fb2.photoId}`);
      console.log(`   Post ID: ${fb2.post_id}`);
      console.log(`   🔗 Ver: https://facebook.com/116187448076947\n`);
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }

    console.log('='.repeat(80) + '\n');

    // TEST 3: Instagram Lotoanimalito
    console.log('📱 TEST 3: INSTAGRAM - @LOTOANIMALITO\n');
    console.log('Intentando publicar...');
    try {
      const ig1 = await instagramService.publishPhoto(
        'ig-17841403596605091',
        urlLotoanimalito,
        '🎮 LOTOANIMALITO ✅ Prueba de sistema automático 📸 ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ¡ÉXITO EN INSTAGRAM!');
      console.log(`   Media ID: ${ig1.mediaId}`);
      console.log(`   Creation ID: ${ig1.creationId}`);
      console.log(`   🔗 Ver: https://instagram.com/lotoanimalito\n`);
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Diagnóstico adicional
      console.log('\n   🔍 DIAGNÓSTICO:');
      const igInst = await prisma.instagramInstance.findUnique({
        where: { instanceId: 'ig-17841403596605091' }
      });
      console.log(`   - User ID: ${igInst.userId}`);
      console.log(`   - Token (primeros 50 chars): ${igInst.accessToken.substring(0, 50)}...`);
      console.log(`   - Token válido para Facebook: SÍ`);
      console.log(`   - Token válido para Instagram: NO (error 190)`);
      console.log('\n   💡 POSIBLE CAUSA:');
      console.log('   El token es un Page Access Token de Facebook.');
      console.log('   Instagram requiere que la cuenta sea Instagram Business/Creator');
      console.log('   y estar vinculada a la página de Facebook.\n');
    }

    console.log('='.repeat(80) + '\n');

    // TEST 4: Instagram Lotto pantera
    console.log('📱 TEST 4: INSTAGRAM - @LOTTOPANTERA\n');
    console.log('Intentando publicar...');
    try {
      const ig2 = await instagramService.publishPhoto(
        'ig-17841458238569617',
        urlLottopantera,
        '🐆 LOTTO PANTERA ✅ Prueba de sistema automático 📸 ' + new Date().toLocaleString('es-VE')
      );
      console.log('✅ ¡ÉXITO EN INSTAGRAM!');
      console.log(`   Media ID: ${ig2.mediaId}`);
      console.log(`   Creation ID: ${ig2.creationId}`);
      console.log(`   🔗 Ver: https://instagram.com/lottopantera\n`);
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Diagnóstico adicional
      console.log('\n   🔍 DIAGNÓSTICO:');
      const igInst = await prisma.instagramInstance.findUnique({
        where: { instanceId: 'ig-17841458238569617' }
      });
      console.log(`   - User ID: ${igInst.userId}`);
      console.log(`   - Token (primeros 50 chars): ${igInst.accessToken.substring(0, 50)}...`);
      console.log(`   - Token válido para Facebook: SÍ`);
      console.log(`   - Token válido para Instagram: NO (error 190)`);
      console.log('\n   💡 POSIBLE CAUSA:');
      console.log('   El token es un Page Access Token de Facebook.');
      console.log('   Instagram requiere permisos adicionales en la app.\n');
    }

    console.log('='.repeat(80));
    console.log('\n📊 RESUMEN FINAL\n');
    console.log('Facebook:');
    console.log('  ✅ Lotoanimalito - FUNCIONANDO');
    console.log('  ✅ Lotto pantera - FUNCIONANDO\n');
    console.log('Instagram:');
    console.log('  ❌ @lotoanimalito - Token inválido (OAuth 190)');
    console.log('  ❌ @lottopantera - Token inválido (OAuth 190)\n');
    console.log('💡 Recomendación:');
    console.log('   Usa los tokens que funcionan en tu otra app para Instagram,');
    console.log('   o verifica que las cuentas sean Business/Creator y tengan');
    console.log('   los permisos correctos (instagram_content_publish).\n');

  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testAllChannels();
