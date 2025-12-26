import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';
import axios from 'axios';

const prisma = new PrismaClient();

async function testFacebookWithPublicUrl() {
  try {
    console.log('🧪 PROBANDO PUBLICACIÓN EN FACEBOOK CON URL PÚBLICA\n');

    // Buscar instancia CONNECTED de Facebook
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
    console.log(`   Página: ${connectedInstance.pageName}\n`);

    // Generar imagen de prueba
    console.log('🎨 Generando imagen de prueba...');
    const imageResult = await testImageGenerator.generateBlackTestImage();
    console.log(`✅ Imagen generada: ${imageResult.filepath}\n`);

    // Probar diferentes URLs
    const urlsToTest = [
      `http://144.126.150.120:3001${imageResult.url}`,
      `https://tote.atilax.io${imageResult.url}`,
      `https://i.imgur.com/placeholder.png`, // URL de prueba externa
    ];

    console.log('🔍 Probando accesibilidad de URLs:\n');
    
    for (const url of urlsToTest) {
      try {
        console.log(`   Probando: ${url}`);
        const response = await axios.head(url, { timeout: 5000 });
        console.log(`   ✅ Accesible (${response.status})\n`);
      } catch (error) {
        console.log(`   ❌ No accesible: ${error.message}\n`);
      }
    }

    // Usar la primera URL disponible localmente
    const imageUrl = `http://144.126.150.120:3001${imageResult.url}`;
    console.log(`📤 Intentando publicar con URL: ${imageUrl}\n`);

    try {
      const result = await facebookService.publishPhoto(
        connectedInstance.instanceId,
        imageUrl,
        '🧪 PRUEBA DE PUBLICACIÓN AUTOMÁTICA\n\nImagen generada por el sistema de Tote.\nFecha: ' + new Date().toLocaleString('es-VE')
      );
      
      console.log('✅ ¡PUBLICACIÓN EXITOSA EN FACEBOOK!\n');
      console.log('📊 Resultado:');
      console.log(`   Photo ID: ${result.photoId}`);
      console.log(`   Post ID: ${result.post_id}`);
      console.log(`\n🔗 Verifica la publicación en: https://facebook.com/${connectedInstance.pageId}\n`);
      
    } catch (error) {
      console.error('❌ Error al publicar:', error.message);
      if (error.response?.data) {
        console.error('Detalles del error:', JSON.stringify(error.response.data, null, 2));
      }
      
      console.log('\n💡 DIAGNÓSTICO:');
      if (error.response?.data?.error?.code === 324) {
        console.log('   El error 324 indica que Facebook no puede acceder a la imagen.');
        console.log('   Posibles causas:');
        console.log('   1. La URL no es accesible públicamente desde Internet');
        console.log('   2. El servidor está detrás de un firewall');
        console.log('   3. El puerto 3001 no está expuesto públicamente\n');
        console.log('   SOLUCIONES:');
        console.log('   A. Configurar proxy en nginx/HAProxy para exponer /storage');
        console.log('   B. Subir imágenes a un CDN (Cloudinary, AWS S3, etc.)');
        console.log('   C. Usar un servicio de túnel temporal (ngrok) para pruebas\n');
      }
    }

  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testFacebookWithPublicUrl();
