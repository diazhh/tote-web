import { PrismaClient } from '@prisma/client';
import instagramService from './src/services/instagram.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';

const prisma = new PrismaClient();

// Función para esperar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testLottopanteraInstagram() {
  try {
    console.log('🐆 PROBANDO INSTAGRAM - @LOTTOPANTERA\n');
    console.log('='.repeat(70) + '\n');

    // Generar imagen
    const image = await testImageGenerator.generateCustomTestImage(
      'LOTTO PANTERA',
      1080, 1080,
      '#000000',
      '#FFD700'
    );
    const imageUrl = `https://toteback.atilax.io${image.publicUrl}`;
    console.log(`📸 Imagen: ${imageUrl}\n`);

    console.log('📱 Publicando en @lottopantera...\n');
    
    try {
      const result = await instagramService.publishPhoto(
        'ig-17841458238569617',
        imageUrl,
        '🐆 LOTTO PANTERA - Prueba de publicación ✅ ' + new Date().toLocaleString('es-VE')
      );
      
      console.log('✅ ¡ÉXITO EN INSTAGRAM!');
      console.log(`   Media ID: ${result.mediaId}`);
      console.log(`   Creation ID: ${result.creationId}`);
      console.log(`   🔗 Ver: https://instagram.com/lottopantera\n`);
      
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
        
        // Si es error 9007 (media not ready), reintentar
        if (error.response.data.error?.code === 9007) {
          console.log('\n   ⏳ La imagen aún no está lista. Esperando 10 segundos...\n');
          await sleep(10000);
          
          console.log('   🔄 Reintentando...\n');
          try {
            const result = await instagramService.publishPhoto(
              'ig-17841458238569617',
              imageUrl,
              '🐆 LOTTO PANTERA - Prueba de publicación ✅ ' + new Date().toLocaleString('es-VE')
            );
            
            console.log('✅ ¡ÉXITO EN INSTAGRAM (segundo intento)!');
            console.log(`   Media ID: ${result.mediaId}`);
            console.log(`   Creation ID: ${result.creationId}`);
            console.log(`   🔗 Ver: https://instagram.com/lottopantera\n`);
            
          } catch (retryError) {
            console.error('❌ ERROR en segundo intento:', retryError.message);
            if (retryError.response?.data) {
              console.error('   Detalles:', JSON.stringify(retryError.response.data, null, 2));
            }
          }
        }
      }
    }

    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLottopanteraInstagram();
