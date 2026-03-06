import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { getBoss } from '../queue/boss.js';
import { QUEUES, QUEUE_CONFIGS } from '../queue/constants.js';

const ALL_QUEUES = Object.values(QUEUES);

/**
 * GET /api/admin/jobs/stats
 * Estadísticas por queue
 */
export async function getJobStats(req, res) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        name,
        state::text,
        COUNT(*) as count
      FROM pgboss.job
      WHERE name = ANY(${ALL_QUEUES})
      GROUP BY name, state
      ORDER BY name, state
    `;

    const queues = {};
    for (const row of rows) {
      if (!queues[row.name]) {
        queues[row.name] = { active: 0, created: 0, completed: 0, failed: 0, retry: 0 };
      }
      queues[row.name][row.state] = parseInt(row.count);
    }

    const totals = { active: 0, created: 0, completed: 0, failed: 0, retry: 0 };
    for (const q of Object.values(queues)) {
      for (const [k, v] of Object.entries(q)) {
        totals[k] = (totals[k] || 0) + v;
      }
    }

    res.json({ queues, totals });
  } catch (error) {
    logger.error('Error en getJobStats:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/admin/jobs/failed?queue=step-process-prizes&limit=20
 * Lista jobs fallidos
 */
export async function getFailedJobs(req, res) {
  try {
    const { queue, limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    const rows = await prisma.$queryRaw`
      SELECT
        id::text,
        name,
        data,
        state::text,
        retry_limit,
        retry_count,
        output,
        created_on,
        completed_on,
        singleton_key
      FROM pgboss.job
      WHERE state = 'failed'
        AND (${queue}::text IS NULL OR name = ${queue})
      ORDER BY completed_on DESC
      LIMIT ${limitNum}
    `;

    const jobs = rows.map(j => ({
      id: j.id,
      queue: j.name,
      data: j.data,
      state: j.state,
      retryLimit: j.retry_limit,
      retryCount: j.retry_count,
      error: j.output?.message || j.output?.error || null,
      output: j.output,
      createdAt: j.created_on,
      failedAt: j.completed_on,
      singletonKey: j.singleton_key,
    }));

    res.json({ jobs, total: jobs.length });
  } catch (error) {
    logger.error('Error en getFailedJobs:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/admin/jobs/:jobId/retry
 * Reintento manual de un job fallido
 */
export async function retryJob(req, res) {
  try {
    const { jobId } = req.params;

    const rows = await prisma.$queryRaw`
      SELECT id::text, name, data, state::text
      FROM pgboss.job
      WHERE id = ${jobId}::uuid
      LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job no encontrado' });
    }

    const job = rows[0];
    if (job.state !== 'failed') {
      return res.status(400).json({ error: `Job en estado ${job.state}, no se puede reintentar` });
    }

    // Re-encolar el job con los mismos datos
    const boss = getBoss();
    const config = QUEUE_CONFIGS[job.name] || {};
    const newJobId = await boss.send(job.name, job.data, config);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'JOB_RETRIED',
        entity: 'PgBossJob',
        entityId: jobId,
        userId: req.user?.id || null,
        changes: { queue: job.name, originalJobId: jobId, newJobId, data: job.data },
      },
    });

    logger.info(`[admin-jobs] Reintento manual: ${job.name} (${jobId}) → nuevo job ${newJobId}`);
    res.json({ success: true, newJobId, queue: job.name });
  } catch (error) {
    logger.error('Error en retryJob:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/admin/jobs/pipeline/:drawId
 * Estado del pipeline para un sorteo específico
 */
export async function getPipelineStatus(req, res) {
  try {
    const { drawId } = req.params;

    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      select: {
        id: true,
        status: true,
        pipelineJobId: true,
        pipelineStatus: true,
        prizesProcessed: true,
        statsCalculated: true,
        drawnAt: true,
      },
    });

    if (!draw) {
      return res.status(404).json({ error: 'Draw no encontrado' });
    }

    // Buscar jobs de pg-boss para este draw
    const stepQueues = [
      QUEUES.STEP_GENERATE_IMAGE,
      QUEUES.STEP_NOTIFY_ADMINS,
      QUEUES.STEP_PUBLISH_DRAW,
      QUEUES.STEP_PROCESS_PRIZES,
      QUEUES.STEP_CALCULATE_STATS,
    ];

    const jobs = await prisma.$queryRaw`
      SELECT name, state::text, retry_count, retry_limit, output, created_on, completed_on
      FROM pgboss.job
      WHERE name = ANY(${stepQueues})
        AND data->>'drawId' = ${drawId}
      ORDER BY created_on ASC
    `;

    const steps = stepQueues.map(queue => {
      const job = jobs.find(j => j.name === queue);
      return {
        name: queue.replace('step-', ''),
        queue,
        status: job ? job.state : 'pending',
        retries: job ? job.retry_count : 0,
        retryLimit: job ? job.retry_limit : null,
        error: job?.output?.message || job?.output?.error || null,
        createdAt: job?.created_on || null,
        completedAt: job?.completed_on || null,
      };
    });

    res.json({
      drawId,
      drawStatus: draw.status,
      pipelineStatus: draw.pipelineStatus,
      pipelineJobId: draw.pipelineJobId,
      prizesProcessed: draw.prizesProcessed,
      statsCalculated: draw.statsCalculated,
      drawnAt: draw.drawnAt,
      steps,
    });
  } catch (error) {
    logger.error('Error en getPipelineStatus:', error);
    res.status(500).json({ error: error.message });
  }
}
