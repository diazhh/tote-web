import { prisma } from '../lib/prisma.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import whatsappBaileysService from '../services/whatsapp-baileys.service.js';
import logger from '../lib/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Script de gestión completa para WhatsApp
 * Permite diagnosticar, reparar y gestionar sesiones
 */

const SESSIONS_DIR = path.join(process.cwd(), 'storage/whatsapp-sessions');

async function showMenu() {
  console.log('\n🔧 === GESTOR DE WHATSAPP ===');
  console.log('1. 📊 Diagnosticar estado');
  console.log('2. 🔄 Restaurar sesiones');
  console.log('3. 🧹 Limpiar sesiones huérfanas');
  console.log('4. 🔗 Sincronizar estados');
  console.log('5. 📋 Listar instancias');
  console.log('6. ❌ Desconectar todas las instancias');
  console.log('7. 🗑️  Eliminar instancia específica');
  console.log('0. 🚪 Salir');
  console.log('================================');
}

async function diagnosticState() {
  console.log('\n🔍 Diagnosticando estado de WhatsApp...\n');

  // 1. Instancias en BD
  const dbInstances = await prisma.whatsAppInstance.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' }
  });

  console.log(`📊 Instancias en BD: ${dbInstances.length}`);
  
  for (const instance of dbInstances) {
    console.log(`\n--- ${instance.instanceId} ---`);
    console.log(`  Estado BD: ${instance.status}`);
    console.log(`  Teléfono: ${instance.phoneNumber || 'N/A'}`);
    console.log(`  Conectado: ${instance.connectedAt || 'N/A'}`);
    console.log(`  Última actividad: ${instance.lastSeen}`);

    // Verificar archivo de sesión
    const sessionDir = path.join(SESSIONS_DIR, instance.instanceId);
    const credsFile = path.join(sessionDir, 'creds.json');
    console.log(`  Archivo sesión: ${fs.existsSync(credsFile) ? '✅' : '❌'}`);

    // Verificar en memoria
    const memorySession = sessionManager.getSessionInfo(instance.instanceId);
    if (memorySession) {
      console.log(`  Estado memoria: ${memorySession.status}`);
      console.log(`  Conectado memoria: ${sessionManager.isConnected(instance.instanceId) ? '✅' : '❌'}`);
    } else {
      console.log(`  Estado memoria: ❌ No encontrado`);
    }
  }

  // 2. Sesiones en memoria
  const memorySessions = sessionManager.getAllSessions();
  console.log(`\n📊 Sesiones en memoria: ${memorySessions.length}`);
  
  for (const session of memorySessions) {
    const dbMatch = dbInstances.find(db => db.instanceId === session.instanceId);
    if (!dbMatch) {
      console.log(`⚠️ Sesión huérfana en memoria: ${session.instanceId}`);
    }
  }

  // 3. Archivos de sesión
  if (fs.existsSync(SESSIONS_DIR)) {
    const sessionDirs = fs.readdirSync(SESSIONS_DIR).filter(item => {
      const itemPath = path.join(SESSIONS_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    });

    console.log(`\n📊 Directorios de sesión: ${sessionDirs.length}`);
    
    for (const dir of sessionDirs) {
      const dbMatch = dbInstances.find(db => db.instanceId === dir);
      const memoryMatch = memorySessions.find(m => m.instanceId === dir);
      
      if (!dbMatch && !memoryMatch) {
        console.log(`⚠️ Directorio huérfano: ${dir}`);
      }
    }
  }
}

async function restoreSessions() {
  console.log('\n🔄 Restaurando sesiones...\n');
  
  try {
    const result = await whatsappBaileysService.restoreSessions();
    console.log('\n✅ Restauración completada:');
    console.log(`   Inicializadas: ${result.restored}`);
    console.log(`   Conectadas: ${result.connected}`);
    console.log(`   Fallidas: ${result.failed}`);
  } catch (error) {
    console.error('❌ Error en restauración:', error.message);
  }
}

