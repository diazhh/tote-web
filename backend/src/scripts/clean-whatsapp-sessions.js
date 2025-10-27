import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script para limpiar sesiones problemáticas de WhatsApp
 */
async function cleanWhatsAppSessions() {
  try {
    logger.info('Iniciando limpieza de sesiones de WhatsApp...');

    // Actualizar todas las instancias a DISCONNECTED
    const result = await prisma.whatsAppInstance.updateMany({
      where: {
        status: {
          in: ['CONNECTING', 'QR_READY']
        }
      },
      data: {
        status: 'DISCONNECTED',
        qrCode: null,
        lastSeen: new Date()
      }
    });

    logger.info(`✅ ${result.count} instancias actualizadas a DISCONNECTED`);

    // Listar directorios de sesiones
    const sessionsDir = path.join(__dirname, '../../../storage/whatsapp-sessions');
    
    if (fs.existsSync(sessionsDir)) {
      const dirs = fs.readdirSync(sessionsDir);
      logger.info(`Directorios de sesión encontrados: ${dirs.length}`);
      
      for (const dir of dirs) {
        if (dir !== '.gitkeep') {
          const dirPath = path.join(sessionsDir, dir);
          const stats = fs.statSync(dirPath);
          
          if (stats.isDirectory()) {
            logger.info(`  - ${dir}`);
          }
        }
      }
    }

    logger.info('✅ Limpieza completada');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error al limpiar sesiones:', error);
    process.exit(1);
  }
}

cleanWhatsAppSessions();
