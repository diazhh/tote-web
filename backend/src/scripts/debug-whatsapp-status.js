import { prisma } from '../lib/prisma.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import whatsappBaileysService from '../services/whatsapp-baileys.service.js';
import logger from '../lib/logger.js';

/**
 * Script para diagnosticar el estado de las instancias de WhatsApp
 */
async function debugWhatsAppStatus() {
  try {
    console.log('🔍 Diagnosticando estado de instancias de WhatsApp...\n');

    // 1. Obtener instancias de la BD
    const dbInstances = await prisma.whatsAppInstance.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' }
    });

    console.log(`📊 Instancias en BD: ${dbInstances.length}`);
    
    for (const dbInstance of dbInstances) {
      console.log(`\n--- Instancia: ${dbInstance.instanceId} ---`);
      console.log(`BD Status: ${dbInstance.status}`);
      console.log(`BD Phone: ${dbInstance.phoneNumber}`);
      console.log(`BD Connected At: ${dbInstance.connectedAt}`);
      console.log(`BD Last Seen: ${dbInstance.lastSeen}`);

      // 2. Verificar estado en memoria (session manager)
      const sessionInfo = sessionManager.getSessionInfo(dbInstance.instanceId);
      if (sessionInfo) {
        console.log(`Memoria Status: ${sessionInfo.status}`);
        console.log(`Memoria Phone: ${sessionInfo.phoneNumber}`);
        console.log(`Memoria Connected At: ${sessionInfo.connectedAt}`);
        console.log(`Memoria Last Seen: ${sessionInfo.lastSeen}`);
        console.log(`Memoria Has QR: ${sessionInfo.hasQR}`);
      } else {
        console.log('❌ No hay información en memoria');
      }

      // 3. Verificar si está conectado según session manager
      const isConnected = sessionManager.isConnected(dbInstance.instanceId);
      console.log(`Session Manager Connected: ${isConnected}`);

      // 4. Obtener estado desde el servicio
      try {
        const serviceStatus = await whatsappBaileysService.getInstanceStatus(dbInstance.instanceId);
        console.log(`Servicio Status: ${serviceStatus.status}`);
        console.log(`Servicio Phone: ${serviceStatus.phoneNumber}`);
      } catch (error) {
        console.log(`❌ Error del servicio: ${error.message}`);
      }

      // 5. Si hay discrepancia, intentar sincronizar
      if (dbInstance.phoneNumber && dbInstance.status !== 'CONNECTED') {
        console.log('⚠️ DISCREPANCIA DETECTADA: Tiene número pero status no es CONNECTED');
        
        // Intentar actualizar el estado en BD
        try {
          const updated = await prisma.whatsAppInstance.update({
            where: { id: dbInstance.id },
            data: {
              status: 'CONNECTED',
              lastSeen: new Date()
            }
          });
          console.log('✅ Estado actualizado en BD a CONNECTED');
        } catch (updateError) {
          console.log(`❌ Error al actualizar BD: ${updateError.message}`);
        }
      }
    }

    // 6. Verificar sesiones en memoria que no están en BD
    const allMemorySessions = sessionManager.getAllSessions();
    console.log(`\n📊 Sesiones en memoria: ${allMemorySessions.length}`);
    
    for (const memorySession of allMemorySessions) {
      const dbMatch = dbInstances.find(db => db.instanceId === memorySession.instanceId);
      if (!dbMatch) {
        console.log(`⚠️ Sesión en memoria sin BD: ${memorySession.instanceId}`);
      }
    }

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Ejecutar diagnóstico
debugWhatsAppStatus();
