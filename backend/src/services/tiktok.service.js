import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../lib/logger.js';

const prisma = new PrismaClient();

/**
 * Servicio para gestionar instancias de TikTok for Business API
 */
class TikTokService {
  constructor() {
    this.instances = new Map(); // Cache de instancias activas
    this.baseUrl = 'https://open.tiktokapis.com';
  }

  /**
   * Crear nueva instancia de TikTok
   */
  async createInstance(instanceId, name, clientKey, clientSecret, redirectUri) {
    try {
      // Crear instancia en la base de datos
      const instance = await prisma.tikTokInstance.create({
        data: {
          instanceId,
          name,
          clientKey,
          clientSecret: this.encryptSecret(clientSecret),
          status: 'DISCONNECTED',
          config: {
            redirectUri,
            scopes: ['user.info.basic', 'video.list']
          }
        }
      });

      logger.info(`Instancia de TikTok creada: ${instanceId}`);
      
      return {
        success: true,
        instance: {
          ...instance,
          clientSecret: '***hidden***'
        },
        authUrl: this.generateAuthUrl(clientKey, redirectUri),
        message: 'Instancia de TikTok creada. Autoriza la aplicación usando la URL proporcionada.'
      };

    } catch (error) {
      logger.error('Error al crear instancia de TikTok:', error);
      throw new Error(`Error al crear instancia: ${error.message}`);
    }
  }

