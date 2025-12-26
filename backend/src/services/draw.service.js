/**
 * Servicio para gestión de sorteos
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getVenezuelaDateAsUTC, getVenezuelaTimeString } from '../lib/dateUtils.js';

export class DrawService {
  /**
   * Obtener sorteos con filtros
   * @param {Object} filters - Filtros
   * @returns {Promise<Object>} { draws: Array, total: number }
   */
  async getDraws(filters = {}) {
    try {
      const where = {};
      
      if (filters.gameId) {
        where.gameId = filters.gameId;
      }
      
      if (filters.status) {
        where.status = filters.status;
      }
      
      if (filters.dateFrom || filters.dateTo) {
        where.drawDate = {};
        if (filters.dateFrom) {
          // Usar Date.UTC para evitar problemas de zona horaria
          const dateStr = filters.dateFrom.split('T')[0];
          const [year, month, day] = dateStr.split('-').map(Number);
          where.drawDate.gte = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        }
        if (filters.dateTo) {
          // Usar Date.UTC para evitar problemas de zona horaria
          const dateStr = filters.dateTo.split('T')[0];
          const [year, month, day] = dateStr.split('-').map(Number);
          where.drawDate.lte = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        }
      }
      
      // Filtro por fecha específica (date)
      if (filters.date) {
        const dateStr = filters.date.split('T')[0];
        const [year, month, day] = dateStr.split('-').map(Number);
        where.drawDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      }

      // Obtener total de registros y los datos paginados en paralelo
      const [draws, total] = await Promise.all([
        prisma.draw.findMany({
          where,
          include: {
            game: true,
            preselectedItem: true,
            winnerItem: true,
            template: true,
            publications: true,
          },
          orderBy: [
            { drawDate: filters.orderBy === 'asc' ? 'asc' : 'desc' },
            { drawTime: filters.orderBy === 'asc' ? 'asc' : 'desc' }
          ],
          ...(filters.limit && { take: filters.limit }),
          ...(filters.skip && { skip: filters.skip }),
        }),
        prisma.draw.count({ where })
      ]);

      return { draws, total };
    } catch (error) {
      logger.error('Error obteniendo sorteos:', error);
      throw error;
    }
  }

  /**
   * Obtener sorteo por ID
   * @param {string} id - ID del sorteo
   * @returns {Promise<Object|null>}
   */
  async getDrawById(id) {
    try {
      const draw = await prisma.draw.findUnique({
        where: { id },
        include: {
          game: {
            include: {
              items: {
                where: { isActive: true },
              },
            },
          },
          preselectedItem: true,
          winnerItem: true,
          template: true,
          publications: true,
        },
      });

      return draw;
    } catch (error) {
      logger.error(`Error obteniendo sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener sorteos de hoy
   * @param {string} gameId - ID del juego (opcional)
   * @returns {Promise<Array>}
   */
  async getTodayDraws(gameId = null) {
    try {
      // Obtener fecha de hoy en Venezuela
      const todayVenezuela = getVenezuelaDateAsUTC();

      const where = {
        drawDate: todayVenezuela,
      };

      if (gameId) {
        where.gameId = gameId;
      }

      const draws = await prisma.draw.findMany({
        where,
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
          publications: true,
        },
        orderBy: {
          drawTime: 'asc',
        },
      });

      return draws;
    } catch (error) {
      logger.error('Error obteniendo sorteos de hoy:', error);
      throw error;
    }
  }

  /**
   * Obtener próximo sorteo
   * @param {string} gameId - ID del juego (opcional)
   * @returns {Promise<Object|null>}
   */
  async getNextDraw(gameId = null) {
    try {
      // Obtener fecha y hora actual en Venezuela
      const todayVenezuela = getVenezuelaDateAsUTC();
      const currentTime = getVenezuelaTimeString();

      const where = {
        status: {
          in: ['SCHEDULED', 'CLOSED'],
        },
        OR: [
          // Sorteos de hoy con hora mayor a la actual
          {
            drawDate: todayVenezuela,
            drawTime: { gt: currentTime }
          },
          // Sorteos de días futuros
          {
            drawDate: { gt: todayVenezuela }
          }
        ]
      };

      if (gameId) {
        where.gameId = gameId;
      }

      const draw = await prisma.draw.findFirst({
        where,
        include: {
          game: true,
          preselectedItem: true,
        },
        orderBy: [
          { drawDate: 'asc' },
          { drawTime: 'asc' }
        ],
      });

      return draw;
    } catch (error) {
      logger.error('Error obteniendo próximo sorteo:', error);
      throw error;
    }
  }

  /**
   * Crear un sorteo
   * @param {Object} data - Datos del sorteo
   * @returns {Promise<Object>}
   */
  async createDraw(data) {
    try {
      const draw = await prisma.draw.create({
        data: {
          gameId: data.gameId,
          templateId: data.templateId,
          drawDate: data.drawDate,
          drawTime: data.drawTime,
          status: data.status || 'SCHEDULED',
          preselectedItemId: data.preselectedItemId,
          winnerItemId: data.winnerItemId,
          notes: data.notes,
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Sorteo creado: ${draw.game.name} - ${draw.drawDate} ${draw.drawTime}`);
      return draw;
    } catch (error) {
      logger.error('Error creando sorteo:', error);
      throw error;
    }
  }

  /**
   * Actualizar un sorteo
   * @param {string} id - ID del sorteo
   * @param {Object} data - Datos a actualizar
   * @returns {Promise<Object>}
   */
  async updateDraw(id, data) {
    try {
      const draw = await prisma.draw.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.preselectedItemId !== undefined && { preselectedItemId: data.preselectedItemId }),
          ...(data.winnerItemId !== undefined && { winnerItemId: data.winnerItemId }),
          ...(data.imageUrl && { imageUrl: data.imageUrl }),
          ...(data.closedAt && { closedAt: new Date(data.closedAt) }),
          ...(data.drawnAt && { drawnAt: new Date(data.drawnAt) }),
          ...(data.publishedAt && { publishedAt: new Date(data.publishedAt) }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Sorteo actualizado: ${draw.id}`);
      return draw;
    } catch (error) {
      logger.error(`Error actualizando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cerrar un sorteo (5 min antes)
   * @param {string} id - ID del sorteo
   * @param {string} preselectedItemId - ID del item preseleccionado
   * @returns {Promise<Object>}
   */
  async closeDraw(id, preselectedItemId) {
    try {
      const draw = await prisma.draw.update({
        where: { id },
        data: {
          status: 'CLOSED',
          preselectedItemId,
          closedAt: new Date(),
        },
        include: {
          game: true,
          preselectedItem: true,
        },
      });

      logger.info(`Sorteo cerrado: ${draw.id} - Preseleccionado: ${draw.preselectedItem?.number}`);
      return draw;
    } catch (error) {
      logger.error(`Error cerrando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Ejecutar un sorteo (confirmar ganador)
   * @param {string} id - ID del sorteo
   * @param {string} winnerItemId - ID del item ganador (opcional, usa preseleccionado si no se provee)
   * @returns {Promise<Object>}
   */
  async executeDraw(id, winnerItemId = null) {
    try {
      const draw = await this.getDrawById(id);
      
      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      const finalWinnerId = winnerItemId || draw.preselectedItemId;
      
      if (!finalWinnerId) {
        throw new Error('No hay ganador seleccionado');
      }

      const updatedDraw = await prisma.draw.update({
        where: { id },
        data: {
          status: 'DRAWN',
          winnerItemId: finalWinnerId,
          drawnAt: new Date(),
        },
        include: {
          game: true,
          winnerItem: true,
        },
      });

      // Actualizar lastWin del item ganador
      await prisma.gameItem.update({
        where: { id: finalWinnerId },
        data: { lastWin: new Date() },
      });

      logger.info(`Sorteo ejecutado: ${updatedDraw.id} - Ganador: ${updatedDraw.winnerItem?.number}`);
      
      // Generar imagen del sorteo automáticamente
      try {
        const { generateDrawImage } = await import('./imageService.js');
        await generateDrawImage(updatedDraw.id);
        logger.info(`✅ Imagen generada para sorteo ${updatedDraw.id}`);
      } catch (imageError) {
        logger.error(`❌ Error generando imagen para sorteo ${updatedDraw.id}:`, imageError);
        // No detener el flujo si falla la imagen
      }

      // Crear registros de publicación para cada canal activo
      const channels = ['TELEGRAM', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'];
      
      for (const channel of channels) {
        try {
          await prisma.drawPublication.create({
            data: {
              drawId: updatedDraw.id,
              channel: channel,
              status: 'PENDING'
            }
          });
        } catch (pubError) {
          logger.error(`Error creando publicación para ${channel}:`, pubError);
        }
      }

      // Verificar apuestas Tripleta activas
      try {
        const tripletaService = (await import('./tripleta.service.js')).default;
        const tripletaResult = await tripletaService.checkTripleBetsForDraw(updatedDraw.id);
        logger.info(`Tripletas verificadas: ${tripletaResult.winners} ganadores, ${tripletaResult.expired} expiradas`);
      } catch (tripletaError) {
        logger.error('Error verificando apuestas tripleta:', tripletaError);
        // No detener el flujo si falla la verificación de tripletas
      }
      
      return updatedDraw;
    } catch (error) {
      logger.error(`Error ejecutando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Preseleccionar ganador de un sorteo
   * @param {string} id - ID del sorteo
   * @param {string} itemId - ID del item a preseleccionar (null para aleatorio)
   * @returns {Promise<Object>}
   */
  async preselectWinner(id, itemId = null) {
    try {
      const draw = await this.getDrawById(id);
      
      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      if (draw.status !== 'SCHEDULED') {
        throw new Error('Solo se puede preseleccionar ganador en sorteos programados');
      }

      let selectedItemId = itemId;
      
      // Si no se proporciona itemId, seleccionar uno aleatorio
      if (!selectedItemId) {
        const items = draw.game.items.filter(item => item.isActive);
        if (items.length === 0) {
          throw new Error('No hay items disponibles para el sorteo');
        }
        const randomItem = items[Math.floor(Math.random() * items.length)];
        selectedItemId = randomItem.id;
      }

      const updatedDraw = await prisma.draw.update({
        where: { id },
        data: {
          preselectedItemId: selectedItemId,
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
          tickets: {
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        },
      });

      logger.info(`Ganador preseleccionado en sorteo ${id}: ${updatedDraw.preselectedItem?.number}`);

      // Notificar a administradores vía Telegram
      try {
        const adminNotificationService = (await import('./admin-notification.service.js')).default;
        const pdfReportService = (await import('./pdf-report.service.js')).default;
        
        // Calcular ventas totales del sorteo
        const tickets = updatedDraw.tickets || [];
        const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
        
        // Obtener configuración del juego
        const gameConfig = updatedDraw.game.config || {};
        const percentageToDistribute = gameConfig.percentageToDistribute || 70;
        
        // Calcular monto máximo a pagar
        let maxPayout;
        if (gameConfig.maxPayoutFixed && gameConfig.maxPayoutFixed > 0) {
          maxPayout = parseFloat(gameConfig.maxPayoutFixed);
        } else {
          maxPayout = (totalSales * percentageToDistribute) / 100;
        }
        maxPayout = Math.min(maxPayout, totalSales);
        
        // Agrupar ventas por item
        const salesByItem = {};
        for (const ticket of tickets) {
          for (const detail of ticket.details) {
            const itemNumber = detail.gameItem?.number || 'N/A';
            const itemName = detail.gameItem?.name || 'N/A';
            if (!salesByItem[itemNumber]) {
              salesByItem[itemNumber] = {
                number: itemNumber,
                name: itemName,
                amount: 0,
                count: 0
              };
            }
            salesByItem[itemNumber].amount += parseFloat(detail.amount);
            salesByItem[itemNumber].count += 1;
          }
        }
        
        // Calcular pago potencial del item seleccionado
        const selectedSales = Object.values(salesByItem).find(
          item => item.number === updatedDraw.preselectedItem.number
        );
        const potentialPayout = selectedSales 
          ? parseFloat(selectedSales.amount) * parseFloat(updatedDraw.preselectedItem.multiplier)
          : 0;
        
        // Generar PDF de cierre
        let pdfPath = null;
        try {
          const gameItems = await prisma.gameItem.findMany({
            where: {
              gameId: updatedDraw.gameId,
              isActive: true
            },
            orderBy: { number: 'asc' }
          });
          
          pdfPath = await pdfReportService.generateDrawClosingReport({
            drawId: updatedDraw.id,
            game: updatedDraw.game,
            drawDate: updatedDraw.drawDate,
            drawTime: updatedDraw.drawTime,
            prewinnerItem: updatedDraw.preselectedItem,
            totalSales,
            maxPayout,
            potentialPayout,
            allItems: gameItems,
            salesByItem: tickets.reduce((acc, ticket) => {
              ticket.details.forEach(detail => {
                if (!acc[detail.gameItemId]) {
                  acc[detail.gameItemId] = { amount: 0, count: 0 };
                }
                acc[detail.gameItemId].amount += parseFloat(detail.amount);
                acc[detail.gameItemId].count += 1;
              });
              return acc;
            }, {}),
            candidates: [],
            tripletaRiskData: {
              activeTripletas: 0,
              highRiskItems: 0,
              mediumRiskItems: 0,
              noRiskItems: 0,
              totalHighRiskPrize: 0,
              highRiskDetails: []
            }
          });
          logger.info(`  📄 PDF generado para pre-selección web: ${pdfPath}`);
        } catch (pdfError) {
          logger.warn(`⚠️ Error generando PDF para pre-selección web:`, pdfError.message);
        }
        
        // Enviar notificación
        await adminNotificationService.notifyPrewinnerSelected({
          drawId: updatedDraw.id,
          game: updatedDraw.game,
          drawDate: updatedDraw.drawDate,
          drawTime: updatedDraw.drawTime,
          prewinnerItem: updatedDraw.preselectedItem,
          totalSales,
          maxPayout,
          potentialPayout,
          salesByItem,
          pdfPath
        });
        
        logger.info(`📱 Notificación de pre-selección web enviada a administradores`);
      } catch (notifyError) {
        logger.error(`Error enviando notificación de pre-selección web:`, notifyError.message);
        // No fallar la operación si falla la notificación
      }
      
      return updatedDraw;
    } catch (error) {
      logger.error(`Error preseleccionando ganador del sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cambiar ganador de un sorteo
   * @param {string} id - ID del sorteo
   * @param {string} newWinnerItemId - ID del nuevo item ganador
   * @returns {Promise<Object>}
   */
  async changeWinner(id, newWinnerItemId) {
    try {
      const draw = await this.getDrawById(id);
      
      if (!draw) {
        throw new Error('Sorteo no encontrado');
      }

      if (draw.status === 'PUBLISHED' || draw.status === 'CANCELLED') {
        throw new Error('No se puede cambiar el ganador de sorteos publicados o cancelados');
      }

      const previousItem = draw.preselectedItem;

      const updatedDraw = await prisma.draw.update({
        where: { id },
        data: {
          preselectedItemId: newWinnerItemId,
          ...(draw.status === 'DRAWN' && { winnerItemId: newWinnerItemId }),
        },
        include: {
          game: true,
          preselectedItem: true,
          winnerItem: true,
        },
      });

      logger.info(`Ganador cambiado en sorteo ${id}: ${updatedDraw.preselectedItem?.number}`);

      // Notificar a administradores vía Telegram sobre el cambio
      try {
        const adminTelegramBotService = (await import('./admin-telegram-bot.service.js')).default;
        
        const [hours, mins] = updatedDraw.drawTime.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'p. m.' : 'a. m.';
        const displayHour = hour % 12 || 12;
        const drawTime = `${displayHour.toString().padStart(2, '0')}:${mins} ${ampm}`;

        // Obtener todos los administradores del juego con Telegram vinculado
        const admins = await prisma.userGame.findMany({
          where: {
            gameId: updatedDraw.gameId,
            notify: true,
            user: {
              isActive: true,
              telegramChatId: { not: null }
            }
          },
          include: { user: true }
        });

        if (admins.length > 0) {
          const message = `
🔔 <b>CAMBIO DE PRE-GANADOR</b>

🎰 <b>Juego:</b> ${updatedDraw.game.name}
⏰ <b>Sorteo:</b> ${drawTime}
${previousItem ? `\n❌ <b>Anterior:</b> ${previousItem.number} - ${previousItem.name}` : ''}
✅ <b>Nuevo:</b> ${updatedDraw.preselectedItem.number} - ${updatedDraw.preselectedItem.name}

👤 <b>Cambiado por:</b> Administrador
📱 <b>Vía:</b> Panel Web
          `.trim();

          // Enviar a cada administrador
          for (const admin of admins) {
            try {
              await adminTelegramBotService.sendMessageDirect(admin.user.telegramChatId, message);
            } catch (error) {
              logger.error(`Error notificando cambio a ${admin.user.username}:`, error.message);
            }
          }

          logger.info(`📢 Notificado cambio de pre-ganador web a ${admins.length} administrador(es)`);
        }
      } catch (notifyError) {
        logger.error(`Error enviando notificación de cambio web:`, notifyError.message);
        // No fallar la operación si falla la notificación
      }

      return updatedDraw;
    } catch (error) {
      logger.error(`Error cambiando ganador del sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cancelar un sorteo
   * @param {string} id - ID del sorteo
   * @param {string} reason - Razón de cancelación
   * @returns {Promise<Object>}
   */
  async cancelDraw(id, reason) {
    try {
      const draw = await prisma.draw.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason,
        },
        include: {
          game: true,
        },
      });

      logger.info(`Sorteo cancelado: ${draw.id} - Razón: ${reason}`);
      return draw;
    } catch (error) {
      logger.error(`Error cancelando sorteo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtener sorteos que deben cerrarse (5 min antes)
   * @returns {Promise<Array>}
   */
  async getDrawsToClose() {
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // Este método ya no se usa - los jobs usan drawDate y drawTime
      const draws = await prisma.draw.findMany({
        where: {
          status: 'SCHEDULED',
          drawDate: new Date(),
        },
        include: {
          game: {
            include: {
              items: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      return draws;
    } catch (error) {
      logger.error('Error obteniendo sorteos para cerrar:', error);
      throw error;
    }
  }

  /**
   * Obtener sorteos que deben ejecutarse
   * @returns {Promise<Array>}
   */
  async getDrawsToExecute() {
    try {
      const now = new Date();

      // Este método ya no se usa - los jobs usan drawDate y drawTime
      const draws = await prisma.draw.findMany({
        where: {
          status: 'CLOSED',
          drawDate: new Date(),
        },
        include: {
          game: true,
          preselectedItem: true,
        },
      });

      return draws;
    } catch (error) {
      logger.error('Error obteniendo sorteos para ejecutar:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de sorteos
   * @param {string} gameId - ID del juego (opcional)
   * @param {Date} dateFrom - Fecha desde
   * @param {Date} dateTo - Fecha hasta
   * @returns {Promise<Object>}
   */
  async getDrawStats(gameId = null, dateFrom = null, dateTo = null) {
    try {
      const where = {};
      
      if (gameId) {
        where.gameId = gameId;
      }
      
      if (dateFrom || dateTo) {
        where.drawDate = {};
        if (dateFrom) {
          const [year, month, day] = dateFrom.split('-').map(Number);
          where.drawDate.gte = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        }
        if (dateTo) {
          const [year, month, day] = dateTo.split('-').map(Number);
          where.drawDate.lte = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        }
      }

      const [total, scheduled, closed, drawn, published, cancelled] = await Promise.all([
        prisma.draw.count({ where }),
        prisma.draw.count({ where: { ...where, status: 'SCHEDULED' } }),
        prisma.draw.count({ where: { ...where, status: 'CLOSED' } }),
        prisma.draw.count({ where: { ...where, status: 'DRAWN' } }),
        prisma.draw.count({ where: { ...where, status: 'PUBLISHED' } }),
        prisma.draw.count({ where: { ...where, status: 'CANCELLED' } }),
      ]);

      return {
        total,
        scheduled,
        closed,
        drawn,
        published,
        cancelled,
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de sorteos:', error);
      throw error;
    }
  }
}

export default new DrawService();