async function cleanOrphanSessions() {
  console.log('\n🧹 Limpiando sesiones huérfanas...\n');

  let cleaned = 0;

  // 1. Limpiar sesiones en memoria sin BD
  const memorySessions = sessionManager.getAllSessions();
  const dbInstances = await prisma.whatsAppInstance.findMany({
    where: { isActive: true }
  });

  for (const memorySession of memorySessions) {
    const dbMatch = dbInstances.find(db => db.instanceId === memorySession.instanceId);
    if (!dbMatch) {
      console.log(`🗑️ Cerrando sesión huérfana en memoria: ${memorySession.instanceId}`);
      await sessionManager.closeSession(memorySession.instanceId);
      cleaned++;
    }
  }

  // 2. Limpiar directorios de sesión sin BD
  if (fs.existsSync(SESSIONS_DIR)) {
    const sessionDirs = fs.readdirSync(SESSIONS_DIR).filter(item => {
      const itemPath = path.join(SESSIONS_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    });

    for (const dir of sessionDirs) {
      const dbMatch = dbInstances.find(db => db.instanceId === dir);
      if (!dbMatch) {
        const dirPath = path.join(SESSIONS_DIR, dir);
        console.log(`🗑️ Eliminando directorio huérfano: ${dir}`);
        fs.rmSync(dirPath, { recursive: true, force: true });
        cleaned++;
      }
    }
  }

  console.log(`\n✅ Limpieza completada. ${cleaned} elementos eliminados.`);
}

async function syncStates() {
  console.log('\n🔗 Sincronizando estados...\n');
  
  try {
    await whatsappBaileysService.syncSessionStates();
    console.log('✅ Sincronización completada');
  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
  }
}

async function listInstances() {
  console.log('\n📋 Listando todas las instancias...\n');

  const instances = await prisma.whatsAppInstance.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' }
  });

  if (instances.length === 0) {
    console.log('No hay instancias activas');
    return;
  }

  console.log('ID\t\tEstado\t\tTeléfono\t\tÚltima actividad');
  console.log('─'.repeat(80));
  
  for (const instance of instances) {
    const phone = instance.phoneNumber || 'N/A';
    const lastSeen = instance.lastSeen.toLocaleString();
    console.log(`${instance.instanceId}\t${instance.status}\t\t${phone}\t${lastSeen}`);
  }
}

async function disconnectAll() {
  console.log('\n❌ Desconectando todas las instancias...\n');

  const memorySessions = sessionManager.getAllSessions();
  let disconnected = 0;

  for (const session of memorySessions) {
    try {
      console.log(`🔌 Desconectando ${session.instanceId}...`);
      await sessionManager.closeSession(session.instanceId);
      
      // Actualizar en BD
      await prisma.whatsAppInstance.updateMany({
        where: { instanceId: session.instanceId, isActive: true },
        data: { 
          status: 'DISCONNECTED',
          lastSeen: new Date()
        }
      });
      
      disconnected++;
    } catch (error) {
      console.error(`❌ Error al desconectar ${session.instanceId}:`, error.message);
    }
  }

  console.log(`\n✅ ${disconnected} instancias desconectadas`);
}

async function deleteInstance() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n🗑️ Ingresa el ID de la instancia a eliminar: ', async (instanceId) => {
      rl.close();
      
      if (!instanceId.trim()) {
        console.log('❌ ID de instancia requerido');
        resolve();
        return;
      }

      try {
        // Cerrar sesión en memoria
        await sessionManager.closeSession(instanceId);
        
        // Eliminar de BD
        await prisma.whatsAppInstance.updateMany({
          where: { instanceId, isActive: true },
          data: { isActive: false }
        });
        
        // Eliminar archivos de sesión
        const sessionDir = path.join(SESSIONS_DIR, instanceId);
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        
        console.log(`✅ Instancia ${instanceId} eliminada completamente`);
      } catch (error) {
        console.error(`❌ Error al eliminar instancia:`, error.message);
      }
      
      resolve();
    });
  });
}

async function main() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  while (true) {
    await showMenu();
    
    const choice = await new Promise((resolve) => {
      rl.question('\nSelecciona una opción: ', resolve);
    });

    switch (choice.trim()) {
      case '1':
        await diagnosticState();
        break;
      case '2':
        await restoreSessions();
        break;
      case '3':
        await cleanOrphanSessions();
        break;
      case '4':
        await syncStates();
        break;
      case '5':
        await listInstances();
        break;
      case '6':
        await disconnectAll();
        break;
      case '7':
        await deleteInstance();
        break;
      case '0':
        console.log('\n👋 ¡Hasta luego!');
        rl.close();
        await prisma.$disconnect();
        process.exit(0);
        break;
      default:
        console.log('❌ Opción inválida');
    }

    // Pausa antes de mostrar el menú nuevamente
    await new Promise((resolve) => {
      rl.question('\nPresiona Enter para continuar...', resolve);
    });
  }
}

// Manejar cierre del script
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Cerrando gestor...');
  await prisma.$disconnect();
  process.exit(0);
});

// Ejecutar
main().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
