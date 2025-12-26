import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testInstagramDirect() {
  try {
    console.log('🔍 PRUEBA DIRECTA DE API DE INSTAGRAM\n');
    console.log('='.repeat(70) + '\n');

    // Obtener datos de Instagram
    const igInstance = await prisma.instagramInstance.findUnique({
      where: { instanceId: 'ig-17841403596605091' }
    });

    const token = igInstance.accessToken;
    const userId = igInstance.userId;
    const imageUrl = 'https://toteback.atilax.io/api/public/images/test/test-custom-1766676409364.png';

    console.log('📊 Datos:');
    console.log(`   User ID: ${userId}`);
    console.log(`   Token: ${token.substring(0, 50)}...`);
    console.log(`   Image URL: ${imageUrl}\n`);

    // Test 1: Verificar el token con Graph API
    console.log('TEST 1: Verificar token con /me\n');
    try {
      const meResponse = await axios.get(
        `https://graph.facebook.com/v18.0/me`,
        {
          params: { access_token: token }
        }
      );
      console.log('✅ Token válido para /me');
      console.log('   Respuesta:', JSON.stringify(meResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Error en /me:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(70) + '\n');

    // Test 2: Obtener info del usuario de Instagram
    console.log('TEST 2: Obtener info del usuario de Instagram\n');
    try {
      const userResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${userId}`,
        {
          params: {
            fields: 'id,username,account_type,media_count',
            access_token: token
          }
        }
      );
      console.log('✅ Usuario de Instagram encontrado');
      console.log('   Respuesta:', JSON.stringify(userResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Error al obtener usuario:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(70) + '\n');

    // Test 3: Crear container de media
    console.log('TEST 3: Crear container de media\n');
    try {
      const containerResponse = await axios.post(
        `https://graph.facebook.com/v18.0/${userId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            caption: '🧪 Prueba de publicación directa',
            access_token: token
          }
        }
      );
      console.log('✅ Container creado');
      console.log('   Creation ID:', containerResponse.data.id);

      // Test 4: Publicar el container
      console.log('\nTEST 4: Publicar container\n');
      const publishResponse = await axios.post(
        `https://graph.facebook.com/v18.0/${userId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerResponse.data.id,
            access_token: token
          }
        }
      );
      console.log('✅ ¡PUBLICACIÓN EXITOSA EN INSTAGRAM!');
      console.log('   Media ID:', publishResponse.data.id);
      console.log('   Ver: https://instagram.com/lotoanimalito\n');

    } catch (error) {
      console.log('❌ Error al crear/publicar:', error.response?.data || error.message);
      if (error.response?.data) {
        console.log('\n   Detalles completos:', JSON.stringify(error.response.data, null, 2));
      }
    }

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testInstagramDirect();
