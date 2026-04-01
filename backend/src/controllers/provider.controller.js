import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import crypto from 'node:crypto';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProviderController {
  async getAllSystems(req, res) {
    try {
      const systems = await prisma.apiSystem.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          slug: true,
          mode: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          configurations: {
            include: { game: true }
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
      const { name, description, slug, mode, isActive } = req.body;

      if (!name || !slug) {
        return res.status(400).json({ error: 'El nombre y el slug son requeridos' });
      }

      const system = await prisma.apiSystem.create({
        data: {
          name,
          description,
          slug,
          mode: mode || 'PULL',
          isActive: isActive !== undefined ? isActive : true
        }
      });

      logger.info(`Sistema API creado: ${system.name} (${system.id})`);
      res.status(201).json(system);
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'El slug ya está en uso' });
      }
      logger.error('Error creando sistema API:', error);
      res.status(500).json({ error: 'Error al crear sistema API' });
    }
  }

  async updateSystem(req, res) {
    try {
      const { id } = req.params;
      const { name, description, slug, mode, isActive } = req.body;

      const data = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (slug !== undefined) data.slug = slug;
      if (mode !== undefined) data.mode = mode;
      if (isActive !== undefined) data.isActive = isActive;

      const system = await prisma.apiSystem.update({ where: { id }, data });

      logger.info(`Sistema API actualizado: ${system.name} (${system.id})`);
      res.json(system);
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'El slug ya está en uso' });
      }
      logger.error('Error actualizando sistema API:', error);
      res.status(500).json({ error: 'Error al actualizar sistema API' });
    }
  }

  async generateToken(req, res) {
    try {
      const { id } = req.params;
      const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
      const system = await prisma.apiSystem.update({
        where: { id },
        data: { webhookToken: token }
      });
      logger.info(`Token webhook generado para sistema: ${system.name} (${id})`);
      res.json({ webhookToken: token, systemId: id });
    } catch (error) {
      logger.error('Error generando token webhook:', error);
      res.status(500).json({ error: 'Error al generar token' });
    }
  }

  async getAdapterStatus(req, res) {
    try {
      const { id } = req.params;
      const system = await prisma.apiSystem.findUnique({ where: { id } });
      if (!system) {
        return res.status(404).json({ error: 'Sistema no encontrado' });
      }
      const adapterPath = path.join(__dirname, '../webhooks/adapters', `${system.slug}.adapter.js`);
      let adapterReady = false;
      try {
        await access(adapterPath);
        adapterReady = true;
      } catch {
        adapterReady = false;
      }
      res.json({ adapterReady, slug: system.slug, mode: system.mode });
    } catch (error) {
      logger.error('Error verificando adapter status:', error);
      res.status(500).json({ error: 'Error al verificar adapter' });
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

  async getWebhookLogs(req, res) {
    try {
      const { apiSystemId, status, page = '1', limit = '50' } = req.query;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const where = {};
      if (apiSystemId) where.apiSystemId = apiSystemId;
      if (status) where.status = status;

      const [logs, total] = await Promise.all([
        prisma.webhookLog.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            apiSystem: {
              select: { id: true, name: true, slug: true }
            }
          }
        }),
        prisma.webhookLog.count({ where })
      ]);

      res.json({
        data: logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: skip + logs.length < total,
          hasPrev: pageNum > 1
        }
      });
    } catch (error) {
      logger.error('Error obteniendo webhook logs:', error);
      res.status(500).json({ error: 'Error al obtener logs' });
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
