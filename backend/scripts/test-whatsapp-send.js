import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001/api';

async function testWhatsAppSend() {
  try {
    const instanceId = 'ws';
    
    console.log('=== Test de envío de WhatsApp ===\n');
    console.log(`Instancia: ${instanceId}\n`);

    // Verificar estado de la instancia a través de la API
    console.log('Verificando estado de la instancia...');
    try {
      const statusResponse = await axios.get(`${API_URL}/whatsapp/instances/${instanceId}/status`);
      console.log('Estado:', statusResponse.data);
      
      if (statusResponse.data.status !== 'connected') {
        console.log('\n❌ La instancia no está conectada.');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error al verificar estado:', error.message);
      console.log('Continuando de todas formas...\n');
    }

    // Obtener grupos disponibles
    console.log('\n--- Obteniendo grupos disponibles ---');
    try {
      const groupsResponse = await axios.get(`${API_URL}/whatsapp/instances/${instanceId}/groups`);
      const groups = groupsResponse.data.groups || [];
      console.log(`Total de grupos: ${groups.length}\n`);
      
      groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.name}`);
        console.log(`   ID: ${group.id}`);
        console.log(`   Participantes: ${group.participants}\n`);
      });
    } catch (error) {
      console.error('❌ Error al obtener grupos:', error.response?.data || error.message);
    }

    // Obtener destinatarios configurados de todos los juegos
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

    // Recopilar todos los destinatarios únicos
    const allRecipients = new Set();
    channels.forEach(channel => {
      console.log(`${channel.game.name} - ${channel.name}:`);
      console.log(`  Destinatarios: ${channel.recipients.join(', ')}\n`);
      channel.recipients.forEach(r => allRecipients.add(r));
    });

    const uniqueRecipients = Array.from(allRecipients);
    console.log(`\nTotal de destinatarios únicos: ${uniqueRecipients.length}`);
    console.log('Destinatarios:', uniqueRecipients);

    // Intentar enviar un '.' a cada destinatario
    console.log('\n\n=== Enviando mensaje de prueba "." ===\n');

    for (const recipient of uniqueRecipients) {
      console.log(`\nEnviando a: ${recipient}`);
      
      try {
        const response = await axios.post(
          `${API_URL}/whatsapp/instances/${instanceId}/test`,
          {
            phoneNumber: recipient,
            message: '.'
          }
        );
        
        console.log('✅ Mensaje enviado exitosamente');
        console.log('   Respuesta:', JSON.stringify(response.data, null, 2));
        
        // Pausa de 2 segundos entre mensajes
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error('❌ Error al enviar mensaje:');
        console.error('   Status:', error.response?.status);
        console.error('   Mensaje:', error.response?.data?.message || error.message);
        
        if (error.response?.data) {
          console.error('   Data completa:', JSON.stringify(error.response.data, null, 2));
        }
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

testWhatsAppSend();
