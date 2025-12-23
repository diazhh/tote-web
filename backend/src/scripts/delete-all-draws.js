#!/usr/bin/env node
/**
 * Script para eliminar TODOS los sorteos de PostgreSQL
 * CUIDADO: Esta operación es irreversible
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n⚠️  ELIMINANDO TODOS LOS SORTEOS DE POSTGRESQL...\n');
  
  try {
    // Eliminar en orden correcto debido a las relaciones
    console.log('1. Eliminando ExternalTickets...');
    const tickets = await prisma.externalTicket.deleteMany({});
    console.log(`   ✓ ${tickets.count} tickets eliminados`);
    
    console.log('2. Eliminando ApiDrawMappings...');
    const mappings = await prisma.apiDrawMapping.deleteMany({});
    console.log(`   ✓ ${mappings.count} mappings eliminados`);
    
    console.log('3. Eliminando Draws...');
    const draws = await prisma.draw.deleteMany({});
    console.log(`   ✓ ${draws.count} sorteos eliminados`);
    
    console.log('\n✅ TODOS LOS SORTEOS HAN SIDO ELIMINADOS\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
