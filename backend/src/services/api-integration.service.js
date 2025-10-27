import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * Servicio para integración con APIs externas de ventas
 */
class ApiIntegrationService {
  /**
   * Sincronizar planificación de sorteos con API SRQ
   * @param {Date} date - Fecha para sincronizar
   */
  async syncSRQPlanning(date) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      logger.info(`🔄 Sincronizando planificación SRQ para ${dateStr}...`);

      // Obtener todas las configuraciones de planificación activas
      const planningConfigs = await prisma.apiConfiguration.findMany({
        where: {
          type: 'PLANNING',
          isActive: true
        },
        include: {
          apiSystem: true,
          game: true
        }
      });

      let totalMapped = 0;
      let totalSkipped = 0;

      for (const config of planningConfigs) {
        try {
          // Llamar a la API de SRQ
          const url = `${config.baseUrl}${dateStr}&token=${config.token}`;
          logger.debug(`Consultando: ${config.baseUrl}${dateStr}`);

          const response = await fetch(url);
          const data = await response.json();

          if (data.result === 'error') {
            logger.error(`Error en API SRQ para juego ${config.game.name}:`, data.errors);
            continue;
          }

          // Procesar cada sorteo externo
          if (data.loteries && Array.isArray(data.loteries)) {
            for (const externalDraw of data.loteries) {
              const mapped = await this.mapExternalDraw(
                config.id,
                config.gameId,
                externalDraw,
                date
              );

              if (mapped) {
                totalMapped++;
              } else {
                totalSkipped++;
              }
            }
          }
        } catch (error) {
          logger.error(`Error procesando config ${config.name}:`, error.message);
        }
      }

