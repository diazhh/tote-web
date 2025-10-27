/**
 * Script para probar la generación de imágenes de sorteos
 * Uso: node src/scripts/test-draw-image.js [drawId]
 */

import { prisma } from '../lib/prisma.js';
import { generateDrawImage } from '../services/imageService.js';

async function testDrawImage(drawId) {
  try {
    console.log(`\n🎨 Probando generación de imagen para sorteo: ${drawId}\n`);
    
    // Get draw info
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: {
        game: true,
        winnerItem: true
      }
    });
    
    if (!draw) {
      console.error('❌ Sorteo no encontrado');
      process.exit(1);
    }
    
    console.log('📋 Información del sorteo:');
    console.log(`   - Juego: ${draw.game.name} (${draw.game.type})`);
    console.log(`   - Estado: ${draw.status}`);
    console.log(`   - Fecha: ${draw.scheduledAt}`);
    console.log(`   - Ganador: ${draw.winnerItem?.number || 'Sin ganador'}`);
    console.log(`   - Imagen actual: ${draw.imageUrl || 'No generada'}`);
    console.log(`   - Estado imagen: ${draw.imageGenerated ? '✅ Generada' : '❌ No generada'}`);
    
    if (draw.imageError) {
      console.log(`   - Error previo: ${draw.imageError}`);
    }
    
    if (!draw.winnerItem) {
      console.error('\n❌ El sorteo no tiene ganador asignado');
      process.exit(1);
    }
    
    console.log('\n🎨 Generando imagen...\n');
    
    const result = await generateDrawImage(drawId);
    
    console.log('✅ Imagen generada exitosamente!');
    console.log(`   - Archivo: ${result.filename}`);
    console.log(`   - URL: ${result.url}`);
    
    // Verify in database
    const updatedDraw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: {
        imageUrl: true,
        imageGenerated: true,
        imageGeneratedAt: true,
        imageError: true
      }
    });
    
    console.log('\n📊 Estado actualizado en BD:');
    console.log(`   - imageUrl: ${updatedDraw.imageUrl}`);
    console.log(`   - imageGenerated: ${updatedDraw.imageGenerated}`);
    console.log(`   - imageGeneratedAt: ${updatedDraw.imageGeneratedAt}`);
    console.log(`   - imageError: ${updatedDraw.imageError || 'null'}`);
    
  } catch (error) {
    console.error('\n❌ Error al generar imagen:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get drawId from command line or find a recent DRAWN draw
async function main() {
  const drawId = process.argv[2];
  
  if (drawId) {
    await testDrawImage(drawId);
  } else {
    console.log('🔍 Buscando sorteo reciente con ganador...\n');
    
    const recentDraw = await prisma.draw.findFirst({
      where: {
        status: 'DRAWN',
        winnerItemId: { not: null }
      },
      orderBy: {
        drawnAt: 'desc'
      },
      include: {
        game: true,
        winnerItem: true
      }
    });
    
    if (!recentDraw) {
      console.error('❌ No se encontró ningún sorteo ejecutado con ganador');
      console.log('\n💡 Uso: node src/scripts/test-draw-image.js [drawId]');
      process.exit(1);
    }
    
    console.log(`✅ Encontrado sorteo: ${recentDraw.id}`);
    console.log(`   - ${recentDraw.game.name} - ${recentDraw.scheduledAt}`);
    console.log(`   - Ganador: ${recentDraw.winnerItem.number}\n`);
    
    await testDrawImage(recentDraw.id);
  }
}

main();
