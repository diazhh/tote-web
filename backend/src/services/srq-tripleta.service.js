/**
 * Servicio para integración con API SRQ - Tripleta
 * 
 * Maneja la obtención de tickets de tripleta desde el proveedor SRQ
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class SRQTripletaService {
  /**
   * Llamar a la API de SRQ para tripleta
   * @param {string} url - URL completa
   * @param {string} token - Token de autenticación
   * @returns {Promise<any>}
   */
  async callAPI(url, token) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'APIKEY': token,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // SRQ puede devolver errores en el body
      if (data.result === 'error') {
        throw new Error(data.errors?.[0]?.message || 'Error desconocido de SRQ');
      }

      return data;
    } catch (error) {
      logger.error(`Error llamando API SRQ Tripleta: ${url}`, error);
      throw error;
    }
  }

  /**
   * Sincronizar jugadas de tripleta de un sorteo desde SRQ
   * @param {string} drawId - ID del sorteo local
   * @returns {Promise<Object>} Resumen de sincronización
   */
  async syncTripletaTickets(drawId) {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        game: true,
        apiMappings: {
          include: {
            apiConfig: true,
          },
        },
      },
    });

    if (!draw) {
      throw new Error(`Sorteo ${drawId} no encontrado`);
    }

    // Buscar configuración de ventas para este juego
    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: draw.gameId,
        type: 'SALES',
        isActive: true,
        tripletaUrl: { not: null },
        tripletaToken: { not: null },
      },
    });

    if (!salesConfig) {
      logger.warn(`No hay configuración de tripleta para ${draw.game.name}`);
      return {
        drawId,
        skipped: true,
        reason: 'No tripleta configuration found',
      };
    }

    // Obtener el mapping del sorteo
    const mapping = draw.apiMappings.find(m => 
      m.apiConfig?.apiSystemId === salesConfig.apiSystemId
    );

    if (!mapping) {
      const anyMapping = draw.apiMappings[0];
      if (!anyMapping) {
        throw new Error(`No hay mapping de API para el sorteo ${drawId}`);
      }
    }

    const externalDrawId = mapping?.externalDrawId || draw.apiMappings[0]?.externalDrawId;
    if (!externalDrawId) {
      throw new Error(`No hay ID externo para el sorteo ${drawId}`);
    }

    const url = `${salesConfig.tripletaUrl}${externalDrawId}`;
    logger.info(`🎫 Sincronizando jugadas de tripleta: ${url}`);

    try {
      const tickets = await this.callAPI(url, salesConfig.tripletaToken);

      if (!Array.isArray(tickets)) {
        throw new Error('Respuesta de tickets de tripleta no es un array');
      }

      logger.info(`  📊 ${tickets.length} jugadas de tripleta encontradas`);

      // Procesar y guardar tickets de tripleta
      const processed = await this.processTripletaTickets(tickets, drawId, draw.gameId);

      logger.info(`  ✅ ${processed} jugadas de tripleta procesadas`);

      return {
        drawId,
        externalDrawId,
        totalTripletaTickets: tickets.length,
        processed,
        rawSample: tickets.length > 0 ? tickets[0] : null,
      };
    } catch (error) {
      logger.error(`Error sincronizando tripleta para sorteo ${drawId}:`, error);
      throw error;
    }
  }

  /**
   * Procesar y guardar tickets de tripleta
   * @param {Array} tickets - Array de tickets de tripleta desde SRQ
   * @param {string} drawId - ID del sorteo inicial
   * @param {string} gameId - ID del juego
   * @returns {Promise<number>} Cantidad de tickets procesados
   */
  async processTripletaTickets(tickets, drawId, gameId) {
    let processed = 0;
    let skipped = 0;

    // Obtener configuración de tripleta del juego
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        config: true,
        name: true
      }
    });

    const tripletaConfig = game?.config?.tripleta;
    if (!tripletaConfig?.enabled) {
      logger.warn(`Tripleta no habilitada para ${game?.name}`);
      return 0;
    }

    const drawsCount = tripletaConfig.drawsCount || 10;
    const multiplier = tripletaConfig.multiplier || 50;

    // Obtener sorteos futuros para calcular rango de la tripleta
    const futureDraws = await prisma.draw.findMany({
      where: {
        gameId,
        scheduledAt: {
          gte: new Date()
        },
        status: 'SCHEDULED'
      },
      orderBy: { scheduledAt: 'asc' },
      take: drawsCount + 1,
      select: { id: true, scheduledAt: true }
    });

    if (futureDraws.length < 2) {
      logger.warn(`No hay suficientes sorteos futuros para procesar tripletas (necesario: al menos 2, disponibles: ${futureDraws.length})`);
      return 0;
    }

    const startDrawId = futureDraws[0].id;
    const endDrawId = futureDraws[Math.min(drawsCount, futureDraws.length) - 1].id;
    const expiresAt = futureDraws[Math.min(drawsCount, futureDraws.length) - 1].scheduledAt;

    for (const ticket of tickets) {
      try {
        // Ignorar tickets anulados
        if (ticket.anulado) {
          skipped++;
          continue;
        }

        // Validar estructura del ticket
        if (!ticket.ticketID || !ticket.numero1 || !ticket.numero2 || !ticket.numero3) {
          logger.warn(`Ticket de tripleta con estructura incompleta: ${JSON.stringify(ticket)}`);
          skipped++;
          continue;
        }

        // Buscar los GameItems para los 3 números
        const [item1, item2, item3] = await Promise.all([
          prisma.gameItem.findFirst({
            where: {
              gameId,
              number: ticket.numero1.toString().padStart(2, '0')
            }
          }),
          prisma.gameItem.findFirst({
            where: {
              gameId,
              number: ticket.numero2.toString().padStart(2, '0')
            }
          }),
          prisma.gameItem.findFirst({
            where: {
              gameId,
              number: ticket.numero3.toString().padStart(2, '0')
            }
          })
        ]);

        if (!item1 || !item2 || !item3) {
          logger.warn(`No se encontraron GameItems para tripleta: ${ticket.numero1}-${ticket.numero2}-${ticket.numero3}`);
          skipped++;
          continue;
        }

        const amount = parseFloat(ticket.monto || 0);
        if (amount <= 0) {
          skipped++;
          continue;
        }

        // Verificar si ya existe este ticket de tripleta
        const existingTicket = await prisma.ticket.findFirst({
          where: {
            drawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ticketID.toString(),
            // Verificar que sea específicamente una tripleta
            details: {
              some: {
                gameItemId: { in: [item1.id, item2.id, item3.id] }
              }
            }
          }
        });

        if (existingTicket) {
          skipped++;
          continue;
        }

        // Crear el ticket de tripleta con sus 3 números
        await prisma.ticket.create({
          data: {
            drawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ticketID.toString(),
            totalAmount: amount,
            totalPrize: 0,
            status: 'ACTIVE',
            providerData: {
              ticketID: ticket.ticketID,
              taquillaID: ticket.taquillaID,
              grupoID: ticket.grupoID,
              bancaID: ticket.bancaID,
              comercialID: ticket.comercialID,
              type: 'TRIPLETA',
              numbers: [ticket.numero1, ticket.numero2, ticket.numero3]
            },
            details: {
              create: [
                {
                  gameItemId: item1.id,
                  amount: amount / 3,
                  multiplier,
                  prize: 0,
                  status: 'ACTIVE'
                },
                {
                  gameItemId: item2.id,
                  amount: amount / 3,
                  multiplier,
                  prize: 0,
                  status: 'ACTIVE'
                },
                {
                  gameItemId: item3.id,
                  amount: amount / 3,
                  multiplier,
                  prize: 0,
                  status: 'ACTIVE'
                }
              ]
            }
          }
        });

        processed++;
      } catch (error) {
        logger.error(`Error procesando ticket de tripleta ${ticket.ticketID}:`, error);
        skipped++;
      }
    }

    logger.info(`  📊 Tripletas procesadas: ${processed} guardadas, ${skipped} saltadas`);
    return processed;
  }

  /**
   * Sincronizar jugadas de tripleta de todos los sorteos próximos a cerrar
   * @param {number} minutesBefore - Minutos antes del cierre
   * @returns {Promise<Array>}
   */
  async syncUpcomingTripletaTickets(minutesBefore = 5) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutesBefore * 60000);

    // Buscar sorteos que cierran pronto y tienen configuración de tripleta
    const draws = await prisma.draw.findMany({
      where: {
        scheduledAt: {
          gte: now,
          lte: targetTime,
        },
        status: {
          in: ['SCHEDULED', 'CLOSED'],
        },
        apiMappings: {
          some: {},
        },
      },
      include: {
        game: {
          include: {
            apiConfigs: {
              where: {
                type: 'SALES',
                isActive: true,
                tripletaUrl: { not: null },
                tripletaToken: { not: null },
              },
            },
          },
        },
        apiMappings: true,
      },
    });

    // Filtrar solo los que tienen configuración de tripleta
    const drawsWithTripleta = draws.filter(d => d.game.apiConfigs.length > 0);

    logger.info(`🎫 Sincronizando jugadas de tripleta de ${drawsWithTripleta.length} sorteos próximos`);

    const results = [];
    for (const draw of drawsWithTripleta) {
      try {
        const result = await this.syncTripletaTickets(draw.id);
        results.push(result);
      } catch (error) {
        logger.error(`Error sincronizando tripleta de ${draw.id}:`, error);
        results.push({
          drawId: draw.id,
          error: error.message,
        });
      }
    }

    return results;
  }
}

export const srqTripletaService = new SRQTripletaService();
export default srqTripletaService;
