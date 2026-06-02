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

/**
 * Resuelve el universo permitido (gameIds, apiSystemIds, includeTaquilla) de un
 * usuario a partir de sus filas UserGame + UserApiSystem + flag
 * fiscalIncludeTaquilla, y lo adjunta como req.fiscalScope.
 *
 * Compartido por el rol FISCALIZADOR y el rol VIEWER (visor): ambos usan el
 * mismo modelo de scope; lo único que cambia es qué reporte se expone.
 */
async function attachScope(req) {
  const user = req.user;
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
}

export const requireFiscalizador = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'FISCALIZADOR') {
      return res.status(403).json({ success: false, error: 'Acceso restringido a fiscalizadores' });
    }

    await attachScope(req);
    next();
  } catch (err) {
    logger.error('[fiscal-scope] error resolviendo scope:', err);
    return res.status(500).json({ success: false, error: 'Error resolviendo permisos del fiscalizador' });
  }
};

/**
 * Middleware para el rol VIEWER (visor). Mismo modelo de scope que el
 * fiscalizador (UserGame + UserApiSystem + fiscalIncludeTaquilla), pero solo se
 * usa para el reporte de VENTAS (sin premios ni utilidad).
 */
export const requireViewer = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'VIEWER') {
      return res.status(403).json({ success: false, error: 'Acceso restringido a visores' });
    }

    await attachScope(req);
    next();
  } catch (err) {
    logger.error('[fiscal-scope] error resolviendo scope (viewer):', err);
    return res.status(500).json({ success: false, error: 'Error resolviendo permisos del visor' });
  }
};
