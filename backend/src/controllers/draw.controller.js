/**
 * Controlador para gestión de sorteos
 */

import drawService from '../services/draw.service.js';
import prewinnerOptimizerService from '../services/prewinner-optimizer.service.js';
import prewinnerSelectionService from '../services/prewinner-selection.service.js';
import publicationService from '../services/publication.service.js';
import * as imageService from '../services/imageService.js';
import { prisma } from '../lib/prisma.js';

export class DrawController {
  /**
   * GET /api/draws
   */
  async getDraws(req, res, next) {
    try {
      const filters = {
        gameId: req.query.gameId,
        status: req.query.status,
        date: req.query.date, // Filtro por fecha específica
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        orderBy: req.query.orderBy || 'desc',
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        skip: req.query.skip ? parseInt(req.query.skip) : undefined,
      };

      const { draws, total } = await drawService.getDraws(filters);

      res.json({
        success: true,
        data: draws,
        count: draws.length,
        total: total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/:id
   */
  async getDrawById(req, res, next) {
    try {
      const { id } = req.params;
      const draw = await drawService.getDrawById(id);

      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'Sorteo no encontrado',
        });
      }

      res.json({
        success: true,
        data: draw,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/today
   */
  async getTodayDraws(req, res, next) {
    try {
      const gameId = req.query.gameId;
      const draws = await drawService.getTodayDraws(gameId);

      res.json({
        success: true,
        data: draws,
        count: draws.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/next
   */
  async getNextDraw(req, res, next) {
    try {
      const gameId = req.query.gameId;
      const draw = await drawService.getNextDraw(gameId);

      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'No hay sorteos próximos',
        });
      }

      res.json({
        success: true,
        data: draw,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws
   */
  async createDraw(req, res, next) {
    try {
      const draw = await drawService.createDraw(req.body);

      res.status(201).json({
        success: true,
        data: draw,
        message: 'Sorteo creado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/draws/:id
   */
  async updateDraw(req, res, next) {
    try {
      const { id } = req.params;
      const draw = await drawService.updateDraw(id, req.body);

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo actualizado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/close
   */
  async closeDraw(req, res, next) {
    try {
      const { id } = req.params;
      const { preselectedItemId } = req.body;

      if (!preselectedItemId) {
        return res.status(400).json({
          success: false,
          error: 'preselectedItemId es requerido',
        });
      }

      const draw = await drawService.closeDraw(id, preselectedItemId);

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo cerrado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/execute
   */
  async executeDraw(req, res, next) {
    try {
      const { id } = req.params;
      const { winnerItemId } = req.body;

      const draw = await drawService.executeDraw(id, winnerItemId);

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo ejecutado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/preselect
   */
  async preselectWinner(req, res, next) {
    try {
      const { id } = req.params;
      const { itemId } = req.body;

      const draw = await drawService.preselectWinner(id, itemId);

      res.json({
        success: true,
        data: draw,
        message: 'Ganador preseleccionado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/change-winner
   */
  async changeWinner(req, res, next) {
    try {
      const { id } = req.params;
      const { newWinnerItemId } = req.body;

      if (!newWinnerItemId) {
        return res.status(400).json({
          success: false,
          error: 'newWinnerItemId es requerido',
        });
      }

      const draw = await drawService.changeWinner(id, newWinnerItemId);

      res.json({
        success: true,
        data: draw,
        message: 'Ganador cambiado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/cancel
   */
  async cancelDraw(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const draw = await drawService.cancelDraw(id, reason || 'Sin razón especificada');

      res.json({
        success: true,
        data: draw,
        message: 'Sorteo cancelado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/stats
   */
  async getDrawStats(req, res, next) {
    try {
      const { gameId, dateFrom, dateTo } = req.query;
      const stats = await drawService.getDrawStats(gameId, dateFrom, dateTo);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/draws/:id/analyze-prewinner
   * Analiza el sorteo y muestra qué item sería seleccionado como pre-ganador
   * sin ejecutar la selección real. Útil para pruebas y debugging.
   */
  async analyzePrewinner(req, res, next) {
    try {
      const { id } = req.params;
      
      const result = await prewinnerOptimizerService.selectOptimalPrewinner(id);
      
      res.json({
        success: true,
        data: result,
        message: 'Análisis de pre-ganador completado (sin guardar cambios)',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/select-prewinner
   * Ejecuta la selección automática de pre-ganador usando el optimizador
   */
  async selectPrewinner(req, res, next) {
    try {
      const { id } = req.params;
      
      const selectedItem = await prewinnerSelectionService.selectPrewinner(id);
      
      if (!selectedItem) {
        return res.status(400).json({
          success: false,
          error: 'No se pudo seleccionar un pre-ganador',
        });
      }
      
      res.json({
        success: true,
        data: {
          selectedItem: {
            id: selectedItem.id,
            number: selectedItem.number,
            name: selectedItem.name,
            multiplier: selectedItem.multiplier
          }
        },
        message: `Pre-ganador seleccionado: ${selectedItem.number} - ${selectedItem.name}`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/force-totalize
   * Totaliza manualmente un sorteo que no se ejecutó automáticamente
   */
  async forceTotalize(req, res, next) {
    try {
      const { id } = req.params;
      const { winnerItemId } = req.body;

      // Obtener el sorteo
      const draw = await drawService.getDrawById(id);
      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'Sorteo no encontrado',
        });
      }

      // Validar estado
      if (!['SCHEDULED', 'CLOSED'].includes(draw.status)) {
        return res.status(400).json({
          success: false,
          error: `No se puede totalizar un sorteo en estado ${draw.status}. Solo SCHEDULED o CLOSED.`,
        });
      }

      // Si no se proporciona winnerItemId, usar el preseleccionado o seleccionar uno
      let finalWinnerItemId = winnerItemId;
      if (!finalWinnerItemId) {
        if (draw.preselectedItemId) {
          finalWinnerItemId = draw.preselectedItemId;
        } else {
          // Seleccionar automáticamente
          const selectedItem = await prewinnerSelectionService.selectPrewinner(id);
          if (selectedItem) {
            finalWinnerItemId = selectedItem.id;
          } else {
            return res.status(400).json({
              success: false,
              error: 'No se pudo determinar un ganador. Proporcione winnerItemId.',
            });
          }
        }
      }

      // Ejecutar el sorteo
      const executedDraw = await drawService.executeDraw(id, finalWinnerItemId);

      // Generar imagen
      let imageResult = null;
      try {
        imageResult = await imageService.generateDrawImage(id);
      } catch (imageError) {
        console.error('Error generando imagen:', imageError);
      }

      // Publicar en canales
      let publicationResult = null;
      try {
        publicationResult = await publicationService.publishDraw(id);
      } catch (pubError) {
        console.error('Error publicando sorteo:', pubError);
      }

      res.json({
        success: true,
        data: {
          draw: executedDraw,
          image: imageResult,
          publication: publicationResult,
        },
        message: 'Sorteo totalizado manualmente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/regenerate-image
   * Regenera la imagen del resultado de un sorteo
   */
  async regenerateImage(req, res, next) {
    try {
      const { id } = req.params;

      // Obtener el sorteo
      const draw = await drawService.getDrawById(id);
      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'Sorteo no encontrado',
        });
      }

      // Validar que tenga ganador
      if (!draw.winnerItemId) {
        return res.status(400).json({
          success: false,
          error: 'El sorteo debe tener un ganador para generar imagen',
        });
      }

      // Regenerar imagen
      const imageResult = await imageService.regenerateDrawImage(id);

      res.json({
        success: true,
        data: imageResult,
        message: 'Imagen regenerada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/draws/:id/republish
   * Reenvía el sorteo a canales específicos o todos
   */
  async republish(req, res, next) {
    try {
      const { id } = req.params;
      const { channels } = req.body; // Array opcional de tipos de canal: ['WHATSAPP', 'TELEGRAM', etc]

      // Obtener el sorteo
      const draw = await drawService.getDrawById(id);
      if (!draw) {
        return res.status(404).json({
          success: false,
          error: 'Sorteo no encontrado',
        });
      }

      // Validar que tenga ganador
      if (!draw.winnerItemId) {
        return res.status(400).json({
          success: false,
          error: 'El sorteo debe tener un ganador para republicar',
        });
      }

      // Obtener tipos de canales a republicar
      let channelTypes = channels;
      
      if (!channelTypes || !Array.isArray(channelTypes) || channelTypes.length === 0) {
        // Si no se especifican canales, obtener todos los activos del juego
        const activeChannels = await prisma.gameChannel.findMany({
          where: { gameId: draw.gameId, isActive: true },
          select: { channelType: true }
        });
        channelTypes = [...new Set(activeChannels.map(c => c.channelType))];
      }

      // Republicar en cada canal
      const results = [];
      for (const channelType of channelTypes) {
        try {
          const channelResult = await publicationService.republishToChannel(id, channelType);
          results.push({
            channelType,
            success: true,
            ...channelResult,
          });
        } catch (error) {
          results.push({
            channelType,
            success: false,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        data: { results },
        message: `Sorteo republicado en ${results.filter(r => r.success).length}/${results.length} canales`,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new DrawController();
