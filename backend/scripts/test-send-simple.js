import { PrismaClient } from '@prisma/client';
import publicationService from '../src/services/publication.service.js';

const prisma = new PrismaClient();

async function testSendSimple() {
  try {
    console.log('=== Test de envío simple a grupos ===\n');

    // Obtener el primer juego con canal de WhatsApp
    const channel = await prisma.gameChannel.findFirst({
      where: {
        channelType: 'WHATSAPP',
        isActive: true
      },
      include: {
        game: true
      }
    });

    if (!channel) {
      console.log('No hay canales de WhatsApp configurados.');
      return;
    }

    console.log(`Canal: ${channel.name}`);
    console.log(`Juego: ${channel.game.name}`);
    console.log(`Instancia: ${channel.whatsappInstanceId}`);
    console.log(`Destinatarios (${channel.recipients.length}):`);
    channel.recipients.forEach(r => {
      const tipo = r.includes('@g.us') ? 'GRUPO' : 'INDIVIDUAL';
      console.log(`  - ${r} (${tipo})`);
    });

    // Crear un sorteo de prueba mínimo
    const testDraw = {
      id: 'test-' + Date.now(),
      gameId: channel.gameId,
      drawDate: new Date(),
      drawTime: '00:00:00',
      status: 'DRAWN',
      imageUrl: 'https://toteback.atilax.io/storage/images/animalitos_20251226_0800.png',
      game: channel.game,
      winnerItem: {
        number: '00',
        name: 'TEST'
      }
    };

    console.log(`\nImagen de prueba: ${testDraw.imageUrl}`);

    // Configuración del canal
    const channelConfig = {
      whatsappInstanceId: channel.whatsappInstanceId,
      recipients: channel.recipients,
      messageTemplate: '🎰 *TEST*\n\nPrueba de envío a grupo\n\n.'
    };

    console.log('\n--- Iniciando envío ---\n');

    const result = await publicationService.publishViaBaileys(testDraw, channelConfig);
    
    console.log('\n=== Resultado ===');
    console.log(`Success: ${result.success}`);
    console.log(`Total enviados: ${result.totalSent}`);
    console.log(`Total fallidos: ${result.totalFailed}`);
    
    if (result.messageIds && result.messageIds.length > 0) {
      console.log('\n✅ Message IDs:');
      result.messageIds.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Errores:');
      result.errors.forEach((err, index) => {
        console.log(`  ${index + 1}. ${err.recipient}`);
        console.log(`     Error: ${err.error}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testSendSimple();
