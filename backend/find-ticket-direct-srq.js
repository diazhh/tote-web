#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import fetch from 'node-fetch';

async function main() {
  try {
    const targetTicketId = '36251384';
    const targetDate = '2025-12-18';
    
    console.log(`\n🔍 Buscando ticket ${targetTicketId} en SRQ para el ${targetDate}...\n`);
    
    // 1. Obtener configuración de API para LOTOANIMALITO
    const game = await prisma.game.findFirst({
      where: { slug: 'lotoanimalito' }
    });
    
    if (!game) {
      console.log('❌ Juego LOTOANIMALITO no encontrado');
      return;
    }
    
    // Obtener configuración de planificación (para obtener lista de sorteos)
    const planningConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'PLANNING',
        isActive: true
      }
    });
    
    // Obtener configuración de ventas (para obtener tickets)
    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'SALES',
        isActive: true
      }
    });
    
    if (!planningConfig || !salesConfig) {
      console.log('❌ No hay configuración de API para LOTOANIMALITO');
      return;
    }
    
    console.log(`✅ Configuración encontrada:`);
    console.log(`   Planning URL: ${planningConfig.baseUrl}`);
    console.log(`   Sales URL: ${salesConfig.baseUrl}`);
    console.log(`   Token: ${salesConfig.token.substring(0, 10)}...\n`);
    
    // 2. Obtener sorteos del 18 de diciembre desde SRQ
    console.log(`📅 Consultando sorteos del ${targetDate} en SRQ...\n`);
    
    const planningUrl = `${planningConfig.baseUrl}${targetDate}`;
    console.log(`   URL: ${planningUrl}\n`);
    
    const planningResponse = await fetch(planningUrl, {
      method: 'GET',
      headers: {
        'APIKEY': planningConfig.token,
        'Content-Type': 'application/json',
      },
    });
    
    const planningData = await planningResponse.json();
    
    if (planningData.result === 'error') {
      console.log(`❌ Error obteniendo sorteos: ${JSON.stringify(planningData.errors)}`);
      return;
    }
    
    const draws = planningData.draws || [];
    console.log(`📊 Sorteos encontrados en SRQ: ${draws.length}\n`);
    
    if (draws.length === 0) {
      console.log('❌ No hay sorteos para esa fecha en SRQ');
      return;
    }
    
    // Mostrar sorteos disponibles
    console.log('Sorteos disponibles:');
    draws.forEach(d => {
      console.log(`   - ${d.name} (ID: ${d.id})`);
    });
    console.log('');
    
    // 3. Buscar el ticket en cada sorteo
    let ticketFound = false;
    
    for (const draw of draws) {
      console.log(`🔎 Buscando en sorteo: ${draw.name} (ID: ${draw.id})...`);
      
      try {
        const ticketsUrl = `${salesConfig.baseUrl}${draw.id}`;
        const ticketsResponse = await fetch(ticketsUrl, {
          method: 'GET',
          headers: {
            'APIKEY': salesConfig.token,
            'Content-Type': 'application/json',
          },
        });
        
        const ticketsData = await ticketsResponse.json();
        
        if (ticketsData.result === 'error') {
          console.log(`   ❌ Error: ${JSON.stringify(ticketsData.errors)}`);
          continue;
        }
        
        const tickets = Array.isArray(ticketsData) ? ticketsData : (ticketsData.tickets || []);
        console.log(`   📊 Tickets en este sorteo: ${tickets.length}`);
        
        // Buscar el ticket específico
        const targetTicket = tickets.find(t => t.ticketID === targetTicketId);
        
        if (targetTicket) {
          ticketFound = true;
          console.log(`\n${'='.repeat(70)}`);
          console.log(`✅ ¡TICKET ENCONTRADO!`);
          console.log(`${'='.repeat(70)}\n`);
          console.log(`Sorteo: ${draw.name}`);
          console.log(`SRQ Draw ID: ${draw.id}`);
          console.log(`Fecha: ${targetDate}`);
          console.log(`\n📄 OBJETO COMPLETO DEL TICKET DESDE SRQ:\n`);
          console.log(JSON.stringify(targetTicket, null, 2));
          console.log(`\n${'='.repeat(70)}\n`);
          
          // Analizar estructura
          console.log('📋 ANÁLISIS DE LA ESTRUCTURA:\n');
          console.log(`Campos principales:`);
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
          console.log('');
          
          break;
        } else {
          console.log(`   ⏭️  Ticket no encontrado\n`);
        }
        
        // Pausa entre requests
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
    }
    
    if (!ticketFound) {
      console.log(`\n❌ Ticket ${targetTicketId} no encontrado en ningún sorteo del ${targetDate}\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
