import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class ProviderController {
  async getAllSystems(req, res) {
    try {
      const systems = await prisma.apiSystem.findMany({
        include: {
          configurations: {
            include: {
              game: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      res.json(systems);
    } catch (error) {
      logger.error('Error obteniendo sistemas API:', error);
      res.status(500).json({ error: 'Error al obtener sistemas API' });
    }
  }

  async getSystemById(req, res) {
    try {
      const { id } = req.params;
      
      const system = await prisma.apiSystem.findUnique({
        where: { id },
        include: {
          configurations: {
            include: {
              game: true
            }
          }
        }
      });

      if (!system) {
        return res.status(404).json({ error: 'Sistema no encontrado' });
      }

      res.json(system);
    } catch (error) {
      logger.error('Error obteniendo sistema API:', error);
      res.status(500).json({ error: 'Error al obtener sistema API' });
    }
  }

  async createSystem(req, res) {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'El nombre es requerido' });
      }

      const system = await prisma.apiSystem.create({
        data: {
          name,
          description
        }
      });

      logger.info(`Sistema API creado: ${system.name} (${system.id})`);
      res.status(201).json(system);
    } catch (error) {
      logger.error('Error creando sistema API:', error);
      res.status(500).json({ error: 'Error al crear sistema API' });
    }
  }

  async updateSystem(req, res) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      const system = await prisma.apiSystem.update({
        where: { id },
        data: {
          name,
          description
        }
      });

      logger.info(`Sistema API actualizado: ${system.name} (${system.id})`);
      res.json(system);
    } catch (error) {
      logger.error('Error actualizando sistema API:', error);
      res.status(500).json({ error: 'Error al actualizar sistema API' });
    }
  }

  async deleteSystem(req, res) {
    try {
      const { id } = req.params;

      await prisma.apiSystem.delete({
        where: { id }
      });

      logger.info(`Sistema API eliminado: ${id}`);
      res.json({ message: 'Sistema eliminado correctamente' });
    } catch (error) {
      logger.error('Error eliminando sistema API:', error);
      res.status(500).json({ error: 'Error al eliminar sistema API' });
    }
  }

  async getAllConfigurations(req, res) {
    try {
      const { apiSystemId, gameId, type } = req.query;
      
      const where = {};
      if (apiSystemId) where.apiSystemId = apiSystemId;
      if (gameId) where.gameId = gameId;
      if (type) where.type = type;

      const configurations = await prisma.apiConfiguration.findMany({
        where,
        include: {
          apiSystem: true,
          game: true,
          drawMappings: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: [
          { apiSystem: { name: 'asc' } },
          { game: { name: 'asc' } },
          { type: 'asc' }
        ]
      });

      res.json(configurations);
    } catch (error) {
      logger.error('Error obteniendo configuraciones API:', error);
      res.status(500).json({ error: 'Error al obtener configuraciones API' });
    }
  }

  async getConfigurationById(req, res) {
    try {
      const { id } = req.params;
      
      const configuration = await prisma.apiConfiguration.findUnique({
        where: { id },
        include: {
          apiSystem: true,
          game: true,
          drawMappings: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              draw: true
            }
          }
        }
      });

      if (!configuration) {
        return res.status(404).json({ error: 'Configuración no encontrada' });
      }

      res.json(configuration);
    } catch (error) {
      logger.error('Error obteniendo configuración API:', error);
      res.status(500).json({ error: 'Error al obtener configuración API' });
    }
  }

  async createConfiguration(req, res) {
    try {
      const { name, apiSystemId, gameId, type, baseUrl, token, tripletaUrl, tripletaToken, isActive } = req.body;

      if (!name || !apiSystemId || !gameId || !type || !baseUrl || !token) {
        return res.status(400).json({ 
          error: 'Todos los campos son requeridos: name, apiSystemId, gameId, type, baseUrl, token' 
        });
      }

      if (!['PLANNING', 'SALES'].includes(type)) {
        return res.status(400).json({ 
          error: 'El tipo debe ser PLANNING o SALES' 
        });
      }

      const configuration = await prisma.apiConfiguration.create({
        data: {
          name,
          apiSystemId,
          gameId,
          type,
          baseUrl,
          token,
          tripletaUrl: tripletaUrl || null,
          tripletaToken: tripletaToken || null,
          isActive: isActive !== undefined ? isActive : true
        },
        include: {
          apiSystem: true,
          game: true
        }
      });

      logger.info(`Configuración API creada: ${configuration.name} (${configuration.id})`);
      res.status(201).json(configuration);
    } catch (error) {
      logger.error('Error creando configuración API:', error);
      res.status(500).json({ error: 'Error al crear configuración API' });
    }
  }

  async updateConfiguration(req, res) {
    try {
      const { id } = req.params;
      const { name, apiSystemId, gameId, type, baseUrl, token, tripletaUrl, tripletaToken, isActive } = req.body;

      const data = {};
      if (name !== undefined) data.name = name;
      if (apiSystemId !== undefined) data.apiSystemId = apiSystemId;
      if (gameId !== undefined) data.gameId = gameId;
      if (type !== undefined) data.type = type;
      if (baseUrl !== undefined) data.baseUrl = baseUrl;
      if (token !== undefined) data.token = token;
      if (tripletaUrl !== undefined) data.tripletaUrl = tripletaUrl || null;
      if (tripletaToken !== undefined) data.tripletaToken = tripletaToken || null;
      if (isActive !== undefined) data.isActive = isActive;

      const configuration = await prisma.apiConfiguration.update({
        where: { id },
        data,
        include: {
          apiSystem: true,
          game: true
        }
      });

      logger.info(`Configuración API actualizada: ${configuration.name} (${configuration.id})`);
      res.json(configuration);
    } catch (error) {
      logger.error('Error actualizando configuración API:', error);
      res.status(500).json({ error: 'Error al actualizar configuración API' });
    }
  }

  async deleteConfiguration(req, res) {
    try {
      const { id } = req.params;

      await prisma.apiConfiguration.delete({
        where: { id }
      });

      logger.info(`Configuración API eliminada: ${id}`);
      res.json({ message: 'Configuración eliminada correctamente' });
    } catch (error) {
      logger.error('Error eliminando configuración API:', error);
      res.status(500).json({ error: 'Error al eliminar configuración API' });
    }
  }

  async testConfiguration(req, res) {
    try {
      const { id } = req.params;
      
      const configuration = await prisma.apiConfiguration.findUnique({
        where: { id },
        include: {
          apiSystem: true,
          game: true
        }
      });

      if (!configuration) {
        return res.status(404).json({ error: 'Configuración no encontrada' });
      }

      let testUrl = configuration.baseUrl;
      if (configuration.type === 'PLANNING') {
        const today = new Date().toISOString().split('T')[0];
        testUrl = `${configuration.baseUrl}${today}`;
      } else {
        testUrl = `${configuration.baseUrl}test`;
      }

      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'APIKEY': configuration.token,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      res.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: data,
        testUrl: testUrl
      });
    } catch (error) {
      logger.error('Error probando configuración API:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  async getConfigurationStats(req, res) {
    try {
      const { id } = req.params;
      
      const configuration = await prisma.apiConfiguration.findUnique({
        where: { id },
        include: {
          drawMappings: {
            include: {
              draw: true,
              tickets: true
            }
          }
        }
      });

      if (!configuration) {
        return res.status(404).json({ error: 'Configuración no encontrada' });
      }

      const totalMappings = configuration.drawMappings.length;
      const totalTickets = configuration.drawMappings.reduce((sum, mapping) => {
        return sum + mapping.tickets.length;
      }, 0);

      const lastSync = configuration.drawMappings.length > 0 
        ? configuration.drawMappings[0].createdAt 
        : null;

      res.json({
        totalMappings,
        totalTickets,
        lastSync,
        isActive: configuration.isActive
      });
    } catch (error) {
      logger.error('Error obteniendo estadísticas de configuración:', error);
      res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
  }
}

export default new ProviderController();
