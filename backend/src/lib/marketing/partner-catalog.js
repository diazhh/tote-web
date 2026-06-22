// Lee el catálogo de casas (partners.json) y provee helpers de rotación diaria
// y armado de texto (caption de Telegram, hilo de Twitter).
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARTNERS_DIR = path.join(__dirname, '../../../storage/marketing/partners');
const CATALOG_PATH = path.join(PARTNERS_DIR, 'partners.json');

/** Lee partners.json y resuelve la ruta absoluta de cada logo. */
export async function loadPartners() {
  const raw = await fs.readFile(CATALOG_PATH, 'utf8');
  const data = JSON.parse(raw);
  return (data.partners || []).map((p) => ({
    name: p.name,
    slug: p.slug,
    url: p.url,
    logoPath: path.join(PARTNERS_DIR, p.logo.file),
  }));
}

/** Día del año en UTC (1..366). */
export function dayOfYearUTC(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86400000) + 1;
}

/** Bloque determinista de `size` casas para el día (rota por día-del-año). */
export function pickDailyGroup(partners, date, size = 4) {
  const groups = Math.ceil(partners.length / size);
  const idx = (dayOfYearUTC(date) - 1) % groups;
  return partners.slice(idx * size, idx * size + size);
}

/** Texto para Telegram: encabezado + un bullet por casa con su link clickeable. */
export function buildLinksCaption(partners, { header = '🎰 ¿Dónde jugar hoy?' } = {}) {
  const lines = partners.map((p) => `• ${p.name} → ${p.url}`);
  return `${header}\n\n${lines.join('\n')}`;
}

/** Trocea las casas en mensajes ≤ maxLen para el hilo de Twitter. */
export function chunkThread(partners, { maxLen = 270, intro = null } = {}) {
  const chunks = [];
  let current = intro ? intro : '';
  for (const p of partners) {
    const line = `• ${p.name} → ${p.url}`;
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
