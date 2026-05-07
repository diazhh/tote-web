import { prisma } from '../lib/prisma.js';

// Allowlist espejo del enum del frontend (frontend/hooks/usePageVisit.js).
// Cualquier pageType fuera de esta lista se rechaza.
const ALLOWED_PAGE_TYPES = new Set([
  'LANDING', 'ADMIN_DASHBOARD', 'ADMIN_SORTEOS', 'ADMIN_JUEGOS',
  'ADMIN_USUARIOS', 'ADMIN_JUGADORES', 'ADMIN_DEPOSITOS', 'ADMIN_RETIROS',
  'ADMIN_TICKETS', 'ADMIN_REPORTES', 'ADMIN_TELEGRAM', 'ADMIN_WHATSAPP',
  'ADMIN_FACEBOOK', 'ADMIN_INSTAGRAM', 'ADMIN_TIKTOK', 'ADMIN_BOTS',
  'ADMIN_PAUSAS', 'ADMIN_CONFIG', 'ADMIN_PERFIL', 'ADMIN_CUENTAS',
  'ADMIN_PAGO_MOVIL', 'PLAYER_DASHBOARD', 'PLAYER_JUGAR', 'PLAYER_BALANCE',
  'PLAYER_CUENTAS', 'PLAYER_DEPOSITOS', 'PLAYER_RETIROS',
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_PATH = 256;
const MAX_REFERRER = 1024;
const MAX_USER_AGENT = 512;
const MAX_SESSION_ID = 128;
const MAX_DURATION_SECONDS = 24 * 60 * 60; // 24h

const pageVisitController = {
  async trackVisit(req, res) {
    try {
      const { pageType, pagePath, sessionId, referrer } = req.body || {};
      const userId = req.user?.id || null;

      // Validación estricta — el endpoint es público (optionalAuth)
      if (typeof pageType !== 'string' || !ALLOWED_PAGE_TYPES.has(pageType)) {
        return res.status(400).json({ error: 'pageType inválido' });
      }
      if (typeof pagePath !== 'string' || pagePath.length === 0 || pagePath.length > MAX_PAGE_PATH) {
        return res.status(400).json({ error: `pagePath requerido (1-${MAX_PAGE_PATH} chars)` });
      }
      if (sessionId !== undefined && sessionId !== null && (typeof sessionId !== 'string' || sessionId.length > MAX_SESSION_ID)) {
        return res.status(400).json({ error: 'sessionId inválido' });
      }
      if (referrer !== undefined && referrer !== null && (typeof referrer !== 'string' || referrer.length > MAX_REFERRER)) {
        return res.status(400).json({ error: 'referrer inválido' });
      }

      const userAgent = (req.headers['user-agent'] || '').toString().slice(0, MAX_USER_AGENT);
      const ipAddress = req.ip || req.connection?.remoteAddress || null;

      const visit = await prisma.pageVisit.create({
        data: {
          userId,
          pageType,
          pagePath,
          userAgent: userAgent || null,
          ipAddress,
          referrer: referrer || null,
          sessionId: sessionId || null,
        },
        select: { id: true },
      });

      res.status(201).json({
        success: true,
        visitId: visit.id
      });
    } catch (error) {
      console.error('Error tracking visit:', error);
      res.status(500).json({ error: 'Error al registrar la visita' });
    }
  },

  async updateVisitDuration(req, res) {
    try {
      const { visitId } = req.params;
      const { duration, sessionId } = req.body || {};

      // Validar formato de visitId (Prisma lanzaría error feo con UUID malformado)
      if (typeof visitId !== 'string' || !UUID_REGEX.test(visitId)) {
        return res.status(400).json({ error: 'visitId inválido' });
      }

      // Validar duration: número, no negativo, no absurdo
      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_SECONDS) {
        return res.status(400).json({ error: `duration debe ser número entre 0 y ${MAX_DURATION_SECONDS}` });
      }

      // Ownership: la duración solo puede actualizarse por el dueño de la visita.
      // Aceptamos dos pruebas:
      //   - sessionId del body coincide con el de la visita (caso normal del browser)
      //   - usuario autenticado coincide con visit.userId (caso admin/jugador logueado)
      const visit = await prisma.pageVisit.findUnique({
        where: { id: visitId },
        select: { id: true, sessionId: true, userId: true },
      });
      if (!visit) {
        return res.status(404).json({ error: 'Visita no encontrada' });
      }

      const sessionMatches = visit.sessionId && typeof sessionId === 'string' && sessionId === visit.sessionId;
      const userMatches = visit.userId && req.user?.id && req.user.id === visit.userId;
      if (!sessionMatches && !userMatches) {
        return res.status(403).json({ error: 'No autorizado para modificar esta visita' });
      }

      await prisma.pageVisit.update({
        where: { id: visitId },
        data: { duration: Math.floor(duration) },
        select: { id: true },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating visit duration:', error);
      res.status(500).json({ error: 'Error al actualizar la duración' });
    }
  },

  async getVisitStats(req, res) {
    try {
      const { startDate, endDate, pageType, userId } = req.query;

      const where = {};

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          const s = new Date(startDate);
          if (isNaN(s.getTime())) return res.status(400).json({ error: 'startDate inválido' });
          where.createdAt.gte = s;
        }
        if (endDate) {
          const e = new Date(endDate);
          if (isNaN(e.getTime())) return res.status(400).json({ error: 'endDate inválido' });
          where.createdAt.lte = e;
        }
      } else {
        // Default: últimos 30 días si no se pasa rango (evita full-table scan)
        where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      }

      if (pageType) {
        if (!ALLOWED_PAGE_TYPES.has(pageType)) {
          return res.status(400).json({ error: 'pageType inválido' });
        }
        where.pageType = pageType;
      }
      if (userId) {
        if (!UUID_REGEX.test(userId)) {
          return res.status(400).json({ error: 'userId inválido' });
        }
        where.userId = userId;
      }

      const [totalVisits, visitsByPage, visitsByUser, recentVisits] = await Promise.all([
        prisma.pageVisit.count({ where }),
        
        prisma.pageVisit.groupBy({
          by: ['pageType'],
          where,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        
        prisma.pageVisit.groupBy({
          by: ['userId'],
          where: { ...where, userId: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }),
        
        prisma.pageVisit.findMany({
          where,
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
              },
            },
          },
        }),
      ]);

      const avgDuration = await prisma.pageVisit.aggregate({
        where: { ...where, duration: { not: null } },
        _avg: { duration: true },
      });

      res.json({
        totalVisits,
        visitsByPage: visitsByPage.map(v => ({
          pageType: v.pageType,
          count: v._count.id,
        })),
        visitsByUser: visitsByUser.map(v => ({
          userId: v.userId,
          count: v._count.id,
        })),
        avgDuration: avgDuration._avg.duration || 0,
        recentVisits,
      });
    } catch (error) {
      console.error('Error getting visit stats:', error);
      res.status(500).json({ 
        error: 'Error al obtener estadísticas de visitas',
        details: error.message 
      });
    }
  },

  async getVisitsByDateRange(req, res) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate y endDate son requeridos' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Fechas inválidas' });
      }
      if (end < start) {
        return res.status(400).json({ error: 'endDate debe ser >= startDate' });
      }

      // Limitar el rango para evitar OOM si la tabla creció mucho.
      const MAX_DAYS = 90;
      const rangeDays = (end - start) / (1000 * 60 * 60 * 24);
      if (rangeDays > MAX_DAYS) {
        return res.status(400).json({ error: `Rango máximo: ${MAX_DAYS} días` });
      }

      // groupBy en allowlist — protege date_trunc de input arbitrario.
      const truncMap = { hour: 'hour', day: 'day', month: 'month' };
      const trunc = truncMap[groupBy];
      if (!trunc) {
        return res.status(400).json({ error: 'groupBy debe ser hour|day|month' });
      }

      // Agregación en SQL — evita traer N millones de filas a Node.
      // Parámetros: $1=trunc no se parametriza (validado contra allowlist),
      // $2=start, $3=end. Prisma.sql con interpolación literal solo del trunc.
      const rows = await prisma.$queryRawUnsafe(
        `SELECT
           to_char(date_trunc('${trunc}', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI') AS bucket,
           "pageType",
           COUNT(*)::int AS count
         FROM "PageVisit"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY bucket, "pageType"
         ORDER BY bucket ASC`,
        start,
        end
      );

      // Reformatear: agrupar por bucket con total + byPage
      const grouped = {};
      for (const row of rows) {
        const key = trunc === 'day'
          ? row.bucket.slice(0, 10)
          : trunc === 'month'
            ? row.bucket.slice(0, 7)
            : row.bucket; // hour: YYYY-MM-DD HH:MM
        if (!grouped[key]) grouped[key] = { date: key, total: 0, byPage: {} };
        grouped[key].total += row.count;
        grouped[key].byPage[row.pageType] = (grouped[key].byPage[row.pageType] || 0) + row.count;
      }

      const result = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
      res.json(result);
    } catch (error) {
      console.error('Error getting visits by date range:', error);
      res.status(500).json({ error: 'Error al obtener visitas por rango de fechas' });
    }
  },
};

export default pageVisitController;
