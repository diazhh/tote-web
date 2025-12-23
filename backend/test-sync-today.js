/**
 * Script para probar sincronización de ventas de hoy
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import syncApiTicketsJob from './src/jobs/sync-api-tickets.job.js';
import { startOfDayInCaracas, endOfDayInCaracas } from './src/lib/dateUtils.js';

async function main() {
  try {
    const today = new Date();
    
    console.log('=== VERIFICANDO SORTEOS DE HOY ===');
    console.log('Fecha actual:', today.toISOString());
    console.log('Inicio del día (Caracas):', startOfDayInCaracas(today).toISOString());
    console.log('Fin del día (Caracas):', endOfDayInCaracas(today).toISOString());
    
    // Buscar sorteos de hoy con mapping
    const draws = await prisma.draw.findMany({
      where: {
        scheduledAt: {
          gte: startOfDayInCaracas(today),
          lte: endOfDayInCaracas(today),
        },
        apiMappings: {
          some: {},
        },
      },
      include: {
        game: true,
        apiMappings: {
          include: {
            tickets: true
          }
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    
    console.log(`\nEncontrados ${draws.length} sorteos de hoy con mapping:\n`);
    
    for (const draw of draws) {
      const hora = draw.scheduledAt.toLocaleTimeString('es-VE', { 
        timeZone: 'America/Caracas', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const ticketCount = draw.apiMappings.reduce((sum, m) => sum + m.tickets.length, 0);
      console.log(`- ${draw.game.name} ${hora} (${draw.status}) - ${ticketCount} tickets actuales`);
    }
    
    if (draws.length === 0) {
      console.log('\n⚠️ No hay sorteos de hoy con mapping de API');
      return;
    }
    
    console.log('\n=== EJECUTANDO SINCRONIZACIÓN ===\n');
    const results = await syncApiTicketsJob.executeForToday();
    
    console.log('\n=== RESULTADOS ===\n');
    for (const result of results) {
      const status = result.error ? '❌' : '✅';
      const hora = result.time.toLocaleTimeString('es-VE', { 
        timeZone: 'America/Caracas', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      if (result.error) {
        console.log(`${status} ${result.game} ${hora}: ERROR - ${result.error}`);
      } else {
        console.log(`${status} ${result.game} ${hora}: ${result.imported} importados, ${result.skipped} saltados, ${result.deleted} eliminados`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
