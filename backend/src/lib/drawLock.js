import { prisma } from './prisma.js';
import logger from './logger.js';
import crypto from 'crypto';

/**
 * Convierte un drawId (UUID string) a un BigInt determinístico válido
 * para pg_advisory_xact_lock (signed bigint, 64 bits).
 *
 * Tomamos los primeros 8 bytes del SHA-256 del drawId, los interpretamos
 * como signed bigint, garantizando una clave estable por sorteo.
 */
function drawIdToLockKey(drawId) {
  const hash = crypto.createHash('sha256').update(drawId).digest();
  const buf = Buffer.from(hash.slice(0, 8));
  return buf.readBigInt64BE(0);
}

/**
 * Ejecuta `fn` bajo un advisory lock transaccional de Postgres
 * keyado por drawId. Garantiza que solo un proceso a la vez puede
 * trabajar sobre los datos de un draw específico (sync SRQ vs.
 * selección de preganador, por ejemplo).
 *
 * El lock se libera automáticamente al terminar la transacción.
 *
 * @param {string} drawId - UUID del sorteo
 * @param {Function} fn - función async que recibe el cliente Prisma transaccional
 * @returns {Promise<any>} resultado de fn
 */
export async function withDrawLock(drawId, fn) {
  if (!drawId) {
    throw new Error('withDrawLock: drawId es requerido');
  }

  const key = drawIdToLockKey(drawId);
  const startedAt = Date.now();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
    const lockWaitMs = Date.now() - startedAt;
    if (lockWaitMs > 1000) {
      logger.warn(`🔐 drawLock(${drawId}) esperó ${lockWaitMs}ms antes de adquirir`);
    }
    return fn(tx);
  }, {
    timeout: 60_000,
    maxWait: 60_000,
  });
}

export default withDrawLock;
