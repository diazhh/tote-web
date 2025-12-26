import { PrismaClient } from '@prisma/client';
import channelService from './src/services/channel.service.js';
import logger from './src/lib/logger.js';

const prisma = new PrismaClient();

async function testChannelPublish() {
  try {
    console.log('🔍 Buscando canales de Instagram y Facebook...\n');

    // Buscar canales de Instagram
    const instagramChannels = await prisma.channelConfig.findMany({
      where: { type: 'INSTAGRAM', isActive: true }
    });

    console.log(`📱 Canales de Instagram encontrados: ${instagramChannels.length}`);
    instagramChannels.forEach(channel => {
      console.log(`  - ${channel.name} (ID: ${channel.id})`);
      console.log(`    Config:`, JSON.stringify(channel.config, null, 2));
    });

    // Buscar canales de Facebook
    const facebookChannels = await prisma.channelConfig.findMany({
      where: { type: 'FACEBOOK', isActive: true }
    });

    console.log(`\n📘 Canales de Facebook encontrados: ${facebookChannels.length}`);
    facebookChannels.forEach(channel => {
      console.log(`  - ${channel.name} (ID: ${channel.id})`);
      console.log(`    Config:`, JSON.stringify(channel.config, null, 2));
    });

    // Buscar GameChannels de Instagram y Facebook
    const gameChannelsInstagram = await prisma.gameChannel.findMany({
      where: { channelType: 'INSTAGRAM', isActive: true },
      include: { game: true }
    });

    console.log(`\n🎮 GameChannels de Instagram encontrados: ${gameChannelsInstagram.length}`);
    gameChannelsInstagram.forEach(channel => {
      console.log(`  - ${channel.name} (ID: ${channel.id})`);
      console.log(`    Juego: ${channel.game.name}`);
      console.log(`    Instagram Instance ID: ${channel.instagramInstanceId}`);
    });

    const gameChannelsFacebook = await prisma.gameChannel.findMany({
      where: { channelType: 'FACEBOOK', isActive: true },
      include: { game: true }
    });

    console.log(`\n🎮 GameChannels de Facebook encontrados: ${gameChannelsFacebook.length}`);
    gameChannelsFacebook.forEach(channel => {
      console.log(`  - ${channel.name} (ID: ${channel.id})`);
      console.log(`    Juego: ${channel.game.name}`);
      console.log(`    Facebook Instance ID: ${channel.facebookInstanceId}`);
    });

    // Probar publicación en el primer canal de cada tipo
    console.log('\n\n🧪 PROBANDO PUBLICACIÓN...\n');

    if (instagramChannels.length > 0) {
      const channel = instagramChannels[0];
      console.log(`\n📱 Probando Instagram: ${channel.name}`);
      try {
        const result = await channelService.testPublish(channel.id);
        console.log('✅ Publicación exitosa en Instagram!');
        console.log('Resultado:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('❌ Error en Instagram:', error.message);
        console.error('Stack:', error.stack);
      }
    }

    if (facebookChannels.length > 0) {
      const channel = facebookChannels[0];
      console.log(`\n📘 Probando Facebook: ${channel.name}`);
      try {
        const result = await channelService.testPublish(channel.id);
        console.log('✅ Publicación exitosa en Facebook!');
        console.log('Resultado:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('❌ Error en Facebook:', error.message);
        console.error('Stack:', error.stack);
      }
    }

    if (instagramChannels.length === 0 && facebookChannels.length === 0) {
      console.log('⚠️  No se encontraron canales de Instagram o Facebook configurados.');
      console.log('\nPara configurar un canal, usa la API:');
      console.log('POST /api/channels');
      console.log('Body: {');
      console.log('  "type": "INSTAGRAM" o "FACEBOOK",');
      console.log('  "name": "Nombre del canal",');
      console.log('  "config": {');
      console.log('    "instanceId": "id-de-la-instancia",');
      console.log('    "accessToken": "token",');
      console.log('    "instagramAccountId": "account-id" (para Instagram)');
      console.log('    "pageId": "page-id" (para Facebook)');
      console.log('  }');
      console.log('}');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testChannelPublish();
