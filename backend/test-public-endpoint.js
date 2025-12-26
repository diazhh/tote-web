import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';
import axios from 'axios';

const prisma = new PrismaClient();

async function testPublicEndpoint() {
  try {
    console.log('🧪 PROBANDO ENDPOINT PÚBLICO Y PUBLICACIÓN EN FACEBOOK\n');

    // 1. Generar imagen de prueba
    console.log('🎨 Generando imagen de prueba...');
    const imageResult = await testImageGenerator.generateBlackTestImage();
    console.log(`✅ Imagen generada: ${imageResult.filename}\n`);

    // 2. Construir URLs
    const publicUrl = `https://tote.atilax.io${imageResult.publicUrl}`;
    console.log(`🔗 URL pública: ${publicUrl}\n`);

    // 3. Verificar accesibilidad desde Internet
    console.log('🌐 Verificando accesibilidad desde Internet...');
    try {
      const response = await axios.head(publicUrl, { timeout: 10000 });
      console.log(`✅ Imagen accesible públicamente (${response.status})`);
      console.log(`   Content-Type: ${response.headers['content-type']}\n`);
    } catch (error) {
      console.log(`❌ No accesible: ${error.message}`);
      console.log('⚠️  El endpoint público no está accesible desde Internet.');
      console.log('   Verifica que HAProxy esté configurado correctamente.\n');
      return;
    }

    // 4. Buscar instancia de Facebook conectada
    console.log('📘 Buscando instancia de Facebook conectada...');
    const fbInstance = await prisma.facebookInstance.findFirst({
      where: { status: 'CONNECTED', isActive: true }
    });

    if (!fbInstance) {
      console.log('❌ No hay instancias de Facebook conectadas\n');
      return;
    }

    console.log(`✅ Instancia encontrada: ${fbInstance.name}\n`);

    // 5. Publicar en Facebook
    console.log('📤 Publicando en Facebook...');
    try {
      const result = await facebookService.publishPhoto(
        fbInstance.instanceId,
        publicUrl,
        '🧪 PRUEBA DE PUBLICACIÓN AUTOMÁTICA\n\n✅ Sistema de publicación funcionando correctamente.\nImagen servida desde endpoint público.\nFecha: ' + new Date().toLocaleString('es-VE')
      );
      
      console.log('\n🎉 ¡PUBLICACIÓN EXITOSA EN FACEBOOK!\n');
      console.log('📊 Resultado:');
      console.log(`   Photo ID: ${result.photoId}`);
      console.log(`   Post ID: ${result.post_id}`);
      console.log(`\n🔗 Ver publicación: https://facebook.com/${fbInstance.pageId}`);
      console.log(`\n✅ El sistema de publicación está funcionando correctamente!`);
      
    } catch (error) {
      console.error('\n❌ Error al publicar:', error.message);
      if (error.response?.data) {
        console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testPublicEndpoint();
