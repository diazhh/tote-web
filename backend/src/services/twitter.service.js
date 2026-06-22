import axios from 'axios';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Servicio para gestionar instancias de Twitter / X y publicar resultados.
 *
 * Autenticación: OAuth 1.0a User Context (apiKey/apiSecret + accessToken/accessSecret).
 * Es el único flujo que permite subir media (imagen) + crear el tweet de forma estable.
 *
 * La firma OAuth 1.0a y el upload de media los delega en la librería `twitter-api-v2`,
 * que se importa de forma dinámica para que su ausencia NO tumbe el arranque del backend
 * ni afecte a los otros canales. Si el paquete no está instalado, publishTweet() devuelve
 * un fallo controlado (se registra como FAILED en DrawPublication) en vez de lanzar al import.
 *
 * Credenciales: se guardan tal cual en la DB (misma política que TikTok/Instagram accessToken)
 * y se enmascaran al exponerlas por la API. La DB es la frontera de confianza.
 */
class TwitterService {
  constructor() {
    this._TwitterApi = null; // cache del símbolo importado
  }

  /**
   * Carga perezosa de la librería twitter-api-v2.
   * @returns {Promise<Function>} clase TwitterApi
   */
  async _loadLib() {
    if (this._TwitterApi) return this._TwitterApi;
    try {
      const mod = await import('twitter-api-v2');
      this._TwitterApi = mod.TwitterApi || mod.default?.TwitterApi || mod.default;
      if (!this._TwitterApi) {
        throw new Error('export TwitterApi no encontrado en twitter-api-v2');
      }
      return this._TwitterApi;
    } catch (error) {
      throw new Error(
        `La librería 'twitter-api-v2' no está instalada o falló al cargar (${error.message}). ` +
        `Ejecuta: npm install twitter-api-v2`
      );
    }
  }

  /**
   * Construir un cliente OAuth 1.0a a partir de una instancia.
   */
  async _buildClient(instance) {
    const TwitterApi = await this._loadLib();
    return new TwitterApi({
      appKey: instance.apiKey,
      appSecret: instance.apiSecret,
      accessToken: instance.accessToken,
      accessSecret: instance.accessSecret
    });
  }

  /**
   * Validar credenciales contra la API (GET /2/users/me).
   * @returns {Promise<{id:string, name:string, username:string}>}
   */
  async validateCredentials(apiKey, apiSecret, accessToken, accessSecret) {
    const client = await this._buildClient({ apiKey, apiSecret, accessToken, accessSecret });
    try {
      const me = await client.v2.me();
      return me.data; // { id, name, username }
    } catch (error) {
      throw new Error(`Credenciales de X inválidas: ${this._extractError(error)}`);
    }
  }

  /**
   * Crear nueva instancia de Twitter/X.
   */
  async createInstance(instanceId, name, apiKey, apiSecret, accessToken, accessSecret, options = {}) {
    try {
      // Validar credenciales (también nos da el username/userId reales)
      let me = null;
      try {
        me = await this.validateCredentials(apiKey, apiSecret, accessToken, accessSecret);
      } catch (validationError) {
        // No bloqueamos la creación si la validación falla (p.ej. lib no instalada aún),
        // pero dejamos la instancia DISCONNECTED para que el admin la pruebe luego.
        logger.warn(`No se pudieron validar credenciales de X al crear ${instanceId}: ${validationError.message}`);
      }

      const instance = await prisma.twitterInstance.create({
        data: {
          instanceId,
          name,
          apiKey,
          apiSecret,
          accessToken,
          accessSecret,
          bearerToken: options.bearerToken || null,
          userId: me?.id || null,
          username: me?.username || options.username || null,
          status: me ? 'CONNECTED' : 'DISCONNECTED',
          connectedAt: me ? new Date() : null,
          config: me ? { userInfo: me } : null
        }
      });

      logger.info(`Instancia de X/Twitter creada: ${instanceId}${me ? ` (@${me.username})` : ''}`);

      return {
        success: true,
        instance: this._mask(instance),
        message: 'Instancia de X/Twitter creada exitosamente'
      };
    } catch (error) {
      logger.error('Error al crear instancia de X/Twitter:', error);
      throw new Error(`Error al crear instancia: ${error.message}`);
    }
  }

