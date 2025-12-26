import { PrismaClient } from '@prisma/client';
import instagramService from './src/services/instagram.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';

const prisma = new PrismaClient();

async function testInstagramService() {
  try {
    console.log('🧪 PROBANDO SERVICIO DE INSTAGRAM\n');
    console.log('='.repeat(70) + '\n');

    // Generar imagen
    const image = await testImageGenerator.generateCustomTestImage('LOTOANIMALITO TEST');
    const imageUrl = `https://toteback.atilax.io${image.publicUrl}`;
    console.log(`📸 Imagen: ${imageUrl}\n`);

    // Obtener instancia directamente
    const instance = await prisma.instagramInstance.findUnique({
      where: { instanceId: 'ig-17841403596605091' }
    });

    console.log('📊 Datos de la instancia:');
    console.log(`   Instance ID: ${instance.instanceId}`);
    console.log(`   User ID: ${instance.userId}`);
    console.log(`   Username: ${instance.username}`);
    console.log(`   Token: ${instance.accessToken.substring(0, 50)}...`);
    console.log(`   Token length: ${instance.accessToken.length} chars\n`);

    // Probar con el servicio
    console.log('📱 Publicando con instagramService...\n');
    
    try {
      const result = await instagramService.publishPhoto(
        'ig-17841403596605091',
        imageUrl,
        '🧪 Prueba desde servicio - ' + new Date().toLocaleString('es-VE')
      );
      
      console.log('✅ ¡ÉXITO!');
      console.log(`   Media ID: ${result.mediaId}`);
      console.log(`   Creation ID: ${result.creationId}`);
      console.log(`   Ver: https://instagram.com/lotoanimalito\n`);
      
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      if (error.response?.data) {
        console.error('   Detalles:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Mostrar la URL que se está usando
      if (error.config) {
        console.log('\n   🔍 Request Details:');
        console.log(`   URL: ${error.config.url}`);
        console.log(`   Method: ${error.config.method}`);
        console.log(`   Params:`, error.config.params);
      }
    }

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testInstagramService();
