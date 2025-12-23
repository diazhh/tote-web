#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import fetch from 'node-fetch';

async function main() {
  try {
    const targetTicketId = '36251384';
    
    console.log(`\n🔍 Buscando ticket ${targetTicketId} en sorteos recientes de SRQ...\n`);
    
    // Obtener configuración de API para LOTOANIMALITO
    const game = await prisma.game.findFirst({
      where: { slug: 'lotoanimalito' }
    });
    
    if (!game) {
      console.log('❌ Juego LOTOANIMALITO no encontrado');
      return;
    }
    
    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'SALES',
        isActive: true
      }
    });
    
    if (!salesConfig) {
      console.log('❌ No hay configuración de ventas');
      return;
    }
    
    console.log(`✅ Token: ${salesConfig.token.substring(0, 10)}...\n`);
    
    // Buscar en sorteos de hoy que tienen mapping
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const draws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        drawDate: today,
        apiMappings: {
          some: {}
        }
      },
      include: {
        apiMappings: true
      },
      orderBy: { drawTime: 'asc' }
    });
    
    console.log(`📊 Sorteos de hoy con mapping: ${draws.length}\n`);
    
    if (draws.length === 0) {
      console.log('❌ No hay sorteos con mapping para buscar');
      return;
    }
    
    // Buscar el ticket en cada sorteo
    for (const draw of draws) {
      const externalDrawId = draw.apiMappings[0].externalDrawId;
      
      console.log(`🔎 Buscando en sorteo ${draw.drawTime} (SRQ ID: ${externalDrawId})...`);
      
      try {
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
        
        const tickets = Array.isArray(data) ? data : (data.tickets || []);
        console.log(`   📊 Tickets: ${tickets.length}`);
        
        // Buscar el ticket específico
        const targetTicket = tickets.find(t => t.ticketID === targetTicketId);
        
        if (targetTicket) {
          console.log(`\n${'='.repeat(70)}`);
          console.log(`✅ ¡TICKET ENCONTRADO!`);
          console.log(`${'='.repeat(70)}\n`);
          console.log(`Sorteo: ${draw.drawTime}`);
          console.log(`SRQ Draw ID: ${externalDrawId}`);
          console.log(`Fecha: ${draw.drawDate.toISOString().split('T')[0]}`);
          console.log(`\n📄 OBJETO COMPLETO DEL TICKET DESDE SRQ:\n`);
          console.log(JSON.stringify(targetTicket, null, 2));
          console.log(`\n${'='.repeat(70)}\n`);
          
          // Analizar estructura
          console.log('📋 ANÁLISIS DE LA ESTRUCTURA:\n');
          console.log(`Campos del ticket:`);
          Object.keys(targetTicket).forEach(key => {
            const value = targetTicket[key];
            const type = Array.isArray(value) ? 'array' : typeof value;
            const preview = Array.isArray(value) 
              ? `[${value.length} items]` 
              : type === 'object' && value !== null
                ? '{...}'
                : JSON.stringify(value);
            console.log(`   - ${key}: ${type} = ${preview}`);
          });
          
          // Si hay array de jugadas, mostrar estructura de la primera
          if (Array.isArray(targetTicket.plays) && targetTicket.plays.length > 0) {
            console.log(`\n📋 Estructura de una jugada (plays[0]):\n`);
            Object.keys(targetTicket.plays[0]).forEach(key => {
              const value = targetTicket.plays[0][key];
              console.log(`   - ${key}: ${typeof value} = ${JSON.stringify(value)}`);
            });
          }
          
          console.log('');
          return;
        } else {
          console.log(`   ⏭️  No encontrado\n`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
    }
    
    console.log(`\n❌ Ticket ${targetTicketId} no encontrado en sorteos de hoy\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
