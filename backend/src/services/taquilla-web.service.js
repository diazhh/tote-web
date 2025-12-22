/**
 * Servicio para gestión de la Taquilla Web
 * Maneja la creación de tickets internos y su equivalente en ExternalTicket
 * para mantener consistencia con el sistema de reportes
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class TaquillaWebService {
  constructor() {
    this._taquillaWebEntities = null;
  }

  /**
   * Obtener las entidades del proveedor TAQUILLA_WEB
   * Se cachean para evitar consultas repetidas
   */
  async getTaquillaWebEntities() {
    if (this._taquillaWebEntities) {
      return this._taquillaWebEntities;
    }

    try {
      // Buscar el ApiSystem de TAQUILLA_WEB
      const apiSystem = await prisma.apiSystem.findFirst({
        where: { name: 'TAQUILLA_WEB' }
      });

      if (!apiSystem) {
        logger.warn('ApiSystem TAQUILLA_WEB no encontrado. Ejecutar seed-taquilla-web.js');
        return null;
      }

      // Buscar el comercial
      const comercial = await prisma.providerComercial.findFirst({
        where: { apiSystemId: apiSystem.id }
      });

      if (!comercial) {
        logger.warn('Comercial de TAQUILLA_WEB no encontrado');
        return null;
      }

      // Buscar la banca
      const banca = await prisma.providerBanca.findFirst({
        where: { comercialId: comercial.id }
      });

      if (!banca) {
        logger.warn('Banca de TAQUILLA_WEB no encontrada');
        return null;
      }

      // Buscar el grupo
      const grupo = await prisma.providerGrupo.findFirst({
        where: { bancaId: banca.id }
      });

      if (!grupo) {
        logger.warn('Grupo de TAQUILLA_WEB no encontrado');
        return null;
      }

      // Buscar la taquilla
      const taquilla = await prisma.providerTaquilla.findFirst({
        where: { grupoId: grupo.id }
      });

      if (!taquilla) {
        logger.warn('Taquilla de TAQUILLA_WEB no encontrada');
        return null;
      }

      this._taquillaWebEntities = {
        apiSystemId: apiSystem.id,
        comercialId: comercial.id,
        comercialExternalId: comercial.externalId,
        bancaId: banca.id,
        bancaExternalId: banca.externalId,
        grupoId: grupo.id,
        grupoExternalId: grupo.externalId,
        taquillaId: taquilla.id,
        taquillaExternalId: taquilla.externalId
      };

      logger.info('Entidades TAQUILLA_WEB cargadas correctamente');
      return this._taquillaWebEntities;
    } catch (error) {
      logger.error('Error obteniendo entidades TAQUILLA_WEB:', error);
      return null;
    }
  }

  /**
   * Crear ExternalTicket equivalente para un ticket de taquilla web
   * Esto permite que los tickets de la taquilla web aparezcan en los reportes
   * junto con los tickets de proveedores externos
   * 
   * @param {Object} ticket - Ticket creado en la taquilla web
   * @param {Object} draw - Sorteo asociado
   */
  async createExternalTicketEquivalent(ticket, draw) {
    try {
      const entities = await this.getTaquillaWebEntities();
      
      if (!entities) {
        logger.warn('No se pueden crear ExternalTickets sin entidades TAQUILLA_WEB');
        return null;
      }

      // Buscar o crear el mapping para este sorteo
      let mapping = await prisma.apiDrawMapping.findFirst({
        where: {
          drawId: draw.id,
          apiConfig: {
            apiSystemId: entities.apiSystemId
          }
        }
      });

      // Si no existe mapping, necesitamos crear una configuración de API primero
      if (!mapping) {
        // Buscar o crear configuración de API para TAQUILLA_WEB
        let apiConfig = await prisma.apiConfiguration.findFirst({
          where: {
            apiSystemId: entities.apiSystemId,
            gameId: draw.gameId,
            type: 'SALES'
          }
        });

        if (!apiConfig) {
          apiConfig = await prisma.apiConfiguration.create({
            data: {
              name: `TAQUILLA_WEB - ${draw.game?.name || 'Juego'}`,
              apiSystemId: entities.apiSystemId,
              gameId: draw.gameId,
              type: 'SALES',
              baseUrl: 'internal://taquilla-web',
              token: 'internal',
              isActive: true
            }
          });
        }

        // Crear mapping
        mapping = await prisma.apiDrawMapping.create({
          data: {
            apiConfigId: apiConfig.id,
            drawId: draw.id,
            externalDrawId: `TW-${draw.id}` // Prefijo TW para identificar como taquilla web
          }
        });
      }

      // Crear ExternalTickets para cada detalle del ticket
      const externalTickets = [];
      
      for (const detail of ticket.details) {
        const externalTicket = await prisma.externalTicket.create({
          data: {
            mappingId: mapping.id,
            gameItemId: detail.gameItemId,
            amount: detail.amount,
            externalData: {
              ticketID: ticket.id,
              taquillaID: entities.taquillaExternalId,
              grupoID: entities.grupoExternalId,
              bancaID: entities.bancaExternalId,
              comercialID: entities.comercialExternalId,
              premio: 0, // Se actualizará cuando se ejecute el sorteo
              isWebTicket: true, // Marcador para identificar tickets web
              userId: ticket.userId,
              entityIds: {
                comercialId: entities.comercialId,
                bancaId: entities.bancaId,
                grupoId: entities.grupoId,
                taquillaId: entities.taquillaId
              }
            }
          }
        });
        externalTickets.push(externalTicket);
      }

      logger.debug(`ExternalTickets creados para ticket web ${ticket.id}: ${externalTickets.length}`);
      return externalTickets;
    } catch (error) {
      logger.error('Error creando ExternalTicket equivalente:', error);
      return null;
    }
  }

  /**
   * Eliminar ExternalTickets equivalentes cuando se cancela un ticket web
   */
  async deleteExternalTicketEquivalent(ticketId) {
    try {
      const result = await prisma.externalTicket.deleteMany({
        where: {
          externalData: {
            path: ['ticketID'],
            equals: ticketId
          }
        }
      });

      logger.debug(`ExternalTickets eliminados para ticket ${ticketId}: ${result.count}`);
      return result.count;
    } catch (error) {
      logger.error('Error eliminando ExternalTicket equivalente:', error);
      return 0;
    }
  }

  /**
   * Limpiar cache de entidades (útil para testing)
   */
  clearCache() {
    this._taquillaWebEntities = null;
  }
}

export default new TaquillaWebService();
