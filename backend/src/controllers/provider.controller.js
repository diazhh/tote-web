import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import crypto from 'node:crypto';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { buildIntegrationDoc } from '../services/provider-doc.service.js';

// Bases públicas para la doc de integración (override por env).
const WEBHOOK_PUBLIC_BASE = process.env.WEBHOOK_PUBLIC_BASE || 'https://toteback.atilax.io/api/webhooks';
const PORTAL_LOGIN_URL = process.env.PORTAL_LOGIN_URL || 'https://tote.atilax.io/login';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Restringe slugs a caracteres seguros para uso en filesystem (path traversal) y URLs.
const SLUG_REGEX = /^[a-z0-9_-]{1,64}$/;

// Valores válidos para ApiSystem.partialMode (enum WebhookPartialMode).
const PARTIAL_MODES = ['NONE', 'DROP', 'SPLIT'];

/**
 * Validates that a URL points to a public host (not loopback/private/link-local).
 * Used to prevent SSRF in testConfiguration where the user controls baseUrl.
 */
function isPublicHttpUrl(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;

  const host = url.hostname.toLowerCase();
  // Hostname-based blocklist for common private ranges
  if (host === 'localhost' || host === '0.0.0.0') return false;
  if (host === '::1' || host === '[::1]') return false;
  // IPv4 private ranges (10/8, 127/8, 169.254/16, 192.168/16, 172.16-31/12, 0/8)
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [_, a, b] = v4.map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  // IPv6: block loopback and unique-local (fc00::/7) and link-local (fe80::/10)
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
  // Block ".internal" / ".local" suffix commonly used for private services
  if (host.endsWith('.internal') || host.endsWith('.local')) return false;
  return true;
}

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
          partialMode: true,
          useGenericAdapter: true,
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

      // NUNCA incluir webhookToken — solo se devuelve una vez en generateToken.
      const system = await prisma.apiSystem.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          description: true,
          slug: true,
          mode: true,
          isActive: true,
          partialMode: true,
          useGenericAdapter: true,
          createdAt: true,
          updatedAt: true,
          configurations: {
            include: { game: true }
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
      const { name, description, slug, mode, isActive, partialMode, useGenericAdapter } = req.body;

      if (!name || !slug) {
        return res.status(400).json({ error: 'El nombre y el slug son requeridos' });
      }

      if (!SLUG_REGEX.test(slug)) {
        return res.status(400).json({ error: 'Slug inválido. Solo a-z, 0-9, _ y - (máx 64)' });
      }

      if (partialMode !== undefined && !PARTIAL_MODES.includes(partialMode)) {
        return res.status(400).json({ error: 'partialMode inválido. Use NONE, DROP o SPLIT' });
      }

      const system = await prisma.apiSystem.create({
        data: {
          name,
          description,
          slug,
          mode: mode || 'PULL',
          isActive: isActive !== undefined ? isActive : true,
          partialMode: partialMode || 'NONE',
          useGenericAdapter: useGenericAdapter !== undefined ? !!useGenericAdapter : false
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
      const { name, description, slug, mode, isActive, partialMode, useGenericAdapter } = req.body;

      const data = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (slug !== undefined) {
        if (!SLUG_REGEX.test(slug)) {
          return res.status(400).json({ error: 'Slug inválido. Solo a-z, 0-9, _ y - (máx 64)' });
        }
        data.slug = slug;
      }
      if (mode !== undefined) data.mode = mode;
      if (isActive !== undefined) data.isActive = isActive;
      if (partialMode !== undefined) {
        if (!PARTIAL_MODES.includes(partialMode)) {
          return res.status(400).json({ error: 'partialMode inválido. Use NONE, DROP o SPLIT' });
        }
        data.partialMode = partialMode;
      }
      if (useGenericAdapter !== undefined) data.useGenericAdapter = !!useGenericAdapter;

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

  /**
   * Asegura credenciales (token webhook + usuario portal) y genera la guía de
   * integración (.docx) con esas credenciales embebidas.
   *
   * Idempotente: si ya hay token/usuario, los reutiliza (la contraseña del
   * portal NO se puede recuperar — solo se incluye en el doc cuando se acaba de
   * crear el usuario en esta llamada). Devuelve el doc en base64 + lo generado.
   */
  async generateIntegrationDoc(req, res) {
    try {
      const { id } = req.params;

      const system = await prisma.apiSystem.findUnique({ where: { id } });
      if (!system) return res.status(404).json({ error: 'Proveedor no encontrado' });
      if (system.mode !== 'PUSH') {
        return res.status(400).json({ error: 'Solo proveedores PUSH tienen documento de integración' });
      }

      const generated = { tokenCreated: false, portalCreated: false };

      // 1. Asegurar token webhook.
      let token = system.webhookToken;
      if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        await prisma.apiSystem.update({ where: { id }, data: { webhookToken: token } });
        generated.tokenCreated = true;
        generated.token = token; // se devuelve una sola vez
        logger.info(`Token webhook generado (via doc) para ${system.slug} (${id})`);
      }

      // 2. Asegurar usuario portal.
      let portalUser = null;
      let portalPass = null;
      const existingPortal = await prisma.user.findFirst({
        where: { apiSystemId: id, role: 'PROVIDER' },
        select: { username: true },
      });
      if (existingPortal) {
        portalUser = existingPortal.username; // contraseña desconocida (bcrypt)
      } else {
        // Username: slug; si está tomado, slug-portal, slug-portal-2, ...
        let base = system.slug.length >= 3 ? system.slug : `${system.slug}-portal`;
        let candidate = base;
        let n = 1;
        // eslint-disable-next-line no-await-in-loop
        while (await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })) {
          n += 1;
          candidate = `${base}-${n}`;
        }
        portalUser = candidate;
        portalPass = `${system.slug.slice(0, 3).toUpperCase()}-${crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12)}`;
        const hashed = await bcrypt.hash(portalPass, 10);
        await prisma.user.create({
          data: {
            username: portalUser,
            email: `portal-${system.slug}@internal.tote`,
            password: hashed,
            role: 'PROVIDER',
            apiSystemId: id,
            isActive: true,
          },
        });
        generated.portalCreated = true;
        generated.portalUser = portalUser;
        generated.portalPass = portalPass;
        logger.info(`Usuario portal creado (via doc) para ${system.slug} (${id}): ${portalUser}`);
      }

      // 3. Construir el documento.
      const buffer = await buildIntegrationDoc({
        providerName: system.name,
        slug: system.slug,
        endpoint: `${WEBHOOK_PUBLIC_BASE}/${system.slug}`,
        token,
        portalUrl: PORTAL_LOGIN_URL,
        portalUser,
        portalPass, // solo presente si se creó en esta llamada
        partialMode: system.partialMode || 'NONE',
      });

      const filename = `Webhook-Integracion-${system.name.replace(/[^A-Za-z0-9]+/g, '-')}.docx`;
      return res.json({
        filename,
        docBase64: buffer.toString('base64'),
        generated,
      });
    } catch (error) {
      logger.error('Error generando documento de integración:', error);
      return res.status(500).json({ error: 'Error al generar el documento' });
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
      let hasCustomFile = false;
      try {
        await access(adapterPath);
        hasCustomFile = true;
      } catch {
        hasCustomFile = false;
      }
      // El conector genérico también deja el proveedor "listo" sin archivo custom.
      const source = hasCustomFile ? 'custom' : (system.useGenericAdapter ? 'generic' : 'none');
      const adapterReady = source !== 'none';
      res.json({ adapterReady, source, slug: system.slug, mode: system.mode });
    } catch (error) {
      logger.error('Error verificando adapter status:', error);
      res.status(500).json({ error: 'Error al verificar adapter' });
    }
  }

  async createPortalUser(req, res) {
    try {
      const { id } = req.params;
      let { username, password } = req.body || {};
      if (typeof username === 'string') username = username.trim().toLowerCase();

      if (!username || typeof username !== 'string' || username.length < 3) {
        return res.status(400).json({ error: 'Username inválido (mínimo 3 caracteres)' });
      }
      if (!password || typeof password !== 'string' || password.length < 10) {
        return res.status(400).json({ error: 'Password debe tener al menos 10 caracteres' });
      }

      const system = await prisma.apiSystem.findUnique({ where: { id } });
      if (!system) return res.status(404).json({ error: 'Proveedor no encontrado' });
      if (system.mode !== 'PUSH') {
        return res.status(400).json({ error: 'Solo proveedores PUSH pueden tener portal' });
      }

      // Enforce one portal user per ApiSystem
      const existingPortal = await prisma.user.findFirst({
        where: { apiSystemId: id, role: 'PROVIDER' },
      });
      if (existingPortal) {
        return res.status(409).json({ error: 'Este proveedor ya tiene un usuario portal. Use reset password.' });
      }

      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) return res.status(409).json({ error: 'Username ya existe' });

      const hashedPassword = await bcrypt.hash(password, 10);
      const email = `portal-${system.slug}@internal.tote`;
      try {
        const user = await prisma.user.create({
          data: {
            username,
            email,
            password: hashedPassword,
            role: 'PROVIDER',
            apiSystemId: id,
            isActive: true,
          },
          select: { id: true, username: true, role: true, apiSystemId: true, createdAt: true },
        });
        logger.info(`Portal user creado para apiSystem ${id}: user=${user.id}`);
        return res.status(201).json(user);
      } catch (createErr) {
        if (createErr.code === 'P2002') {
          return res.status(409).json({ error: 'Usuario ya existe (colisión de unique)' });
        }
        throw createErr;
      }
    } catch (error) {
      logger.error('Error en createPortalUser:', error);
      return res.status(500).json({ error: 'Error interno' });
    }
  }

  async resetPortalUserPassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body || {};
      if (!password || typeof password !== 'string' || password.length < 10) {
        return res.status(400).json({ error: 'Password debe tener al menos 10 caracteres' });
      }

      const system = await prisma.apiSystem.findUnique({ where: { id } });
      if (!system) return res.status(404).json({ error: 'Proveedor no encontrado' });
      if (system.mode !== 'PUSH') {
        return res.status(400).json({ error: 'Solo proveedores PUSH pueden tener portal' });
      }

      const user = await prisma.user.findFirst({
        where: { apiSystemId: id, role: 'PROVIDER' },
      });
      if (!user) return res.status(404).json({ error: 'No hay usuario portal para este proveedor' });

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
      logger.info(`Password reseteado para portal user ${user.id} (proveedor ${id})`);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Error en resetPortalUserPassword:', error);
      return res.status(500).json({ error: 'Error interno' });
    }
  }

  async getPortalUser(req, res) {
    try {
      const { id } = req.params;
      const user = await prisma.user.findFirst({
        where: { apiSystemId: id, role: 'PROVIDER' },
        select: { id: true, username: true, isActive: true, createdAt: true },
      });
      return res.json({ exists: !!user, user: user || null });
    } catch (error) {
      logger.error('Error en getPortalUser:', error);
      return res.status(500).json({ error: 'Error interno' });
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

      // Bloquear SSRF: rechazar baseUrls que apunten a hosts privados/internos
      if (!isPublicHttpUrl(configuration.baseUrl)) {
        return res.status(400).json({
          success: false,
          error: 'baseUrl debe ser una URL pública (http/https, no loopback ni red privada)'
        });
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
        signal: AbortSignal.timeout(10000),
        redirect: 'manual'
      });

      // No reflejar el body al cliente — solo estado. Evita SSRF "full-read"
      // y minimiza fuga de datos del proveedor externo.
      res.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText
      });
    } catch (error) {
      logger.error('Error probando configuración API:', error);
      res.status(500).json({
        success: false,
        error: 'Test failed'
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

  // Intentos de webhook rechazados por auth (401) — registrados por
  // webhook-auth.middleware ANTES de crear un WebhookLog. Para diagnosticar
  // proveedores que mandan token incorrecto / faltante / firma inválida.
  async getWebhookAuthFailures(req, res) {
    try {
      const { slug, page = '1', limit = '50' } = req.query;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const where = {};
      if (slug) where.slug = slug;

      const [failures, total] = await Promise.all([
        prisma.webhookAuthFailure.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.webhookAuthFailure.count({ where }),
      ]);

      res.json({
        data: failures,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: skip + failures.length < total,
          hasPrev: pageNum > 1,
        },
      });
    } catch (error) {
      logger.error('Error obteniendo webhook auth failures:', error);
      res.status(500).json({ error: 'Error al obtener intentos de auth fallidos' });
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
