import { PrismaClient } from '@prisma/client';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function testGroupSend() {
  try {
    const instanceId = 'ws';
    
    console.log('=== Test de envío directo a grupos de WhatsApp ===\n');
    console.log(`Instancia: ${instanceId}\n`);

    // Cargar autenticación existente
    const authPath = path.join(__dirname, '../whatsapp-sessions', instanceId);
    console.log(`Cargando sesión desde: ${authPath}\n`);

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    // Crear socket de WhatsApp
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    // Esperar a que se conecte
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout esperando conexión'));
      }, 30000);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          clearTimeout(timeout);
          console.log('✅ Conectado a WhatsApp\n');
          resolve();
        } else if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom)
            ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
            : false;

          if (!shouldReconnect) {
            clearTimeout(timeout);
            reject(new Error('Sesión cerrada'));
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);
    });

    // Obtener grupos
    console.log('--- Obteniendo grupos disponibles ---');
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    console.log(`Total de grupos: ${groupList.length}\n`);
    groupList.forEach((group, index) => {
      console.log(`${index + 1}. ${group.subject}`);
      console.log(`   ID: ${group.id}`);
      console.log(`   Participantes: ${group.participants?.length || 0}\n`);
    });

    // Obtener destinatarios configurados
    console.log('--- Destinatarios configurados por juego ---');
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
        const result = await sock.sendMessage(recipient, { text: '.' });
        
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
      }
    }

    console.log('\n\n=== Test completado ===');

    // Cerrar socket
    sock.end();

  } catch (error) {
    console.error('\n❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGroupSend();
