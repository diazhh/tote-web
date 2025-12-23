import dotenv from 'dotenv';
dotenv.config();

import generateDailyDrawsJob from './src/jobs/generate-daily-draws.job.js';

async function main() {
  try {
    console.log('🧪 Probando generación de sorteos...\n');
    await generateDailyDrawsJob.execute();
    console.log('\n✅ Prueba completada');
  } catch (error) {
    console.error('❌ Error:', error);
  }
  process.exit(0);
}

main();
