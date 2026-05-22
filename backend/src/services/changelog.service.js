/**
 * Servicio de Changelog — bitácora de cambios visibles al staff.
 *
 * Reglas de visibilidad:
 *   - Roles staff (ADMIN, OPERATOR, TAQUILLA_ADMIN) pueden listar.
 *   - Solo entradas con isPublished=true se devuelven al listar (a menos
 *     que el llamador sea ADMIN, que puede ver drafts pasando includeDrafts).
 *   - Solo ADMIN puede crear/editar/borrar (validado en el controller/route).
 */
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const VALID_CATEGORIES = ['FEATURE', 'IMPROVEMENT', 'FIX', 'BREAKING'];

class ChangelogService {
  /**
   * Lista entradas con paginación, ordenadas por publishedAt DESC.
   * @param {object} opts
   * @param {number} [opts.page=1]
   * @param {number} [opts.pageSize=25]
   * @param {boolean} [opts.includeDrafts=false] - true solo para ADMIN
   * @param {string}  [opts.category]            - filtro opcional
   */
  async list({ page = 1, pageSize = 25, includeDrafts = false, category = null } = {}) {
    const where = {};
    if (!includeDrafts) where.isPublished = true;
    if (category && VALID_CATEGORIES.includes(category)) where.category = category;

    const [entries, total] = await Promise.all([
      prisma.changelogEntry.findMany({
        where,
        include: { createdBy: { select: { id: true, username: true } } },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.changelogEntry.count({ where }),
    ]);

    return {
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Cuenta entradas publicadas después de la fecha dada. Usado por el badge
   * de "novedades" en la sidebar. Si `since` es null/inválida, devuelve el
   * total de entradas publicadas (primera visita).
   */
  async unreadCount(sinceIso) {
    const where = { isPublished: true };
    if (sinceIso) {
      const d = new Date(sinceIso);
      if (!isNaN(d.getTime())) where.publishedAt = { gt: d };
    }
    return prisma.changelogEntry.count({ where });
  }

  async create({ title, description, category, publishedAt, isPublished, createdById }) {
    if (!title || !title.trim()) {
      const err = new Error('title es requerido');
      err.statusCode = 400;
      throw err;
    }
    if (!description || !description.trim()) {
      const err = new Error('description es requerido');
      err.statusCode = 400;
      throw err;
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      const err = new Error(`category debe ser uno de: ${VALID_CATEGORIES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    const entry = await prisma.changelogEntry.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        category: category || 'IMPROVEMENT',
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        isPublished: isPublished !== undefined ? !!isPublished : true,
        createdById: createdById || null,
      },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    logger.info(`[changelog] entry created: ${entry.id} — "${entry.title}"`);
    return entry;
  }

  async update(id, data) {
    const existing = await prisma.changelogEntry.findUnique({ where: { id } });
    if (!existing) {
      const err = new Error('Entrada no encontrada');
      err.statusCode = 404;
      throw err;
    }
    if (data.category && !VALID_CATEGORIES.includes(data.category)) {
      const err = new Error(`category debe ser uno de: ${VALID_CATEGORIES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    const updateData = {};
    if (data.title !== undefined)       updateData.title = String(data.title).trim();
    if (data.description !== undefined) updateData.description = String(data.description).trim();
    if (data.category !== undefined)    updateData.category = data.category;
    if (data.publishedAt !== undefined) updateData.publishedAt = new Date(data.publishedAt);
    if (data.isPublished !== undefined) updateData.isPublished = !!data.isPublished;

    const entry = await prisma.changelogEntry.update({
      where: { id },
      data: updateData,
      include: { createdBy: { select: { id: true, username: true } } },
    });
    return entry;
  }

  async remove(id) {
    try {
      await prisma.changelogEntry.delete({ where: { id } });
      return true;
    } catch (err) {
      if (err.code === 'P2025') {
        const e = new Error('Entrada no encontrada');
        e.statusCode = 404;
        throw e;
      }
      throw err;
    }
  }
}

export default new ChangelogService();
export { VALID_CATEGORIES };
