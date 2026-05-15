/**
 * Phase 13 — Category service (FIN-LEDGER-06, D-02).
 *
 * CRITICAL DESIGN NOTES:
 *   1. D-02 segregation: every Category has an `appliesTo` enum (INCOME/EXPENSE/PAYMENT).
 *      Categories are NOT type-polymorphic. UI forms filter by appliesTo.
 *
 *   2. FIN-LEDGER-06 soft-delete: deactivation flips `isActive=false`; no `deleteCategory`
 *      export. Rationale: preserves historical entry category labels — past entries that
 *      reference a deactivated category still show the original name.
 *
 *   3. @@unique([appliesTo, name]) at the DB level means createCategory can throw a
 *      Prisma P2002. Controllers map this to 409 Conflict (see category.controller.js).
 *
 *   4. Module exports are named (no default).
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

/**
 * List Category rows ordered by [appliesTo ASC, name ASC]. Excludes inactive by default.
 *
 * @param {object} args
 * @param {string}  [args.appliesTo]        - filter to one of INCOME | EXPENSE | PAYMENT
 * @param {boolean} [args.includeInactive=false]
 * @returns {Promise<object[]>}
 */
export async function listCategories({ appliesTo, includeInactive = false } = {}) {
  return prisma.category.findMany({
    where: {
      ...(appliesTo && { appliesTo }),
      ...(!includeInactive && { isActive: true }),
    },
    orderBy: [{ appliesTo: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Create a Category. Throws Prisma P2002 if (appliesTo, name) already exists —
 * controller maps to 409.
 *
 * @param {object} args - { name, appliesTo }
 * @param {string} userId - createdById (req.user.id)
 */
export async function createCategory({ name, appliesTo }, userId) {
  const cat = await prisma.category.create({
    data: { name, appliesTo, createdById: userId },
  });
  logger.info(`[category] CREATE id=${cat.id} appliesTo=${cat.appliesTo} name=${cat.name}`);
  return cat;
}

/**
 * Soft-deactivate. FIN-LEDGER-06: NEVER hard-delete — historical entries' labels survive.
 */
export async function deactivateCategory(id) {
  const cat = await prisma.category.update({
    where: { id },
    data: { isActive: false },
  });
  logger.info(`[category] DEACTIVATE id=${id}`);
  return cat;
}

export async function reactivateCategory(id) {
  const cat = await prisma.category.update({
    where: { id },
    data: { isActive: true },
  });
  logger.info(`[category] REACTIVATE id=${id}`);
  return cat;
}

/**
 * Rename only — no other mutable fields. appliesTo is intentionally immutable
 * (changing it would reclassify historical entries silently).
 */
export async function renameCategory(id, name) {
  const cat = await prisma.category.update({
    where: { id },
    data: { name },
  });
  logger.info(`[category] RENAME id=${id} newName=${name}`);
  return cat;
}

// INTENTIONAL ABSENCE — FIN-LEDGER-06 enforced via surface area:
//   - NO deleteCategory export (soft-delete via deactivateCategory only)
