import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseGroups() {
  try {
    console.log('=== Diagnóstico de Grupos de WhatsApp ===\n');

    // Obtener la instancia
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { instanceId: 'ws' }
    });

    console.log('Instancia WhatsApp:');
    console.log(`  ID: ${instance.instanceId}`);
    console.log(`  Teléfono: ${instance.phoneNumber}`);
    console.log(`  Estado: ${instance.status}`);
    console.log(`  Activa: ${instance.isActive}\n`);

    // Obtener canales configurados
    const channels = await prisma.gameChannel.findMany({
      where: {
        channelType: 'WHATSAPP',
        whatsappInstanceId: 'ws',
        isActive: true
      },
      include: {
        game: true
      }
    });

    console.log('=== Canales Configurados ===\n');
    
    for (const channel of channels) {
      console.log(`${channel.game.name} - ${channel.name}:`);
      console.log(`  Destinatarios (${channel.recipients.length}):`);
      
      channel.recipients.forEach(recipient => {
        const isGroup = recipient.includes('@g.us');
        const isPhone = recipient.includes('@s.whatsapp.net') || (!recipient.includes('@'));
        
        console.log(`    - ${recipient}`);
        console.log(`      Tipo: ${isGroup ? 'GRUPO' : isPhone ? 'TELÉFONO' : 'DESCONOCIDO'}`);
        
        if (isGroup) {
          console.log(`      ⚠️  GRUPO - Verificar que ${instance.phoneNumber} sea miembro`);
        }
      });
      console.log();
    }

    console.log('\n=== Recomendaciones ===\n');
    console.log('1. Verifica que el número 584228114042 sea miembro de los grupos:');
    console.log('   - 120363049206495531@g.us');
    console.log('   - 120363058911718517@g.us');
    console.log();
    console.log('2. Para verificar, abre WhatsApp Web con ese número y revisa:');
    console.log('   - Si ves los grupos en la lista de chats');
    console.log('   - Si puedes enviar mensajes manualmente a esos grupos');
    console.log();
    console.log('3. Si el bot NO es miembro:');
    console.log('   - Agrega el número al grupo manualmente');
    console.log('   - O actualiza los destinatarios en la configuración del canal');
    console.log();
    console.log('4. Para obtener el ID correcto de un grupo:');
    console.log('   - Usa el endpoint: GET /api/whatsapp/instances/ws/groups');
    console.log('   - Copia el ID exacto del grupo deseado');
    console.log();

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseGroups();
