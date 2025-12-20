import ticketService from '../services/ticket.service.js';
import logger from '../lib/logger.js';

class TicketController {
  async create(req, res) {
    try {
      const userId = req.user.id;
      const { drawId, details } = req.body;

      if (!drawId || !details) {
        return res.status(400).json({
          success: false,
          error: 'Los campos drawId y details son requeridos'
        });
      }

      if (!Array.isArray(details) || details.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'details debe ser un array con al menos una jugada'
        });
      }

      const ticket = await ticketService.create(userId, {
        drawId,
        details
      });

      res.status(201).json({
        success: true,
        data: ticket,
        message: 'Ticket creado exitosamente'
      });
    } catch (error) {
      logger.error('Error in create ticket:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al crear ticket'
      });
    }
  }

  async getAll(req, res) {
    try {
      const { userId, drawId, status } = req.query;
      
      const filters = {};
      if (userId) filters.userId = userId;
      if (drawId) filters.drawId = drawId;
      if (status) filters.status = status;

      const tickets = await ticketService.findAll(filters);

      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      logger.error('Error in getAll tickets:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener tickets'
      });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;

      const ticket = await ticketService.findById(id);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'Ticket no encontrado'
        });
      }

      if (req.user.role !== 'ADMIN' && ticket.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'No tienes permisos para ver este ticket'
        });
      }

      res.json({
        success: true,
        data: ticket
      });
    } catch (error) {
      logger.error('Error in getById ticket:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener ticket'
      });
    }
  }

  async getMyTickets(req, res) {
    try {
      const userId = req.user.id;
      const { status, drawId } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (drawId) filters.drawId = drawId;

      const tickets = await ticketService.getUserTickets(userId, filters);

      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      logger.error('Error in getMyTickets:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener tus tickets'
      });
    }
  }

  async getByDraw(req, res) {
    try {
      const { drawId } = req.params;

      const tickets = await ticketService.getTicketsByDraw(drawId);

      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      logger.error('Error in getByDraw:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener tickets del sorteo'
      });
    }
  }

  async cancel(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const ticket = await ticketService.cancel(id, userId);

      res.json({
        success: true,
        data: ticket,
        message: 'Ticket cancelado y saldo reembolsado'
      });
    } catch (error) {
      logger.error('Error in cancel ticket:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al cancelar ticket'
      });
    }
  }

  async getStatsByDraw(req, res) {
    try {
      const { drawId } = req.params;

      const stats = await ticketService.getStatsByDraw(drawId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error in getStatsByDraw:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estadísticas del sorteo'
      });
    }
  }
}

export default new TicketController();
