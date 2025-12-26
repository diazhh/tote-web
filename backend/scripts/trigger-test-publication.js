import { PrismaClient } from '@prisma/client';
import publicationService from '../src/services/publication.service.js';

const prisma = new PrismaClient();

async function triggerTestPublication() {
  try {
    console.log('=== Test de publicación en WhatsApp ===\n');

    // Obtener canales de WhatsApp activos
    const channels = await prisma.gameChannel.findMany({
      where: {
        channelType: 'WHATSAPP',
        isActive: true
      },
      include: {
        game: true
      }
    });

    console.log(`Canales de WhatsApp activos: ${channels.length}\n`);

    if (channels.length === 0) {
      console.log('No hay canales de WhatsApp activos.');
      return;
    }

    // Crear un sorteo de prueba temporal
    const testChannel = channels[0];
    console.log(`Usando canal: ${testChannel.name} (${testChannel.game.name})`);
    console.log(`Destinatarios: ${testChannel.recipients.join(', ')}\n`);

    // Crear un objeto de sorteo simulado para la prueba
    const testDraw = {
      id: 'test-draw-' + Date.now(),
      gameId: testChannel.gameId,
      drawDate: new Date(),
      drawTime: '00:00:00',
      status: 'DRAWN',
      winnerItemId: null,
      imageUrl: null,
      game: testChannel.game,
      winnerItem: {
        number: '00',
        name: 'TEST'
      }
    };

    console.log('Enviando mensaje de prueba "." a través del servicio de publicación...\n');

    // Preparar el canal en el formato que espera el servicio
    const channelConfig = {
      whatsappInstanceId: testChannel.whatsappInstanceId,
      recipients: testChannel.recipients,
      messageTemplate: '.' // Solo un punto para la prueba
    };

    try {
      const result = await publicationService.publishViaBaileys(testDraw, channelConfig);
      
      console.log('\n=== Resultado de la publicación ===');
      console.log('Success:', result.success);
      console.log('Total enviados:', result.totalSent);
      console.log('Total fallidos:', result.totalFailed);
      
      if (result.messageIds && result.messageIds.length > 0) {
        console.log('Message IDs:', result.messageIds);
      }
      
      if (result.errors && result.errors.length > 0) {
        console.log('\n❌ Errores encontrados:');
        result.errors.forEach((err, index) => {
          console.log(`\n${index + 1}. Destinatario: ${err.recipient}`);
          console.log(`   Error: ${err.error}`);
        });
      } else {
        console.log('\n✅ Todos los mensajes se enviaron exitosamente');
      }
      
    } catch (error) {
      console.error('\n❌ Error al publicar:', error.message);
      console.error('Stack:', error.stack);
    }

  } catch (error) {
    console.error('\n❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

triggerTestPublication();
