import { PrismaClient } from '@prisma/client';
import publicationService from '../src/services/publication.service.js';
import logger from '../src/lib/logger.js';

const prisma = new PrismaClient();

async function testSendToGroups() {
  try {
    console.log('=== Test de envío a grupos de WhatsApp ===\n');

    // Obtener un sorteo reciente para usar como prueba
    const recentDraw = await prisma.draw.findFirst({
      where: {
        status: 'DRAWN',
        imageUrl: { not: null }
      },
      include: {
        game: true,
        winnerItem: true
      },
      orderBy: {
        drawnAt: 'desc'
      }
    });

    if (!recentDraw) {
      console.log('No hay sorteos recientes con imagen para probar.');
      return;
    }

    console.log(`Usando sorteo de prueba:`);
    console.log(`  Juego: ${recentDraw.game.name}`);
    console.log(`  Fecha: ${recentDraw.drawDate}`);
    console.log(`  Hora: ${recentDraw.drawTime}`);
    console.log(`  Ganador: ${recentDraw.winnerItem?.number} - ${recentDraw.winnerItem?.name}`);
    console.log(`  Imagen: ${recentDraw.imageUrl}\n`);

    // Obtener canales de WhatsApp del juego
    const channels = await prisma.gameChannel.findMany({
      where: {
        gameId: recentDraw.gameId,
        channelType: 'WHATSAPP',
        isActive: true
      }
    });

    if (channels.length === 0) {
      console.log('No hay canales de WhatsApp configurados para este juego.');
      return;
    }

    console.log(`Canales encontrados: ${channels.length}\n`);

    // Probar envío a cada canal
    for (const channel of channels) {
      console.log(`\n--- Probando canal: ${channel.name} ---`);
      console.log(`Destinatarios: ${channel.recipients.join(', ')}`);
      
      // Preparar configuración del canal
      const channelConfig = {
        whatsappInstanceId: channel.whatsappInstanceId,
        recipients: channel.recipients,
        messageTemplate: 'TEST: .'  // Mensaje simple de prueba
      };

      try {
        console.log('\nEnviando mensaje de prueba...');
        const result = await publicationService.publishViaBaileys(recentDraw, channelConfig);
        
        console.log('\n✅ Resultado:');
        console.log(`  Success: ${result.success}`);
        console.log(`  Enviados: ${result.totalSent}`);
        console.log(`  Fallidos: ${result.totalFailed}`);
        
        if (result.messageIds && result.messageIds.length > 0) {
          console.log(`  Message IDs: ${result.messageIds.join(', ')}`);
        }
        
        if (result.errors && result.errors.length > 0) {
          console.log('\n❌ Errores:');
          result.errors.forEach((err, index) => {
            console.log(`  ${index + 1}. ${err.recipient}: ${err.error}`);
          });
        }
        
      } catch (error) {
        console.error('\n❌ Error al enviar:', error.message);
        console.error('Stack:', error.stack);
      }
      
      // Pausa entre canales
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('\n\n=== Test completado ===');

  } catch (error) {
    console.error('\n❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testSendToGroups();
