#!/usr/bin/env node
/**
 * trigger-pgboss-cron.mjs — disparado por cron Linux cada minuto.
 *
 * Reemplaza el `boss.schedule()` de pg-boss v10 (que tiene una ventana
 * hardcoded de 60s en shouldSendIt: si el onCron() interno se atrasa >60s,
 * el tick se descarta sin retry — bug raíz del 11-may-2026 que dejó al
 * sorteo de las 19:00 sin cerrar).
 *
 * Este script solo encola UN job en pg-boss y termina.
 * pg-boss workers (corriendo dentro de tote-backend) procesan después.
 * Si el backend está caído, los jobs se acumulan en pgboss.job y se
 * consumen cuando el backend vuelve.
 *
 * Uso (desde cron Linux):
 *   * * * * * root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs close-and-ingest-sweep
 *   * * * * * root /usr/bin/node /var/proyectos/tote-web/backend/src/scripts/trigger-pgboss-cron.mjs preselect-sweep
 *
 * Salida (logueada a /var/log/tote-triggers.log):
 *   2026-05-11T19:55:00.123Z [close-and-ingest-sweep] enqueued
 */
import PgBoss from 'pg-boss';
import 'dotenv/config';

const queueName = process.argv[2];

if (!queueName) {
  console.error(`${new Date().toISOString()} [trigger] FATAL: missing queue name (argv[2])`);
  process.exit(1);
}

const ALLOWED_QUEUES = new Set([
  // Sweeps (descubren trabajo y encolan jobs hijos)
  'close-and-ingest-sweep',
  'preselect-sweep',
  'execute-draw-sweep',
  // Jobs idempotentes con payload vacío (cron Linux es el único trigger)
  'sync-api-tickets',
  'sync-api-planning',
  'sync-scrape-tickets',
  'generate-daily-draws',
  'retry-failed-publications',
  'monitor-dlq',
  'cleanup-logs',
  // Phase 12 — weekly settlement snapshot, fired Monday 06:00 VE via /etc/cron.d/tote-triggers
  'weekly-settlement-snapshot',
  // Phase v1.4 — perf cache layer
  'refresh-live-snapshots',
  'refresh-daily-snapshot',
]);

if (!ALLOWED_QUEUES.has(queueName)) {
  console.error(`${new Date().toISOString()} [trigger] FATAL: queue ${queueName} not in allowlist`);
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  console.error(`${new Date().toISOString()} [trigger] FATAL: DATABASE_URL not set`);
  process.exit(3);
}

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  schema: 'pgboss',
  // No registramos workers — solo encolamos y salimos.
  noScheduling: true,
  noSupervisor: true,
});

const TIMEOUT_MS = 15_000; // safety: si pg-boss no conecta en 15s, abortar

const timeout = setTimeout(() => {
  console.error(`${new Date().toISOString()} [trigger] FATAL: timeout after ${TIMEOUT_MS}ms`);
  process.exit(4);
}, TIMEOUT_MS);

try {
  await boss.start();
  const jobId = await boss.send(queueName, {}, { singletonKey: `trigger-${Date.now()}` });
  console.log(`${new Date().toISOString()} [${queueName}] enqueued job=${jobId ?? 'null'}`);
  await boss.stop({ graceful: false });
  clearTimeout(timeout);
  process.exit(0);
} catch (err) {
  console.error(`${new Date().toISOString()} [${queueName}] FATAL: ${err.message}`);
  clearTimeout(timeout);
  process.exit(5);
}
