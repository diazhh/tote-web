import { describe, test, expect } from '@jest/globals';
import { QUEUES, QUEUE_CONFIGS } from '../constants.js';
import { dondeJugarLotoanimalitoWorker } from '../workers/donde-jugar-lotoanimalito.worker.js';
import { dondeJugarLottopanteraWorker } from '../workers/donde-jugar-lottopantera.worker.js';

describe('donde-jugar queues', () => {
  test('queue names + configs exist', () => {
    expect(QUEUES.DONDE_JUGAR_LOTOANIMALITO).toBe('donde-jugar-lotoanimalito');
    expect(QUEUES.DONDE_JUGAR_LOTTOPANTERA).toBe('donde-jugar-lottopantera');
    expect(QUEUE_CONFIGS[QUEUES.DONDE_JUGAR_LOTOANIMALITO]).toMatchObject({ retryLimit: expect.any(Number) });
    expect(QUEUE_CONFIGS[QUEUES.DONDE_JUGAR_LOTTOPANTERA]).toMatchObject({ retryLimit: expect.any(Number) });
  });
  test('workers are functions', () => {
    expect(typeof dondeJugarLotoanimalitoWorker).toBe('function');
    expect(typeof dondeJugarLottopanteraWorker).toBe('function');
  });
});
