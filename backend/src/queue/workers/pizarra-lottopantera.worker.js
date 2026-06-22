// backend/src/queue/workers/pizarra-lottopantera.worker.js
import { generatePizarraImage, runPizarraWorker } from '../../lib/marketing/pizarra-runner.js';

export async function generatePizarraLottopantera(date, withFeed = false) {
  return generatePizarraImage({ slug: 'lottopantera', date, withFeed });
}

export async function pizarraLottopanteraWorker(jobs) {
  return runPizarraWorker({ slug: 'lottopantera', displayName: 'LOTTOPANTERA', jobs });
}
