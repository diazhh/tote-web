// backend/src/queue/workers/resumen-triple.worker.js
import { generateResumenImage, runResumenWorker } from '../../lib/marketing/resumen-runner.js';

export async function generateResumenTriple(date) {
  return generateResumenImage({ slug: 'triple-pantera', fileSlug: 'triple', title: 'RESULTADOS DEL DÍA', date });
}

export async function resumenTripleWorker(jobs) {
  return runResumenWorker({ slug: 'triple-pantera', fileSlug: 'triple', title: 'RESULTADOS DEL DÍA', displayName: 'TRIPLE', jobs });
}
