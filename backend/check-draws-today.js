import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import { startOfDayInCaracas, endOfDayInCaracas } from './src/lib/dateUtils.js';

async function main() {
  try {
    const today = new Date();
    
    console.log('Fecha actual:', today.toISOString());
    console.log('Inicio día Caracas:', startOfDayInCaracas(today).toISOString());
    console.log('Fin día Caracas:', endOfDayInCaracas(today).toISOString());
    console.log('');
    
    const draws = await prisma.draw.findMany({
      where: {
        scheduledAt: {
          gte: startOfDayInCaracas(today),
          lte: endOfDayInCaracas(today)
        }
      },
      include: {
        game: true,
        apiMappings: {
          include: {
            tickets: true
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });
    
    console.log(`Total sorteos hoy: ${draws.length}\n`);
    
    for (const draw of draws) {
      const hora = draw.scheduledAt.toLocaleTimeString('es-VE', { 
        timeZone: 'America/Caracas', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const mappings = draw.apiMappings.length;
      const tickets = draw.apiMappings.reduce((sum, m) => sum + m.tickets.length, 0);
      
      console.log(`${draw.game.name} ${hora}`);
      console.log(`  Status: ${draw.status}`);
      console.log(`  Mappings: ${mappings}`);
      console.log(`  Tickets: ${tickets}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
