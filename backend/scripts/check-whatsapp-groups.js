import { PrismaClient } from '@prisma/client';
import sessionManager from '../src/lib/whatsapp/session-manager.js';
import logger from '../src/lib/logger.js';

const prisma = new PrismaClient();

async function checkWhatsAppGroups() {
  try {
    console.log('=== Verificando instancias de WhatsApp ===\n');

    // Obtener todas las instancias
    const instances = await prisma.whatsAppInstance.findMany({
      orderBy: { instanceId: 'asc' }
    });

    console.log(`Total de instancias: ${instances.length}\n`);

    for (const instance of instances) {
      console.log(`\n--- Instancia: ${instance.instanceId} ---`);
      console.log(`Nombre: ${instance.name}`);
      console.log(`Estado en BD: ${instance.status}`);
      console.log(`Teléfono: ${instance.phoneNumber || 'N/A'}`);
      console.log(`Activa: ${instance.isActive}`);

      // Verificar estado en memoria
      const isConnected = sessionManager.isConnected(instance.instanceId);
      console.log(`Conectada en memoria: ${isConnected}`);

      if (isConnected) {
        try {
          // Obtener grupos
          console.log('\nObteniendo grupos...');
          const groups = await sessionManager.getGroups(instance.instanceId);
          console.log(`Total de grupos: ${groups.length}`);

          if (groups.length > 0) {
            console.log('\nGrupos disponibles:');
            groups.forEach((group, index) => {
              console.log(`  ${index + 1}. ${group.name}`);
              console.log(`     ID: ${group.id}`);
              console.log(`     Participantes: ${group.participants}`);
            });
          }
        } catch (error) {
          console.error(`Error al obtener grupos: ${error.message}`);
        }
      }
    }

    // Obtener juegos y sus canales de WhatsApp
    console.log('\n\n=== Juegos y sus canales de WhatsApp ===\n');
    const games = await prisma.game.findMany({
      include: {
        channels: {
          where: { channelType: 'WHATSAPP' }
        }
      },
      orderBy: { name: 'asc' }
    });

    for (const game of games) {
      console.log(`\n--- ${game.name} ---`);
      
      if (game.channels.length > 0) {
        console.log('Canales de WhatsApp configurados:');
        game.channels.forEach((channel, index) => {
          console.log(`  ${index + 1}. ${channel.name}`);
          console.log(`     Activo: ${channel.isActive}`);
          console.log(`     Instancia WhatsApp: ${channel.whatsappInstanceId || 'N/A'}`);
          console.log(`     Destinatarios (${channel.recipients.length}):`, channel.recipients);
          console.log(`     Plantilla: ${channel.messageTemplate.substring(0, 50)}...`);
        });
      } else {
        console.log('Sin canales de WhatsApp configurados');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWhatsAppGroups();
