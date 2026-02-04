#!/usr/bin/env node

/**
 * Script para corregir mapeos de sorteos de tripleta
 * 
 * Problema: Los sorteos de tripleta de SRQ estaban mapeados al sorteo de cierre
 * en lugar del sorteo de inicio.
 * 
 * Solución: Mapear sorteos de tripleta SRQ con sorteos locales en orden 1 a 1
 * (SRQ ya los devuelve ordenados por hora)
 */

import { prisma } from '../src/lib/prisma.js';

const SRQ_TOKEN = 'e403d7ca-31ca-4dba-8179-55ecca035e10';

async function fixTripletaMappings(startDate, endDate) {
  console.log('\n🔧 CORRIGIENDO MAPEOS DE SORTEOS DE TRIPLETA\n');
  console.log(`Fechas: ${startDate} a ${endDate}\n`);

  const game = await prisma.game.findFirst({ 
    where: { name: 'LOTOANIMALITO' } 
  });
  
  if (!game) {
    throw new Error('Juego LOTOANIMALITO no encontrado');
  }

  const apiConfig = await prisma.apiConfiguration.findFirst({
    where: {
      gameId: game.id,
      type: 'PLANNING',
      isActive: true
    }
  });

  if (!apiConfig) {
    throw new Error('Configuración de API no encontrada');
  }

  let totalUpdated = 0;
  let totalTicketsUpdated = 0;

  // Procesar cada fecha
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0];
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 Procesando fecha: ${dateStr}`);
    console.log(`${'='.repeat(60)}\n`);

    // 1. Obtener sorteos de tripleta de SRQ (ya vienen ordenados)
    const srqUrl = `https://api2.sistemasrq.com/externalapi/operator/loteries?date=${dateStr}`;
    const srqResponse = await fetch(srqUrl, {
      headers: { 'APIKEY': SRQ_TOKEN }
    });
    const srqLoteries = await srqResponse.json();
    
    const tripletaDraws = srqLoteries.filter(l => 
      l.descripcion && l.descripcion.toUpperCase().includes('TRIPLETA')
    );

    console.log(`📊 Sorteos de tripleta en SRQ: ${tripletaDraws.length}`);

    if (tripletaDraws.length === 0) {
      console.log('⚠️  No hay sorteos de tripleta para esta fecha\n');
      continue;
    }

    // 2. Eliminar TODOS los mapeos existentes para estos sorteoIDs
    // (pueden estar mapeados a otros sorteos locales)
    for (const srqDraw of tripletaDraws) {
      await prisma.apiDrawMapping.deleteMany({
        where: {
          externalDrawId: srqDraw.sorteoID.toString()
        }
      });
    }

    console.log(`🗑️  Mapeos de tripleta limpiados\n`);

    // 3. Obtener sorteos locales ordenados por hora
    const localDraws = await prisma.draw.findMany({
      where: {
        gameId: game.id,
        drawDate: new Date(dateStr)
      },
      orderBy: { drawTime: 'asc' },
      select: { id: true, drawTime: true }
    });

    console.log(`📊 Sorteos locales: ${localDraws.length}`);

    if (localDraws.length === 0) {
      console.log('⚠️  No hay sorteos locales para esta fecha\n');
      continue;
    }

    if (tripletaDraws.length !== localDraws.length) {
      console.log(`⚠️  ADVERTENCIA: Cantidad de sorteos no coincide (SRQ: ${tripletaDraws.length}, Local: ${localDraws.length})`);
    }

    console.log('\n📋 MAPEO:\n');

    // 4. Mapear 1 a 1 en orden (crear nuevos mapeos)
    const mappingCount = Math.min(tripletaDraws.length, localDraws.length);
    
    for (let i = 0; i < mappingCount; i++) {
      const srqDraw = tripletaDraws[i];
      const localDraw = localDraws[i];

      console.log(`  ${i + 1}. SRQ ${srqDraw.sorteoID} → Local ${localDraw.drawTime}`);

      // Eliminar mapeo existente para este drawId + apiConfigId si existe
      await prisma.apiDrawMapping.deleteMany({
        where: {
          drawId: localDraw.id,
          apiConfigId: apiConfig.id
        }
      });

      // Crear nuevo mapeo
      await prisma.apiDrawMapping.create({
        data: {
          apiConfigId: apiConfig.id,
          drawId: localDraw.id,
          externalDrawId: srqDraw.sorteoID.toString()
        }
      });

      console.log(`     ✅ Creado`);
      totalUpdated++;
    }

    // 5. Actualizar tickets de tripleta para que apunten a los sorteos correctos
    console.log('\n📦 Actualizando tickets de tripleta...\n');
    
    for (let i = 0; i < mappingCount; i++) {
      const srqDraw = tripletaDraws[i];
      const localDraw = localDraws[i];

      // Buscar tickets que tienen este sorteoID en su providerData
      const ticketsToUpdate = await prisma.ticket.findMany({
        where: {
          source: 'EXTERNAL_API',
          providerData: {
            path: ['sorteoID'],
            equals: srqDraw.sorteoID
          }
        },
        select: { id: true, drawId: true }
      });

      if (ticketsToUpdate.length > 0) {
        const ticketsUpdated = await prisma.ticket.updateMany({
          where: {
            id: { in: ticketsToUpdate.map(t => t.id) }
          },
          data: {
            drawId: localDraw.id
          }
        });

        console.log(`  ${localDraw.drawTime}: ${ticketsUpdated.count} tickets actualizados`);
        totalTicketsUpdated += ticketsUpdated.count;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RESUMEN');
  console.log(`${'='.repeat(60)}`);
  console.log(`Mapeos actualizados: ${totalUpdated}`);
  console.log(`Tickets actualizados: ${totalTicketsUpdated}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Ejecutar
const startDate = process.argv[2] || '2026-02-02';
const endDate = process.argv[3] || '2026-02-03';

fixTripletaMappings(startDate, endDate)
  .then(() => {
    console.log('✅ Proceso completado\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