  /**
   * Generar URL de autorización OAuth
   */
  generateAuthUrl(clientKey, redirectUri) {
    const scopes = 'user.info.basic,video.list';
    const baseUrl = 'https://www.tiktok.com/v2/auth/authorize';
    
    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: Math.random().toString(36).substring(7) // Estado aleatorio para seguridad
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Intercambiar código de autorización por access token
   */
  async exchangeCodeForToken(instanceId, authCode, redirectUri) {
    try {
      const instance = await this.getInstance(instanceId);
      const clientSecret = this.decryptSecret(instance.clientSecret);

      const response = await axios.post(`${this.baseUrl}/v2/oauth/token/`, {
        client_key: instance.clientKey,
        client_secret: clientSecret,
        code: authCode,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        }
      });

      const tokenData = response.data;
      
      if (tokenData.error) {
        throw new Error(`Error de TikTok: ${tokenData.error_description}`);
      }

      // Obtener información del usuario
      const userInfo = await this.getUserInfo(tokenData.access_token);

      // Actualizar instancia
      const updatedInstance = await prisma.tikTokInstance.update({
        where: { instanceId },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          refreshExpiresAt: new Date(Date.now() + tokenData.refresh_expires_in * 1000),
          openId: tokenData.open_id,
          scope: tokenData.scope,
          status: 'CONNECTED',
          connectedAt: new Date(),
          config: {
            ...instance.config,
            userInfo
          }
        }
      });

      logger.info(`Instancia de TikTok conectada: ${instanceId}`);

      return {
        success: true,
        instance: {
          ...updatedInstance,
          clientSecret: '***hidden***',
          accessToken: '***hidden***',
          refreshToken: '***hidden***'
        },
        message: 'Autorización exitosa. TikTok conectado.'
      };

    } catch (error) {
      logger.error('Error al intercambiar código:', error);
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw new Error(`Error en autorización: ${error.message}`);
    }
  }

  /**
   * Obtener información del usuario
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.post(`${this.baseUrl}/v2/user/info/`, {
        fields: 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count'
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`Error al obtener info del usuario: ${response.data.error.message}`);
      }

      return response.data.data.user;
    } catch (error) {
      logger.error('Error al obtener info del usuario:', error);
      throw error;
    }
  }

  /**
   * Obtener videos del usuario
   */
  async getUserVideos(instanceId, limit = 20) {
    try {
      const instance = await this.getInstance(instanceId);
      
      if (!instance.accessToken) {
        throw new Error('Instancia no autorizada');
      }

      // Verificar si el token ha expirado
      if (instance.tokenExpiresAt && new Date() > instance.tokenExpiresAt) {
        // Intentar refrescar el token
        await this.refreshAccessToken(instanceId);
        // Obtener la instancia actualizada
        const refreshedInstance = await this.getInstance(instanceId);
        instance.accessToken = refreshedInstance.accessToken;
      }

      const response = await axios.post(`${this.baseUrl}/v2/video/list/`, {
        max_count: limit,
        fields: 'id,create_time,cover_image_url,share_url,video_description,duration,height,width,title,embed_html,embed_link,like_count,comment_count,share_count,view_count'
      }, {
        headers: {
          'Authorization': `Bearer ${instance.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`Error al obtener videos: ${response.data.error.message}`);
      }

      await this.updateLastSeen(instanceId);

      return {
        success: true,
        videos: response.data.data.videos,
        hasMore: response.data.data.has_more,
        cursor: response.data.data.cursor
      };

    } catch (error) {
      logger.error('Error al obtener videos:', error);
      if (error.response?.status === 401) {
        await this.updateConnectionStatus(instanceId, 'EXPIRED');
      }
      throw error;
    }
  }

  /**
   * Refrescar token de acceso
   */
  async refreshAccessToken(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      
      if (!instance.refreshToken) {
        throw new Error('No hay refresh token disponible');
      }

      if (instance.refreshExpiresAt && new Date() > instance.refreshExpiresAt) {
        throw new Error('Refresh token expirado. Reautoriza la aplicación.');
      }

      const clientSecret = this.decryptSecret(instance.clientSecret);

      const response = await axios.post(`${this.baseUrl}/v2/oauth/token/`, {
        client_key: instance.clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: instance.refreshToken
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        }
      });

      const tokenData = response.data;
      
      if (tokenData.error) {
        throw new Error(`Error al refrescar token: ${tokenData.error_description}`);
      }

      // Actualizar tokens
      await prisma.tikTokInstance.update({
        where: { instanceId },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          refreshExpiresAt: new Date(Date.now() + tokenData.refresh_expires_in * 1000),
          status: 'CONNECTED',
          lastSeen: new Date()
        }
      });

      logger.info(`Token de TikTok refrescado: ${instanceId}`);

      return {
        success: true,
        message: 'Token refrescado exitosamente',
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
      };

    } catch (error) {
      logger.error('Error al refrescar token:', error);
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw error;
    }
  }

  /**
   * Revocar acceso
   */
  async revokeAccess(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      const clientSecret = this.decryptSecret(instance.clientSecret);

      if (instance.accessToken) {
        await axios.post(`${this.baseUrl}/v2/oauth/revoke/`, {
          client_key: instance.clientKey,
          client_secret: clientSecret,
          token: instance.accessToken
        }, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache'
          }
        });
      }

      // Limpiar tokens
      await prisma.tikTokInstance.update({
        where: { instanceId },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          refreshExpiresAt: null,
          status: 'DISCONNECTED',
          lastSeen: new Date()
        }
      });

      return {
        success: true,
        message: 'Acceso revocado exitosamente'
      };

    } catch (error) {
      logger.error('Error al revocar acceso:', error);
      throw error;
    }
  }

  /**
   * Listar todas las instancias
   */
  async listInstances() {
    try {
      const instances = await prisma.tikTokInstance.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });

      // Ocultar secrets
      return instances.map(instance => ({
        ...instance,
        clientSecret: '***hidden***',
        accessToken: instance.accessToken ? '***hidden***' : null,
        refreshToken: instance.refreshToken ? '***hidden***' : null
      }));
    } catch (error) {
      logger.error('Error al listar instancias de TikTok:', error);
      throw error;
    }
  }

  /**
   * Obtener instancia por ID
   */
  async getInstance(instanceId) {
    try {
      const instance = await prisma.tikTokInstance.findUnique({
        where: { instanceId }
      });

      if (!instance) {
        throw new Error(`Instancia de TikTok no encontrada: ${instanceId}`);
      }

      if (!instance.isActive) {
        throw new Error(`Instancia de TikTok inactiva: ${instanceId}`);
      }

      return instance;
    } catch (error) {
      logger.error('Error al obtener instancia:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado de conexión
   */
  async updateConnectionStatus(instanceId, status, error = null) {
    try {
      const updateData = {
        status,
        lastSeen: new Date()
      };

      if (status === 'CONNECTED') {
        updateData.connectedAt = new Date();
      }

      if (error) {
        updateData.config = {
          lastError: error
        };
      }

      await prisma.tikTokInstance.update({
        where: { instanceId },
        data: updateData
      });

      logger.info(`Estado de instancia TikTok actualizado: ${instanceId} -> ${status}`);
    } catch (error) {
      logger.error('Error al actualizar estado:', error);
    }
  }

  /**
   * Actualizar última actividad
   */
  async updateLastSeen(instanceId) {
    try {
      await prisma.tikTokInstance.update({
        where: { instanceId },
        data: { lastSeen: new Date() }
      });
    } catch (error) {
      logger.error('Error al actualizar última actividad:', error);
    }
  }

  /**
   * Desconectar instancia
   */
  async disconnectInstance(instanceId) {
    try {
      await this.revokeAccess(instanceId);

      return {
        success: true,
        message: 'Instancia desconectada exitosamente'
      };

    } catch (error) {
      logger.error('Error al desconectar instancia:', error);
      throw error;
    }
  }

  /**
   * Eliminar instancia
   */
  async deleteInstance(instanceId) {
    try {
      // Revocar acceso primero
      try {
        await this.revokeAccess(instanceId);
      } catch (error) {
        logger.warn('Error al revocar acceso durante eliminación:', error);
      }

      // Marcar como inactiva
      await prisma.tikTokInstance.update({
        where: { instanceId },
        data: { isActive: false }
      });

      logger.info(`Instancia de TikTok eliminada: ${instanceId}`);

      return {
        success: true,
        message: 'Instancia eliminada exitosamente'
      };

    } catch (error) {
      logger.error('Error al eliminar instancia:', error);
      throw error;
    }
  }

  /**
   * Probar conexión
   */
  async testConnection(instanceId) {
    try {
      const instance = await this.getInstance(instanceId);
      
      if (!instance.accessToken) {
        throw new Error('Instancia no autorizada');
      }

      const userInfo = await this.getUserInfo(instance.accessToken);
      await this.updateConnectionStatus(instanceId, 'CONNECTED');

      return {
        success: true,
        userInfo,
        message: 'Conexión exitosa'
      };

    } catch (error) {
      await this.updateConnectionStatus(instanceId, 'ERROR', error.message);
      throw error;
    }
  }

  /**
   * Encriptar secret (implementación básica - usar crypto en producción)
   */
  encryptSecret(secret) {
    // En producción, usar una librería de encriptación real
    return Buffer.from(secret).toString('base64');
  }

  /**
   * Desencriptar secret
   */
  decryptSecret(encryptedSecret) {
    // En producción, usar una librería de encriptación real
    return Buffer.from(encryptedSecret, 'base64').toString('utf8');
  }
}

export default new TikTokService();
