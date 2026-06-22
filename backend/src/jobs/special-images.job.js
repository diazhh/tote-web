import { Cron } from 'croner';
import logger from '../lib/logger.js';
import { getVenezuelaDateAsUTC } from '../lib/dateUtils.js';
import { getBoss } from '../queue/boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../queue/constants.js';

/**
 * Job para generar imagenes especiales (piramides, resumenes, recomendaciones).
 *
 * - 7:00 AM VE: piramides + recomendaciones (predicciones del dia)
 * - 7:01 PM VE: resumenes (resultados del dia)
 */
class SpecialImagesJob {
  constructor() {
    this.morningTask = null;
    this.eveningTask = null;
    this.pizarraTask = null;
  }

  start() {
    // 7:00 AM Venezuela — piramides + recomendaciones
    this.morningTask = new Cron('0 7 * * *', {
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('[special-images] Error en morning job:', error);
      }
    }, async () => {
      await this.executeMorning();
    });

    // 7:01 PM Venezuela — resumenes del dia
    this.eveningTask = new Cron('1 19 * * *', {
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('[special-images] Error en evening job:', error);
      }
    }, async () => {
      await this.executeEvening();
    });

    // 7:30 PM Venezuela — pizarra semanal (story todos los dias; feed los domingos)
    this.pizarraTask = new Cron('30 19 * * *', {
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('[special-images] Error en pizarra job:', error);
      }
    }, async () => {
      await this.executePizarra();
    });

    logger.info('[special-images] Job iniciado (7:00am piramides, 7:01pm resumenes, 7:30pm pizarra, TZ: America/Caracas)');
  }

  stop() {
    if (this.morningTask) this.morningTask.stop();
    if (this.eveningTask) this.eveningTask.stop();
    if (this.pizarraTask) this.pizarraTask.stop();
    logger.info('[special-images] Job detenido');
  }

  async executeMorning() {
    const today = getVenezuelaDateAsUTC();
    const dateStr = today.toISOString();
    logger.info(`[special-images] Generando imagenes matutinas para ${dateStr}`);

    if (process.env.PGBOSS_SPECIAL_IMAGES === 'true') {
      const boss = getBoss();
      await Promise.all([
        boss.send(QUEUES.PIRAMIDE_LOTOANIMALITO, { date: dateStr }, {
          singletonKey: `piramide-la-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.PIRAMIDE_LOTOANIMALITO],
        }),
        boss.send(QUEUES.PIRAMIDE_LOTTOPANTERA, { date: dateStr }, {
          singletonKey: `piramide-lp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.PIRAMIDE_LOTTOPANTERA],
        }),
        boss.send(QUEUES.RECOMENDACIONES_TRIPLE, { date: dateStr }, {
          singletonKey: `reco-tp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.RECOMENDACIONES_TRIPLE],
        }),
      ]);
      logger.info('[special-images] 3 imagenes matutinas encoladas en pg-boss');
      return;
    }

    // Legacy: ejecucion directa
    try {
      const { generatePiramideLotoanimalito } = await import('../queue/workers/piramide-lotoanimalito.worker.js');
      const { generatePiramideLottopantera } = await import('../queue/workers/piramide-lottopantera.worker.js');
      const { generateRecomendacionesTriple } = await import('../queue/workers/recomendaciones-triple.worker.js');

      const results = await Promise.allSettled([
        generatePiramideLotoanimalito(today),
        generatePiramideLottopantera(today),
        generateRecomendacionesTriple(today),
      ]);

      results.forEach((r, i) => {
        const names = ['piramide-lotoanimalito', 'piramide-lottopantera', 'recomendaciones-triple'];
        if (r.status === 'fulfilled') {
          logger.info(`[special-images] ${names[i]} generada: ${r.value.filename}`);
        } else {
          logger.error(`[special-images] Error generando ${names[i]}:`, r.reason);
        }
      });
    } catch (error) {
      logger.error('[special-images] Error en ejecucion matutina:', error);
    }
  }

  async executeEvening() {
    const today = getVenezuelaDateAsUTC();
    const dateStr = today.toISOString();
    logger.info(`[special-images] Generando resumenes para ${dateStr}`);

    if (process.env.PGBOSS_SPECIAL_IMAGES === 'true') {
      const boss = getBoss();
      await Promise.all([
        boss.send(QUEUES.RESUMEN_LOTOANIMALITO, { date: dateStr }, {
          singletonKey: `resumen-la-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.RESUMEN_LOTOANIMALITO],
        }),
        boss.send(QUEUES.RESUMEN_LOTTOPANTERA, { date: dateStr }, {
          singletonKey: `resumen-lp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.RESUMEN_LOTTOPANTERA],
        }),
        boss.send(QUEUES.RESUMEN_TRIPLE, { date: dateStr }, {
          singletonKey: `resumen-tp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.RESUMEN_TRIPLE],
        }),
      ]);
      logger.info('[special-images] 3 resumenes encolados en pg-boss');
      return;
    }

    // Legacy: ejecucion directa
    try {
      const { generateResumenLotoanimalito } = await import('../queue/workers/resumen-lotoanimalito.worker.js');
      const { generateResumenLottopantera } = await import('../queue/workers/resumen-lottopantera.worker.js');
      const { generateResumenTriple } = await import('../queue/workers/resumen-triple.worker.js');

      const results = await Promise.allSettled([
        generateResumenLotoanimalito(today),
        generateResumenLottopantera(today),
        generateResumenTriple(today),
      ]);

      results.forEach((r, i) => {
        const names = ['resumen-lotoanimalito', 'resumen-lottopantera', 'resumen-triple'];
        if (r.status === 'fulfilled') {
          logger.info(`[special-images] ${names[i]} generada: ${r.value.filename}`);
        } else {
          logger.error(`[special-images] Error generando ${names[i]}:`, r.reason);
        }
      });
    } catch (error) {
      logger.error('[special-images] Error en ejecucion vespertina:', error);
    }
  }

  async executePizarra() {
    const today = getVenezuelaDateAsUTC();
    const dateStr = today.toISOString();
    logger.info(`[special-images] Generando pizarra semanal para ${dateStr}`);

    if (process.env.PGBOSS_SPECIAL_IMAGES === 'true') {
      const boss = getBoss();
      await Promise.all([
        boss.send(QUEUES.PIZARRA_LOTOANIMALITO, { date: dateStr }, {
          singletonKey: `pizarra-la-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.PIZARRA_LOTOANIMALITO],
        }),
        boss.send(QUEUES.PIZARRA_LOTTOPANTERA, { date: dateStr }, {
          singletonKey: `pizarra-lp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.PIZARRA_LOTTOPANTERA],
        }),
        boss.send(QUEUES.PIZARRA_TRIPLE, { date: dateStr }, {
          singletonKey: `pizarra-tp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.PIZARRA_TRIPLE],
        }),
      ]);
      logger.info('[special-images] 3 pizarras encoladas en pg-boss');
      return;
    }

    // Legacy: solo generacion (sin publicacion, igual que el resto del fallback)
    try {
      const { generatePizarraLotoanimalito } = await import('../queue/workers/pizarra-lotoanimalito.worker.js');
      const { generatePizarraLottopantera } = await import('../queue/workers/pizarra-lottopantera.worker.js');
      const { generatePizarraTriple } = await import('../queue/workers/pizarra-triple.worker.js');
      const { isSunday } = await import('../lib/marketing/pizarra-runner.js');
      const withFeed = isSunday(today);

      const results = await Promise.allSettled([
        generatePizarraLotoanimalito(today, withFeed),
        generatePizarraLottopantera(today, withFeed),
        generatePizarraTriple(today, withFeed),
      ]);

      results.forEach((r, i) => {
        const names = ['pizarra-lotoanimalito', 'pizarra-lottopantera', 'pizarra-triple'];
        if (r.status === 'fulfilled') {
          logger.info(`[special-images] ${names[i]} generada`);
        } else {
          logger.error(`[special-images] Error generando ${names[i]}:`, r.reason);
        }
      });
    } catch (error) {
      logger.error('[special-images] Error en ejecucion pizarra:', error);
    }
  }
}

export default new SpecialImagesJob();
