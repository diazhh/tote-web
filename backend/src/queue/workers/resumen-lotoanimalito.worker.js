// backend/src/queue/workers/resumen-lotoanimalito.worker.js
import { generateResumenImage, runResumenWorker } from '../../lib/marketing/resumen-runner.js';

export async function generateResumenLotoanimalito(date) {
  return generateResumenImage({ slug: 'lotoanimalito', title: 'RESULTADOS DEL DÍA', date });
}

export async function resumenLotoanimalitoWorker(jobs) {
  return runResumenWorker({ slug: 'lotoanimalito', title: 'RESULTADOS DEL DÍA', displayName: 'LOTOANIMALITO', jobs });
}
