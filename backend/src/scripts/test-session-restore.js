import { prisma } from '../lib/prisma.js';
import whatsappBaileysService from '../services/whatsapp-baileys.service.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import logger from '../lib/logger.js';

/**
 * Script para probar la restauración de sesiones de WhatsApp
 */
async function testSessionRestore() {
  try {
    console.log('🧪 Probando restauración de sesiones de WhatsApp...\n');

    // 1. Estado inicial
    console.log('--- Estado inicial ---');
    const initialSessions = sessionManager.getAllSessions();
    console.log(`Sesiones en memoria: ${initialSessions.length}`);

    const dbInstances = await prisma.whatsAppInstance.findMany({
      where: { isActive: true }
    });
    console.log(`Instancias en BD: ${dbInstances.length}`);

    // 2. Ejecutar restauración
    console.log('\n--- Ejecutando restauración ---');
    const result = await whatsappBaileysService.restoreSessions();
    console.log(`Resultado: ${JSON.stringify(result, null, 2)}`);

    // 3. Estado después de restauración
    console.log('\n--- Estado después de restauración ---');
    const finalSessions = sessionManager.getAllSessions();
    console.log(`Sesiones en memoria: ${finalSessions.length}`);

    for (const session of finalSessions) {
      console.log(`- ${session.instanceId}: ${session.status} (${session.phoneNumber || 'sin número'})`);
    }

    // 4. Verificar estado de instancias específicas
    console.log('\n--- Verificando instancias específicas ---');
    for (const dbInstance of dbInstances) {
      const status = await whatsappBaileysService.getInstanceStatus(dbInstance.instanceId);
      console.log(`${dbInstance.instanceId}: ${status.status} (${status.phoneNumber || 'sin número'})`);
    }

    // 5. Esperar un momento para ver si las conexiones se establecen
    console.log('\n--- Esperando 10 segundos para verificar conexiones ---');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n--- Estado final ---');
    for (const dbInstance of dbInstances) {
      const status = await whatsappBaileysService.getInstanceStatus(dbInstance.instanceId);
      console.log(`${dbInstance.instanceId}: ${status.status} (${status.phoneNumber || 'sin número'})`);
    }

  } catch (error) {
    console.error('❌ Error en prueba de restauración:', error);
  } finally {
    // Mantener el proceso vivo para observar las conexiones
    console.log('\n⏳ Manteniendo proceso activo para observar conexiones...');
    console.log('Presiona Ctrl+C para salir');
  }
}

// Ejecutar prueba
testSessionRestore();
