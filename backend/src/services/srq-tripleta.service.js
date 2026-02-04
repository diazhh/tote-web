/**
 * Servicio para integración con API SRQ - Tripleta
 * 
 * Maneja la obtención de tickets de tripleta desde el proveedor SRQ
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class SRQTripletaService {
  /**
   * Verificar tickets de tripleta externos después de ejecutar un sorteo
   * @param {string} drawId - ID del sorteo ejecutado
   * @returns {Promise<Object>} Resumen de verificación
   */
  async checkExternalTripletasForDraw(drawId) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          winnerItem: true
        }
      });

      if (!draw || !draw.winnerItemId) {
        throw new Error('Sorteo no encontrado o sin ganador');
      }

      // Obtener configuración de tripleta del juego
      const tripletaConfig = draw.game.config?.tripleta;
      if (!tripletaConfig?.enabled) {
        return { checked: 0, winners: 0, expired: 0 };
      }

      const drawsCount = tripletaConfig.drawsCount || 10;
      const multiplier = tripletaConfig.multiplier || 50;

      // Obtener todos los tickets de tripleta ACTIVOS que participan en este sorteo
      const activeTripletas = await prisma.ticket.findMany({
        where: {
          drawId: draw.id,
          source: 'EXTERNAL_API',
          status: 'ACTIVE',
          providerData: {
            path: ['type'],
            equals: 'TRIPLETA'
          }
        },
        include: {
          details: true
        }
      });

      logger.info(`🎯 Verificando ${activeTripletas.length} tripletas externas para sorteo ${drawId}`);

      let winnersCount = 0;
      let expiredCount = 0;

      for (const ticket of activeTripletas) {
        try {
          // Obtener los 3 números de la tripleta
          const itemIds = ticket.details.map(d => d.gameItemId);
          
          if (itemIds.length !== 3) {
            logger.warn(`Tripleta ${ticket.id} no tiene 3 números, tiene ${itemIds.length}`);
            continue;
          }

          // Obtener sorteos ejecutados desde el sorteo de inicio
          // El sorteo de inicio es el drawId del ticket
          const startDraw = await prisma.draw.findUnique({
            where: { id: ticket.drawId }
          });

          // Calcular la fecha de expiración (drawsCount sorteos desde el inicio)
          const futureDraws = await prisma.draw.findMany({
            where: {
              gameId: draw.gameId,
              OR: [
                { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
                { drawDate: { gt: startDraw.drawDate } }
              ]
            },
            orderBy: [
              { drawDate: 'asc' },
              { drawTime: 'asc' }
            ],
            take: drawsCount
          });

          // Obtener sorteos ya ejecutados en la ventana
          const executedDraws = await prisma.draw.findMany({
            where: {
              id: { in: futureDraws.map(d => d.id) },
              status: { in: ['DRAWN', 'PUBLISHED'] },
              winnerItemId: { not: null }
            },
            select: {
              id: true,
              winnerItemId: true
            }
          });

          // Verificar si los 3 números han salido
          const winnerItemIds = executedDraws.map(d => d.winnerItemId);
          const item1Won = winnerItemIds.includes(itemIds[0]);
          const item2Won = winnerItemIds.includes(itemIds[1]);
          const item3Won = winnerItemIds.includes(itemIds[2]);

          if (item1Won && item2Won && item3Won) {
            // ¡GANADOR! Los 3 números salieron
            const prize = parseFloat(ticket.totalAmount) * multiplier;

            await prisma.$transaction(async (tx) => {
              // Actualizar todos los detalles como WON
              await tx.ticketDetail.updateMany({
                where: { ticketId: ticket.id },
                data: {
                  status: 'WON',
                  prize: parseFloat(ticket.totalAmount) * multiplier / 3 // Dividir premio entre los 3
                }
              });

              // Actualizar el ticket
              await tx.ticket.update({
                where: { id: ticket.id },
                data: {
                  status: 'WON',
                  totalPrize: prize
                }
              });
            });

            winnersCount++;
            logger.info(`✅ Tripleta externa ganadora: ${ticket.externalTicketId} - Premio: ${prize}`);

          } else if (executedDraws.length >= drawsCount) {
            // Ya se ejecutaron todos los sorteos de la ventana y no ganó
            await prisma.$transaction(async (tx) => {
              // Actualizar todos los detalles como LOST
              await tx.ticketDetail.updateMany({
                where: { ticketId: ticket.id },
                data: {
                  status: 'LOST',
                  prize: 0
                }
              });

              // Actualizar el ticket
              await tx.ticket.update({
                where: { id: ticket.id },
                data: {
                  status: 'LOST',
                  totalPrize: 0
                }
              });
            });

            expiredCount++;
            logger.info(`❌ Tripleta externa expirada: ${ticket.externalTicketId}`);
          }
          // Si no cumple ninguna condición, sigue ACTIVE

        } catch (ticketError) {
          logger.error(`Error verificando tripleta ${ticket.id}:`, ticketError);
        }
      }

      return {
        checked: activeTripletas.length,
        winners: winnersCount,
        expired: expiredCount
      };

    } catch (error) {
      logger.error('Error verificando tripletas externas:', error);
      throw error;
    }
  }

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
   * Sincronizar jugadas de tripleta desde SRQ para una fecha específica
   * Las tripletas de SRQ vienen de un sorteo especial que abarca todo el día
   * @param {Date} date - Fecha para sincronizar (default: hoy)
   * @returns {Promise<Object>} Resumen de sincronización
   */
  async syncTripletaTicketsForDate(date = new Date()) {
    const { getVenezuelaDateAsUTC } = await import('../lib/dateUtils.js');
    const dateVenezuela = getVenezuelaDateAsUTC(date);
    const dateStr = dateVenezuela.toISOString().split('T')[0];
    
    logger.info(`🎯 Sincronizando tripletas de SRQ para ${dateStr}`);

    // Buscar configuración de tripleta para LOTOANIMALITO
    const game = await prisma.game.findFirst({
      where: { name: 'LOTOANIMALITO' }
    });

    if (!game) {
      throw new Error('Juego LOTOANIMALITO no encontrado');
    }

    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'SALES',
        isActive: true,
        tripletaUrl: { not: null },
        tripletaToken: { not: null },
      },
    });

    if (!salesConfig) {
      logger.warn(`No hay configuración de tripleta para ${game.name}`);
      return {
        skipped: true,
        reason: 'No tripleta configuration found',
      };
    }

    // Obtener sorteos de tripleta de SRQ para esta fecha
    const planningUrl = `https://api2.sistemasrq.com/externalapi/operator/loteries?date=${dateStr}`;
    
    try {
      const planningResponse = await this.callAPI(planningUrl, salesConfig.tripletaToken);
      
      if (!Array.isArray(planningResponse)) {
        throw new Error('Respuesta de planificación no es un array');
      }

      // Buscar sorteos de tripleta (descripción contiene "TRIPLETA")
      const tripletaDraws = planningResponse.filter(d => 
        d.descripcion && d.descripcion.toUpperCase().includes('TRIPLETA')
      );

      if (tripletaDraws.length === 0) {
        logger.info(`  No hay sorteos de tripleta para ${dateStr}`);
        return {
          skipped: true,
          reason: 'No tripleta draws found for date',
          date: dateStr
        };
      }

      logger.info(`  📊 ${tripletaDraws.length} sorteos de tripleta encontrados`);

      let totalProcessed = 0;
      let totalTickets = 0;

      // Procesar cada sorteo de tripleta individualmente
      for (const tripletaDraw of tripletaDraws) {
        try {
          logger.info(`  📌 ${tripletaDraw.descripcion} (ID: ${tripletaDraw.sorteoID})`);

          // Obtener tickets del sorteo de tripleta
          const url = `${salesConfig.tripletaUrl}${tripletaDraw.sorteoID}`;
          const tickets = await this.callAPI(url, salesConfig.tripletaToken);

          if (!Array.isArray(tickets)) {
            throw new Error('Respuesta de tickets de tripleta no es un array');
          }

          logger.info(`    📦 ${tickets.length} tickets encontrados`);
          totalTickets += tickets.length;

          if (tickets.length === 0) {
            continue;
          }

          // Procesar tickets usando el sorteoID del ticket para encontrar el sorteo de inicio
          const processed = await this.processTripletaTicketsWithMapping(tickets, game.id, tripletaDraw.sorteoID);
          totalProcessed += processed;
          logger.info(`    ✅ ${processed} tickets procesados`);

        } catch (error) {
          logger.error(`  Error procesando sorteo de tripleta ${tripletaDraw.sorteoID}:`, error);
        }
      }

      logger.info(`  ✅ Total: ${totalProcessed} de ${totalTickets} tickets de tripleta procesados`);

      return {
        date: dateStr,
        totalTripletaTickets: totalTickets,
        processed: totalProcessed,
      };
    } catch (error) {
      logger.error(`Error sincronizando tripletas para ${dateStr}:`, error);
      throw error;
    }
  }

  /**
   * Sincronizar jugadas de tripleta de un sorteo desde SRQ (método legacy)
   * @param {string} drawId - ID del sorteo local
   * @returns {Promise<Object>} Resumen de sincronización
   */
  async syncTripletaTickets(drawId) {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: { drawDate: true }
    });

    if (!draw) {
      throw new Error(`Sorteo ${drawId} no encontrado`);
    }

    // Delegar a syncTripletaTicketsForDate
    return this.syncTripletaTicketsForDate(draw.drawDate);
  }

  /**
   * Procesar y guardar tickets de tripleta usando mapping de sorteoID
   * @param {Array} tickets - Array de tickets de tripleta desde SRQ
   * @param {string} gameId - ID del juego
   * @param {string} tripletaDrawId - ID del sorteo de tripleta en SRQ (para referencia)
   * @returns {Promise<number>} Cantidad de tickets procesados
   */
  async processTripletaTicketsWithMapping(tickets, gameId, tripletaDrawId) {
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

    // Buscar el mapping del sorteo de tripleta (ya debe existir)
    const tripletaMapping = await prisma.apiDrawMapping.findFirst({
      where: {
        externalDrawId: tripletaDrawId.toString()
      },
      include: {
        draw: true
      }
    });

    if (!tripletaMapping) {
      logger.warn(`No se encontró mapping para sorteo de tripleta ${tripletaDrawId}`);
      return 0;
    }

    const startDraw = tripletaMapping.draw;

    for (const ticket of tickets) {
      try {
        // Ignorar tickets anulados
        if (ticket.anulado) {
          skipped++;
          continue;
        }

        // Validar estructura del ticket
        if (!ticket.ticketID || !ticket.numerosTexto || !ticket.ventaID) {
          logger.warn(`Ticket de tripleta con estructura incompleta: ${JSON.stringify(ticket)}`);
          skipped++;
          continue;
        }

        // Obtener sorteos desde el sorteo de inicio hacia adelante
        const futureDraws = await prisma.draw.findMany({
          where: {
            gameId,
            OR: [
              { drawDate: startDraw.drawDate, drawTime: { gte: startDraw.drawTime } },
              { drawDate: { gt: startDraw.drawDate } }
            ]
          },
          orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }],
          take: drawsCount + 1,
          select: { id: true, drawDate: true, drawTime: true, status: true }
        });

        if (futureDraws.length < 2) {
          logger.warn(`No hay suficientes sorteos desde ${startDraw.drawDate.toISOString().split('T')[0]} ${startDraw.drawTime} para ticket ${ticket.ticketID}`);
          skipped++;
          continue;
        }

        const startDrawId = futureDraws[0].id;
        const endDrawId = futureDraws[Math.min(drawsCount, futureDraws.length) - 1].id;
        const lastDraw = futureDraws[Math.min(drawsCount, futureDraws.length) - 1];
        const expiresAt = new Date(lastDraw.drawDate);
        const [hours, minutes] = lastDraw.drawTime.split(':');
        expiresAt.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);

        // Parsear los números de animalitos
        const numbers = ticket.numerosTexto.split(',').map(num => {
          const trimmed = num.trim();
          return trimmed === '0' ? '0' : trimmed.padStart(2, '0');
        });
        
        if (numbers.length !== 3) {
          logger.warn(`Ticket de tripleta no tiene exactamente 3 números: ${ticket.numerosTexto}`);
          skipped++;
          continue;
        }

        // Buscar los GameItems por número
        const items = await Promise.all(
          numbers.map(number => 
            prisma.gameItem.findFirst({
              where: {
                number,
                gameId,
                isActive: true
              }
            })
          )
        );

        if (items.some(item => !item)) {
          logger.warn(`No se encontraron todos los GameItems para tripleta. Números: ${ticket.numerosTexto}`);
          skipped++;
          continue;
        }

        const [item1, item2, item3] = items;
        const amount = parseFloat(ticket.monto || 0);
        if (amount <= 0) {
          skipped++;
          continue;
        }

        // Verificar si ya existe usando ventaID como identificador único
        const existingTicket = await prisma.ticket.findFirst({
          where: {
            drawId: startDrawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ventaID.toString()
          }
        });

        if (existingTicket) {
          skipped++;
          continue;
        }

        // Crear el ticket de tripleta
        await prisma.ticket.create({
          data: {
            drawId: startDrawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ventaID.toString(),
            totalAmount: amount,
            totalPrize: 0,
            status: 'ACTIVE',
            providerData: {
              ticketID: ticket.ticketID,
              ventaID: ticket.ventaID,
              taquillaID: ticket.taquillaID,
              bancaID: ticket.bancaID,
              usuarioID: ticket.usuarioID,
              codigo: ticket.codigo,
              type: 'TRIPLETA',
              numeros: ticket.numeros,
              numerosTexto: ticket.numerosTexto,
              numbers: [item1.number, item2.number, item3.number],
              sorteoID: ticket.sorteoID,
              tripletaDrawId: tripletaDrawId
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

    logger.info(`    📊 Tripletas: ${processed} guardadas, ${skipped} saltadas`);
    return processed;
  }

  /**
   * Procesar y guardar tickets de tripleta (método legacy)
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

    // Obtener el sorteo base desde el cual se calculan los próximos sorteos
    const baseDraw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: { drawDate: true, drawTime: true }
    });

    if (!baseDraw) {
      logger.error(`Sorteo base ${drawId} no encontrado`);
      return 0;
    }

    // Obtener sorteos desde el sorteo base (incluyéndolo) hacia adelante
    const futureDraws = await prisma.draw.findMany({
      where: {
        gameId,
        OR: [
          { drawDate: baseDraw.drawDate, drawTime: { gte: baseDraw.drawTime } },
          { drawDate: { gt: baseDraw.drawDate } }
        ]
      },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }],
      take: drawsCount + 1,
      select: { id: true, drawDate: true, drawTime: true, status: true }
    });

    if (futureDraws.length < 2) {
      logger.warn(`No hay suficientes sorteos desde ${baseDraw.drawDate.toISOString().split('T')[0]} ${baseDraw.drawTime} para procesar tripletas (necesario: al menos 2, disponibles: ${futureDraws.length})`);
      return 0;
    }

    const startDrawId = futureDraws[0].id;
    const endDrawId = futureDraws[Math.min(drawsCount, futureDraws.length) - 1].id;
    // Construir expiresAt desde drawDate y drawTime
    const lastDraw = futureDraws[Math.min(drawsCount, futureDraws.length) - 1];
    const expiresAt = new Date(lastDraw.drawDate);
    const [hours, minutes] = lastDraw.drawTime.split(':');
    expiresAt.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);

    for (const ticket of tickets) {
      try {
        // Ignorar tickets anulados
        if (ticket.anulado) {
          skipped++;
          continue;
        }

        // Validar estructura del ticket - SRQ usa campo 'numerosTexto' con números separados por coma
        if (!ticket.ticketID || !ticket.numerosTexto) {
          logger.warn(`Ticket de tripleta con estructura incompleta: ${JSON.stringify(ticket)}`);
          skipped++;
          continue;
        }

        // Parsear los números de animalitos (formato: "21,26,30")
        // Special case: '0' should stay '0', not become '00' (0=DELFIN, 00=BALLENA)
        const numbers = ticket.numerosTexto.split(',').map(num => {
          const trimmed = num.trim();
          return trimmed === '0' ? '0' : trimmed.padStart(2, '0');
        });
        
        if (numbers.length !== 3) {
          logger.warn(`Ticket de tripleta no tiene exactamente 3 números: ${ticket.numerosTexto}`);
          skipped++;
          continue;
        }

        // Buscar los GameItems por número
        const items = await Promise.all(
          numbers.map(number => 
            prisma.gameItem.findFirst({
              where: {
                number,
                gameId,
                isActive: true
              }
            })
          )
        );

        if (items.some(item => !item)) {
          logger.warn(`No se encontraron todos los GameItems para tripleta. Números: ${ticket.numerosTexto}`);
          skipped++;
          continue;
        }

        const [item1, item2, item3] = items;

        const amount = parseFloat(ticket.monto || 0);
        if (amount <= 0) {
          skipped++;
          continue;
        }

        // Verificar si ya existe usando ventaID como identificador único
        // Un mismo ticketID puede tener múltiples jugadas (ventaID diferente)
        const existingTicket = await prisma.ticket.findFirst({
          where: {
            drawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ventaID.toString()
          }
        });

        if (existingTicket) {
          skipped++;
          continue;
        }

        // Crear el ticket de tripleta usando ventaID como identificador único
        await prisma.ticket.create({
          data: {
            drawId,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ventaID.toString(), // ventaID es el identificador único de cada jugada
            totalAmount: amount,
            totalPrize: 0,
            status: 'ACTIVE',
            providerData: {
              ticketID: ticket.ticketID, // ID del ticket (puede repetirse)
              ventaID: ticket.ventaID,   // ID único de la jugada
              taquillaID: ticket.taquillaID,
              bancaID: ticket.bancaID,
              usuarioID: ticket.usuarioID,
              codigo: ticket.codigo,
              type: 'TRIPLETA',
              numeros: ticket.numeros,
              numerosTexto: ticket.numerosTexto,
              numbers: [item1.number, item2.number, item3.number]
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
    const { getVenezuelaDateAsUTC, getVenezuelaTimeString, addMinutesToTime } = await import('../lib/dateUtils.js');
    const todayVenezuela = getVenezuelaDateAsUTC();
    const currentTime = getVenezuelaTimeString();
    const targetTime = addMinutesToTime(currentTime, minutesBefore);

    // Buscar sorteos que cierran pronto y tienen configuración de tripleta
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: todayVenezuela,
        drawTime: {
          gte: currentTime,
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
