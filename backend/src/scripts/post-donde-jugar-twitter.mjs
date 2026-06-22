#!/usr/bin/env node
/**
 * post-donde-jugar-twitter.mjs — publica el directorio "¿dónde jugar?" (16 logos)
 * + hilo de links en Twitter/X, para cada familia. On-demand (no cron).
 * El pin del tweet es MANUAL (la API de X no lo soporta): usa las URLs impreas.
 *
 * Uso (desde backend/):  node src/scripts/post-donde-jugar-twitter.mjs
 */
import 'dotenv/config';
import { runTwitterDirectorio } from '../lib/marketing/partner-runner.js';

const families = ['lotoanimalito', 'lottopantera'];

for (const family of families) {
  try {
    const res = await runTwitterDirectorio({ family });
    console.log(`\n[${family}]`, JSON.stringify(res, null, 2));
    for (const r of res.results || []) {
      if (r.success) console.log(`  → FIJAR MANUALMENTE: ${r.url}`);
    }
  } catch (err) {
    console.error(`[${family}] ERROR:`, err.message);
  }
}

process.exit(0);
