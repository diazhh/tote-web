import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';

const prisma = new PrismaClient();

async function testFacebookConnected() {
  try {
    console.log('🧪 PROBANDO PUBLICACIÓN EN FACEBOOK CONECTADO\n');

    // Buscar la instancia CONNECTED de Facebook
    const connectedInstance = await prisma.facebookInstance.findFirst({
      where: { status: 'CONNECTED', isActive: true }
    });

    if (!connectedInstance) {
      console.log('❌ No hay instancias de Facebook conectadas');
      return;
    }

    console.log('✅ Instancia encontrada:');
    console.log(`   ID: ${connectedInstance.instanceId}`);
    console.log(`   Nombre: ${connectedInstance.name}`);
    console.log(`   Página: ${connectedInstance.pageName}`);
    console.log(`   Page ID: ${connectedInstance.pageId}`);
    console.log(`   Estado: ${connectedInstance.status}\n`);

    // Generar imagen de prueba
    console.log('🎨 Generando imagen de prueba...');
    const imageResult = await testImageGenerator.generateBlackTestImage();
    console.log(`✅ Imagen generada: ${imageResult.filepath}\n`);
    
    const baseUrl = process.env.BACKEND_URL || 'http://144.126.150.120:3000';
    const imageUrl = `${baseUrl}${imageResult.url}`;
    console.log(`🔗 URL pública: ${imageUrl}\n`);

    // Probar publicación
    console.log('📤 Publicando en Facebook...');
    try {
      const result = await facebookService.publishPhoto(
        connectedInstance.instanceId,
        imageUrl,
        '🧪 PRUEBA DE PUBLICACIÓN AUTOMÁTICA\n\nImagen generada por el sistema de Tote.\nFecha: ' + new Date().toLocaleString('es-VE')
      );
      
      console.log('\n✅ ¡PUBLICACIÓN EXITOSA EN FACEBOOK!\n');
      console.log('📊 Resultado:');
      console.log(`   Photo ID: ${result.photoId}`);
      console.log(`   Post ID: ${result.post_id}`);
      console.log(`\n🔗 Verifica la publicación en: https://facebook.com/${connectedInstance.pageId}`);
      
    } catch (error) {
      console.error('\n❌ Error al publicar:', error.message);
      if (error.response?.data) {
        console.error('Detalles del error:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.response?.status === 400) {
        console.error('\n💡 Posibles causas:');
        console.error('   - Token de acceso expirado');
        console.error('   - Permisos insuficientes en el token');
        console.error('   - URL de imagen no accesible públicamente');
      }
    }

  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testFacebookConnected();