  /**
   * Publicar un tweet (con imagen opcional).
   *
   * @param {string} instanceId
   * @param {string} text        - Texto del tweet (máx. 280 caracteres en el plan base)
   * @param {string|null} imageUrl - URL pública de la imagen a adjuntar
   * @returns {Promise<{success:boolean, tweetId?:string, error?:string}>}
   */
  async publishTweet(instanceId, text, imageUrl = null) {
    try {
      const instance = await this.getInstance(instanceId);
      const client = await this._buildClient(instance);

      const mediaIds = [];
      if (imageUrl) {
        try {
          const resp = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
          });
          const buffer = Buffer.from(resp.data);
          const mediaId = await this._uploadMedia(client, buffer);
          mediaIds.push(mediaId);
        } catch (mediaError) {
          // Si falla la subida de imagen, intentamos publicar solo texto (mejor que nada)
          logger.warn(`No se pudo subir imagen a X para ${instanceId}, publicando solo texto: ${this._extractError(mediaError)}`);
        }
      }

      const payload = { text };
      if (mediaIds.length > 0) {
        payload.media = { media_ids: mediaIds };
      }

      const result = await client.v2.tweet(payload);
      const tweetId = result?.data?.id || null;

      await this.updateLastSeen(instanceId);
      await this.updateConnectionStatus(instanceId, 'CONNECTED');

