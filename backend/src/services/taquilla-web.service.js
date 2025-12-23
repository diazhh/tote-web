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
   * Limpiar cache de entidades (útil para testing)
   */
  clearCache() {
    this._taquillaWebEntities = null;
  }
}

export default new TaquillaWebService();
