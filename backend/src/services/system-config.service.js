import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class SystemConfigService {
  /**
   * Obtener configuración por clave
   */
  async get(key) {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key }
      });

      if (!config) {
        return null;
      }

      // Parsear el valor JSON
      try {
        return {
          ...config,
          value: JSON.parse(config.value)
        };
      } catch {
        return config;
      }
    } catch (error) {
      logger.error(`Error al obtener configuración ${key}:`, error);
      throw error;
    }
  }

  /**
   * Establecer o actualizar configuración
   */
  async set(key, value, description = null, updatedBy = null) {
    try {
      const valueString = typeof value === 'string' ? value : JSON.stringify(value);

      const config = await prisma.systemConfig.upsert({
        where: { key },
        create: {
          key,
          value: valueString,
          description,
          updatedBy
        },
        update: {
          value: valueString,
          description,
          updatedBy,
          updatedAt: new Date()
        }
      });

      logger.info(`Configuración actualizada: ${key}`, { updatedBy });
      return config;
    } catch (error) {
      logger.error(`Error al establecer configuración ${key}:`, error);
      throw error;
    }
  }

  /**
   * Verificar si el sistema está en parada de emergencia
   */
  async isEmergencyStop() {
    try {
      const config = await this.get('emergency_stop');
      return config?.value?.enabled === true;
    } catch (error) {
      logger.error('Error al verificar parada de emergencia:', error);
      return false;
    }
  }

  /**
   * Activar parada de emergencia
   */
  async enableEmergencyStop(reason = 'Parada de emergencia activada', updatedBy = null) {
    try {
      await this.set(
        'emergency_stop',
        {
          enabled: true,
          reason,
          activatedAt: new Date().toISOString()
        },
        'Parada de emergencia del sistema',
        updatedBy
      );

      logger.warn('🚨 PARADA DE EMERGENCIA ACTIVADA', { reason, updatedBy });
      return true;
    } catch (error) {
      logger.error('Error al activar parada de emergencia:', error);
      throw error;
    }
  }

  /**
   * Desactivar parada de emergencia
   */
  async disableEmergencyStop(updatedBy = null) {
    try {
      await this.set(
        'emergency_stop',
        {
          enabled: false,
          deactivatedAt: new Date().toISOString()
        },
        'Parada de emergencia del sistema',
        updatedBy
      );

      logger.info('✅ Parada de emergencia desactivada', { updatedBy });
      return true;
    } catch (error) {
      logger.error('Error al desactivar parada de emergencia:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las configuraciones
   */
  async getAll() {
    try {
      const configs = await prisma.systemConfig.findMany({
        orderBy: { key: 'asc' }
      });

      return configs.map(config => {
        try {
          return {
            ...config,
            value: JSON.parse(config.value)
          };
        } catch {
          return config;
        }
      });
    } catch (error) {
      logger.error('Error al obtener configuraciones:', error);
      throw error;
    }
  }

  /**
   * Eliminar configuración
   */
  async delete(key) {
    try {
      await prisma.systemConfig.delete({
        where: { key }
      });

      logger.info(`Configuración eliminada: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Error al eliminar configuración ${key}:`, error);
      throw error;
    }
  }
}

export default new SystemConfigService();
