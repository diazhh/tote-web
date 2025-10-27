import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger, { whatsappLogger } from '../logger.js';
import { prisma } from '../prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio base para almacenar sesiones
const SESSIONS_DIR = path.join(__dirname, '../../../storage/whatsapp-sessions');

// Asegurar que el directorio existe
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Gestor de sesiones de WhatsApp usando Baileys
 * Permite manejar múltiples instancias de WhatsApp simultáneamente
 */
class WhatsAppSessionManager {
  constructor() {
    this.sessions = new Map(); // instanceId -> { socket, state, info }
    this.qrCallbacks = new Map(); // instanceId -> callback
    this.connectionCallbacks = new Map(); // instanceId -> callback
  }

  /**
   * Crear o reconectar una instancia de WhatsApp
   */
  async createSession(instanceId, callbacks = {}) {
    try {
      // Si ya existe una sesión activa, cerrarla primero (sin logout)
      if (this.sessions.has(instanceId)) {
        const session = this.sessions.get(instanceId);
        if (session && session.socket) {
          try {
            session.socket.end();
          } catch (error) {
            logger.warn(`Error al cerrar socket existente: ${error.message}`);
          }
        }
        this.sessions.delete(instanceId);
        this.qrCallbacks.delete(instanceId);
        this.connectionCallbacks.delete(instanceId);
      }

      const sessionDir = path.join(SESSIONS_DIR, instanceId);
      
      // Crear directorio de sesión si no existe
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      // Configurar autenticación multi-archivo
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      
      // Obtener la última versión de Baileys
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info(`Usando WhatsApp v${version.join('.')}, isLatest: ${isLatest}`);

      // Configurar logger de Baileys (silencioso en producción)
      const baileysLogger = pino({ 
        level: process.env.NODE_ENV === 'production' ? 'silent' : 'error' 
      });

      // Crear socket de WhatsApp con configuración optimizada
      const socket = makeWASocket({
        version,
        logger: baileysLogger,
        printQRInTerminal: false, // Manejamos el QR manualmente
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
        },
        // Usar una configuración de navegador más estándar
        browser: ['Chrome', 'Desktop', '120.0.0'],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        // Mejorar el manejo de mensajes
        getMessage: async (key) => {
          // Implementación básica para manejar mensajes
          return { conversation: '' };
        },
        // Agregar opciones para mejorar la estabilidad
        connectTimeoutMs: 60000,
        qrTimeout: 40000,
        defaultQueryTimeoutMs: 60000,
        emitOwnEvents: true,
        // Desactivar la compresión para evitar problemas
        shouldSyncHistoryMessage: false,
        // Mejorar la reconexión
        retryRequestDelayMs: 250
      });

      // Información de la sesión
      const sessionInfo = {
        instanceId,
        socket,
        state,
        status: 'connecting',
        qr: null,
        connectedAt: null,
        phoneNumber: null,
        lastSeen: new Date()
      };

      // Guardar callbacks
      if (callbacks.onQR) {
        this.qrCallbacks.set(instanceId, callbacks.onQR);
      }
      if (callbacks.onConnectionUpdate) {
        this.connectionCallbacks.set(instanceId, callbacks.onConnectionUpdate);
      }

      // Manejar actualizaciones de conexión con más detalle
      socket.ev.on('connection.update', async (update) => {
        whatsappLogger.info(`[${instanceId}] Evento connection.update recibido:`, { 
          update: JSON.stringify(update),
          keys: Object.keys(update)
        });
        await this.handleConnectionUpdate(instanceId, update, sessionInfo);
      });
      
      // Detectar cambios en el estado de la conexión
      socket.ev.on('connection.update', async (update) => {
        if (update.connection === 'open') {
          whatsappLogger.info(`[${instanceId}] ✅✅ Conexión ABIERTA detectada en evento separado`);
        }
      });
      
      // Detectar cuando el usuario está en línea (indica conexión exitosa)
      socket.ev.on('presence.update', async (update) => {
        whatsappLogger.info(`[${instanceId}] Evento presence.update:`, update);
        if (update.presences) {
          await this.updateUserInfo(instanceId, sessionInfo);
        }
      });
      
      // Detectar cambios en la información del usuario
      socket.ev.on('user.update', async (update) => {
        whatsappLogger.info(`[${instanceId}] Evento user.update:`, update);
        await this.updateUserInfo(instanceId, sessionInfo);
      });

      // Manejar actualización de credenciales
      socket.ev.on('creds.update', saveCreds);

      // Manejar mensajes (opcional)
      socket.ev.on('messages.upsert', async (m) => {
        // Aquí puedes implementar lógica para manejar mensajes entrantes
        logger.debug(`Mensaje recibido en instancia ${instanceId}:`, m);
      });

      // Guardar sesión
      this.sessions.set(instanceId, sessionInfo);

      logger.info(`Sesión de WhatsApp creada para instancia: ${instanceId}`);
      return sessionInfo;

    } catch (error) {
      logger.error(`Error al crear sesión de WhatsApp para ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Manejar actualizaciones de conexión
   */
  async handleConnectionUpdate(instanceId, update, sessionInfo) {
    const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;

    whatsappLogger.info(`[${instanceId}] Connection update:`, { 
      connection, 
      hasQR: !!qr, 
      hasError: !!lastDisconnect, 
      isNewLogin,
      receivedPendingNotifications,
      currentStatus: sessionInfo.status
    });

    // Actualizar QR si está disponible
    if (qr) {
      sessionInfo.qr = qr;
      sessionInfo.status = 'qr_ready';
      
      whatsappLogger.info(`✅ QR generado para instancia ${instanceId}`);
      
      // Llamar callback de QR si existe
      const qrCallback = this.qrCallbacks.get(instanceId);
      whatsappLogger.debug(`[${instanceId}] Callback QR ${qrCallback ? 'EXISTE' : 'NO EXISTE'}`);
      
      if (qrCallback) {
        try {
          await qrCallback(qr);
          whatsappLogger.info(`[${instanceId}] Callback QR ejecutado exitosamente`);
        } catch (error) {
          whatsappLogger.error(`Error en callback QR para ${instanceId}:`, error);
        }
      }
    }
    
    // Detectar cualquier cambio que pueda indicar una conexión
    const possibleConnectionSignals = [
      update.isNewLogin === true,
      update.isOnline === true,
      update.receivedPendingNotifications === true,
      !!update.chats,
      !!update.contacts,
      !!update.messages,
      !!update.presences
    ];
    
    if (possibleConnectionSignals.some(signal => signal === true)) {
      whatsappLogger.info(`[${instanceId}] ✅ Posible nueva conexión detectada`, { 
        signals: possibleConnectionSignals,
        currentStatus: sessionInfo.status
      });
      
      // Intentar obtener información del usuario
      try {
        const success = await this.updateUserInfo(instanceId, sessionInfo);
        if (success) {
          whatsappLogger.info(`[${instanceId}] ✅✅✅ Conexión confirmada y actualizada`);
        }
      } catch (error) {
        whatsappLogger.error(`[${instanceId}] Error al actualizar info de usuario:`, error);
      }
    }

    // Manejar cambios de conexión
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : false; // Cambiar a false para evitar reconexiones infinitas

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      whatsappLogger.info(`❌ Conexión cerrada para ${instanceId}`, { statusCode, shouldReconnect, error: lastDisconnect?.error?.message });

      if (shouldReconnect && statusCode !== DisconnectReason.connectionClosed) {
        // Reconectar automáticamente solo en casos específicos
        whatsappLogger.info(`🔄 Programando reconexión para ${instanceId} en 5 segundos...`);
        setTimeout(() => {
          whatsappLogger.info(`🔄 Intentando reconectar ${instanceId}...`);
          this.createSession(instanceId, {
            onQR: this.qrCallbacks.get(instanceId),
            onConnectionUpdate: this.connectionCallbacks.get(instanceId)
          }).catch(err => {
            whatsappLogger.error(`Error en reconexión automática de ${instanceId}:`, err);
          });
        }, 5000);
      } else {
        // Usuario cerró sesión o error de conexión
        sessionInfo.status = statusCode === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected';
        if (statusCode === DisconnectReason.loggedOut) {
          await this.deleteSessionData(instanceId);
        }
      }
    } else if (connection === 'open') {
      whatsappLogger.info(`[${instanceId}] ✅ Conexión abierta detectada`);
      
      // Actualizar estado básico
      sessionInfo.status = 'connected';
      sessionInfo.connectedAt = new Date();
      sessionInfo.qr = null;
      
      // Usar el nuevo método para obtener información del usuario y llamar al callback
      await this.updateUserInfo(instanceId, sessionInfo);
    } else if (connection === 'connecting') {
      whatsappLogger.info(`[${instanceId}] 🔄 Conectando...`);
      sessionInfo.status = 'connecting';
    }
    
    // Detectar conexión exitosa por otros indicadores
    if (receivedPendingNotifications && sessionInfo.status !== 'connected') {
      whatsappLogger.info(`[${instanceId}] ✅ Conexión detectada por pendingNotifications`);
      sessionInfo.status = 'connected';
      sessionInfo.connectedAt = new Date();
      sessionInfo.qr = null;
      await this.updateUserInfo(instanceId, sessionInfo);
    }

    // Actualizar última actividad
    sessionInfo.lastSeen = new Date();
  }

  /**
   * Obtener una sesión activa
   */
  getSession(instanceId) {
    return this.sessions.get(instanceId);
  }

  /**
   * Obtener todas las sesiones
   */
  getAllSessions() {
    const sessions = [];
    for (const [instanceId, info] of this.sessions.entries()) {
      sessions.push({
        instanceId,
        status: info.status,
        phoneNumber: info.phoneNumber,
        connectedAt: info.connectedAt,
        lastSeen: info.lastSeen
      });
    }
    return sessions;
  }

  /**
   * Verificar si una sesión está conectada
   */
  isConnected(instanceId) {
    const session = this.sessions.get(instanceId);
    return session && session.status === 'connected';
  }

  /**
   * Cerrar una sesión
   */
  async closeSession(instanceId) {
    try {
      const session = this.sessions.get(instanceId);
      if (session && session.socket) {
        try {
          // Intentar logout solo si la conexión está abierta
          if (session.status === 'connected') {
            await session.socket.logout();
          }
        } catch (logoutError) {
          logger.warn(`No se pudo hacer logout de ${instanceId}: ${logoutError.message}`);
        }
        
        try {
          session.socket.end();
        } catch (endError) {
          logger.warn(`Error al terminar socket de ${instanceId}: ${endError.message}`);
        }
      }
      
      this.sessions.delete(instanceId);
      this.qrCallbacks.delete(instanceId);
      this.connectionCallbacks.delete(instanceId);
      
      logger.info(`Sesión cerrada para instancia: ${instanceId}`);
      return true;
    } catch (error) {
      logger.error(`Error al cerrar sesión ${instanceId}:`, error);
      // No lanzar error, solo limpiar
      this.sessions.delete(instanceId);
      this.qrCallbacks.delete(instanceId);
      this.connectionCallbacks.delete(instanceId);
      return false;
    }
  }

  /**
   * Eliminar datos de sesión del disco
   */
  async deleteSessionData(instanceId) {
    try {
      const sessionDir = path.join(SESSIONS_DIR, instanceId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info(`Datos de sesión eliminados para: ${instanceId}`);
      }
      return true;
    } catch (error) {
      logger.error(`Error al eliminar datos de sesión ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Enviar mensaje de texto
   */
  async sendTextMessage(instanceId, phoneNumber, message) {
    try {
      const session = this.getSession(instanceId);
      if (!session || session.status !== 'connected') {
        throw new Error(`Instancia ${instanceId} no está conectada`);
      }

      // Formatear número de teléfono (debe incluir código de país)
      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      const result = await session.socket.sendMessage(jid, { text: message });
      
      logger.info(`Mensaje enviado desde ${instanceId} a ${phoneNumber}`);
      return result;
    } catch (error) {
      logger.error(`Error al enviar mensaje desde ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Enviar imagen con caption
   */
  async sendImageMessage(instanceId, phoneNumber, imageBuffer, caption) {
    try {
      const session = this.getSession(instanceId);
      if (!session || session.status !== 'connected') {
        throw new Error(`Instancia ${instanceId} no está conectada`);
      }

      // Formatear número de teléfono
      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      const result = await session.socket.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || ''
      });

      logger.info(`Imagen enviada desde ${instanceId} a ${phoneNumber}`);
      return result;
    } catch (error) {
      logger.error(`Error al enviar imagen desde ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Enviar imagen desde URL
   */
  async sendImageFromUrl(instanceId, phoneNumber, imageUrl, caption) {
    try {
      const session = this.getSession(instanceId);
      if (!session || session.status !== 'connected') {
        throw new Error(`Instancia ${instanceId} no está conectada`);
      }

      // Formatear número de teléfono
      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      const result = await session.socket.sendMessage(jid, {
        image: { url: imageUrl },
        caption: caption || ''
      });

      logger.info(`Imagen (URL) enviada desde ${instanceId} a ${phoneNumber}`);
      return result;
    } catch (error) {
      logger.error(`Error al enviar imagen desde URL ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Verificar si un número existe en WhatsApp
   */
  async checkNumberExists(instanceId, phoneNumber) {
    try {
      const session = this.getSession(instanceId);
      if (!session || session.status !== 'connected') {
        throw new Error(`Instancia ${instanceId} no está conectada`);
      }

      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
      const [result] = await session.socket.onWhatsApp(jid);
      
      return result ? result.exists : false;
    } catch (error) {
      logger.error(`Error al verificar número ${phoneNumber}:`, error);
      return false;
    }
  }

  /**
   * Obtener información de la sesión
   */
  getSessionInfo(instanceId) {
    const session = this.sessions.get(instanceId);
    if (!session) {
      return null;
    }

    return {
      instanceId: session.instanceId,
      status: session.status,
      phoneNumber: session.phoneNumber,
      connectedAt: session.connectedAt,
      lastSeen: session.lastSeen,
      hasQR: !!session.qr
    };
  }

  /**
   * Actualizar información del usuario conectado
   * @param {string} instanceId - ID de la instancia
   * @param {object} sessionInfo - Información de la sesión
   */
  async updateUserInfo(instanceId, sessionInfo) {
    if (!sessionInfo || !sessionInfo.socket) {
      whatsappLogger.error(`[${instanceId}] No hay sesión válida para actualizar info de usuario`);
      return false;
    }

    whatsappLogger.info(`[${instanceId}] Intentando obtener información del usuario...`);
    
    // Intentar obtener el número de teléfono de diferentes formas
    let phoneNumber = null;
    let retries = 0;
    const maxRetries = 5;
    
    // Si ya tenemos un número de teléfono en la sesión, usarlo
    if (sessionInfo.phoneNumber) {
      phoneNumber = sessionInfo.phoneNumber;
      whatsappLogger.info(`[${instanceId}] Usando número ya existente en la sesión: ${phoneNumber}`);
    }
    
    while (!phoneNumber && retries < maxRetries) {
      try {
        whatsappLogger.info(`[${instanceId}] Intento ${retries + 1}/${maxRetries} de obtener número...`);
        
        // Método 1: Intentar obtener de socket.user
        if (sessionInfo.socket.user) {
          phoneNumber = sessionInfo.socket.user.id?.split(':')[0];
          whatsappLogger.info(`[${instanceId}] Número obtenido de socket.user: ${phoneNumber}`);
        }
        
        // Método 2: Intentar obtener de socket.authState.creds.me
        if (!phoneNumber && sessionInfo.socket.authState?.creds?.me?.id) {
          phoneNumber = sessionInfo.socket.authState.creds.me.id.split(':')[0];
          whatsappLogger.info(`[${instanceId}] Número obtenido de authState.creds.me: ${phoneNumber}`);
        }
        
        // Método 3: Intentar obtener de state.creds.me
        if (!phoneNumber && sessionInfo.state?.creds?.me?.id) {
          phoneNumber = sessionInfo.state.creds.me.id.split(':')[0];
          whatsappLogger.info(`[${instanceId}] Número obtenido de state.creds.me: ${phoneNumber}`);
        }
        
        // Método 4: Intentar obtener directamente de las credenciales
        if (!phoneNumber && sessionInfo.state?.creds) {
          const credsStr = JSON.stringify(sessionInfo.state.creds);
          const phoneMatch = credsStr.match(/"wid":"([0-9]+)/);
          if (phoneMatch && phoneMatch[1]) {
            phoneNumber = phoneMatch[1];
            whatsappLogger.info(`[${instanceId}] Número obtenido de credenciales: ${phoneNumber}`);
          }
        }
        
        // Método 5: Intentar obtener de cualquier contacto
        if (!phoneNumber) {
          try {
            const contacts = await sessionInfo.socket.getContacts();
            if (contacts && Object.keys(contacts).length > 0) {
              // El primer contacto suele ser el propio usuario
              const firstContact = Object.values(contacts)[0];
              if (firstContact && firstContact.id) {
                const potentialNumber = firstContact.id.split('@')[0];
                if (potentialNumber.length > 8) { // Número válido debe tener al menos 9 dígitos
                  phoneNumber = potentialNumber;
                  whatsappLogger.info(`[${instanceId}] Número obtenido de contactos: ${phoneNumber}`);
                }
              }
            }
          } catch (contactError) {
            whatsappLogger.warn(`[${instanceId}] Error al obtener contactos:`, contactError);
          }
        }
        
        if (phoneNumber) {
          break;
        }
        
        // Esperar antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
        whatsappLogger.info(`[${instanceId}] Reintentando obtener número (${retries}/${maxRetries})`);
      } catch (error) {
        whatsappLogger.error(`[${instanceId}] Error al obtener número en intento ${retries}:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
      }
    }
    
    // Si aún no tenemos número pero la sesión parece estar conectada, 
    // intentar obtenerlo de la base de datos
    if (!phoneNumber) {
      try {
        const dbInstance = await prisma.whatsAppInstance.findUnique({
          where: { instanceId }
        });
        
        if (dbInstance && dbInstance.phoneNumber) {
          phoneNumber = dbInstance.phoneNumber;
          whatsappLogger.info(`[${instanceId}] Número obtenido de BD: ${phoneNumber}`);
        }
      } catch (dbError) {
        whatsappLogger.error(`[${instanceId}] Error al obtener número de BD:`, dbError);
      }
    }
    
    // Si aún no tenemos número, intentar usar un valor por defecto para desbloquear
    if (!phoneNumber && sessionInfo.status === 'connected') {
      phoneNumber = `unknown_${Date.now()}`;
      whatsappLogger.warn(`[${instanceId}] Usando número temporal para desbloquear: ${phoneNumber}`);
    }
    
    if (phoneNumber) {
      // Actualizar información de la sesión
      sessionInfo.phoneNumber = phoneNumber;
      sessionInfo.status = 'connected';
      sessionInfo.connectedAt = new Date();
      sessionInfo.qr = null;
      
      whatsappLogger.info(`[${instanceId}] ✅✅✅ WhatsApp CONECTADO: ${phoneNumber}`);
      
      // Llamar callback de conexión
      const connectionCallback = this.connectionCallbacks.get(instanceId);
      if (connectionCallback) {
        try {
          whatsappLogger.info(`[${instanceId}] Ejecutando callback de conexión con phoneNumber=${phoneNumber}`);
          await connectionCallback({
            status: 'connected',
            sessionInfo: {
              instanceId,
              phoneNumber,
              connectedAt: sessionInfo.connectedAt,
              status: 'connected'
            }
          });
          whatsappLogger.info(`[${instanceId}] ✅ Callback de conexión ejecutado exitosamente`);
          return true;
        } catch (error) {
          whatsappLogger.error(`[${instanceId}] ❌ Error en callback de conexión:`, error);
          return false;
        }
      } else {
        whatsappLogger.warn(`[${instanceId}] ⚠️ No hay callback de conexión registrado`);
        return false;
      }
    } else {
      whatsappLogger.error(`[${instanceId}] ❌ No se pudo obtener el número de teléfono después de ${maxRetries} intentos`);
      return false;
    }
  }

  /**
   * Limpiar sesiones inactivas
   */
  async cleanupInactiveSessions(maxInactiveMinutes = 30) {
    const now = new Date();
    const sessionsToClean = [];

    for (const [instanceId, info] of this.sessions.entries()) {
      const inactiveMinutes = (now - info.lastSeen) / 1000 / 60;
      
      if (info.status !== 'connected' && inactiveMinutes > maxInactiveMinutes) {
        sessionsToClean.push(instanceId);
      }
    }

    for (const instanceId of sessionsToClean) {
      logger.info(`Limpiando sesión inactiva: ${instanceId}`);
      await this.closeSession(instanceId);
    }

    return sessionsToClean.length;
  }
}

// Exportar instancia singleton
export default new WhatsAppSessionManager();
