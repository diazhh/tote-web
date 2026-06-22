// backend/src/queue/workers/pizarra-lotoanimalito.worker.js
import { generatePizarraImage, runPizarraWorker } from '../../lib/marketing/pizarra-runner.js';

export async function generatePizarraLotoanimalito(date, withFeed = false) {
  return generatePizarraImage({ slug: 'lotoanimalito', date, withFeed });
}

export async function pizarraLotoanimalitoWorker(jobs) {
  return runPizarraWorker({ slug: 'lotoanimalito', displayName: 'LOTOANIMALITO', jobs });
}
