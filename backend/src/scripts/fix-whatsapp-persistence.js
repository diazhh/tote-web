import { prisma } from '../lib/prisma.js';
import fs from 'fs';
import path from 'path';

/**
 * Script para corregir problemas de persistencia de WhatsApp
 */
async function fixWhatsAppPersistence() {
  try {
    console.log('🔧 Corrigiendo problemas de persistencia de WhatsApp...\n');

    // 1. Verificar instancias con número pero estado incorrecto
    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        isActive: true,
        phoneNumber: { not: null }
      }
    });

    console.log(`📊 Encontradas ${instances.length} instancias con número de teléfono`);

    for (const instance of instances) {
      console.log(`\n--- Instancia: ${instance.instanceId} ---`);
      console.log(`Estado actual: ${instance.status}`);
      console.log(`Número: ${instance.phoneNumber}`);
      console.log(`Conectado en: ${instance.connectedAt}`);

      // Verificar si existe archivo de sesión
      const sessionDir = path.join(process.cwd(), 'storage/whatsapp-sessions', instance.instanceId);
      const credsFile = path.join(sessionDir, 'creds.json');
      
      if (fs.existsSync(credsFile)) {
        console.log('✅ Archivo de sesión existe');
        
        // Si tiene número pero no está marcado como conectado, corregir
        if (instance.phoneNumber && instance.status !== 'CONNECTED') {
          console.log('🔄 Corrigiendo estado a CONNECTED...');
          
          await prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: {
              status: 'CONNECTED',
              lastSeen: new Date()
            }
          });
          
          console.log('✅ Estado corregido');
        }
      } else {
        console.log('❌ Archivo de sesión no existe');
        
        // Si no hay archivo de sesión, marcar como desconectado
        if (instance.status !== 'DISCONNECTED') {
          console.log('🔄 Marcando como DISCONNECTED...');
          
          await prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: {
              status: 'DISCONNECTED',
              phoneNumber: null,
              connectedAt: null
            }
          });
          
          console.log('✅ Estado corregido');
        }
      }
    }

    // 2. Verificar canales asociados
    console.log('\n--- Verificando canales asociados ---');
    
    const channels = await prisma.channelConfig.findMany({
      where: {
        type: 'WHATSAPP',
        isActive: true
      }
    });

    for (const channel of channels) {
      const instanceId = channel.config?.instanceId;
      if (instanceId) {
        const instance = instances.find(i => i.instanceId === instanceId);
        if (instance) {
          console.log(`Canal "${channel.name}" → Instancia "${instanceId}" (${instance.status})`);
          
          // Actualizar configuración del canal
          const updatedConfig = {
            ...channel.config,
            status: instance.status.toLowerCase(),
            phoneNumber: instance.phoneNumber,
            connectedAt: instance.connectedAt
          };
          
          await prisma.channelConfig.update({
            where: { id: channel.id },
            data: { config: updatedConfig }
          });
          
          console.log('✅ Canal actualizado');
        }
      }
    }

    console.log('\n🎉 Corrección completada');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

fixWhatsAppPersistence();
