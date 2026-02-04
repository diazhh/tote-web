#!/usr/bin/env node

/**
 * Script para sincronizar tripletas de SRQ por sorteo específico
 * Las tripletas en SRQ están organizadas por sorteo (8AM-6PM, 9AM-7PM, etc.)
 * y deben asociarse al sorteo de cierre correspondiente
 */

import { prisma } from '../src/lib/prisma.js';
import logger from '../src/lib/logger.js';

async function syncTripletasByDraw(date) {
  const token = 'e403d7ca-31ca-4dba-8179-55ecca035e10';
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 SINCRONIZANDO TRIPLETAS POR SORTEO - ${dateStr}`);
  console.log(`${'='.repeat(60)}\n`);

  // Obtener sorteos de tripleta de SRQ
  const planningUrl = `https://api2.sistemasrq.com/externalapi/operator/loteries?date=${dateStr}`;
  const planningResponse = await fetch(planningUrl, {
    headers: { 'APIKEY': token }
  });
  const loteries = await planningResponse.json();

  const tripletaDraws = loteries.filter(l => 
    l.descripcion && l.descripcion.toUpperCase().includes('TRIPLETA')
  );

  console.log(`📊 Sorteos de tripleta encontrados: ${tripletaDraws.length}\n`);

  const game = await prisma.game.findFirst({ where: { name: 'LOTOANIMALITO' } });
  if (!game) {
    throw new Error('Juego LOTOANIMALITO no encontrado');
  }

  const tripletaConfig = game.config?.tripleta;
  const multiplier = tripletaConfig?.multiplier || 50;

  let totalProcessed = 0;
  let totalSkipped = 0;

  for (const tripletaDraw of tripletaDraws) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📌 ${tripletaDraw.descripcion} (ID: ${tripletaDraw.sorteoID})`);
    console.log(`   Ganador: ${tripletaDraw.ganador}`);

    // Buscar el sorteo local usando ApiDrawMapping
    const mapping = await prisma.apiDrawMapping.findFirst({
      where: {
        externalDrawId: tripletaDraw.sorteoID.toString()
      },
      include: {
        draw: true
      }
    });

    if (!mapping) {
      console.log(`   ❌ No se encontró mapeo para sorteoID ${tripletaDraw.sorteoID}`);
      continue;
    }

    const localDraw = mapping.draw;
    console.log(`   Sorteo local: ${localDraw.drawTime} (${localDraw.status})`);

    // Obtener tickets del sorteo de tripleta
    const ticketsUrl = `https://api2.sistemasrq.com/externalapi/operator/tickets/${tripletaDraw.sorteoID}`;
    const ticketsResponse = await fetch(ticketsUrl, {
      headers: { 'APIKEY': token }
    });
    const tickets = await ticketsResponse.json();

    console.log(`   📦 Tickets encontrados: ${tickets.length}`);

    let processed = 0;
    let skipped = 0;

    for (const ticket of tickets) {
      try {
        if (ticket.anulado) {
          skipped++;
          continue;
        }

        if (!ticket.ticketID || !ticket.numerosTexto) {
          skipped++;
          continue;
        }

        // Parsear números
        const numbers = ticket.numerosTexto.split(',').map(num => {
          const trimmed = num.trim();
          return trimmed === '0' ? '0' : trimmed.padStart(2, '0');
        });

        if (numbers.length !== 3) {
          skipped++;
          continue;
        }

        // Buscar GameItems
        const items = await Promise.all(
          numbers.map(number => 
            prisma.gameItem.findFirst({
              where: { number, gameId: game.id, isActive: true }
            })
          )
        );

        if (items.some(item => !item)) {
          skipped++;
          continue;
        }

        const [item1, item2, item3] = items;
        const amount = parseFloat(ticket.monto || 0);
        
        if (amount <= 0) {
          skipped++;
          continue;
        }

        // Verificar si ya existe usando ventaID como identificador único
        // Un mismo ticketID puede tener múltiples jugadas (ventaID diferente)
        const existingTicket = await prisma.ticket.findFirst({
          where: {
            drawId: localDraw.id,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ventaID.toString() // Usar ventaID como identificador único
          }
        });

        if (existingTicket) {
          skipped++;
          continue;
        }

        // Crear ticket usando ventaID como externalTicketId
        await prisma.ticket.create({
          data: {
            drawId: localDraw.id,
            source: 'EXTERNAL_API',
            externalTicketId: ticket.ventaID.toString(), // ventaID es el identificador único de cada jugada
            totalAmount: amount,
            totalPrize: 0,
            status: 'ACTIVE',
            providerData: {
              ticketID: ticket.ticketID, // ID del ticket (puede repetirse)
              ventaID: ticket.ventaID,   // ID único de la jugada
              taquillaID: ticket.taquillaID,
              bancaID: ticket.bancaID,
              usuarioID: ticket.usuarioID,
              codigo: ticket.codigo,
              type: 'TRIPLETA',
              numeros: ticket.numeros,
              numerosTexto: ticket.numerosTexto,
              numbers: [item1.number, item2.number, item3.number],
              externalDrawId: tripletaDraw.sorteoID
            },
            details: {
              create: [
                {
                  gameItemId: item1.id,
                  amount: amount / 3,
                  multiplier,
                  prize: 0,
                  status: 'ACTIVE'
                },
                {
                  gameItemId: item2.id,
                  amount: amount / 3,
                  multiplier,
                  prize: 0,
                  status: 'ACTIVE'
                },
                {
                  gameItemId: item3.id,
                  amount: amount / 3,
                  multiplier,
                  prize: 0,
                  status: 'ACTIVE'
                }
              ]
            }
          }
        });

        processed++;
      } catch (error) {
        logger.error(`Error procesando ticket ${ticket.ticketID}:`, error);
        skipped++;
      }
    }

    console.log(`   ✅ Procesados: ${processed}, Saltados: ${skipped}`);
    totalProcessed += processed;
    totalSkipped += skipped;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RESUMEN TOTAL`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total procesados: ${totalProcessed}`);
  console.log(`Total saltados: ${totalSkipped}`);
  console.log(`${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

// Ejecutar
const date = process.argv[2] || '2026-01-20';
syncTripletasByDraw(date).catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
