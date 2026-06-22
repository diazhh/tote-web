// backend/src/queue/workers/donde-jugar-lotoanimalito.worker.js
import { runDailyDondeJugar } from '../../lib/marketing/partner-runner.js';

export async function dondeJugarLotoanimalitoWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  return runDailyDondeJugar({ date: job.data.date, family: 'lotoanimalito' });
}
