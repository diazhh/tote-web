/**
 * Servicio para integración con API SRQ
 * 
 * SRQ es un proveedor de jugadas que expone:
 * - Planificación: GET {baseUrl}{date} con header APIKEY -> Lista de sorteos del día
 * - Ventas: GET {baseUrl}{sorteoID} con header APIKEY -> Lista de jugadas del sorteo
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { format, startOfDay, endOfDay } from 'date-fns';

class SRQService {
  /**
   * Obtener configuraciones de API SRQ activas
   * @param {string} type - 'PLANNING' o 'SALES'
   * @returns {Promise<Array>}
   */
  async getConfigurations(type = null) {
    const where = {
      isActive: true,
      apiSystem: {
        name: 'SRQ'
      }
    };

    if (type) {
      where.type = type;
    }

    return prisma.apiConfiguration.findMany({
      where,
      include: {
        game: true,
        apiSystem: true,
      }
    });
  }

  /**
   * Llamar a la API de SRQ
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
      logger.error(`Error llamando API SRQ: ${url}`, error);
      throw error;
    }
  }

  /**
   * Sincronizar sorteos del día desde SRQ
   * @param {Date} date - Fecha a sincronizar (default: hoy)
   * @returns {Promise<Object>} Resumen de sincronización
   */
  async syncDraws(date = new Date()) {
    const dateStr = format(date, 'yyyy-MM-dd');
    logger.info(`🔄 Sincronizando sorteos SRQ para ${dateStr}`);

    const configs = await this.getConfigurations('PLANNING');
    const results = {
      date: dateStr,
      games: [],
      totalDraws: 0,
      errors: [],
    };

    for (const config of configs) {
      try {
        const url = `${config.baseUrl}${dateStr}`;
        logger.info(`  Consultando ${config.game.name}: ${url}`);

        const srqDraws = await this.callAPI(url, config.token);

        if (!Array.isArray(srqDraws)) {
          logger.warn(`  ⚠️ Respuesta no es array para ${config.game.name}`);
          continue;
        }

        logger.info(`  📊 ${srqDraws.length} sorteos encontrados para ${config.game.name}`);

        // Obtener sorteos existentes del día para este juego
        const existingDraws = await prisma.draw.findMany({
          where: {
            gameId: config.gameId,
            scheduledAt: {
              gte: startOfDay(date),
              lte: endOfDay(date),
            },
          },
          orderBy: { scheduledAt: 'asc' },
          include: {
            apiMappings: true,
          },
        });

        let created = 0;
        let updated = 0;

        // Procesar cada sorteo de SRQ en orden
        for (let i = 0; i < srqDraws.length; i++) {
          const srqDraw = srqDraws[i];
          
          // Buscar si ya existe un mapping para este sorteoID
          let existingMapping = await prisma.apiDrawMapping.findUnique({
            where: { externalDrawId: srqDraw.sorteoID.toString() },
            include: { draw: true },
          });

          // Extraer hora del sorteo de la descripción (ej: "LOTTO ANIMALITO 8AM")
          const drawTime = this.extractTimeFromDescription(srqDraw.descripcion);
          
          // Extraer número ganador si existe
          const winnerNumber = srqDraw.ganador ? this.extractWinnerNumber(srqDraw.ganador) : null;

          if (existingMapping) {
            // Actualizar sorteo existente
            const updateData = {};
            
            if (winnerNumber && !existingMapping.draw.winnerItemId) {
              // Buscar el GameItem correspondiente
              const gameItem = await prisma.gameItem.findFirst({
                where: {
                  gameId: config.gameId,
                  number: winnerNumber,
                },
              });

              if (gameItem) {
                updateData.winnerItemId = gameItem.id;
                updateData.status = 'PUBLISHED';
                updateData.drawnAt = new Date();
              }
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.draw.update({
                where: { id: existingMapping.drawId },
                data: updateData,
              });
              updated++;
            }
          } else {
            // Crear nuevo sorteo o asociar con existente por posición
            let draw = existingDraws[i];

            if (!draw) {
              // Crear nuevo sorteo
              const scheduledAt = this.buildScheduledAt(date, drawTime);
              
              draw = await prisma.draw.create({
                data: {
                  gameId: config.gameId,
                  scheduledAt,
                  status: srqDraw.abierta ? 'SCHEDULED' : 'PUBLISHED',
                  notes: srqDraw.descripcion,
                },
              });
              created++;
            }

            // Crear mapping
            await prisma.apiDrawMapping.create({
              data: {
                apiConfigId: config.id,
                drawId: draw.id,
                externalDrawId: srqDraw.sorteoID.toString(),
              },
            });

            // Actualizar ganador si existe
            if (winnerNumber) {
              const gameItem = await prisma.gameItem.findFirst({
                where: {
                  gameId: config.gameId,
                  number: winnerNumber,
                },
              });

              if (gameItem) {
                await prisma.draw.update({
                  where: { id: draw.id },
                  data: {
                    winnerItemId: gameItem.id,
                    status: 'PUBLISHED',
                    drawnAt: new Date(),
                  },
                });
              }
            }
          }
        }

        results.games.push({
          game: config.game.name,
          total: srqDraws.length,
          created,
          updated,
        });
        results.totalDraws += srqDraws.length;

      } catch (error) {
        logger.error(`Error sincronizando ${config.game.name}:`, error);
        results.errors.push({
          game: config.game.name,
          error: error.message,
        });
      }
    }

    logger.info(`✅ Sincronización completada: ${results.totalDraws} sorteos procesados`);
    return results;
  }

  /**
   * Sincronizar jugadas de un sorteo desde SRQ
   * @param {string} drawId - ID del sorteo local
   * @returns {Promise<Object>} Resumen de sincronización
   */
  async syncTickets(drawId) {
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
      },
    });

    if (!salesConfig) {
      throw new Error(`No hay configuración de ventas para ${draw.game.name}`);
    }

    // Obtener el mapping del sorteo
    const mapping = draw.apiMappings.find(m => m.apiConfigId === salesConfig.id || 
      m.apiConfig?.apiSystemId === salesConfig.apiSystemId);

    if (!mapping) {
      // Intentar buscar mapping por cualquier config del mismo sistema
      const anyMapping = draw.apiMappings[0];
      if (!anyMapping) {
        throw new Error(`No hay mapping de API para el sorteo ${drawId}`);
      }
    }

    const externalDrawId = mapping?.externalDrawId || draw.apiMappings[0]?.externalDrawId;
    if (!externalDrawId) {
      throw new Error(`No hay ID externo para el sorteo ${drawId}`);
    }

    const url = `${salesConfig.baseUrl}${externalDrawId}`;
    logger.info(`🎫 Sincronizando jugadas: ${url}`);

    const tickets = await this.callAPI(url, salesConfig.token);

    if (!Array.isArray(tickets)) {
      throw new Error('Respuesta de tickets no es un array');
    }

    logger.info(`  📊 ${tickets.length} jugadas encontradas`);

    // Agrupar tickets por número para sumar montos
    const ticketsByNumber = new Map();
    
    for (const ticket of tickets) {
      if (ticket.anulado) continue; // Ignorar anulados

      const key = ticket.numero;
      if (!ticketsByNumber.has(key)) {
        ticketsByNumber.set(key, {
          number: ticket.numero,
          amount: 0,
          tickets: [],
        });
      }
      
      const entry = ticketsByNumber.get(key);
      entry.amount += parseFloat(ticket.monto);
      entry.tickets.push({
        ticketId: ticket.ticketID,
        taquillaId: ticket.taquillaID,
        grupoId: ticket.grupoID,
        bancaId: ticket.bancaID,
        comercialId: ticket.comercialID,
        monto: ticket.monto,
        premio: ticket.premio,
      });
    }

    // Guardar en ExternalTicket
    let created = 0;
    
    // Primero eliminar tickets anteriores de este mapping
    if (mapping) {
      await prisma.externalTicket.deleteMany({
        where: { mappingId: mapping.id },
      });
    }

    for (const [number, data] of ticketsByNumber) {
      // Buscar GameItem
      const gameItem = await prisma.gameItem.findFirst({
        where: {
          gameId: draw.gameId,
          number: number,
        },
      });

      if (!gameItem) {
        logger.warn(`  ⚠️ GameItem no encontrado: ${number}`);
        continue;
      }

      await prisma.externalTicket.create({
        data: {
          mappingId: mapping?.id || draw.apiMappings[0].id,
          gameItemId: gameItem.id,
          amount: data.amount,
          externalData: {
            ticketCount: data.tickets.length,
            tickets: data.tickets,
          },
        },
      });
      created++;
    }

    logger.info(`✅ ${created} items de jugadas guardados`);

    return {
      drawId,
      externalDrawId,
      totalTickets: tickets.length,
      uniqueNumbers: ticketsByNumber.size,
      saved: created,
    };
  }

  /**
   * Sincronizar jugadas de todos los sorteos próximos a cerrar
   * @param {number} minutesBefore - Minutos antes del cierre
   * @returns {Promise<Array>}
   */
  async syncUpcomingTickets(minutesBefore = 5) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutesBefore * 60000);

    // Buscar sorteos que cierran pronto
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
        game: true,
        apiMappings: true,
      },
    });

    logger.info(`🎫 Sincronizando jugadas de ${draws.length} sorteos próximos`);

    const results = [];
    for (const draw of draws) {
      try {
        const result = await this.syncTickets(draw.id);
        results.push(result);
      } catch (error) {
        logger.error(`Error sincronizando jugadas de ${draw.id}:`, error);
        results.push({
          drawId: draw.id,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Extraer hora de la descripción del sorteo
   * @param {string} description - Ej: "LOTTO ANIMALITO 8AM"
   * @returns {string} Hora en formato HH:mm
   */
  extractTimeFromDescription(description) {
    const match = description.match(/(\d{1,2})(AM|PM)/i);
    if (!match) return '00:00';

    let hour = parseInt(match[1]);
    const isPM = match[2].toUpperCase() === 'PM';

    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    return `${hour.toString().padStart(2, '0')}:00`;
  }

  /**
   * Extraer número ganador
   * @param {string} ganador - Ej: "32 ARDILLA"
   * @returns {string|null}
   */
  extractWinnerNumber(ganador) {
    if (!ganador) return null;
    const match = ganador.match(/^(\d+)/);
    return match ? match[1].padStart(2, '0') : null;
  }

  /**
   * Construir fecha/hora del sorteo
   * @param {Date} date - Fecha base
   * @param {string} time - Hora en formato HH:mm
   * @returns {Date}
   */
  buildScheduledAt(date, time) {
    const [hours, minutes] = time.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
}

export const srqService = new SRQService();
export default srqService;
