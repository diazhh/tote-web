/**
 * Script para analizar la estructura de datos de la API SRQ
 */

import dotenv from 'dotenv';
dotenv.config();

import { srqService } from './src/services/srq.service.js';
import { prisma } from './src/lib/prisma.js';
import { startOfDay, endOfDay } from 'date-fns';

async function main() {
  try {
    // Obtener un sorteo de hoy con tickets
    const today = new Date();
    const draw = await prisma.draw.findFirst({
      where: {
        scheduledAt: {
          gte: startOfDay(today),
          lte: endOfDay(today),
        },
        apiMappings: {
          some: {},
        },
      },
      include: {
        game: true,
        apiMappings: {
          include: {
            apiConfig: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    if (!draw) {
      console.log('No se encontraron sorteos de hoy con mapping');
      return;
    }

    console.log('=== INFORMACIÓN DEL SORTEO ===');
    console.log('Juego:', draw.game.name);
    console.log('ID Local:', draw.id);
    console.log('Fecha:', draw.scheduledAt);
    console.log('Estado:', draw.status);

    const mapping = draw.apiMappings[0];
    console.log('ID Externo:', mapping.externalDrawId);

    // Obtener tickets de la API directamente
    console.log('\n=== LLAMANDO A LA API DE SRQ ===');
    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: draw.gameId,
        type: 'SALES',
        isActive: true,
      },
    });

    if (!salesConfig) {
      console.log('No hay configuración de ventas para este juego');
      return;
    }

    const url = `${salesConfig.baseUrl}${mapping.externalDrawId}`;
    console.log('URL:', url);
    
    const tickets = await srqService.callAPI(url, salesConfig.token);
    
    console.log('\n=== ESTRUCTURA DE DATOS DE TICKETS ===');
    console.log('Tipo de respuesta:', Array.isArray(tickets) ? 'Array' : typeof tickets);
    console.log('Total de tickets:', tickets.length);
    
    if (tickets.length > 0) {
      console.log('\n--- PRIMER TICKET (MUESTRA) ---');
      console.log(JSON.stringify(tickets[0], null, 2));
      
      console.log('\n--- CAMPOS ENCONTRADOS ---');
      const fields = Object.keys(tickets[0]);
      fields.forEach(field => {
        console.log(`- ${field}: ${typeof tickets[0][field]}`);
      });
      
      console.log('\n--- ANÁLISIS DE VALORES ---');
      const numeros = tickets.map(t => parseInt(t.numero) || 0).filter(n => n > 0);
      const montos = tickets.map(t => parseFloat(t.monto) || 0).filter(m => m > 0);
      
      if (numeros.length > 0) {
        console.log('Rango de números:', Math.min(...numeros), '-', Math.max(...numeros));
      }
      if (montos.length > 0) {
        console.log('Rango de montos:', Math.min(...montos), '-', Math.max(...montos));
      }
      console.log('Tickets anulados:', tickets.filter(t => t.anulado).length);
      
      console.log('\n--- DISTRIBUCIÓN POR NÚMERO ---');
      const distribucion = {};
      tickets.forEach(ticket => {
        if (!ticket.anulado) {
          const num = ticket.numero;
          distribucion[num] = (distribucion[num] || 0) + parseFloat(ticket.monto || 0);
        }
      });
      
      const sortedDistribucion = Object.entries(distribucion)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10
      
      console.log('Top 10 números por monto apostado:');
      sortedDistribucion.forEach(([numero, monto]) => {
        console.log(`  ${numero}: $${monto.toFixed(2)}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
