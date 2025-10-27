import { prisma } from '../lib/prisma.js';
import authService from '../services/auth.service.js';
import logger from '../lib/logger.js';

/**
 * Script para crear datos iniciales en la base de datos
 */
async function seed() {
  try {
    logger.info('🌱 Iniciando seed de base de datos...');

    // Crear usuario administrador por defecto
    const adminExists = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (!adminExists) {
      const admin = await authService.register({
        username: 'admin',
        email: 'admin@tote.com',
        password: 'admin123',
        role: 'ADMIN'
      });

      logger.info('✅ Usuario administrador creado:');
      logger.info('   Username: admin');
      logger.info('   Password: admin123');
      logger.info('   ⚠️  CAMBIAR CONTRASEÑA EN PRODUCCIÓN');
    } else {
      logger.info('ℹ️  Usuario administrador ya existe');
    }

    // Crear usuario operador de ejemplo
    const operatorExists = await prisma.user.findUnique({
      where: { username: 'operator' }
    });

    if (!operatorExists) {
      await authService.register({
        username: 'operator',
        email: 'operator@tote.com',
        password: 'operator123',
        role: 'OPERATOR'
      });

      logger.info('✅ Usuario operador creado:');
      logger.info('   Username: operator');
      logger.info('   Password: operator123');
    } else {
      logger.info('ℹ️  Usuario operador ya existe');
    }

    logger.info('✅ Seed completado exitosamente');
  } catch (error) {
    logger.error('❌ Error en seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar seed
seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Error fatal en seed:', error);
    process.exit(1);
  });
