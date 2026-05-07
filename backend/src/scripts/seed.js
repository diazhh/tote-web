import { prisma } from '../lib/prisma.js';
import authService from '../services/auth.service.js';
import logger from '../lib/logger.js';

/**
 * Script para crear datos iniciales en la base de datos
 */
async function seed() {
  // Requerir passwords fuertes vía env — sin defaults inseguros.
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const operatorPassword = process.env.OPERATOR_INITIAL_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    logger.error('❌ ADMIN_INITIAL_PASSWORD env var requerida (mínimo 12 caracteres)');
    process.exit(1);
  }
  if (!operatorPassword || operatorPassword.length < 12) {
    logger.error('❌ OPERATOR_INITIAL_PASSWORD env var requerida (mínimo 12 caracteres)');
    process.exit(1);
  }

  try {
    logger.info('🌱 Iniciando seed de base de datos...');

    // Crear usuario administrador por defecto
    const adminExists = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (!adminExists) {
      await authService.register({
        username: 'admin',
        email: 'admin@tote.com',
        password: adminPassword,
        role: 'ADMIN'
      });

      logger.info('✅ Usuario administrador creado (password: $ADMIN_INITIAL_PASSWORD)');
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
        password: operatorPassword,
        role: 'OPERATOR'
      });

      logger.info('✅ Usuario operador creado (password: $OPERATOR_INITIAL_PASSWORD)');
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
