// backend/src/queue/workers/donde-jugar-lottopantera.worker.js
import { runDailyDondeJugar } from '../../lib/marketing/partner-runner.js';

export async function dondeJugarLottopanteraWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  return runDailyDondeJugar({ date: job.data.date, family: 'lottopantera' });
}
