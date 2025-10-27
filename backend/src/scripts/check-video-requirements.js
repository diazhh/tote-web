import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import logger from '../lib/logger.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script para verificar requisitos de generación de videos
 */
async function checkVideoRequirements() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  VERIFICACIÓN DE REQUISITOS DE VIDEO');
  console.log('═══════════════════════════════════════════\n');

  let allOk = true;

  // 1. Verificar FFmpeg
  console.log('1️⃣  Verificando FFmpeg...');
  try {
    const { stdout: ffmpegVersion } = await execAsync('ffmpeg -version');
    const versionMatch = ffmpegVersion.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : 'desconocida';

    console.log(`   ✅ FFmpeg instalado: v${version}\n`);
  } catch (error) {
    console.log('   ❌ FFmpeg NO está instalado\n');
    console.log('   📝 Instalar con:');
    console.log('      Ubuntu/Debian: sudo apt-get install -y ffmpeg');
    console.log('      CentOS/RHEL:   sudo yum install -y ffmpeg');
    console.log('      macOS:         brew install ffmpeg\n');
    allOk = false;
  }

  // 2. Verificar fluent-ffmpeg
  console.log('2️⃣  Verificando fluent-ffmpeg...');
  try {
    await import('fluent-ffmpeg');
    console.log('   ✅ fluent-ffmpeg instalado\n');
  } catch (error) {
    console.log('   ❌ fluent-ffmpeg NO está instalado\n');
    console.log('   📝 Instalar con: npm install fluent-ffmpeg\n');
    allOk = false;
  }

  // 3. Verificar directorios
  console.log('3️⃣  Verificando directorios...');
  const projectRoot = path.join(__dirname, '..', '..');
  const directories = [
    { path: path.join(projectRoot, 'storage'), name: 'storage/' },
    { path: path.join(projectRoot, 'storage', 'video-assets'), name: 'storage/video-assets/' },
    { path: path.join(projectRoot, 'storage', 'videos'), name: 'storage/videos/' },
    { path: path.join(projectRoot, 'storage', 'temp'), name: 'storage/temp/' }
  ];

  for (const dir of directories) {
    try {
      await fs.access(dir.path);
      console.log(`   ✅ ${dir.name} existe`);
    } catch {
      console.log(`   ⚠️  ${dir.name} no existe (se creará automáticamente)`);
    }
  }
  console.log();

  // 4. Verificar assets para videos animados
  console.log('4️⃣  Verificando assets para videos animados...');
  const assetsPath = path.join(projectRoot, 'storage', 'video-assets');
  const requiredAssets = [
    'intro.png',
    'countdown-3.png',
    'countdown-2.png',
    'countdown-1.png',
    'outro.png',
    'background-music.mp3'
  ];

  let assetsFound = 0;
  for (const asset of requiredAssets) {
    const assetPath = path.join(assetsPath, asset);
    try {
      await fs.access(assetPath);
      console.log(`   ✅ ${asset}`);
      assetsFound++;
    } catch {
      console.log(`   ❌ ${asset} no encontrado`);
    }
  }

  if (assetsFound === 0) {
    console.log('\n   ⚠️  No hay assets. Solo se podrán generar videos simples.');
    console.log('   📝 Para videos animados, crear assets en: storage/video-assets/\n');
  } else if (assetsFound < requiredAssets.length) {
    console.log(`\n   ⚠️  Faltan ${requiredAssets.length - assetsFound} assets para videos animados.\n`);
  } else {
    console.log('\n   ✅ Todos los assets disponibles para videos animados.\n');
  }

  // 5. Verificar permisos de escritura
  console.log('5️⃣  Verificando permisos de escritura...');
  const videosPath = path.join(projectRoot, 'storage', 'videos');
  try {
    await fs.mkdir(videosPath, { recursive: true });
    const testFile = path.join(videosPath, '.test-write');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    console.log('   ✅ Permisos de escritura OK\n');
  } catch (error) {
    console.log('   ❌ No hay permisos de escritura en storage/videos/');
    console.log(`   📝 Ejecutar: chmod -R 755 storage/\n`);
    allOk = false;
  }

  // 6. Verificar espacio en disco
  console.log('6️⃣  Verificando espacio en disco...');
  try {
    const { stdout } = await execAsync(`df -h ${projectRoot} | tail -1`);
    const parts = stdout.trim().split(/\s+/);
    const available = parts[3];
    const usePercent = parts[4];

    console.log(`   💾 Espacio disponible: ${available}`);
    console.log(`   📊 Uso: ${usePercent}\n`);
  } catch (error) {
    console.log('   ⚠️  No se pudo verificar espacio en disco\n');
  }

  // 7. Verificar base de datos
  console.log('7️⃣  Verificando sorteos con imágenes...');
  try {
    const { prisma } = await import('../lib/prisma.js');

    const drawsWithImages = await prisma.draw.count({
      where: {
        status: 'DRAWN',
        imageUrl: { not: null }
      }
    });

    const drawsWithVideos = await prisma.draw.count({
      where: {
        videoUrl: { not: null }
      }
    });

    console.log(`   📊 Sorteos con imagen: ${drawsWithImages}`);
    console.log(`   🎬 Sorteos con video: ${drawsWithVideos}\n`);

    if (drawsWithImages === 0) {
      console.log('   ⚠️  No hay sorteos con imagen. Ejecutar primero los sorteos.\n');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.log('   ❌ Error conectando a la base de datos');
    console.log(`   ${error.message}\n`);
    allOk = false;
  }

  // Resumen final
  console.log('═══════════════════════════════════════════');
  if (allOk) {
    console.log('✅ SISTEMA LISTO PARA GENERAR VIDEOS');
    console.log('═══════════════════════════════════════════\n');
    console.log('🚀 Ejecutar prueba con:');
    console.log('   npm run test:video\n');
    return 0;
  } else {
    console.log('⚠️  FALTAN REQUISITOS');
    console.log('═══════════════════════════════════════════\n');
    console.log('📝 Completar los pasos marcados arriba antes de continuar.\n');
    console.log('📖 Ver documentación completa en:');
    console.log('   GENERACION_VIDEOS.md\n');
    return 1;
  }
}

// Ejecutar verificación
checkVideoRequirements()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('❌ Error en verificación:', error);
    process.exit(1);
  });
