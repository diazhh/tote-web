// backend/src/queue/workers/resumen-lottopantera.worker.js
import { generateResumenImage, runResumenWorker } from '../../lib/marketing/resumen-runner.js';

export async function generateResumenLottopantera(date) {
  return generateResumenImage({ slug: 'lottopantera', title: 'RESULTADOS DEL DÍA', date });
}

export async function resumenLottopanteraWorker(jobs) {
  return runResumenWorker({ slug: 'lottopantera', title: 'RESULTADOS DEL DÍA', displayName: 'LOTTOPANTERA', jobs });
}
