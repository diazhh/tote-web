import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import providerEntitiesService from './provider-entities.service.js';
import { startOfDayInCaracas, endOfDayInCaracas } from '../lib/dateUtils.js';

/**
 * Servicio para integración con APIs externas de ventas
 */
class ApiIntegrationService {
  /**
   * Sincronizar planificación de sorteos con API SRQ
   * Mapea sorteos externos con locales POR ORDEN (1:1)
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
      let totalWinners = 0;

      for (const config of planningConfigs) {
        try {
          // Llamar a la API de SRQ (header APIKEY)
          const url = `${config.baseUrl}${dateStr}`;
          logger.debug(`Consultando: ${url}`);

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'APIKEY': config.token,
              'Content-Type': 'application/json',
            },
          });
          const data = await response.json();

          if (data.result === 'error') {
            logger.error(`Error en API SRQ para juego ${config.game.name}:`, data.errors);
            continue;
          }

          // SRQ devuelve array directamente ordenado por hora
          const externalDraws = Array.isArray(data) ? data : (data.loteries || []);
          
          if (externalDraws.length === 0) {
            logger.warn(`No hay sorteos externos para ${config.game.name}`);
            continue;
          }

          // Obtener sorteos locales del día para este juego, ordenados por hora
          const { getVenezuelaDateAsUTC } = await import('../lib/dateUtils.js');
          const drawDate = getVenezuelaDateAsUTC(date);
          
          const localDraws = await prisma.draw.findMany({
            where: {
              gameId: config.gameId,
              drawDate: drawDate
            },
            orderBy: [
              { drawDate: 'asc' },
              { drawTime: 'asc' }
            ]
          });

          if (localDraws.length === 0) {
            logger.warn(`No hay sorteos locales para ${config.game.name} en ${dateStr}`);
            totalSkipped += externalDraws.length;
            continue;
          }

          // Mapear 1:1 por orden
          const minLength = Math.min(externalDraws.length, localDraws.length);
          
          for (let i = 0; i < minLength; i++) {
            const externalDraw = externalDraws[i];
            const localDraw = localDraws[i];
            
            // SRQ usa sorteoID como identificador
            const externalId = (externalDraw.sorteoID || externalDraw.id).toString();
            
            // Verificar si ya existe el mapping
            const existingMapping = await prisma.apiDrawMapping.findFirst({
              where: {
                OR: [
                  { externalDrawId: externalId },
                  { drawId: localDraw.id, apiConfigId: config.id }
                ]
              }
            });

            if (existingMapping) {
              logger.debug(`Mapping ya existe: ${externalId} ↔ ${localDraw.id}`);
              totalSkipped++;
              
              // Verificar si necesitamos actualizar el ganador
              if (externalDraw.ganador && !localDraw.winnerItemId) {
                const updated = await this.syncDrawWinner(localDraw.id, externalDraw.ganador, config.gameId);
                if (updated) totalWinners++;
              }
              continue;
            }

            // Crear el mapping
            await prisma.apiDrawMapping.create({
              data: {
                apiConfigId: config.id,
                drawId: localDraw.id,
                externalDrawId: externalId
              }
            });

            // drawTime ya está en formato "HH:MM:SS" hora Venezuela
            const [hours, mins] = localDraw.drawTime.split(':');
            const hora = `${hours}:${mins}`;
            logger.info(`✅ Mapeado: ${config.game.name} ${hora} → SRQ ${externalId} (${externalDraw.descripcion || ''})`);
            totalMapped++;
            
            // Sincronizar ganador si existe
            if (externalDraw.ganador) {
              const updated = await this.syncDrawWinner(localDraw.id, externalDraw.ganador, config.gameId);
              if (updated) totalWinners++;
            }
          }

          // Reportar si hay diferencia en cantidad
          if (externalDraws.length !== localDraws.length) {
            logger.warn(
              `⚠️ ${config.game.name}: ${externalDraws.length} sorteos SRQ vs ${localDraws.length} locales`
            );
          }

        } catch (error) {
          logger.error(`Error procesando config ${config.name}:`, error.message);
        }
      }

      logger.info(`✅ Sincronización SRQ completada: ${totalMapped} mapeados, ${totalSkipped} saltados, ${totalWinners} ganadores`);
      return { mapped: totalMapped, skipped: totalSkipped, winners: totalWinners };
    } catch (error) {
      logger.error('❌ Error en syncSRQPlanning:', error);
      throw error;
    }
  }

  /**
   * Importar tickets vendidos de un sorteo desde la API SRQ
   * @param {string} drawId - ID del Draw
   * @param {boolean} clearExisting - Si debe limpiar tickets existentes antes de importar
   */
  async importSRQTickets(drawId, clearExisting = true) {
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
              game: true,
              apiSystem: true
            }
          },
          draw: true
        }
      });

      if (!mapping) {
        logger.warn(`No hay mapping para draw ${drawId}`);
        return { imported: 0, skipped: 0, deleted: 0 };
      }

      // Obtener la configuración de ventas para este juego
      const salesConfig = await prisma.apiConfiguration.findFirst({
        where: {
          gameId: mapping.apiConfig.gameId,
          type: 'SALES',
          isActive: true
        },
        include: {
          apiSystem: true
        }
      });

      if (!salesConfig) {
        logger.warn(`No hay configuración de ventas para juego ${mapping.apiConfig.game.name}`);
        return { imported: 0, skipped: 0, deleted: 0 };
      }

      // Limpiar tickets existentes antes de importar (para sincronización completa)
      let deleted = 0;
      if (clearExisting) {
        const deleteResult = await prisma.ticket.deleteMany({
          where: { 
            drawId,
            source: 'EXTERNAL_API'
          }
        });
        deleted = deleteResult.count;
        if (deleted > 0) {
          logger.info(`  🗑️ ${deleted} tickets externos anteriores eliminados para draw ${drawId}`);
        }
      }

      // Llamar a la API de tickets (header APIKEY)
      const url = `${salesConfig.baseUrl}${mapping.externalDrawId}`;
      logger.debug(`Consultando tickets: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'APIKEY': salesConfig.token,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();

      if (data.result === 'error') {
        logger.error(`Error obteniendo tickets:`, data.errors);
        return { imported: 0, skipped: 0, deleted };
      }

      // Procesar tickets - SRQ devuelve array directamente
      const ticketsData = Array.isArray(data) ? data : (data.tickets || []);
      
      // Obtener el apiSystemId para crear entidades
      const apiSystemId = salesConfig.apiSystemId || mapping.apiConfig.apiSystemId;

      // Agrupar tickets por ticketID
      const ticketsGrouped = await this.groupTicketsByExternalId(
        ticketsData, 
        mapping.apiConfig.gameId, 
        apiSystemId
      );

      let imported = 0;
      let skipped = 0;

      // Crear Ticket + TicketDetail para cada ticket agrupado
      for (const ticketGroup of ticketsGrouped) {
        const saved = await this.saveTicketWithDetails(drawId, ticketGroup);
        if (saved) {
          imported++;
        } else {
          skipped++;
        }
      }

      logger.info(`✅ Tickets importados para draw ${drawId}: ${imported} tickets (${ticketsGrouped.reduce((sum, t) => sum + t.details.length, 0)} jugadas), ${skipped} saltados, ${deleted} eliminados`);
      return { imported, skipped, deleted };
    } catch (error) {
      logger.error('❌ Error en importSRQTickets:', error);
      throw error;
    }
  }

  /**
   * Agrupar tickets de SRQ por ticketID
   * @param {Array} ticketsData - Array de tickets de SRQ
   * @param {string} gameId - ID del juego
   * @param {string} apiSystemId - ID del sistema API
   * @returns {Array} Tickets agrupados con sus detalles
   */
  async groupTicketsByExternalId(ticketsData, gameId, apiSystemId) {
    const grouped = new Map();

    for (const ticket of ticketsData) {
      // Ignorar tickets anulados
      if (ticket.anulado) {
        continue;
      }

      const ticketId = ticket.ticketID?.toString();
      if (!ticketId) {
        logger.warn('Ticket sin ticketID, ignorando');
        continue;
      }

      // Buscar el game_item por número
      const numero = ticket.numero?.toString() || ticket.number?.toString();
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId,
          number: numero.padStart(2, '0')
        }
      });

      if (!gameItem) {
        logger.warn(`No se encontró gameItem para número ${numero} en juego ${gameId}`);
        continue;
      }

      const amount = parseFloat(ticket.monto || ticket.amount || 0);

      // Si no existe el ticket en el mapa, crearlo
      if (!grouped.has(ticketId)) {
        // Asegurar que las entidades del proveedor existan
        let entityIds = null;
        if (apiSystemId && ticket.comercialID && ticket.bancaID && ticket.grupoID && ticket.taquillaID) {
          try {
            entityIds = await providerEntitiesService.ensureEntitiesExist(apiSystemId, {
              comercialID: ticket.comercialID,
              bancaID: ticket.bancaID,
              grupoID: ticket.grupoID,
              taquillaID: ticket.taquillaID
            });
          } catch (entityError) {
            logger.warn(`Error creando entidades para ticket ${ticketId}: ${entityError.message}`);
          }
        }

        grouped.set(ticketId, {
          externalTicketId: ticketId,
          providerData: {
            ticketID: ticketId,
            taquillaID: ticket.taquillaID,
            grupoID: ticket.grupoID,
            bancaID: ticket.bancaID,
            comercialID: ticket.comercialID,
            ...(entityIds && { entityIds })
          },
          details: []
        });
      }

      // Agregar el detalle al ticket
      grouped.get(ticketId).details.push({
        gameItemId: gameItem.id,
        amount,
        multiplier: gameItem.multiplier
      });
    }

    return Array.from(grouped.values());
  }

  /**
   * Guardar un ticket con sus detalles
   * @param {string} drawId - ID del sorteo
   * @param {Object} ticketData - Datos del ticket agrupado
   * @returns {boolean} True si se guardó correctamente
   */
  async saveTicketWithDetails(drawId, ticketData) {
    try {
      // Verificar si ya existe el ticket
      const existing = await prisma.ticket.findFirst({
        where: {
          drawId,
          source: 'EXTERNAL_API',
          externalTicketId: ticketData.externalTicketId
        }
      });

      if (existing) {
        return false; // Ya existe
      }

      // Calcular total
      const totalAmount = ticketData.details.reduce((sum, d) => sum + d.amount, 0);

      // Crear el ticket con sus detalles en una transacción
      await prisma.ticket.create({
        data: {
          drawId,
          source: 'EXTERNAL_API',
          externalTicketId: ticketData.externalTicketId,
          totalAmount,
          totalPrize: 0,
          status: 'ACTIVE',
          providerData: ticketData.providerData,
          details: {
            create: ticketData.details.map(detail => ({
              gameItemId: detail.gameItemId,
              amount: detail.amount,
              multiplier: detail.multiplier,
              prize: 0,
              status: 'ACTIVE'
            }))
          }
        }
      });

      return true;
    } catch (error) {
      logger.error(`Error guardando ticket ${ticketData.externalTicketId}:`, error.message);
      return false;
    }
  }


  /**
   * Sincronizar ganador de un sorteo desde SRQ
   * @param {string} drawId - ID del Draw
   * @param {string} ganadorStr - String del ganador (ej: "32 ARDILLA")
   * @param {string} gameId - ID del juego
   */
  async syncDrawWinner(drawId, ganadorStr, gameId) {
    try {
      if (!ganadorStr) return;

      // Extraer número del ganador (ej: "32 ARDILLA" -> "32")
      const match = ganadorStr.match(/^(\d+)/);
      if (!match) {
        logger.warn(`No se pudo extraer número de ganador: ${ganadorStr}`);
        return;
      }

      const winnerNumber = match[1].padStart(2, '0');

      // Buscar el GameItem correspondiente
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId,
          number: winnerNumber
        }
      });

      if (!gameItem) {
        logger.warn(`GameItem no encontrado: game=${gameId}, number=${winnerNumber}`);
        return;
      }

      // Actualizar el sorteo con el ganador
      await prisma.draw.update({
        where: { id: drawId },
        data: {
          winnerItemId: gameItem.id,
          status: 'DRAWN',
          drawnAt: new Date()
        }
      });

      logger.info(`🏆 Ganador sincronizado: ${winnerNumber} - ${gameItem.name}`);
      return true;
    } catch (error) {
      logger.error(`Error sincronizando ganador para draw ${drawId}:`, error.message);
      return false;
    }
  }

  /**
   * Obtener estadísticas de ventas de un sorteo
   * @param {string} drawId - ID del Draw
   */
  async getDrawSalesStats(drawId) {
    try {
      const tickets = await prisma.ticket.findMany({
        where: { 
          drawId,
          source: 'EXTERNAL_API'
        },
        include: {
          details: {
            include: {
              gameItem: true
            }
          }
        }
      });

      if (tickets.length === 0) {
        return null;
      }

      const totalSales = tickets.reduce((sum, ticket) => {
        return sum + parseFloat(ticket.totalAmount);
      }, 0);

      const ticketsByItem = {};
      tickets.forEach(ticket => {
        ticket.details.forEach(detail => {
          const key = detail.gameItem.number;
          if (!ticketsByItem[key]) {
            ticketsByItem[key] = {
              number: detail.gameItem.number,
              name: detail.gameItem.name,
              amount: 0,
              count: 0
            };
          }
          ticketsByItem[key].amount += parseFloat(detail.amount);
          ticketsByItem[key].count += 1;
        });
      });

      return {
        totalSales,
        totalTickets: tickets.length,
        ticketsByItem: Object.values(ticketsByItem)
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de ventas:', error);
      return null;
    }
  }
}

export default new ApiIntegrationService();