      logger.info(`✅ Sincronización SRQ completada: ${totalMapped} mapeados, ${totalSkipped} saltados`);
      return { mapped: totalMapped, skipped: totalSkipped };
    } catch (error) {
      logger.error('❌ Error en syncSRQPlanning:', error);
      throw error;
    }
  }

  /**
   * Mapear un sorteo externo con uno local
   * @param {string} apiConfigId - ID de la configuración de API
   * @param {string} gameId - ID del juego
   * @param {object} externalDraw - Datos del sorteo externo
   * @param {Date} date - Fecha del sorteo
   */
  async mapExternalDraw(apiConfigId, gameId, externalDraw, date) {
    try {
      // Verificar si ya existe el mapping
      const existingMapping = await prisma.apiDrawMapping.findUnique({
        where: {
          externalDrawId: externalDraw.id.toString()
        }
      });

      if (existingMapping) {
        logger.debug(`Mapping ya existe para sorteo externo ${externalDraw.id}`);
        return false;
      }

      // Buscar el sorteo local correspondiente (HARDCODED por nombre/hora)
      const localDraw = await this.findMatchingLocalDraw(
        gameId,
        externalDraw,
        date
      );

      if (!localDraw) {
        logger.warn(`No se encontró sorteo local para mapear con ${externalDraw.id}`);
        return false;
      }

      // Crear el mapping
      await prisma.apiDrawMapping.create({
        data: {
          apiConfigId,
          drawId: localDraw.id,
          externalDrawId: externalDraw.id.toString()
        }
      });

      logger.debug(`✅ Mapeado: sorteo externo ${externalDraw.id} → draw ${localDraw.id}`);
      return true;
    } catch (error) {
      logger.error(`Error mapeando sorteo externo ${externalDraw.id}:`, error.message);
      return false;
    }
  }

  /**
   * Encontrar el sorteo local que corresponde al sorteo externo
   * HARDCODED: Mapeo por hora del sorteo
   */
  async findMatchingLocalDraw(gameId, externalDraw, date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Obtener todos los sorteos del día para este juego
      const draws = await prisma.draw.findMany({
        where: {
          gameId,
          scheduledAt: {
            gte: startOfDay,
            lt: endOfDay
          },
          status: 'SCHEDULED'
        },
        orderBy: {
          scheduledAt: 'asc'
        }
      });

      if (draws.length === 0) {
        return null;
      }

      // Parsear la hora del sorteo externo
      const drawTime = this.parseDrawTime(externalDraw.time || externalDraw.hour || externalDraw.name);
      
      if (!drawTime) {
        logger.warn(`No se pudo parsear la hora del sorteo externo ${externalDraw.id}`);
        return null;
      }

      // Buscar el sorteo que coincida con la hora
      const targetTime = new Date(date);
      targetTime.setHours(drawTime.hours, drawTime.minutes, 0, 0);

      // Buscar el sorteo más cercano a la hora objetivo
      let closestDraw = null;
      let minDiff = Infinity;

      for (const draw of draws) {
        const diff = Math.abs(draw.scheduledAt.getTime() - targetTime.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestDraw = draw;
        }
      }

      // Solo aceptar si la diferencia es menor a 5 minutos
      if (minDiff < 5 * 60 * 1000) {
        return closestDraw;
      }

      return null;
    } catch (error) {
      logger.error('Error en findMatchingLocalDraw:', error);
      return null;
    }
  }

  /**
   * Parsear hora del sorteo externo
   * Formatos soportados: "08 AM", "02 PM", "14:00", "8:00 AM"
   */
  parseDrawTime(timeStr) {
    if (!timeStr) return null;

    try {
      const str = timeStr.trim().toUpperCase();
      
      // Formato: "08 AM" o "02 PM"
      const amPmMatch = str.match(/(\d{1,2})\s*(AM|PM)/);
      if (amPmMatch) {
        let hours = parseInt(amPmMatch[1]);
        const period = amPmMatch[2];
        
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }
        
        return { hours, minutes: 0 };
      }

      // Formato: "14:00" o "8:30"
      const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        return {
          hours: parseInt(timeMatch[1]),
          minutes: parseInt(timeMatch[2])
        };
      }

      return null;
    } catch (error) {
      logger.error('Error parseando hora:', timeStr, error);
      return null;
    }
  }

  /**
   * Importar tickets vendidos de un sorteo desde la API SRQ
   * @param {string} drawId - ID del Draw
   */
  async importSRQTickets(drawId) {
    try {
      logger.info(`🎫 Importando tickets para draw ${drawId}...`);

      // Obtener el mapping del sorteo
      const mapping = await prisma.apiDrawMapping.findFirst({
        where: {
          drawId
        },
        include: {
          apiConfig: {
            include: {
              game: true
            }
          },
          draw: true
        }
      });

      if (!mapping) {
        logger.warn(`No hay mapping para draw ${drawId}`);
        return { imported: 0, skipped: 0 };
      }

      // Obtener la configuración de ventas para este juego
      const salesConfig = await prisma.apiConfiguration.findFirst({
        where: {
          gameId: mapping.apiConfig.gameId,
          type: 'SALES',
          isActive: true
        }
      });

      if (!salesConfig) {
        logger.warn(`No hay configuración de ventas para juego ${mapping.apiConfig.game.name}`);
        return { imported: 0, skipped: 0 };
      }

      // Llamar a la API de tickets
      const url = `${salesConfig.baseUrl}${mapping.externalDrawId}?token=${salesConfig.token}`;
      logger.debug(`Consultando tickets: ${salesConfig.baseUrl}${mapping.externalDrawId}`);

      const response = await fetch(url);
      const data = await response.json();

      if (data.result === 'error') {
        logger.error(`Error obteniendo tickets:`, data.errors);
        return { imported: 0, skipped: 0 };
      }

      // Procesar tickets
      let imported = 0;
      let skipped = 0;

      if (data.tickets && Array.isArray(data.tickets)) {
        for (const ticket of data.tickets) {
          const saved = await this.saveTicket(mapping.id, mapping.apiConfig.gameId, ticket);
          if (saved) {
            imported++;
          } else {
            skipped++;
          }
        }
      }

      logger.info(`✅ Tickets importados para draw ${drawId}: ${imported} guardados, ${skipped} saltados`);
      return { imported, skipped };
    } catch (error) {
      logger.error('❌ Error en importSRQTickets:', error);
      throw error;
    }
  }

  /**
   * Guardar un ticket en la base de datos
   */
  async saveTicket(mappingId, gameId, ticket) {
    try {
      // Buscar el game_item por número
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId,
          number: ticket.number.toString()
        }
      });

      if (!gameItem) {
        logger.warn(`No se encontró gameItem para número ${ticket.number} en juego ${gameId}`);
        return false;
      }

      // Verificar si ya existe el ticket (evitar duplicados)
      const existing = await prisma.externalTicket.findFirst({
        where: {
          mappingId,
          gameItemId: gameItem.id,
          amount: parseFloat(ticket.amount)
        }
      });

      if (existing) {
        return false; // Ya existe
      }

      // Crear el registro de ticket
      await prisma.externalTicket.create({
        data: {
          mappingId,
          gameItemId: gameItem.id,
          amount: parseFloat(ticket.amount),
          externalData: {
            taquillaId: ticket.taquilla_id,
            grupoId: ticket.grupo_id,
            bancaId: ticket.banca_id,
            comercialId: ticket.comercial_id,
            date: ticket.date
          }
        }
      });

      return true;
    } catch (error) {
      logger.error('Error guardando ticket:', error.message);
      return false;
    }
  }

  /**
   * Obtener estadísticas de ventas de un sorteo
   * @param {string} drawId - ID del Draw
   */
  async getDrawSalesStats(drawId) {
    try {
      const mapping = await prisma.apiDrawMapping.findFirst({
        where: { drawId },
        include: {
          tickets: {
            include: {
              gameItem: true
            }
          }
        }
      });

      if (!mapping) {
        return null;
      }

      const totalSales = mapping.tickets.reduce((sum, ticket) => {
        return sum + parseFloat(ticket.amount);
      }, 0);

      const ticketsByItem = {};
      mapping.tickets.forEach(ticket => {
        const key = ticket.gameItem.number;
        if (!ticketsByItem[key]) {
          ticketsByItem[key] = {
            number: ticket.gameItem.number,
            name: ticket.gameItem.name,
            amount: 0,
            count: 0
          };
        }
        ticketsByItem[key].amount += parseFloat(ticket.amount);
        ticketsByItem[key].count += 1;
      });

      return {
        totalSales,
        totalTickets: mapping.tickets.length,
        ticketsByItem: Object.values(ticketsByItem)
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de ventas:', error);
      return null;
    }
  }
}

export default new ApiIntegrationService();
