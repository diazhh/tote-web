// backend/src/queue/workers/pizarra-triple.worker.js
import { generatePizarraImage, runPizarraWorker } from '../../lib/marketing/pizarra-runner.js';

export async function generatePizarraTriple(date, withFeed = false) {
  return generatePizarraImage({ slug: 'triple-pantera', fileSlug: 'triple', date, withFeed });
}

export async function pizarraTripleWorker(jobs) {
  return runPizarraWorker({ slug: 'triple-pantera', fileSlug: 'triple', displayName: 'TRIPLE PANTERA', jobs });
}
