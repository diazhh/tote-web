/**
 * Script para limpiar sorteos migrados incorrectamente
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando sorteos migrados incorrectamente...\n');

  try {
    // Eliminar sorteos con nota de migración
    const deleted = await prisma.draw.deleteMany({
      where: {
        status: 'DRAWN',
        notes: {
          contains: 'Migrado desde MySQL'
        }
      }
    });

    console.log(`✅ Sorteos eliminados: ${deleted.count}`);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit());
