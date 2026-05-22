/**
 * Middleware para el rol FISCALIZADOR.
 *
 * - Verifica que req.user.role === 'FISCALIZADOR'.
 * - Resuelve el universo permitido (gameIds, apiSystemIds, includeTaquilla) a
 *   partir de UserGame + UserApiSystem + flag User.fiscalIncludeTaquilla.
 * - Adjunta req.fiscalScope para que el service pueda intersectarlo con los
 *   filtros que pida el cliente.
 *
 * Convención (acordada con el negocio):
 *   - Sin UserGame asignado     → ve todos los juegos.
 *   - Sin UserApiSystem asignado → ve todos los proveedores; Taquilla Online
 *     se incluye/excluye según fiscalIncludeTaquilla.
 *   - Con asignaciones explícitas → solo esos.
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

export const requireFiscalizador = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'FISCALIZADOR') {
      return res.status(403).json({ success: false, error: 'Acceso restringido a fiscalizadores' });
    }

    const [userGames, userApiSystems] = await Promise.all([
      prisma.userGame.findMany({
        where: { userId: user.id },
        select: { gameId: true },
      }),
      prisma.userApiSystem.findMany({
        where: { userId: user.id },
        select: { apiSystemId: true },
      }),
    ]);

    req.fiscalScope = {
      // null → "sin restricción explícita" (ve todos los juegos)
      gameIds: userGames.length > 0 ? userGames.map((r) => r.gameId) : null,
      apiSystemIds: userApiSystems.length > 0 ? userApiSystems.map((r) => r.apiSystemId) : null,
      includeTaquilla: !!user.fiscalIncludeTaquilla,
    };

    next();
  } catch (err) {
    logger.error('[fiscal-scope] error resolviendo scope:', err);
    return res.status(500).json({ success: false, error: 'Error resolviendo permisos del fiscalizador' });
  }
};
