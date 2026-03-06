import { prisma } from '../../lib/prisma.js';
import logger from '../../lib/logger.js';
import adminTelegramBotService from '../../services/admin-telegram-bot.service.js';

async function sendToAllAdmins(message) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true, telegramUserId: { not: null } },
    select: { telegramUserId: true },
  });
  for (const admin of admins) {
    try {
      await adminTelegramBotService.sendMessageDirect(admin.telegramUserId, message);
    } catch (err) {
      logger.error(`[monitor-dlq] Error enviando a ${admin.telegramUserId}: ${err.message}`);
    }
  }
}

const CRITICAL_QUEUES = ['step-process-prizes', 'close-draw'];
const HIGH_QUEUES = ['sync-api-planning', 'sync-api-tickets', 'execute-draw'];

function formatAlert(jobs, level) {
  const emoji = level === 'CRITICAL' ? '🚨 ALERTA CRÍTICA' : '⚠️ ADVERTENCIA';
  const lines = [`${emoji} — Jobs fallidos en DLQ`, ''];
  for (const job of jobs) {
    const error = job.output?.message || job.output?.error || 'Error desconocido';
    const drawId = job.data?.drawId ? ` (Draw: ${job.data.drawId})` : '';
    lines.push(`❌ ${job.name}${drawId}`);
    lines.push(`   Error: ${String(error).slice(0, 200)}`);
    lines.push(`   Reintentos: ${job.retry_count}/${job.retry_limit}`);
    lines.push(`   Falló: ${new Date(job.completed_on).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`);
    lines.push('');
  }
  if (level === 'CRITICAL') {
    lines.push('⚠️ Acción requerida: Intervención manual inmediata');
    lines.push('🔧 Usar: POST /api/admin/jobs/:id/retry');
  }
  return lines.join('\n');
}

export async function monitorDlqWorker(job) {
  // Consultar jobs fallidos en los últimos 10 minutos
  const since = new Date(Date.now() - 10 * 60 * 1000);

  const failedJobs = await prisma.$queryRaw`
    SELECT id, name, data, state, retry_limit, retry_count, output, completed_on
    FROM pgboss.job
    WHERE state = 'failed'
      AND completed_on > ${since}
    ORDER BY completed_on DESC
    LIMIT 50
  `;

  if (failedJobs.length === 0) {
    return { checked: true, failures: 0 };
  }

  const critical = failedJobs.filter(j => CRITICAL_QUEUES.includes(j.name));
  const high = failedJobs.filter(j => HIGH_QUEUES.includes(j.name));
  const medium = failedJobs.filter(j => !CRITICAL_QUEUES.includes(j.name) && !HIGH_QUEUES.includes(j.name));

  if (critical.length > 0) {
    const msg = formatAlert(critical, 'CRITICAL');
    logger.error(`[monitor-dlq] CRÍTICO: ${critical.map(j => j.name).join(', ')}`);
    await sendToAllAdmins(msg);
  }

  if (high.length > 0) {
    const msg = formatAlert(high, 'HIGH');
    logger.warn(`[monitor-dlq] ALTO: ${high.map(j => j.name).join(', ')}`);
    await sendToAllAdmins(msg);
  }

  if (medium.length > 0) {
    logger.warn(`[monitor-dlq] MEDIO: ${medium.map(j => j.name).join(', ')}`);
  }

  return {
    checked: true,
    failures: failedJobs.length,
    critical: critical.length,
    high: high.length,
    medium: medium.length,
  };
}
