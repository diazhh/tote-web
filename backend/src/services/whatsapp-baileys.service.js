import { prisma } from '../lib/prisma.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import logger, { whatsappLogger } from '../lib/logger.js';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Servicio para gestionar instancias de WhatsApp usando Baileys
 */
class WhatsAppBaileysService {
  constructor() {
    this.activeQRs = new Map(); // instanceId -> { qr, timestamp }
  }

  /**
   * Inicializar instancia de WhatsApp
   * Crea una nueva sesión y genera QR para escanear
   * @param {string} instanceId - ID único para la instancia
   * @param {string} name - Nombre descriptivo (opcional)
   * @param {string} channelConfigId - ID del canal asociado (opcional)
   * @param {Object} channelData - Datos para crear canal si no existe (opcional)
   */
  async initializeInstance(instanceId, name = null, channelConfigId = null, channelData = null) {
    try {
      logger.info(`Inicializando instancia de WhatsApp: ${instanceId}`);

      // Si se proporcionan datos del canal pero no un ID de canal, crear el canal primero
      if (!channelConfigId && channelData) {
        try {
          logger.info(`Creando canal para instancia ${instanceId}`);
          
          const channel = await prisma.channelConfig.create({
            data: {
              type: 'WHATSAPP',
              name: channelData.name || `WhatsApp ${instanceId}`,
              config: {
                type: 'baileys',
                instanceId: instanceId,
                recipients: channelData.recipients || [],
                status: 'connecting'
              },
              isActive: true
            }
          });
          
          channelConfigId = channel.id;
          logger.info(`Canal creado con ID: ${channelConfigId}`);
        } catch (channelError) {
          logger.error(`Error al crear canal para ${instanceId}:`, channelError);
          // Continuar con la creación de la instancia aunque falle la creación del canal
        }
      }

      // Buscar o crear instancia en BD
      let dbInstance = await prisma.whatsAppInstance.findUnique({
        where: { instanceId }
      });

      if (!dbInstance) {
        dbInstance = await prisma.whatsAppInstance.create({
          data: {
            instanceId,
            name: name || instanceId,
            status: 'CONNECTING',
            isActive: true
          }
        });
      } else {
        // Actualizar estado a CONNECTING y marcar como activa
        dbInstance = await prisma.whatsAppInstance.update({
          where: { instanceId },
          data: { 
            status: 'CONNECTING',
            isActive: true
          }
        });
      }

      // Callbacks para manejar eventos de WhatsApp
      const callbacks = {
        onQR: async (qr) => {
          try {
            whatsappLogger.info(`[${instanceId}] QR generado, guardando en BD...`);
            
            await this.updateInstanceStateInDB(instanceId, {
              status: 'QR_READY',
              qrCode: qr,
              qrGeneratedAt: new Date(),
              isActive: true
            });
            
            whatsappLogger.info(`[${instanceId}] ✅ QR guardado en BD`);
          } catch (error) {
            whatsappLogger.error(`[${instanceId}] Error al guardar QR en BD:`, error);
          }
        },
        
        onConnectionUpdate: async (update) => {
          try {
            whatsappLogger.info(`[${instanceId}] Actualización de conexión:`, update);
            
            if (update.status === 'connected' && update.sessionInfo) {
              const { phoneNumber, connectedAt } = update.sessionInfo;
              
              whatsappLogger.info(`[${instanceId}] ✅ Conectado con número: ${phoneNumber}`);
              
              // Actualizar en BD
              await this.updateInstanceStateInDB(instanceId, {
                status: 'CONNECTED',
                phoneNumber,
                connectedAt,
                qrCode: null, // Limpiar QR al conectar
                qrGeneratedAt: null,
                isActive: true
              });
              
              // Actualizar configuración del canal si existe
              if (channelConfigId) {
                try {
                  const channelConfig = await prisma.channelConfig.findUnique({
                    where: { id: channelConfigId }
                  });
                  
                  if (channelConfig) {
                    const updatedConfig = {
                      ...channelConfig.config,
                      status: 'connected',
                      phoneNumber,
                      connectedAt,
                      instanceId
                    };
                    
                    await prisma.channelConfig.update({
                      where: { id: channelConfigId },
                      data: { config: updatedConfig }
                    });
                    
                    whatsappLogger.info(`[${instanceId}] ✅ Canal actualizado en BD`);
                  }
                } catch (channelError) {
                  whatsappLogger.error(`[${instanceId}] Error al actualizar canal:`, channelError);
                }
              }
              
              whatsappLogger.info(`[${instanceId}] ✅ Estado CONNECTED guardado en BD`);
              
            } else if (update.status === 'disconnected' || update.status === 'logged_out') {
              // Manejar desconexión
              await this.updateInstanceStateInDB(instanceId, {
                status: update.status === 'logged_out' ? 'LOGGED_OUT' : 'DISCONNECTED',
                ...(update.status === 'logged_out' && {
                  phoneNumber: null,
                  connectedAt: null,
                  qrCode: null,
                  qrGeneratedAt: null
                })
              });
              
              whatsappLogger.info(`[${instanceId}] Estado ${update.status} guardado en BD`);
            }
          } catch (error) {
            whatsappLogger.error(`[${instanceId}] Error al actualizar conexión en BD:`, error);
          }
        }
      };

      // Crear sesión con callbacks
      const session = await sessionManager.createSession(instanceId, callbacks);
      
      return {
        success: true,
        instanceId,
        status: session.status,
        message: 'Instancia inicializada. Escanea el código QR para conectar.'
      };
    } catch (error) {
      logger.error(`Error al inicializar instancia ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener código QR como imagen base64
   */
  async getQRCode(instanceId) {
    try {
      // Primero verificar si la sesión ya está conectada
      const sessionInfo = sessionManager.getSessionInfo(instanceId);
      if (sessionInfo && sessionInfo.status === 'connected') {
        return {
          status: 'connected',
          message: 'La instancia ya está conectada',
          phoneNumber: sessionInfo.phoneNumber
        };
      }

      // Buscar QR en la base de datos
      const dbInstance = await prisma.whatsAppInstance.findUnique({
        where: { instanceId }
      });

      if (!dbInstance) {
        throw new Error('Instancia no encontrada. Crea la instancia primero.');
      }

      // Si hay QR en BD y es reciente (menos de 5 minutos)
      if (dbInstance.qrCode && dbInstance.qrGeneratedAt) {
        const qrAge = Date.now() - new Date(dbInstance.qrGeneratedAt).getTime();
        const maxAge = 5 * 60 * 1000; // 5 minutos

        if (qrAge < maxAge) {
          // Generar imagen QR en base64
          const qrImage = await QRCode.toDataURL(dbInstance.qrCode);

          return {
            status: 'qr_ready',
            qr: dbInstance.qrCode,
            qrImage,
            timestamp: dbInstance.qrGeneratedAt
          };
        }
      }

      // Si no hay QR válido, verificar si hay sesión en memoria
      if (sessionInfo) {
        if (sessionInfo.status === 'qr_ready' && sessionInfo.hasQR) {
          // Intentar obtener QR desde session manager
          const session = sessionManager.getSession(instanceId);
          if (session && session.qr) {
            const qrImage = await QRCode.toDataURL(session.qr);
            return {
              status: 'qr_ready',
              qr: session.qr,
              qrImage,
              timestamp: new Date()
            };
          }
        }

        if (sessionInfo.status === 'connecting') {
          return {
            status: 'connecting',
            message: 'Instancia conectándose. El QR se generará pronto.'
          };
        }
      }

      // Si llegamos aquí, necesitamos inicializar la instancia
      throw new Error('No hay código QR disponible. La instancia necesita ser inicializada o reinicializada.');
      
    } catch (error) {
      logger.error(`Error al obtener QR para ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener estado de una instancia
   */
  async getInstanceStatus(instanceId) {
    try {
      // Primero intentar obtener de la sesión en memoria
      const sessionInfo = sessionManager.getSessionInfo(instanceId);
      
      if (sessionInfo) {
        whatsappLogger.debug(`[getInstanceStatus] Estado de memoria para ${instanceId}:`, {
          status: sessionInfo.status,
          phoneNumber: sessionInfo.phoneNumber,
          hasQR: sessionInfo.hasQR
        });
        
        return {
          instanceId: sessionInfo.instanceId,
          status: sessionInfo.status,
          phoneNumber: sessionInfo.phoneNumber,
          connectedAt: sessionInfo.connectedAt,
          lastSeen: sessionInfo.lastSeen,
          hasQR: sessionInfo.hasQR
        };
      }

      // Si no hay sesión en memoria, consultar BD
      const dbInstance = await prisma.whatsAppInstance.findUnique({
        where: { instanceId }
      });

      if (!dbInstance) {
        return {
          instanceId,
          status: 'disconnected',
          message: 'Instancia no encontrada'
        };
      }

      whatsappLogger.debug(`[getInstanceStatus] Estado de BD para ${instanceId}:`, {
        status: dbInstance.status,
        phoneNumber: dbInstance.phoneNumber
      });

      return {
        instanceId: dbInstance.instanceId,
        status: dbInstance.status.toLowerCase(),
        phoneNumber: dbInstance.phoneNumber,
        connectedAt: dbInstance.connectedAt,
        lastSeen: dbInstance.lastSeen,
        hasQR: !!dbInstance.qrCode
      };
    } catch (error) {
      logger.error(`Error al obtener estado de ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Listar todas las instancias activas
   * FLUJO SIMPLIFICADO: Solo devolver datos de la BD, sin mezclar memoria
   */
  async listInstances() {
    try {
      logger.info('📊 Listando instancias desde BD...');
      
      // Obtener instancias de la BD - FUENTE ÚNICA DE VERDAD
      const dbInstances = await prisma.whatsAppInstance.findMany({
        orderBy: { updatedAt: 'desc' }
      });

      logger.info(`📊 Encontradas ${dbInstances.length} instancias activas en BD`);

      // Obtener configuraciones de canales asociadas
      const channelConfigs = await prisma.channelConfig.findMany({
        where: {
          type: 'WHATSAPP',
          isActive: true
        }
      });

      // Mapear SOLO datos de BD - sin mezclar memoria
      const instances = dbInstances.map(dbInstance => {
        const config = channelConfigs.find(c => 
          c.config?.instanceId === dbInstance.instanceId
        );

        const result = {
          instanceId: dbInstance.instanceId,
          name: dbInstance.name,
          status: dbInstance.status.toLowerCase(), // SOLO de BD
          phoneNumber: dbInstance.phoneNumber,     // SOLO de BD
          connectedAt: dbInstance.connectedAt,     // SOLO de BD
          lastSeen: dbInstance.lastSeen,           // SOLO de BD
          channelConfigId: config?.id || null,
          channelName: config?.name || 'Sin asociar',
          hasQR: !!dbInstance.qrCode,              // SOLO de BD
          qrGeneratedAt: dbInstance.qrGeneratedAt
        };

        logger.debug(`📋 Instancia ${dbInstance.instanceId}:`, {
          status: result.status,
          phoneNumber: result.phoneNumber,
          hasQR: result.hasQR,
          channelName: result.channelName
        });

        return result;
      });

      logger.info(`✅ Devolviendo ${instances.length} instancias al frontend`);
      return instances;
    } catch (error) {
      logger.error('❌ Error al listar instancias:', error);
      throw error;
    }
  }

  /**
   * Desconectar y cerrar una instancia
   */
  async disconnectInstance(instanceId) {
    try {
      await sessionManager.closeSession(instanceId);
      this.activeQRs.delete(instanceId);

      // Actualizar estado en BD
      await prisma.whatsAppInstance.update({
        where: { instanceId },
        data: {
          status: 'DISCONNECTED',
          lastSeen: new Date()
        }
      });

      logger.info(`Instancia desconectada: ${instanceId}`);
      
      return {
        success: true,
        message: 'Instancia desconectada exitosamente'
      };
    } catch (error) {
      logger.error(`Error al desconectar instancia ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar instancia y sus datos
   */
  async deleteInstance(instanceId) {
    try {
      // Cerrar sesión
      await sessionManager.closeSession(instanceId);
      
      // Eliminar datos de sesión del disco
      await sessionManager.deleteSessionData(instanceId);
      
      // Eliminar QR activo
      this.activeQRs.delete(instanceId);

      // Marcar como inactiva en BD (soft delete)
      await prisma.whatsAppInstance.update({
        where: { instanceId },
        data: {
          isActive: false,
          status: 'DISCONNECTED',
          lastSeen: new Date()
        }
      });

      logger.info(`Instancia eliminada: ${instanceId}`);
      
      return {
        success: true,
        message: 'Instancia y datos eliminados exitosamente'
      };
    } catch (error) {
      logger.error(`Error al eliminar instancia ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Activar/Desactivar instancia (pausar envíos)
   */
  async toggleActive(instanceId, isActive) {
    try {
      const instance = await prisma.whatsAppInstance.update({
        where: { instanceId },
        data: { isActive }
      });

      logger.info(`Instancia de WhatsApp ${isActive ? 'activada' : 'pausada'}: ${instanceId}`);

      return {
        success: true,
        message: `Instancia ${isActive ? 'activada' : 'pausada'} exitosamente`,
        instance: {
          instanceId: instance.instanceId,
          name: instance.name,
          isActive: instance.isActive
        }
      };

    } catch (error) {
      logger.error('Error al cambiar estado de instancia:', error);
      throw error;
    }
  }

  /**
   * Enviar mensaje de prueba
   */
  async sendTestMessage(instanceId, phoneNumber, message = 'Mensaje de prueba desde Tote System') {
    try {
      if (!sessionManager.isConnected(instanceId)) {
        throw new Error('La instancia no está conectada');
      }

      const result = await sessionManager.sendTextMessage(instanceId, phoneNumber, message);
      
      return {
        success: true,
        message: 'Mensaje enviado exitosamente',
        messageId: result.key.id
      };
    } catch (error) {
      logger.error(`Error al enviar mensaje de prueba desde ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Publicar resultado de sorteo
   */
  async publishDraw(instanceId, draw, recipients = []) {
    try {
      if (!sessionManager.isConnected(instanceId)) {
        throw new Error('La instancia no está conectada');
      }

      const results = [];

      // Preparar mensaje
      const caption = this.formatDrawMessage(draw);

      // Enviar a cada destinatario
      for (const recipient of recipients) {
        try {
          let result;

          if (draw.imageUrl) {
            // Enviar imagen con caption
            result = await sessionManager.sendImageFromUrl(
              instanceId,
              recipient,
              draw.imageUrl,
              caption
            );
          } else {
            // Enviar solo texto
            result = await sessionManager.sendTextMessage(
              instanceId,
              recipient,
              caption
            );
          }

          results.push({
            recipient,
            success: true,
            messageId: result.key.id
          });

          // Pequeña pausa entre mensajes para evitar spam
          await this.sleep(1000);
        } catch (error) {
          logger.error(`Error al enviar a ${recipient}:`, error);
          results.push({
            recipient,
            success: false,
            error: error.message
          });
        }
      }

      return {
        success: true,
        results,
        totalSent: results.filter(r => r.success).length,
        totalFailed: results.filter(r => !r.success).length
      };
    } catch (error) {
      logger.error(`Error al publicar sorteo desde ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Formatear mensaje de sorteo
   */
  formatDrawMessage(draw) {
    const gameName = draw.game?.name || 'Sorteo';
    const winnerNumber = draw.winnerItem?.number || 'N/A';
    const winnerName = draw.winnerItem?.name || 'N/A';
    
    // drawTime ya está en formato "HH:MM:SS" hora Venezuela
    const [hours, mins] = (draw.drawTime || '00:00:00').split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    const time = `${displayHour}:${mins} ${ampm}`;

    return `🎰 *${gameName}*\n\n` +
           `⏰ Hora: ${time}\n` +
           `🎯 Resultado: *${winnerNumber}*\n` +
           `🏆 ${winnerName}\n\n` +
           `✨ ¡Buena suerte en el próximo sorteo!`;
  }

  /**
   * Actualizar canal con información de conexión
   */
  async updateChannelWithConnection(channelConfigId, sessionInfo) {
    try {
      const channel = await prisma.channelConfig.findUnique({
        where: { id: channelConfigId }
      });

      if (!channel) {
        logger.warn(`Canal ${channelConfigId} no encontrado`);
        return;
      }

      // Actualizar configuración con datos de conexión
      const updatedConfig = {
        ...channel.config,
        instanceId: sessionInfo.instanceId,
        phoneNumber: sessionInfo.phoneNumber,
        connectedAt: sessionInfo.connectedAt,
        status: 'connected'
      };

      await prisma.channelConfig.update({
        where: { id: channelConfigId },
        data: { config: updatedConfig }
      });

      logger.info(`Canal ${channelConfigId} actualizado con conexión de ${sessionInfo.phoneNumber}`);
    } catch (error) {
      logger.error('Error al actualizar canal con conexión:', error);
    }
  }

  /**
   * Reconectar instancia existente
   */
  async reconnectInstance(instanceId) {
    try {
      // Verificar si ya está conectada
      if (sessionManager.isConnected(instanceId)) {
        return {
          success: true,
          status: 'already_connected',
          message: 'La instancia ya está conectada'
        };
      }

      // Obtener nombre de la instancia de BD
      const dbInstance = await prisma.whatsAppInstance.findUnique({
        where: { instanceId }
      });

      // Intentar reconectar
      await this.initializeInstance(instanceId, dbInstance?.name);

      return {
        success: true,
        status: 'reconnecting',
        message: 'Reconectando instancia...'
      };
    } catch (error) {
      logger.error(`Error al reconectar instancia ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Verificar si un número existe en WhatsApp
   */
  async checkNumber(instanceId, phoneNumber) {
    try {
      if (!sessionManager.isConnected(instanceId)) {
        throw new Error('La instancia no está conectada');
      }

      const exists = await sessionManager.checkNumberExists(instanceId, phoneNumber);

      return {
        phoneNumber,
        exists,
        message: exists ? 'Número válido en WhatsApp' : 'Número no encontrado en WhatsApp'
      };
    } catch (error) {
      logger.error(`Error al verificar número ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Limpiar sesiones inactivas
   */
  async cleanupSessions() {
    try {
      const cleaned = await sessionManager.cleanupInactiveSessions(30);
      
      logger.info(`Sesiones inactivas limpiadas: ${cleaned}`);
      
      return {
        success: true,
        cleaned
      };
    } catch (error) {
      logger.error('Error al limpiar sesiones:', error);
      throw error;
    }
  }

  /**
   * Restaurar sesiones desde la base de datos al iniciar
   */
  async restoreSessions() {
    try {
      logger.info('🔄 Restaurando sesiones de WhatsApp desde BD...');

      // Obtener todas las instancias activas
      const instances = await prisma.whatsAppInstance.findMany({
        where: {
          isActive: true
        },
        orderBy: { updatedAt: 'desc' }
      });

      logger.info(`📊 Encontradas ${instances.length} instancias activas en BD`);

      let restored = 0;
      let failed = 0;
      let connected = 0;
      const SESSIONS_DIR = path.join(process.cwd(), 'storage/whatsapp-sessions');

      for (const instance of instances) {
        try {
          logger.info(`\n🔍 Procesando instancia: ${instance.instanceId}`);
          logger.info(`   Estado BD: ${instance.status}`);
          logger.info(`   Teléfono: ${instance.phoneNumber || 'N/A'}`);
          
          // Verificar si existe sesión guardada en disco
          const sessionDir = path.join(SESSIONS_DIR, instance.instanceId);
          const credsFile = path.join(sessionDir, 'creds.json');

          if (fs.existsSync(credsFile)) {
            logger.info(`   ✅ Archivo de sesión encontrado`);
            
            // Buscar canal asociado
            const channelConfig = await prisma.channelConfig.findFirst({
              where: {
                type: 'WHATSAPP',
                isActive: true,
                config: {
                  path: ['instanceId'],
                  equals: instance.instanceId
                }
              }
            });

            logger.info(`   Canal asociado: ${channelConfig ? channelConfig.name : 'No encontrado'}`);
            
            // Inicializar sesión con callback mejorado
            logger.info(`   🚀 Inicializando sesión...`);
            await this.initializeInstance(
              instance.instanceId, 
              instance.name,
              channelConfig?.id
            );
            
            restored++;
            
            // Esperar un poco para que la conexión se establezca
            await this.sleep(2000);
            
            // Verificar si se conectó automáticamente
            const sessionInfo = sessionManager.getSessionInfo(instance.instanceId);
            if (sessionInfo && sessionInfo.status === 'connected') {
              connected++;
              logger.info(`   ✅ Sesión restaurada y conectada automáticamente`);
            } else {
              logger.info(`   ⏳ Sesión inicializada, esperando conexión manual`);
            }
            
          } else {
            logger.info(`   ❌ No se encontró archivo de sesión`);
            
            // No hay datos de sesión, marcar como desconectada
            if (instance.status !== 'DISCONNECTED') {
              await prisma.whatsAppInstance.update({
                where: { id: instance.id },
                data: { 
                  status: 'DISCONNECTED',
                  phoneNumber: null,
                  connectedAt: null,
                  qrCode: null,
                  qrGeneratedAt: null
                }
              });
              logger.info(`   🔄 Estado actualizado a DISCONNECTED en BD`);
            }
          }
        } catch (error) {
          logger.error(`❌ Error al restaurar ${instance.instanceId}:`, error);
          failed++;
          
          // Marcar como desconectada en caso de error
          try {
            await prisma.whatsAppInstance.update({
              where: { id: instance.id },
              data: { 
                status: 'DISCONNECTED',
                phoneNumber: null,
                connectedAt: null,
                qrCode: null,
                qrGeneratedAt: null
              }
            });
          } catch (updateError) {
            logger.error(`Error al actualizar estado de ${instance.instanceId}:`, updateError);
          }
        }
      }

      logger.info(`\n📊 Resumen de restauración:`);
      logger.info(`   ✅ Sesiones inicializadas: ${restored}`);
      logger.info(`   🔗 Conectadas automáticamente: ${connected}`);
      logger.info(`   ❌ Fallidas: ${failed}`);
      
      // Programar sincronización periódica
      this.startPeriodicSync();
      
      return {
        success: true,
        restored,
        connected,
        failed
      };
    } catch (error) {
      logger.error('❌ Error al restaurar sesiones:', error);
      throw error;
    }
  }

  /**
   * Iniciar sincronización periódica entre memoria y BD
   */
  startPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Sincronizar cada 30 segundos
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncSessionStates();
      } catch (error) {
        logger.error('Error en sincronización periódica:', error);
      }
    }, 30000);

    logger.info('🔄 Sincronización periódica iniciada (cada 30 segundos)');
  }

  /**
   * Sincronizar estados entre memoria y base de datos
   */
  async syncSessionStates() {
    try {
      const memorySessions = sessionManager.getAllSessions();
      
      for (const memorySession of memorySessions) {
        const dbInstance = await prisma.whatsAppInstance.findUnique({
          where: { instanceId: memorySession.instanceId }
        });

        if (dbInstance) {
          // Verificar si hay diferencias
          const needsUpdate = 
            dbInstance.status !== memorySession.status.toUpperCase() ||
            dbInstance.phoneNumber !== memorySession.phoneNumber ||
            Math.abs(new Date(dbInstance.lastSeen) - memorySession.lastSeen) > 60000; // 1 minuto de diferencia

          if (needsUpdate) {
            await prisma.whatsAppInstance.update({
              where: { instanceId: memorySession.instanceId },
              data: {
                status: memorySession.status.toUpperCase(),
                phoneNumber: memorySession.phoneNumber,
                connectedAt: memorySession.connectedAt,
                lastSeen: memorySession.lastSeen,
                // Limpiar QR si está conectado
                ...(memorySession.status === 'connected' && {
                  qrCode: null,
                  qrGeneratedAt: null
                })
              }
            });

            logger.debug(`🔄 Estado sincronizado para ${memorySession.instanceId}: ${memorySession.status}`);
          }
        }
      }

      // Verificar instancias en BD que no están en memoria
      const dbInstances = await prisma.whatsAppInstance.findMany({
        where: { 
          isActive: true,
          status: { in: ['CONNECTING', 'QR_READY', 'CONNECTED'] }
        }
      });

      for (const dbInstance of dbInstances) {
        const memorySession = memorySessions.find(m => m.instanceId === dbInstance.instanceId);
        
        if (!memorySession) {
          // Instancia en BD pero no en memoria, marcar como desconectada
          await prisma.whatsAppInstance.update({
            where: { instanceId: dbInstance.instanceId },
            data: {
              status: 'DISCONNECTED',
              lastSeen: new Date()
            }
          });

          logger.warn(`⚠️ Instancia ${dbInstance.instanceId} marcada como desconectada (no en memoria)`);
        }
      }

    } catch (error) {
      logger.error('Error en sincronización de estados:', error);
    }
  }

  /**
   * Detener sincronización periódica
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('🛑 Sincronización periódica detenida');
    }
  }

  /**
   * Actualizar estado en BD inmediatamente
   */
  async updateInstanceStateInDB(instanceId, updates) {
    try {
      await prisma.whatsAppInstance.updateMany({
        where: { instanceId, isActive: true },
        data: {
          ...updates,
          lastSeen: new Date()
        }
      });

      logger.debug(`📝 Estado actualizado en BD para ${instanceId}:`, updates);
    } catch (error) {
      logger.error(`Error al actualizar estado en BD para ${instanceId}:`, error);
    }
  }

  /**
   * Obtener grupos de una instancia de WhatsApp
   */
  async getGroups(instanceId) {
    try {
      if (!sessionManager.isConnected(instanceId)) {
        throw new Error('La instancia no está conectada');
      }

      const groups = await sessionManager.getGroups(instanceId);

      return {
        success: true,
        instanceId,
        groups
      };
    } catch (error) {
      logger.error(`Error al obtener grupos de ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Utilidad: sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new WhatsAppBaileysService();
