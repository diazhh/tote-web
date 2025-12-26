import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/prisma.js';
import logger from '../src/lib/logger.js';

async function deleteSimulatorTickets() {
  try {
    logger.info('🗑️  Iniciando eliminación de datos del simulador...');

    // Buscar usuario jugador_test
    const testUser = await prisma.user.findUnique({
      where: { username: 'jugador_test' }
    });

    if (!testUser) {
      logger.warn('Usuario jugador_test no encontrado');
      process.exit(0);
    }

    logger.info(`Usuario encontrado: ${testUser.username} (ID: ${testUser.id})`);

    // Contar tickets antes de eliminar
    const ticketCount = await prisma.ticket.count({
      where: { userId: testUser.id }
    });

    // Contar tripletas antes de eliminar
    const tripleBetCount = await prisma.tripleBet.count({
      where: { userId: testUser.id }
    });

    logger.info(`Total de tickets del simulador: ${ticketCount}`);
    logger.info(`Total de tripletas del simulador: ${tripleBetCount}`);

    if (ticketCount === 0 && tripleBetCount === 0) {
      logger.info('No hay datos para eliminar');
      process.exit(0);
    }

    // Eliminar tickets (esto también eliminará TicketDetail por CASCADE)
    if (ticketCount > 0) {
      const ticketResult = await prisma.ticket.deleteMany({
        where: { userId: testUser.id }
      });
      logger.info(`✅ ${ticketResult.count} tickets eliminados exitosamente`);
      logger.info('Los TicketDetail asociados fueron eliminados automáticamente (CASCADE)');
    }

    // Eliminar tripletas
    if (tripleBetCount > 0) {
      const tripleBetResult = await prisma.tripleBet.deleteMany({
        where: { userId: testUser.id }
      });
      logger.info(`✅ ${tripleBetResult.count} tripletas eliminadas exitosamente`);
    }

    process.exit(0);
  } catch (error) {
    logger.error('❌ Error eliminando datos del simulador:', error);
    process.exit(1);
  }
}

deleteSimulatorTickets();
