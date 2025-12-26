import { PrismaClient } from '@prisma/client';
import sessionManager from '../src/lib/whatsapp/session-manager.js';

const prisma = new PrismaClient();

async function testGroupSend() {
  try {
    const instanceId = 'ws';
    
    console.log('=== Test de envío a grupos de WhatsApp ===\n');
    console.log(`Instancia: ${instanceId}\n`);

    // Verificar si está conectada
    const session = sessionManager.getSession(instanceId);
    console.log('Estado de la sesión:', session ? {
      status: session.status,
      phoneNumber: session.phoneNumber,
      hasSocket: !!session.socket
    } : 'null');

    if (!session || session.status !== 'connected') {
      console.log('\n❌ La sesión no está conectada.');
      console.log('Nota: El backend debe estar corriendo para que la sesión esté activa.');
      process.exit(1);
    }

    console.log('\n✅ Sesión conectada\n');

    // Obtener grupos
    console.log('--- Obteniendo grupos disponibles ---');
    try {
      const groups = await sessionManager.getGroups(instanceId);
      console.log(`Total de grupos: ${groups.length}\n`);
      
      groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.name}`);
        console.log(`   ID: ${group.id}`);
        console.log(`   Participantes: ${group.participants}\n`);
      });
    } catch (error) {
      console.error('❌ Error al obtener grupos:', error.message);
      console.error('Stack:', error.stack);
    }

    // Obtener destinatarios configurados
    console.log('\n--- Destinatarios configurados por juego ---');
    const channels = await prisma.gameChannel.findMany({
      where: {
        channelType: 'WHATSAPP',
        whatsappInstanceId: instanceId,
        isActive: true
      },
      include: {
        game: true
      }
    });

    console.log(`Total de canales activos: ${channels.length}\n`);

    const allRecipients = new Set();
    channels.forEach(channel => {
      console.log(`${channel.game.name} - ${channel.name}:`);
      console.log(`  Destinatarios: ${channel.recipients.join(', ')}\n`);
      channel.recipients.forEach(r => allRecipients.add(r));
    });

    const uniqueRecipients = Array.from(allRecipients);
    console.log(`Total de destinatarios únicos: ${uniqueRecipients.length}`);
    console.log('Destinatarios:', uniqueRecipients);

    // Enviar mensaje de prueba "." a cada destinatario
    console.log('\n\n=== Enviando mensaje de prueba "." ===\n');

    for (const recipient of uniqueRecipients) {
      console.log(`\nEnviando a: ${recipient}`);
      
      try {
        const result = await sessionManager.sendTextMessage(
          instanceId,
          recipient,
          '.'
        );
        
        console.log('✅ Mensaje enviado exitosamente');
        console.log('   Message ID:', result.key.id);
        console.log('   Status:', result.status);
        
        // Pausa de 2 segundos entre mensajes
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error('❌ Error al enviar mensaje:');
        console.error('   Mensaje:', error.message);
        console.error('   Tipo:', error.constructor.name);
        
        if (error.output) {
          console.error('   Output:', JSON.stringify(error.output, null, 2));
        }
        
        if (error.data) {
          console.error('   Data:', JSON.stringify(error.data, null, 2));
        }
        
        console.error('\n   Stack completo:');
        console.error(error.stack);
      }
    }

    console.log('\n\n=== Test completado ===');

  } catch (error) {
    console.error('\n❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGroupSend();
