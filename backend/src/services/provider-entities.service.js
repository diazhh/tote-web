/**
 * Servicio para gestión de entidades de proveedores
 * Jerarquía: Comercial → Banca → Grupo → Taquilla
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

class ProviderEntitiesService {
  /**
   * Asegurar que todas las entidades de un ticket existan
   * Si no existen, las crea automáticamente
   * @param {string} apiSystemId - ID del sistema de API (proveedor)
   * @param {Object} ticketData - Datos del ticket con comercialID, bancaID, grupoID, taquillaID
   * @returns {Promise<Object>} - IDs de las entidades creadas/encontradas
   */
  async ensureEntitiesExist(apiSystemId, ticketData) {
    try {
      const { comercialID, bancaID, grupoID, taquillaID } = ticketData;

      if (!comercialID || !bancaID || !grupoID || !taquillaID) {
        logger.debug('Ticket sin datos completos de entidades, saltando...');
        return null;
      }

      // 1. Obtener o crear Comercial
      const comercial = await this.getOrCreateComercial(apiSystemId, comercialID);

      // 2. Obtener o crear Banca (pertenece al Comercial)
      const banca = await this.getOrCreateBanca(comercial.id, bancaID);

      // 3. Obtener o crear Grupo (pertenece a la Banca)
      const grupo = await this.getOrCreateGrupo(banca.id, grupoID);

      // 4. Obtener o crear Taquilla (pertenece al Grupo)
      const taquilla = await this.getOrCreateTaquilla(grupo.id, taquillaID);

      return {
        comercialId: comercial.id,
        bancaId: banca.id,
        grupoId: grupo.id,
        taquillaId: taquilla.id
      };
    } catch (error) {
      logger.error('Error asegurando entidades:', error);
      throw error;
    }
  }

  /**
   * Obtener o crear un Comercial
   */
  async getOrCreateComercial(apiSystemId, externalId) {
    try {
      let comercial = await prisma.providerComercial.findUnique({
        where: {
          apiSystemId_externalId: {
            apiSystemId,
            externalId: parseInt(externalId)
          }
        }
      });

      if (!comercial) {
        comercial = await prisma.providerComercial.create({
          data: {
            apiSystemId,
            externalId: parseInt(externalId)
          }
        });
        logger.debug(`Comercial creado: ${externalId}`);
      }

      return comercial;
    } catch (error) {
      logger.error(`Error en getOrCreateComercial(${externalId}):`, error);
      throw error;
    }
  }

  /**
   * Obtener o crear una Banca
   */
  async getOrCreateBanca(comercialId, externalId) {
    try {
      let banca = await prisma.providerBanca.findUnique({
        where: {
          comercialId_externalId: {
            comercialId,
            externalId: parseInt(externalId)
          }
        }
      });

      if (!banca) {
        banca = await prisma.providerBanca.create({
          data: {
            comercialId,
            externalId: parseInt(externalId)
          }
        });
        logger.debug(`Banca creada: ${externalId}`);
      }

      return banca;
    } catch (error) {
      logger.error(`Error en getOrCreateBanca(${externalId}):`, error);
      throw error;
    }
  }

  /**
   * Obtener o crear un Grupo
   */
  async getOrCreateGrupo(bancaId, externalId) {
    try {
      let grupo = await prisma.providerGrupo.findUnique({
        where: {
          bancaId_externalId: {
            bancaId,
            externalId: parseInt(externalId)
          }
        }
      });

      if (!grupo) {
        grupo = await prisma.providerGrupo.create({
          data: {
            bancaId,
            externalId: parseInt(externalId)
          }
        });
        logger.debug(`Grupo creado: ${externalId}`);
      }

      return grupo;
    } catch (error) {
      logger.error(`Error en getOrCreateGrupo(${externalId}):`, error);
      throw error;
    }
  }

  /**
   * Obtener o crear una Taquilla
   */
  async getOrCreateTaquilla(grupoId, externalId) {
    try {
      let taquilla = await prisma.providerTaquilla.findUnique({
        where: {
          grupoId_externalId: {
            grupoId,
            externalId: parseInt(externalId)
          }
        }
      });

      if (!taquilla) {
        taquilla = await prisma.providerTaquilla.create({
          data: {
            grupoId,
            externalId: parseInt(externalId)
          }
        });
        logger.debug(`Taquilla creada: ${externalId}`);
      }

      return taquilla;
    } catch (error) {
      logger.error(`Error en getOrCreateTaquilla(${externalId}):`, error);
      throw error;
    }
  }

  /**
   * Obtener todas las entidades de un proveedor
   */
  async getEntitiesByProvider(apiSystemId) {
    try {
      const comerciales = await prisma.providerComercial.findMany({
        where: { apiSystemId },
        include: {
          bancas: {
            include: {
              grupos: {
                include: {
                  taquillas: true
                }
              }
            }
          }
        },
        orderBy: { externalId: 'asc' }
      });

      return comerciales;
    } catch (error) {
      logger.error('Error obteniendo entidades por proveedor:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de entidades por proveedor
   */
  async getEntitiesStats(apiSystemId) {
    try {
      const [comerciales, bancas, grupos, taquillas] = await Promise.all([
        prisma.providerComercial.count({ where: { apiSystemId } }),
        prisma.providerBanca.count({
          where: { comercial: { apiSystemId } }
        }),
        prisma.providerGrupo.count({
          where: { banca: { comercial: { apiSystemId } } }
        }),
        prisma.providerTaquilla.count({
          where: { grupo: { banca: { comercial: { apiSystemId } } } }
        })
      ]);

      return { comerciales, bancas, grupos, taquillas };
    } catch (error) {
      logger.error('Error obteniendo estadísticas de entidades:', error);
      throw error;
    }
  }

  /**
   * Actualizar nombre de un Comercial
   */
  async updateComercialName(id, name) {
    return prisma.providerComercial.update({
      where: { id },
      data: { name }
    });
  }

  /**
   * Actualizar nombre de una Banca
   */
  async updateBancaName(id, name) {
    return prisma.providerBanca.update({
      where: { id },
      data: { name }
    });
  }

  /**
   * Actualizar nombre de un Grupo
   */
  async updateGrupoName(id, name) {
    return prisma.providerGrupo.update({
      where: { id },
      data: { name }
    });
  }

  /**
   * Actualizar nombre de una Taquilla
   */
  async updateTaquillaName(id, name) {
    return prisma.providerTaquilla.update({
      where: { id },
      data: { name }
    });
  }

  /**
   * Obtener Banca por ID externo y proveedor
   */
  async getBancaByExternalId(apiSystemId, externalBancaId) {
    try {
      const banca = await prisma.providerBanca.findFirst({
        where: {
          externalId: parseInt(externalBancaId),
          comercial: { apiSystemId }
        },
        include: {
          comercial: true
        }
      });
      return banca;
    } catch (error) {
      logger.error('Error obteniendo banca por ID externo:', error);
      throw error;
    }
  }

  /**
   * Listar todas las bancas de un proveedor
   */
  async listBancasByProvider(apiSystemId) {
    try {
      const bancas = await prisma.providerBanca.findMany({
        where: {
          comercial: { apiSystemId }
        },
        include: {
          comercial: {
            select: {
              id: true,
              externalId: true,
              name: true
            }
          }
        },
        orderBy: { externalId: 'asc' }
      });
      return bancas;
    } catch (error) {
      logger.error('Error listando bancas por proveedor:', error);
      throw error;
    }
  }
}

export default new ProviderEntitiesService();
