#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import closeDrawJob from './src/jobs/close-draw.job.js';

async function main() {
  try {
    console.log('🔍 Buscando sorteos de 8am que deben cerrarse...\n');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Buscar sorteos de 8am que aún están SCHEDULED
    const draws = await prisma.draw.findMany({
      where: {
        drawDate: today,
        drawTime: '08:00:00',
        status: 'SCHEDULED'
      },
      include: {
        game: true,
        apiMappings: true
      }
    });
    
    console.log(`📊 Sorteos de 8am encontrados: ${draws.length}\n`);
    
    if (draws.length === 0) {
      console.log('✅ No hay sorteos de 8am pendientes de cerrar');
      return;
    }
    
    for (const draw of draws) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎮 ${draw.game.name} - 08:00 AM`);
      console.log(`   ID: ${draw.id}`);
      console.log(`   Status: ${draw.status}`);
      console.log(`   Mappings: ${draw.apiMappings.length}`);
      console.log(`${'='.repeat(60)}\n`);
    }
    
    console.log('🚀 Ejecutando job de cierre de sorteos...\n');
    
    // Ejecutar el job de cierre que hará:
    // 1. Importar tickets de SRQ (elimina anteriores + inserta nuevos)
    // 2. Cerrar el sorteo
    // 3. Pre-seleccionar ganador con lógica inteligente
    // 4. Generar PDF
    // 5. Enviar notificación por Telegram
    await closeDrawJob.execute();
    
    console.log('\n✅ Proceso completado\n');
    
    // Verificar estado final
    console.log('📊 Verificando estado final...\n');
    const updatedDraws = await prisma.draw.findMany({
      where: {
        drawDate: today,
        drawTime: '08:00:00'
      },
      include: {
        game: true,
        preselectedItem: true,
        tickets: true
      }
    });
    
    for (const draw of updatedDraws) {
      console.log(`${draw.game.name}:`);
      console.log(`  Status: ${draw.status}`);
      console.log(`  Pre-ganador: ${draw.preselectedItem ? `${draw.preselectedItem.number} - ${draw.preselectedItem.name}` : 'No seleccionado'}`);
      console.log(`  Tickets: ${draw.tickets.length}`);
      console.log(`  Cerrado: ${draw.closedAt ? draw.closedAt.toISOString() : 'No'}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
