#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/lib/prisma.js';
import fetch from 'node-fetch';

async function main() {
  try {
    console.log('\n🔍 Consultando sorteos en SRQ...\n');
    
    // Obtener configuración de API para LOTOANIMALITO
    const game = await prisma.game.findFirst({
      where: { slug: 'lotoanimalito' }
    });
    
    if (!game) {
      console.log('❌ Juego LOTOANIMALITO no encontrado');
      return;
    }
    
    const planningConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'PLANNING',
        isActive: true
      }
    });
    
    const salesConfig = await prisma.apiConfiguration.findFirst({
      where: {
        gameId: game.id,
        type: 'SALES',
        isActive: true
      }
    });
    
    if (!planningConfig || !salesConfig) {
      console.log('❌ No hay configuración de API');
      return;
    }
    
    console.log(`✅ Configuración encontrada`);
    console.log(`   Planning URL: ${planningConfig.baseUrl}`);
    console.log(`   Sales URL: ${salesConfig.baseUrl}`);
    console.log(`   Token: ${salesConfig.token.substring(0, 10)}...\n`);
    
    // PASO 1: Obtener sorteos de HOY (23/12/2025)
    const today = '2025-12-23';
    console.log(`${'='.repeat(70)}`);
    console.log(`📅 PASO 1: Consultando sorteos del ${today} en SRQ...`);
    console.log(`${'='.repeat(70)}\n`);
    
    const todayUrl = `${planningConfig.baseUrl}${today}`;
    console.log(`URL: ${todayUrl}\n`);
    
    const todayResponse = await fetch(todayUrl, {
      method: 'GET',
      headers: {
        'APIKEY': planningConfig.token,
        'Content-Type': 'application/json',
      },
    });
    
    const todayData = await todayResponse.json();
    
    if (todayData.result === 'error') {
      console.log(`❌ Error: ${JSON.stringify(todayData.errors)}\n`);
    } else {
      const todayDraws = todayData.draws || [];
      console.log(`✅ Sorteos encontrados para ${today}: ${todayDraws.length}\n`);
      
      if (todayDraws.length > 0) {
        console.log('Primeros 5 sorteos:');
        todayDraws.slice(0, 5).forEach(d => {
          console.log(`   - ${d.name} (ID: ${d.id})`);
        });
        console.log('');
      }
    }
    
    // PASO 2: Obtener sorteos del 18/12/2025
    const targetDate = '2025-12-18';
    console.log(`${'='.repeat(70)}`);
    console.log(`📅 PASO 2: Consultando sorteos del ${targetDate} en SRQ...`);
    console.log(`${'='.repeat(70)}\n`);
    
    const targetUrl = `${planningConfig.baseUrl}${targetDate}`;
    console.log(`URL: ${targetUrl}\n`);
    
    const targetResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'APIKEY': planningConfig.token,
        'Content-Type': 'application/json',
      },
    });
    
    const targetData = await targetResponse.json();
    
    if (targetData.result === 'error') {
      console.log(`❌ Error: ${JSON.stringify(targetData.errors)}\n`);
      return;
    }
    
    const targetDraws = targetData.draws || [];
    console.log(`✅ Sorteos encontrados para ${targetDate}: ${targetDraws.length}\n`);
    
    if (targetDraws.length === 0) {
      console.log('❌ No hay sorteos para esa fecha\n');
      return;
    }
    
    console.log('Sorteos disponibles:');
    targetDraws.forEach(d => {
      console.log(`   - ${d.name} (ID: ${d.id})`);
    });
    console.log('');
    
    // PASO 3: Buscar ticket 36251384 en cada sorteo del 18/12
    const targetTicketId = '36251384';
    console.log(`${'='.repeat(70)}`);
    console.log(`🔎 PASO 3: Buscando ticket ${targetTicketId}...`);
    console.log(`${'='.repeat(70)}\n`);
    
    let ticketFound = false;
    
    for (const draw of targetDraws) {
      console.log(`Buscando en: ${draw.name} (ID: ${draw.id})...`);
      
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
        console.log(`   📊 Tickets: ${tickets.length}`);
        
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
          console.log('');
          break;
        } else {
          console.log(`   ⏭️  No encontrado\n`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
    }
    
    if (!ticketFound) {
      console.log(`\n❌ Ticket ${targetTicketId} no encontrado en sorteos del ${targetDate}\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
