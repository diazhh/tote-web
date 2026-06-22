export const QUEUES = {
  CLOSE_DRAW: 'close-draw',
  CLOSE_AND_INGEST_SWEEP: 'close-and-ingest-sweep',
  CLOSE_AND_INGEST: 'close-and-ingest',
  PRESELECT_SWEEP: 'preselect-sweep',
  PRESELECT: 'preselect',
  EXECUTE_DRAW: 'execute-draw',
  EXECUTE_DRAW_SWEEP: 'execute-draw-sweep',
  STEP_GENERATE_IMAGE: 'step-generate-image',
  STEP_NOTIFY_ADMINS: 'step-notify-admins',
  STEP_PUBLISH_DRAW: 'step-publish-draw',
  STEP_PROCESS_PRIZES: 'step-process-prizes',
  STEP_CALCULATE_STATS: 'step-calculate-stats',
  // Phase 11 (FIN-AGG): materialized DrawFinancial aggregate, two-phase (SALES + PRIZES)
  CALCULATE_DRAW_FINANCIALS: 'calculate-draw-financials',
  // Phase 12 placeholder (D-15) — registered now to prevent F-11 silent-drop on Phase 12's
  // first deploy. Worker logic is a no-op until Phase 12 swaps in commission calculation.
  CALCULATE_PROVIDER_COMMISSION: 'calculate-provider-commission',
  // Phase 12 — weekly settlement snapshot (cron-triggered Mondays 06:00 VE)
  WEEKLY_SETTLEMENT_SNAPSHOT: 'weekly-settlement-snapshot',
  // Phase v1.4 — perf cache layer (RFC 2026-05-16)
  REFRESH_LIVE_SNAPSHOTS: 'refresh-live-snapshots',
  REFRESH_DAILY_SNAPSHOT: 'refresh-daily-snapshot',
  SYNC_API_PLANNING: 'sync-api-planning',
  SYNC_API_TICKETS: 'sync-api-tickets',
  SYNC_SCRAPE_TICKETS: 'sync-scrape-tickets',
  SIMULATE_BETS: 'simulate-bets',
  TEST_BETS: 'test-bets',
  GENERATE_DAILY_DRAWS: 'generate-daily-draws',
  PIRAMIDE_LOTOANIMALITO: 'piramide-lotoanimalito',
  RESUMEN_LOTOANIMALITO: 'resumen-lotoanimalito',
  PIRAMIDE_LOTTOPANTERA: 'piramide-lottopantera',
  RESUMEN_LOTTOPANTERA: 'resumen-lottopantera',
  RECOMENDACIONES_TRIPLE: 'recomendaciones-triple',
  RESUMEN_TRIPLE: 'resumen-triple',
  PIZARRA_LOTOANIMALITO: 'pizarra-lotoanimalito',
  PIZARRA_LOTTOPANTERA: 'pizarra-lottopantera',
  PIZARRA_TRIPLE: 'pizarra-triple',
  RETRY_FAILED_PUBLICATIONS: 'retry-failed-publications',
  CLEANUP_LOGS: 'cleanup-logs',
};

export const QUEUE_CONFIGS = {
  [QUEUES.CLOSE_DRAW]: {
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
  [QUEUES.CLOSE_AND_INGEST_SWEEP]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 1,
  },
  [QUEUES.CLOSE_AND_INGEST]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.PRESELECT_SWEEP]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 1,
  },
  [QUEUES.PRESELECT]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 2,
  },
  [QUEUES.EXECUTE_DRAW]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 2,
  },
  [QUEUES.EXECUTE_DRAW_SWEEP]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 1,
  },
  [QUEUES.STEP_GENERATE_IMAGE]: {
    retryLimit: 4,
    retryDelay: 3,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.STEP_NOTIFY_ADMINS]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 2,
  },
  [QUEUES.STEP_PUBLISH_DRAW]: {
    retryLimit: 4,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
  [QUEUES.STEP_PROCESS_PRIZES]: {
    retryLimit: 5,
    retryDelay: 10,
    retryBackoff: true,
    expireInMinutes: 10,
  },
  [QUEUES.STEP_CALCULATE_STATS]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 2,
  },
  [QUEUES.CALCULATE_DRAW_FINANCIALS]: {
    // Slightly larger window than STEP_CALCULATE_STATS — two-phase + per-provider upserts.
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.CALCULATE_PROVIDER_COMMISSION]: {
    // Phase 12 — real handler. Retry-with-backoff covers the Pitfall 7
    // race condition with DrawFinancial PRIZES commit.
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 2,
  },
  [QUEUES.WEEKLY_SETTLEMENT_SNAPSHOT]: {
    // Phase 12 — heavier GROUP BY across the closed ISO week. Worst case
    // ~4 providers × ~50 ledger rows; should be << 1 min but expireInMinutes
    // is generous so a slow DB doesn't dead-letter the snapshot.
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInMinutes: 10,
  },
  [QUEUES.REFRESH_LIVE_SNAPSHOTS]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 1,
  },
  [QUEUES.REFRESH_DAILY_SNAPSHOT]: {
    retryLimit: 1,
    retryDelay: 10,
    retryBackoff: false,
    expireInMinutes: 2,
  },
  [QUEUES.SYNC_API_PLANNING]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.SYNC_API_TICKETS]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 2,
  },
  [QUEUES.SYNC_SCRAPE_TICKETS]: {
    // Scraping handles its own internal retry (1 reintento extra) — pg-boss-level retry
    // is kept low to avoid spamming the sidecar when Maxplay is down.
    retryLimit: 1,
    retryDelay: 30,
    retryBackoff: false,
    expireInMinutes: 3,
  },
  [QUEUES.SIMULATE_BETS]: {
    retryLimit: 2,
    retryDelay: 3,
    retryBackoff: true,
    expireInMinutes: 1,
  },
  [QUEUES.TEST_BETS]: {
    retryLimit: 2,
    retryDelay: 3,
    retryBackoff: true,
    expireInMinutes: 1,
  },
  [QUEUES.GENERATE_DAILY_DRAWS]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
  [QUEUES.PIRAMIDE_LOTOANIMALITO]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.RESUMEN_LOTOANIMALITO]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.PIRAMIDE_LOTTOPANTERA]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.RESUMEN_LOTTOPANTERA]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.RECOMENDACIONES_TRIPLE]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.RESUMEN_TRIPLE]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.PIZARRA_LOTOANIMALITO]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
  [QUEUES.PIZARRA_LOTTOPANTERA]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
  [QUEUES.PIZARRA_TRIPLE]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
  [QUEUES.RETRY_FAILED_PUBLICATIONS]: {
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInMinutes: 5,
  },
};
