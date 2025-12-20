import { prisma } from '../lib/prisma.js';

const pageVisitController = {
  async trackVisit(req, res) {
    try {
      const { pageType, pagePath, sessionId, referrer } = req.body;
      const userId = req.user?.id || null;
      
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

      if (!pageType || !pagePath) {
        return res.status(400).json({ 
          error: 'pageType y pagePath son requeridos' 
        });
      }

      const visit = await prisma.pageVisit.create({
        data: {
          userId,
          pageType,
          pagePath,
          userAgent,
          ipAddress,
          referrer,
          sessionId,
        },
      });

      res.status(201).json({ 
        success: true,
        visitId: visit.id 
      });
    } catch (error) {
      console.error('Error tracking visit:', error);
      res.status(500).json({ 
        error: 'Error al registrar la visita',
        details: error.message 
      });
    }
  },

  async updateVisitDuration(req, res) {
    try {
      const { visitId } = req.params;
      const { duration } = req.body;

      if (!duration || duration < 0) {
        return res.status(400).json({ 
          error: 'duration debe ser un número positivo' 
        });
      }

      const visit = await prisma.pageVisit.update({
        where: { id: visitId },
        data: { duration },
      });

      res.json({ 
        success: true,
        visit 
      });
    } catch (error) {
      console.error('Error updating visit duration:', error);
      res.status(500).json({ 
        error: 'Error al actualizar la duración de la visita',
        details: error.message 
      });
    }
  },

  async getVisitStats(req, res) {
    try {
      const { startDate, endDate, pageType, userId } = req.query;

      const where = {};
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }
      
      if (pageType) where.pageType = pageType;
      if (userId) where.userId = userId;

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
        return res.status(400).json({ 
          error: 'startDate y endDate son requeridos' 
        });
      }

      const visits = await prisma.pageVisit.findMany({
        where: {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        select: {
          createdAt: true,
          pageType: true,
        },
      });

      const groupedData = {};
      visits.forEach(visit => {
        const date = new Date(visit.createdAt);
        let key;
        
        if (groupBy === 'hour') {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
        } else if (groupBy === 'day') {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        } else if (groupBy === 'month') {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        if (!groupedData[key]) {
          groupedData[key] = { total: 0, byPage: {} };
        }
        
        groupedData[key].total++;
        groupedData[key].byPage[visit.pageType] = (groupedData[key].byPage[visit.pageType] || 0) + 1;
      });

      const result = Object.entries(groupedData).map(([date, data]) => ({
        date,
        total: data.total,
        byPage: data.byPage,
      })).sort((a, b) => a.date.localeCompare(b.date));

      res.json(result);
    } catch (error) {
      console.error('Error getting visits by date range:', error);
      res.status(500).json({ 
        error: 'Error al obtener visitas por rango de fechas',
        details: error.message 
      });
    }
  },
};

export default pageVisitController;
