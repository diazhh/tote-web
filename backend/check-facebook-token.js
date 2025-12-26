import { PrismaClient } from '@prisma/client';
import facebookService from './src/services/facebook.service.js';

const prisma = new PrismaClient();

async function checkFacebookToken() {
  try {
    console.log('🔍 VERIFICANDO TOKENS DE FACEBOOK\n');

    const instances = await prisma.facebookInstance.findMany();

    for (const instance of instances) {
      console.log(`\n📘 ${instance.name} (${instance.instanceId})`);
      console.log(`   Estado: ${instance.status}`);
      console.log(`   Page ID: ${instance.pageId}`);
      
      // Desencriptar y mostrar info del token
      try {
        const decryptedToken = facebookService.decryptSecret(instance.pageAccessToken);
        console.log(`   Token encriptado: ${instance.pageAccessToken.substring(0, 50)}...`);
        console.log(`   Token desencriptado: ${decryptedToken.substring(0, 50)}...`);
        console.log(`   Longitud del token: ${decryptedToken.length} caracteres`);
        
        // Verificar formato del token
        if (decryptedToken.includes('.')) {
          console.log(`   ✅ Token parece tener formato válido (contiene puntos)`);
        } else {
          console.log(`   ⚠️  Token NO tiene formato JWT estándar (sin puntos)`);
        }
        
        // Intentar validar el token
        console.log(`\n   🧪 Probando validación del token...`);
        try {
          const pageInfo = await facebookService.validatePageToken(decryptedToken);
          console.log(`   ✅ Token válido!`);
          console.log(`   Página: ${pageInfo.name}`);
          console.log(`   ID: ${pageInfo.id}`);
        } catch (error) {
          console.log(`   ❌ Token inválido: ${error.message}`);
          if (error.response?.data) {
            console.log(`   Detalles:`, JSON.stringify(error.response.data, null, 2));
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Error al desencriptar: ${error.message}`);
      }
    }

    console.log('\n\n💡 SOLUCIÓN:\n');
    console.log('Si los tokens están expirados o inválidos, necesitas:');
    console.log('1. Ir a Facebook Developers (https://developers.facebook.com)');
    console.log('2. Seleccionar tu app');
    console.log('3. Ir a "Tools" > "Access Token Tool"');
    console.log('4. Generar un nuevo Page Access Token con permisos:');
    console.log('   - pages_manage_posts');
    console.log('   - pages_read_engagement');
    console.log('   - pages_show_list');
    console.log('5. Actualizar la instancia con el nuevo token usando:');
    console.log('   PUT /api/facebook/instances/{instanceId}');
    console.log('   Body: { "pageAccessToken": "NUEVO_TOKEN" }\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFacebookToken();
