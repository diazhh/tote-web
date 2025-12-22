import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import providerEntitiesService from './provider-entities.service.js';

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
          const startOfDay = new Date(date);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);

          const localDraws = await prisma.draw.findMany({
            where: {
              gameId: config.gameId,
              scheduledAt: {
                gte: startOfDay,
                lte: endOfDay
              }
            },
            orderBy: { scheduledAt: 'asc' }
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

            const hora = localDraw.scheduledAt.toLocaleTimeString('es-VE', { 
              timeZone: 'America/Caracas', 
              hour: '2-digit', 
              minute: '2-digit' 
            });
            logger.info(`✅ Mapeado: ${config.game.name} ${hora} → SRQ ${externalId} (${externalDraw.descripcion || ''})`);
            totalMapped++;
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

      logger.info(`✅ Sincronización SRQ completada: ${totalMapped} mapeados, ${totalSkipped} saltados`);
      return { mapped: totalMapped, skipped: totalSkipped };
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
        const deleteResult = await prisma.externalTicket.deleteMany({
          where: { mappingId: mapping.id }
        });
        deleted = deleteResult.count;
        if (deleted > 0) {
          logger.info(`  🗑️ ${deleted} tickets anteriores eliminados para mapping ${mapping.id}`);
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

      // Procesar tickets
      // SRQ devuelve array directamente
      let imported = 0;
      let skipped = 0;
      const tickets = Array.isArray(data) ? data : (data.tickets || []);

      // Obtener el apiSystemId para crear entidades
      const apiSystemId = salesConfig.apiSystemId || mapping.apiConfig.apiSystemId;

      if (tickets.length > 0) {
        for (const ticket of tickets) {
          const saved = await this.saveTicket(mapping.id, mapping.apiConfig.gameId, ticket, apiSystemId);
          if (saved) {
            imported++;
          } else {
            skipped++;
          }
        }
      }

      logger.info(`✅ Tickets importados para draw ${drawId}: ${imported} guardados, ${skipped} saltados, ${deleted} eliminados`);
      return { imported, skipped, deleted };
    } catch (error) {
      logger.error('❌ Error en importSRQTickets:', error);
      throw error;
    }
  }

  /**
   * Guardar un ticket en la base de datos
   * SRQ format: { ticketID, numero, monto, premio, anulado, taquillaID, grupoID, bancaID, comercialID }
   */
  async saveTicket(mappingId, gameId, ticket, apiSystemId = null) {
    try {
      // Ignorar tickets anulados
      if (ticket.anulado) {
        return false;
      }

      // Buscar el game_item por número (SRQ usa 'numero')
      const numero = ticket.numero?.toString() || ticket.number?.toString();
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId,
          number: numero.padStart(2, '0')
        }
      });

      if (!gameItem) {
        logger.warn(`No se encontró gameItem para número ${numero} en juego ${gameId}`);
        return false;
      }

      // SRQ usa 'monto' en lugar de 'amount'
      const amount = parseFloat(ticket.monto || ticket.amount || 0);

      // Verificar si ya existe el ticket (evitar duplicados)
      const existing = await prisma.externalTicket.findFirst({
        where: {
          mappingId,
          gameItemId: gameItem.id,
          externalData: {
            path: ['ticketID'],
            equals: ticket.ticketID
          }
        }
      });

      if (existing) {
        return false; // Ya existe
      }

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
          logger.warn(`Error creando entidades para ticket ${ticket.ticketID}: ${entityError.message}`);
        }
      }

      // Crear el registro de ticket
      await prisma.externalTicket.create({
        data: {
          mappingId,
          gameItemId: gameItem.id,
          amount,
          externalData: {
            ticketID: ticket.ticketID,
            taquillaID: ticket.taquillaID,
            grupoID: ticket.grupoID,
            bancaID: ticket.bancaID,
            comercialID: ticket.comercialID,
            premio: ticket.premio,
            // Guardar referencias a las entidades internas si se crearon
            ...(entityIds && {
              entityIds: {
                comercialId: entityIds.comercialId,
                bancaId: entityIds.bancaId,
                grupoId: entityIds.grupoId,
                taquillaId: entityIds.taquillaId
              }
            })
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
