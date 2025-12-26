import { PrismaClient } from '@prisma/client';
import instagramService from './src/services/instagram.service.js';
import facebookService from './src/services/facebook.service.js';
import testImageGenerator from './src/lib/test-image-generator.js';
import logger from './src/lib/logger.js';

const prisma = new PrismaClient();

async function testGameChannelPublish() {
  try {
    console.log('🔍 Buscando GameChannels de Instagram y Facebook...\n');

    // Buscar GameChannels de Instagram
    const instagramChannels = await prisma.gameChannel.findMany({
      where: { channelType: 'INSTAGRAM', isActive: true },
      include: { game: true }
    });

    console.log(`📱 GameChannels de Instagram encontrados: ${instagramChannels.length}`);
    instagramChannels.forEach(channel => {
      console.log(`  - ${channel.name} (ID: ${channel.id})`);
      console.log(`    Juego: ${channel.game.name}`);
      console.log(`    Instagram Instance ID: ${channel.instagramInstanceId}`);
    });

    // Buscar GameChannels de Facebook
    const facebookChannels = await prisma.gameChannel.findMany({
      where: { channelType: 'FACEBOOK', isActive: true },
      include: { game: true }
    });

    console.log(`\n📘 GameChannels de Facebook encontrados: ${facebookChannels.length}`);
    facebookChannels.forEach(channel => {
      console.log(`  - ${channel.name} (ID: ${channel.id})`);
      console.log(`    Juego: ${channel.game.name}`);
      console.log(`    Facebook Instance ID: ${channel.facebookInstanceId}`);
    });

    // Verificar instancias de Instagram
    if (instagramChannels.length > 0) {
      console.log('\n\n📱 VERIFICANDO INSTANCIAS DE INSTAGRAM...\n');
      for (const channel of instagramChannels) {
        if (channel.instagramInstanceId) {
          try {
            const instance = await prisma.instagramInstance.findUnique({
              where: { instanceId: channel.instagramInstanceId }
            });
            console.log(`  ✅ Instancia ${channel.instagramInstanceId}:`);
            console.log(`     Estado: ${instance?.status || 'NO ENCONTRADA'}`);
            console.log(`     Username: ${instance?.username || 'N/A'}`);
            console.log(`     Token expira: ${instance?.tokenExpiresAt || 'N/A'}`);
          } catch (error) {
            console.log(`  ❌ Error al verificar instancia: ${error.message}`);
          }
        }
      }
    }

    // Verificar instancias de Facebook
    if (facebookChannels.length > 0) {
      console.log('\n\n📘 VERIFICANDO INSTANCIAS DE FACEBOOK...\n');
      for (const channel of facebookChannels) {
        if (channel.facebookInstanceId) {
          try {
            const instance = await prisma.facebookInstance.findUnique({
              where: { instanceId: channel.facebookInstanceId }
            });
            console.log(`  ✅ Instancia ${channel.facebookInstanceId}:`);
            console.log(`     Estado: ${instance?.status || 'NO ENCONTRADA'}`);
            console.log(`     Página: ${instance?.pageName || 'N/A'}`);
            console.log(`     Page ID: ${instance?.pageId || 'N/A'}`);
          } catch (error) {
            console.log(`  ❌ Error al verificar instancia: ${error.message}`);
          }
        }
      }
    }

    // Generar imagen de prueba
    console.log('\n\n🎨 GENERANDO IMAGEN DE PRUEBA...\n');
    const imageResult = await testImageGenerator.generateBlackTestImage();
    console.log(`✅ Imagen generada: ${imageResult.filepath}`);
    
    const baseUrl = process.env.BACKEND_URL || 'http://144.126.150.120:3000';
    const imageUrl = `${baseUrl}${imageResult.url}`;
    console.log(`🔗 URL pública: ${imageUrl}`);

    // Probar publicación en Instagram
    if (instagramChannels.length > 0) {
      const channel = instagramChannels[0];
      console.log(`\n\n📱 PROBANDO PUBLICACIÓN EN INSTAGRAM: ${channel.name}\n`);
      
      if (!channel.instagramInstanceId) {
        console.log('❌ No hay instanceId configurado para este canal');
      } else {
        try {
          console.log(`Publicando en instancia: ${channel.instagramInstanceId}`);
          const result = await instagramService.publishPhoto(
            channel.instagramInstanceId,
            imageUrl,
            '🧪 Prueba de publicación automática - Imagen generada por el sistema'
          );
          console.log('✅ ¡Publicación exitosa en Instagram!');
          console.log('Resultado:', JSON.stringify(result, null, 2));
        } catch (error) {
          console.error('❌ Error en Instagram:', error.message);
          if (error.response?.data) {
            console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
          }
        }
      }
    }

    // Probar publicación en Facebook
    if (facebookChannels.length > 0) {
      const channel = facebookChannels[0];
      console.log(`\n\n📘 PROBANDO PUBLICACIÓN EN FACEBOOK: ${channel.name}\n`);
      
      if (!channel.facebookInstanceId) {
        console.log('❌ No hay instanceId configurado para este canal');
      } else {
        try {
          console.log(`Publicando en instancia: ${channel.facebookInstanceId}`);
          const result = await facebookService.publishPhoto(
            channel.facebookInstanceId,
            imageUrl,
            '🧪 Prueba de publicación automática - Imagen generada por el sistema'
          );
          console.log('✅ ¡Publicación exitosa en Facebook!');
          console.log('Resultado:', JSON.stringify(result, null, 2));
        } catch (error) {
          console.error('❌ Error en Facebook:', error.message);
          if (error.response?.data) {
            console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
          }
        }
      }
    }

    console.log('\n\n✨ Prueba completada\n');

  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGameChannelPublish();