      return { success: true, tweetId };
    } catch (error) {
      const message = this._extractError(error);
      logger.error(`Error al publicar tweet en ${instanceId}: ${message}`);
      await this.updateConnectionStatus(instanceId, 'ERROR', message);
      return { success: false, error: message };
    }
  }

  /**
   * Responder a un tweet (encadenar un hilo), con imagen opcional.
   *
   * @param {string} instanceId
   * @param {string} text
   * @param {string} inReplyToTweetId - id del tweet al que se responde
   * @param {string|null} imageUrl
   * @returns {Promise<{success:boolean, tweetId?:string, error?:string}>}
   */
  async replyTweet(instanceId, text, inReplyToTweetId, imageUrl = null) {
    try {
      const instance = await this.getInstance(instanceId);
      const client = await this._buildClient(instance);

      const mediaIds = [];
      if (imageUrl) {
        try {
          const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
          mediaIds.push(await this._uploadMedia(client, Buffer.from(resp.data)));
        } catch (mediaError) {
          logger.warn(`No se pudo subir imagen al reply de X (${instanceId}): ${this._extractError(mediaError)}`);
        }
      }

      const payload = { text, reply: { in_reply_to_tweet_id: inReplyToTweetId } };
      if (mediaIds.length > 0) payload.media = { media_ids: mediaIds };

      const result = await client.v2.tweet(payload);
      const tweetId = result?.data?.id || null;

      await this.updateLastSeen(instanceId);
      return { success: true, tweetId };
    } catch (error) {
      const message = this._extractError(error);
      logger.error(`Error al responder tweet en ${instanceId}: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Subir una imagen y devolver el media_id.
   * Prefiere el endpoint v2 (/2/media/upload, el vigente desde 2026); si la versión
   * de la librería o la cuenta aún usan v1.1, hace fallback a v1.uploadMedia.
   */
  async _uploadMedia(client, buffer) {
    // Intento 1: endpoint v2 (vigente)
    if (typeof client.v2?.uploadMedia === 'function') {
      try {
        return await client.v2.uploadMedia(buffer, {
          media_type: 'image/png',
          media_category: 'tweet_image'
        });
      } catch (v2Error) {
        logger.warn(`v2.uploadMedia falló, probando v1: ${this._extractError(v2Error)}`);
      }
    }
    // Intento 2: endpoint v1.1 (legacy)
    return client.v1.uploadMedia(buffer, { mimeType: 'image/png' });
  }

  /**
   * Probar conexión de una instancia.
   */
  async testConnection(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      const me = await this.validateCredentials(
        instance.apiKey,
        instance.apiSecret,
        instance.accessToken,
        instance.accessSecret
      );

      await prisma.twitterInstance.update({
        where: { instanceId },
        data: {
          status: 'CONNECTED',
          connectedAt: new Date(),
          lastSeen: new Date(),
          userId: me.id,
          username: me.username,
          config: { userInfo: me }
        }
      });

      return { success: true, userInfo: me, message: 'Conexión exitosa' };
    } catch (error) {
      const message = this._extractError(error);
      await this.updateConnectionStatus(instanceId, 'ERROR', message);
      throw new Error(message);
    }
  }

  /**
   * Listar todas las instancias (con secretos enmascarados).
   */
  async listInstances() {
    try {
      const instances = await prisma.twitterInstance.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return instances.map((i) => this._mask(i));
    } catch (error) {
      logger.error('Error al listar instancias de X/Twitter:', error);
      throw error;
    }
  }

  /**
   * Obtener instancia activa por ID (con secretos en claro, para uso interno).
   */
  async getInstance(instanceId) {
    const instance = await prisma.twitterInstance.findUnique({
      where: { instanceId }
    });

    if (!instance) {
      throw new Error(`Instancia de X/Twitter no encontrada: ${instanceId}`);
    }
    if (!instance.isActive) {
      throw new Error(`Instancia de X/Twitter inactiva: ${instanceId}`);
    }
    return instance;
  }

  /**
   * Actualizar estado de conexión.
   */
  async updateConnectionStatus(instanceId, status, error = null) {
    try {
      const updateData = { status, lastSeen: new Date() };
      if (status === 'CONNECTED') updateData.connectedAt = new Date();
      if (error) updateData.config = { lastError: error };

      await prisma.twitterInstance.update({
        where: { instanceId },
        data: updateData
      });
    } catch (err) {
      logger.error('Error al actualizar estado de X/Twitter:', err);
    }
  }

  /**
   * Actualizar última actividad.
   */
  async updateLastSeen(instanceId) {
    try {
      await prisma.twitterInstance.update({
        where: { instanceId },
        data: { lastSeen: new Date() }
      });
    } catch (error) {
      logger.error('Error al actualizar última actividad de X/Twitter:', error);
    }
  }

  /**
   * Desconectar instancia.
   */
  async disconnectInstance(instanceId) {
    await prisma.twitterInstance.update({
      where: { instanceId },
      data: { status: 'DISCONNECTED', lastSeen: new Date() }
    });
    return { success: true, message: 'Instancia desconectada exitosamente' };
  }

  /**
   * Eliminar instancia (soft delete).
   */
  async deleteInstance(instanceId) {
    await prisma.twitterInstance.update({
      where: { instanceId },
      data: { isActive: false }
    });
    logger.info(`Instancia de X/Twitter eliminada: ${instanceId}`);
    return { success: true, message: 'Instancia eliminada exitosamente' };
  }

  /**
   * Activar / pausar instancia.
   */
  async toggleActive(instanceId, isActive) {
    const instance = await prisma.twitterInstance.update({
      where: { instanceId },
      data: { isActive }
    });
    logger.info(`Instancia de X/Twitter ${isActive ? 'activada' : 'pausada'}: ${instanceId}`);
    return {
      success: true,
      message: `Instancia ${isActive ? 'activada' : 'pausada'} exitosamente`,
      instance: { instanceId: instance.instanceId, name: instance.name, isActive: instance.isActive }
    };
  }

  /**
   * Enmascarar secretos antes de exponer una instancia por la API.
   */
  _mask(instance) {
    return {
      ...instance,
      apiSecret: '***hidden***',
      accessToken: '***hidden***',
      accessSecret: '***hidden***',
      bearerToken: instance.bearerToken ? '***hidden***' : null
    };
  }

  /**
   * Extraer un mensaje de error legible de un fallo de twitter-api-v2 o axios.
   */
  _extractError(error) {
    return (
      error?.data?.detail ||
      error?.data?.errors?.[0]?.message ||
      error?.data?.title ||
      error?.response?.data?.detail ||
      error?.message ||
      'Error desconocido'
    );
  }
}

export default new TwitterService();
