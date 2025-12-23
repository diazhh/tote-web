#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import fetch from 'node-fetch';

async function main() {
  try {
    const targetDate = new Date('2025-12-18');
    targetDate.setHours(0, 0, 0, 0);
    
    const targetTicketId = '36251384';
    
    console.log(`\n🔍 Buscando ticket ${targetTicketId} en SRQ para el 18 de diciembre...\n`);
    
    // 1. Obtener el juego LOTOANIMALITO
    const game = await prisma.game.findFirst({
      where: { slug: 'lotoanimalito' }
    });
    
    if (!game) {
      console.log('❌ Juego LOTOANIMALITO no encontrado');
      return;
    }
    
    console.log(`✅ Juego encontrado: ${game.name} (${game.id})\n`);
    
    // 2. Obtener configuración de API de ventas para LOTOANIMALITO
    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'SALES',
        isActive: true
      },
      include: {
        apiSystem: true
      }
    });
    
    if (!salesConfig) {
      console.log('❌ No hay configuración de ventas para LOTOANIMALITO');
      return;
    }
    
    console.log(`✅ Configuración de API encontrada:`);
    console.log(`   Base URL: ${salesConfig.baseUrl}`);
    console.log(`   Token: ${salesConfig.token.substring(0, 10)}...`);
    console.log('');
    
    // 3. Obtener sorteos del 18 de diciembre con sus mappings de SRQ
    const draws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        drawDate: targetDate
      },
      include: {
        apiMappings: true
      },
      orderBy: { drawTime: 'asc' }
    });
    
    console.log(`📊 Sorteos encontrados para el 18/12: ${draws.length}\n`);
    
    if (draws.length === 0) {
      console.log('❌ No hay sorteos para esa fecha');
      return;
    }
    
    // 4. Buscar el ticket en cada sorteo
    let ticketFound = false;
    
    for (const draw of draws) {
      if (draw.apiMappings.length === 0) {
        console.log(`⏭️  ${draw.drawTime} - Sin mapping de SRQ, saltando...`);
        continue;
      }
      
      const externalDrawId = draw.apiMappings[0].externalDrawId;
      
      console.log(`🔎 Buscando en sorteo ${draw.drawTime} (SRQ ID: ${externalDrawId})...`);
      
      try {
        // Consultar API de SRQ
        const url = `${salesConfig.baseUrl}${externalDrawId}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'APIKEY': salesConfig.token,
            'Content-Type': 'application/json',
          },
        });
        
        const data = await response.json();
        
        if (data.result === 'error') {
          console.log(`   ❌ Error: ${JSON.stringify(data.errors)}`);
          continue;
        }
        
        // Procesar tickets - SRQ devuelve array directamente
        const tickets = Array.isArray(data) ? data : (data.tickets || []);
        
        console.log(`   📊 Tickets en este sorteo: ${tickets.length}`);
        
        // Buscar el ticket específico
        const targetTicket = tickets.find(t => t.ticketID === targetTicketId);
        
        if (targetTicket) {
          ticketFound = true;
          console.log(`\n${'='.repeat(70)}`);
          console.log(`✅ ¡TICKET ENCONTRADO!`);
          console.log(`${'='.repeat(70)}\n`);
          console.log(`Sorteo: ${draw.drawTime} (${draw.scheduledAt.toLocaleString('es-VE', { timeZone: 'America/Caracas' })})`);
          console.log(`SRQ Draw ID: ${externalDrawId}`);
          console.log(`\n📄 OBJETO COMPLETO DEL TICKET:\n`);
          console.log(JSON.stringify(targetTicket, null, 2));
          console.log(`\n${'='.repeat(70)}\n`);
          break;
        } else {
          console.log(`   ⏭️  Ticket no encontrado en este sorteo\n`);
        }
        
        // Pausa entre requests
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`   ❌ Error consultando API: ${error.message}\n`);
      }
    }
    
    if (!ticketFound) {
      console.log(`\n❌ Ticket ${targetTicketId} no encontrado en ningún sorteo del 18/12\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
