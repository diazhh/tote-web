# "¿Dónde Jugar?" — Publicación de casas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar a diario un recordatorio "¿dónde jugar?" (16 casas de apuestas catalogadas) como story 9:16 en IG/FB + imagen con links en Telegram, desde las familias LOTOANIMALITO y LOTTOPANTERA; más un directorio de 16 logos para Twitter/X (on-demand).

**Architecture:** Calca el pipeline de marketing existente (`resumen-runner` → `html-renderer` Puppeteer → `publication.service`). Una capa de catálogo (`partner-catalog`) lee el `partners.json` ya existente y rota 4 casas/día (determinista por día-del-año). Un fill-builder (`partner-fill`) inyecta logos/nombres/links + paleta por familia en 2 plantillas HTML compartidas. Un runner (`partner-runner`) renderiza y publica. Workers pg-boss + una tarea Croner a las 07:30 VE disparan el diario; un script on-demand dispara el directorio de Twitter.

**Tech Stack:** Node.js ESM, pg-boss, Puppeteer (`renderTemplateToPng`), Sharp, Croner, Prisma, Jest (`--experimental-vm-modules`), `twitter-api-v2`.

## Global Constraints

- **Backend ESM**: `import`/`export` siempre. `type: module`.
- **Prisma singleton**: importar `prisma` desde `../prisma.js` (o ruta relativa equivalente). Nunca instanciar PrismaClient.
- **Comando de test**: desde `backend/`, `npm test -- <ruta>` (ejecuta `NODE_OPTIONS='--experimental-vm-modules' jest --forceExit <ruta>`). Filtrar por nombre con `-t "..."`.
- **Catálogo fuente de verdad**: `backend/storage/marketing/partners/partners.json` (16 casas, campo `logo.file` relativo a esa carpeta). Logos binarios (PNG/JPG) están gitignored (`*.png`) y se despliegan por rsync; solo `partners.json` + `README.md` van a git.
- **Salida de imágenes**: PNGs a `backend/storage/results/`; se sirven públicamente en `${BACKEND_PUBLIC_URL}/api/public/images/results/<filename>` (default `https://toteback.atilax.io`).
- **Familias**: `lotoanimalito` (gameSlug `lotoanimalito`, handle `@lotoanimalito`) y `lottopantera` (gameSlug `lottopantera`, handle `@LottoPantera`; cubre triple/terminal — comparten cuentas).
- **TZ**: el trigger Croner usa `timezone: 'America/Caracas'`. 07:30 = hora Venezuela.
- **Pin de Twitter = manual**: la API de X v2 no expone fijar tweets. El bot publica directorio + hilo y devuelve la URL.
- **Dry-run local**: con `DISABLE_SOCIAL_CHANNELS=true`, `publishStoryToChannels` no publica (genera imágenes, no postea).
- **Branch**: `feat/donde-jugar-publicacion-casas` (ya creada).

---

### Task 1: Catálogo + rotación/caption/hilo (`partner-catalog.js`)

**Files:**
- Create: `backend/src/lib/marketing/partner-catalog.js`
- Test: `backend/src/lib/marketing/__tests__/partner-catalog.test.js`

**Interfaces:**
- Consumes: `backend/storage/marketing/partners/partners.json` (existente).
- Produces:
  - `loadPartners(): Promise<Array<{name, slug, url, logoPath}>>` — `logoPath` absoluto (`<partnersDir>/<logo.file>`).
  - `dayOfYearUTC(date: Date): number` — 1..366.
  - `pickDailyGroup(partners: Array, date: Date, size=4): Array` — bloque determinista del día.
  - `buildLinksCaption(partners: Array, opts?: {header?: string}): string`.
  - `chunkThread(partners: Array, opts?: {maxLen?: number, intro?: string}): string[]` — cada elemento ≤ maxLen (default 270).

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/marketing/__tests__/partner-catalog.test.js`:

```javascript
import { describe, test, expect } from '@jest/globals';
import {
  loadPartners, dayOfYearUTC, pickDailyGroup, buildLinksCaption, chunkThread,
} from '../partner-catalog.js';

const sample = Array.from({ length: 16 }, (_, i) => ({
  name: `Casa${i + 1}`, slug: `casa-${i + 1}`, url: `https://casa${i + 1}.com/`, logoPath: `/abs/casa-${i + 1}.png`,
}));

describe('dayOfYearUTC', () => {
  test('Jan 1 is 1, Dec 31 (non-leap) is 365', () => {
    expect(dayOfYearUTC(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(dayOfYearUTC(new Date(Date.UTC(2026, 11, 31)))).toBe(365);
  });
});

describe('pickDailyGroup', () => {
  test('deterministic: same date -> same 4', () => {
    const d = new Date(Date.UTC(2026, 5, 22));
    expect(pickDailyGroup(sample, d)).toEqual(pickDailyGroup(sample, d));
  });
  test('returns 4 and cycles through all 4 groups over consecutive days', () => {
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const g = pickDailyGroup(sample, new Date(Date.UTC(2026, 0, 1 + i)));
      expect(g).toHaveLength(4);
      seen.add(g[0].slug);
    }
    expect(seen.size).toBe(4); // 4 distinct starting partners => full coverage
  });
});

describe('buildLinksCaption', () => {
  test('header + one bullet per partner with name and url', () => {
    const cap = buildLinksCaption(sample.slice(0, 2), { header: '🎰 Hoy' });
    expect(cap).toContain('🎰 Hoy');
    expect(cap).toContain('• Casa1 → https://casa1.com/');
    expect(cap).toContain('• Casa2 → https://casa2.com/');
  });
});

describe('chunkThread', () => {
  test('every chunk <= maxLen and all 16 partners covered', () => {
    const chunks = chunkThread(sample, { maxLen: 270 });
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(270);
    const joined = chunks.join('\n');
    for (const p of sample) expect(joined).toContain(p.name);
  });
});

describe('loadPartners', () => {
  test('reads the real catalog: 16 partners with absolute logoPath', async () => {
    const partners = await loadPartners();
    expect(partners).toHaveLength(16);
    for (const p of partners) {
      expect(typeof p.name).toBe('string');
      expect(p.url).toMatch(/^https?:\/\//);
      expect(p.logoPath.startsWith('/')).toBe(true);
      expect(p.logoPath).toContain('storage/marketing/partners/logos/');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-catalog.test.js`
Expected: FAIL — `Cannot find module '../partner-catalog.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/marketing/partner-catalog.js`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-catalog.test.js`
Expected: PASS (all suites).

- [ ] **Step 5: Commit (incluye el catálogo de datos)**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/lib/marketing/partner-catalog.js \
        backend/src/lib/marketing/__tests__/partner-catalog.test.js \
        backend/storage/marketing/partners/partners.json \
        backend/storage/marketing/partners/README.md
git commit -m "feat(marketing): partner catalog loader + daily rotation helpers"
```

---

### Task 2: Fill-builder por familia (`partner-fill.js`)

**Files:**
- Create: `backend/src/lib/marketing/partner-fill.js`
- Test: `backend/src/lib/marketing/__tests__/partner-fill.test.js`

**Interfaces:**
- Consumes: nada de otras tareas (autónomo). Las plantillas HTML que referencia se crean en Task 3 (el builder solo devuelve rutas + selectores; no las lee).
- Produces:
  - `getFamily(key: string): {key, gameSlug, displayName, handle, palette}` — throw si `key` desconocido.
  - `buildDondeJugarStoryFill(familyKey, partners): {templatePath, fill:{texts, attrs}}` (4 slots).
  - `buildDondeJugarDirectorioFill(familyKey, partners): {templatePath, fill:{texts, attrs}}` (hasta 16 slots).
  - Constantes `STORY_TEMPLATE`, `DIRECTORIO_TEMPLATE` (rutas absolutas).

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/marketing/__tests__/partner-fill.test.js`:

```javascript
import { describe, test, expect } from '@jest/globals';
import {
  getFamily, buildDondeJugarStoryFill, buildDondeJugarDirectorioFill,
} from '../partner-fill.js';

const four = Array.from({ length: 4 }, (_, i) => ({
  name: `Casa${i + 1}`, slug: `casa-${i + 1}`, url: `https://casa${i + 1}.com/`, logoPath: `/abs/casa-${i + 1}.png`,
}));
const sixteen = Array.from({ length: 16 }, (_, i) => ({
  name: `Casa${i + 1}`, slug: `casa-${i + 1}`, url: `https://casa${i + 1}.com/`, logoPath: `/abs/casa-${i + 1}.png`,
}));

describe('getFamily', () => {
  test('known families resolve, unknown throws', () => {
    expect(getFamily('lotoanimalito').gameSlug).toBe('lotoanimalito');
    expect(getFamily('lottopantera').handle).toBe('@LottoPantera');
    expect(() => getFamily('nope')).toThrow();
  });
});

describe('buildDondeJugarStoryFill', () => {
  const r = buildDondeJugarStoryFill('lotoanimalito', four);
  test('uses the story template', () => {
    expect(r.templatePath).toMatch(/donde-jugar-story\.html$/);
  });
  test('injects palette CSS vars on #board', () => {
    const style = r.fill.attrs.find(([sel, attr]) => sel === '#board' && attr === 'style');
    expect(style).toBeTruthy();
    expect(style[2]).toContain('--bg1:');
    expect(style[2]).toContain('--accent:');
  });
  test('injects 4 logos by file:// and name+url texts', () => {
    const img = r.fill.attrs.find(([sel, attr]) => sel === '[data-logo="1"] .logo__img' && attr === 'src');
    expect(img[2]).toBe('file:///abs/casa-1.png');
    expect(r.fill.texts).toContainEqual(['[data-logo="1"] .logo__name', 'Casa1']);
    expect(r.fill.texts).toContainEqual(['[data-logo="1"] .logo__url', 'casa1.com']);
    expect(r.fill.texts).toContainEqual(['.board__handle', '@lotoanimalito']);
  });
});

describe('buildDondeJugarDirectorioFill', () => {
  test('uses the directorio template and injects 16 logos', () => {
    const r = buildDondeJugarDirectorioFill('lottopantera', sixteen);
    expect(r.templatePath).toMatch(/donde-jugar-directorio\.html$/);
    const img16 = r.fill.attrs.find(([sel, attr]) => sel === '[data-logo="16"] .logo__img' && attr === 'src');
    expect(img16[2]).toBe('file:///abs/casa-16.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-fill.test.js`
Expected: FAIL — `Cannot find module '../partner-fill.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/marketing/partner-fill.js`:

```javascript
// Construye el fill (selector→valor) para las plantillas "¿dónde jugar?",
// inyectando logos, nombre+url y la paleta de la familia. Pareja de html-renderer.
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../../storage/marketing/templates');

export const STORY_TEMPLATE = path.join(TEMPLATES_DIR, 'donde-jugar-story.html');
export const DIRECTORIO_TEMPLATE = path.join(TEMPLATES_DIR, 'donde-jugar-directorio.html');

const FAMILIES = {
  lotoanimalito: {
    key: 'lotoanimalito', gameSlug: 'lotoanimalito', displayName: 'LOTOANIMALITO', handle: '@lotoanimalito',
    palette: { bg1: '#a8181d', bg2: '#3a0608', accent: '#F5C542', text: '#FFF7E6', chip: '#FFFFFF' },
  },
  lottopantera: {
    key: 'lottopantera', gameSlug: 'lottopantera', displayName: 'LOTTOPANTERA', handle: '@LottoPantera',
    palette: { bg1: '#3B0A0E', bg2: '#180405', accent: '#D4AF37', text: '#F5D67A', chip: '#FFFFFF' },
  },
};

export function getFamily(key) {
  const fam = FAMILIES[key];
  if (!fam) throw new Error(`Familia desconocida para donde-jugar: ${key}`);
  return fam;
}

function paletteVars(p) {
  return `--bg1:${p.bg1};--bg2:${p.bg2};--accent:${p.accent};--text:${p.text};--chip:${p.chip};`;
}

/** URL bonita para mostrar: sin protocolo ni slash final. */
function prettyUrl(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function buildFill(templatePath, familyKey, partners) {
  const fam = getFamily(familyKey);
  const texts = [['.board__handle', fam.handle]];
  const attrs = [['#board', 'style', paletteVars(fam.palette)]];
  partners.forEach((p, i) => {
    const n = i + 1;
    attrs.push([`[data-logo="${n}"] .logo__img`, 'src', 'file://' + p.logoPath]);
    texts.push([`[data-logo="${n}"] .logo__name`, p.name]);
    texts.push([`[data-logo="${n}"] .logo__url`, prettyUrl(p.url)]);
  });
  return { templatePath, fill: { texts, attrs } };
}

export function buildDondeJugarStoryFill(familyKey, partners) {
  return buildFill(STORY_TEMPLATE, familyKey, partners);
}

export function buildDondeJugarDirectorioFill(familyKey, partners) {
  return buildFill(DIRECTORIO_TEMPLATE, familyKey, partners);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-fill.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/lib/marketing/partner-fill.js backend/src/lib/marketing/__tests__/partner-fill.test.js
git commit -m "feat(marketing): donde-jugar fill builder (logos + palette per family)"
```

---

### Task 3: Plantillas HTML (story 9:16 + directorio 4×4)

**Files:**
- Create: `backend/storage/marketing/templates/donde-jugar-story.html`
- Create: `backend/storage/marketing/templates/donde-jugar-directorio.html`
- Test: `backend/src/lib/marketing/__tests__/donde-jugar-templates.test.js`

**Interfaces:**
- Consumes: los selectores que `partner-fill.js` (Task 2) inyecta: `#board`, `.board__handle`, `[data-logo="N"] .logo__img`, `[data-logo="N"] .logo__name`, `[data-logo="N"] .logo__url`. Las CSS vars `--bg1/--bg2/--accent/--text/--chip`.
- Produces: 2 archivos `.html` listos para `renderTemplateToPng` (story 1080×1920, directorio 1080×1350). El elemento `#board` es el target del screenshot.

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/marketing/__tests__/donde-jugar-templates.test.js`:

```javascript
import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import { STORY_TEMPLATE, DIRECTORIO_TEMPLATE } from '../partner-fill.js';

describe('donde-jugar templates', () => {
  test('story template exists with #board and 4 logo slots', () => {
    const html = fs.readFileSync(STORY_TEMPLATE, 'utf8');
    expect(html).toContain('id="board"');
    for (let n = 1; n <= 4; n++) {
      expect(html).toContain(`data-logo="${n}"`);
    }
    expect(html).toContain('class="logo__img"');
    expect(html).toContain('class="logo__name"');
    expect(html).toContain('class="logo__url"');
    expect(html).toContain('board__handle');
    expect(html).toContain('var(--bg1');
  });
  test('directorio template exists with #board and 16 logo slots', () => {
    const html = fs.readFileSync(DIRECTORIO_TEMPLATE, 'utf8');
    expect(html).toContain('id="board"');
    for (let n = 1; n <= 16; n++) {
      expect(html).toContain(`data-logo="${n}"`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/donde-jugar-templates.test.js`
Expected: FAIL — `ENOENT` (los .html no existen).

- [ ] **Step 3: Create the story template**

Create `backend/storage/marketing/templates/donde-jugar-story.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{display:flex;justify-content:center;background:#0a0404;}
  #board{
    --bg1:#a8181d;--bg2:#3a0608;--accent:#F5C542;--text:#FFF7E6;--chip:#FFFFFF;
    width:1080px;height:1920px;overflow:hidden;position:relative;
    padding:150px 70px 130px;display:flex;flex-direction:column;
    font-family:'Baloo 2',system-ui,sans-serif;color:var(--text);
    background:
      radial-gradient(130% 90% at 50% -12%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 52%),
      linear-gradient(160deg, var(--bg1) 0%, var(--bg2) 100%);
  }
  #board::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
    box-shadow:inset 0 0 230px rgba(0,0,0,.5);}
  .board__header{position:relative;z-index:3;text-align:center;margin-bottom:54px;}
  .board__kicker{font-family:'Fredoka';font-weight:600;font-size:34px;letter-spacing:2px;opacity:.92;text-transform:uppercase;}
  .board__title{
    font-weight:800;font-size:96px;line-height:1;letter-spacing:1px;margin-top:10px;text-transform:uppercase;
    color:var(--text);text-shadow:0 4px 0 rgba(0,0,0,.3),0 0 26px color-mix(in srgb, var(--accent) 40%, transparent);}
  .board__grid{position:relative;z-index:3;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:42px;flex:1;min-height:0;}
  .cell{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:22px;min-height:0;}
  .logo__chip{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
    background:var(--chip);border-radius:34px;padding:34px;border:4px solid var(--accent);
    box-shadow:0 14px 34px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.6);}
  .logo__img{max-width:100%;max-height:100%;object-fit:contain;}
  .logo__name{font-weight:800;font-size:40px;line-height:1;text-align:center;}
  .logo__url{font-family:'Fredoka';font-weight:600;font-size:28px;color:var(--accent);text-align:center;margin-top:-12px;}
  .board__footer{position:relative;z-index:3;text-align:center;margin-top:46px;}
  .board__cta{display:inline-block;font-weight:800;font-size:40px;color:#1a0203;
    background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 100%, white 20%), var(--accent));
    padding:18px 54px;border-radius:999px;box-shadow:0 10px 26px rgba(0,0,0,.4);}
  .board__handle{display:block;font-family:'Fredoka';font-weight:600;font-size:30px;margin-top:22px;opacity:.85;}
</style>
</head>
<body>
  <div class="board" id="board">
    <header class="board__header">
      <div class="board__kicker">Juega seguro en</div>
      <h1 class="board__title">¿Dónde Jugar?</h1>
    </header>
    <main class="board__grid">
      <div class="cell" data-logo="1"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="2"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="3"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="4"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
    </main>
    <footer class="board__footer">
      <span class="board__cta">🔗 Link en bio</span>
      <span class="board__handle">@handle</span>
    </footer>
  </div>
</body>
</html>
```

- [ ] **Step 4: Create the directorio template**

Create `backend/storage/marketing/templates/donde-jugar-directorio.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{display:flex;justify-content:center;background:#0a0404;}
  #board{
    --bg1:#a8181d;--bg2:#3a0608;--accent:#F5C542;--text:#FFF7E6;--chip:#FFFFFF;
    width:1080px;height:1350px;overflow:hidden;position:relative;
    padding:64px 56px 60px;display:flex;flex-direction:column;
    font-family:'Baloo 2',system-ui,sans-serif;color:var(--text);
    background:
      radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 55%),
      linear-gradient(160deg, var(--bg1) 0%, var(--bg2) 100%);
  }
  #board::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;box-shadow:inset 0 0 200px rgba(0,0,0,.5);}
  .board__header{position:relative;z-index:3;text-align:center;margin-bottom:34px;}
  .board__title{font-weight:800;font-size:72px;line-height:1;text-transform:uppercase;
    text-shadow:0 4px 0 rgba(0,0,0,.3),0 0 22px color-mix(in srgb, var(--accent) 40%, transparent);}
  .board__sub{font-family:'Fredoka';font-weight:600;font-size:30px;opacity:.9;margin-top:8px;}
  .board__grid{position:relative;z-index:3;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr);gap:22px;flex:1;min-height:0;}
  .cell{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;min-height:0;}
  .logo__chip{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
    background:var(--chip);border-radius:22px;padding:16px;border:3px solid var(--accent);
    box-shadow:0 8px 20px rgba(0,0,0,.38);}
  .logo__img{max-width:100%;max-height:100%;object-fit:contain;}
  .logo__name{font-weight:700;font-size:21px;line-height:1;text-align:center;}
  .logo__url{display:none;}
  .board__footer{position:relative;z-index:3;text-align:center;margin-top:28px;}
  .board__handle{font-family:'Fredoka';font-weight:600;font-size:30px;opacity:.9;}
</style>
</head>
<body>
  <div class="board" id="board">
    <header class="board__header">
      <h1 class="board__title">¿Dónde Jugar?</h1>
      <div class="board__sub">Todas las casas — links en el hilo 👇</div>
    </header>
    <main class="board__grid">
      <div class="cell" data-logo="1"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="2"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="3"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="4"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="5"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="6"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="7"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="8"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="9"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="10"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="11"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="12"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="13"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="14"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="15"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
      <div class="cell" data-logo="16"><div class="logo__chip"><img class="logo__img" src="" alt=""></div><div class="logo__name"></div><div class="logo__url"></div></div>
    </main>
    <footer class="board__footer"><span class="board__handle">@handle</span></footer>
  </div>
</body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/donde-jugar-templates.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

Nota: las plantillas `.html` NO están afectadas por `*.png` en `.gitignore`, así que se commitean.

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/storage/marketing/templates/donde-jugar-story.html \
        backend/storage/marketing/templates/donde-jugar-directorio.html \
        backend/src/lib/marketing/__tests__/donde-jugar-templates.test.js
git commit -m "feat(marketing): donde-jugar HTML templates (story 9:16 + directorio 4x4)"
```

---

### Task 4: `twitterService.replyTweet` (hilo)

**Files:**
- Modify: `backend/src/services/twitter.service.js` (añadir método tras `publishTweet`, ~línea 164)
- Test: `backend/src/services/__tests__/twitter.service.test.js`

**Interfaces:**
- Consumes: métodos existentes `getInstance`, `_buildClient`, `_uploadMedia`, `_extractError`, `updateLastSeen`.
- Produces: `replyTweet(instanceId: string, text: string, inReplyToTweetId: string, imageUrl?: string): Promise<{success, tweetId?, error?}>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/twitter.service.test.js`:

```javascript
import { describe, test, expect, jest, afterEach } from '@jest/globals';
import twitterService from '../twitter.service.js';

afterEach(() => jest.restoreAllMocks());

describe('twitterService.replyTweet', () => {
  test('posts a reply with in_reply_to_tweet_id and returns tweetId', async () => {
    jest.spyOn(twitterService, 'getInstance').mockResolvedValue({ instanceId: 'x', apiKey: 'a', apiSecret: 'b', accessToken: 'c', accessSecret: 'd' });
    const tweet = jest.fn().mockResolvedValue({ data: { id: '999' } });
    jest.spyOn(twitterService, '_buildClient').mockResolvedValue({ v2: { tweet } });
    jest.spyOn(twitterService, 'updateLastSeen').mockResolvedValue(undefined);

    const res = await twitterService.replyTweet('x', 'hola', '123');
    expect(res).toEqual({ success: true, tweetId: '999' });
    expect(tweet).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hola',
      reply: { in_reply_to_tweet_id: '123' },
    }));
  });

  test('returns controlled failure on error', async () => {
    jest.spyOn(twitterService, 'getInstance').mockRejectedValue(new Error('boom'));
    const res = await twitterService.replyTweet('x', 'hola', '123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/services/__tests__/twitter.service.test.js`
Expected: FAIL — `twitterService.replyTweet is not a function`.

- [ ] **Step 3: Add the method**

In `backend/src/services/twitter.service.js`, insert this method immediately after the `publishTweet` method closes (after its closing `}` near line 164, before `_uploadMedia`):

```javascript
  /**
   * Responder a un tweet (encadenar un hilo), con imagen opcional.
   *
   * @param {string} instanceId
   * @param {string} text
   * @param {string} inReplyToTweetId - id del tweet al que se responde
   * @param {string|null} imageUrl
   * @returns {Promise<{success:boolean, tweetId?:string, error?:string}>}
   */
  async replyTweet(instanceId, text, inReplyToTweetId, imageUrl = null) {
    try {
      const instance = await this.getInstance(instanceId);
      const client = await this._buildClient(instance);

      const mediaIds = [];
      if (imageUrl) {
        try {
          const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
          mediaIds.push(await this._uploadMedia(client, Buffer.from(resp.data)));
        } catch (mediaError) {
          logger.warn(`No se pudo subir imagen al reply de X (${instanceId}): ${this._extractError(mediaError)}`);
        }
      }

      const payload = { text, reply: { in_reply_to_tweet_id: inReplyToTweetId } };
      if (mediaIds.length > 0) payload.media = { media_ids: mediaIds };

      const result = await client.v2.tweet(payload);
      const tweetId = result?.data?.id || null;

      await this.updateLastSeen(instanceId);
      return { success: true, tweetId };
    } catch (error) {
      const message = this._extractError(error);
      logger.error(`Error al responder tweet en ${instanceId}: ${message}`);
      return { success: false, error: message };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/services/__tests__/twitter.service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/services/twitter.service.js backend/src/services/__tests__/twitter.service.test.js
git commit -m "feat(twitter): replyTweet() to chain threads"
```

---

### Task 5: Runner diario (`partner-runner.js` → `runDailyDondeJugar`)

**Files:**
- Create: `backend/src/lib/marketing/partner-runner.js`
- Test: `backend/src/lib/marketing/__tests__/partner-runner.test.js`

**Interfaces:**
- Consumes: `loadPartners`, `pickDailyGroup`, `buildLinksCaption` (Task 1); `buildDondeJugarStoryFill`, `getFamily` (Task 2); `renderTemplateToPng` (existente); `publication.service` (existente, `publishStoryToChannels`); `prisma`.
- Produces: `runDailyDondeJugar({date, family}, deps?): Promise<{success, gameId, storyFilename}>`. `deps` permite inyectar dependencias en tests (default = las reales).

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/marketing/__tests__/partner-runner.test.js`:

```javascript
import { describe, test, expect, jest } from '@jest/globals';
import { runDailyDondeJugar } from '../partner-runner.js';

describe('runDailyDondeJugar', () => {
  test('renders a 1080x1920 story and publishes to IG/FB/Telegram with a 4-link caption', async () => {
    const calls = {};
    const deps = {
      render: jest.fn().mockResolvedValue(Buffer.from('png')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      findGameBySlug: jest.fn().mockResolvedValue({ id: 'game-1' }),
      publication: {
        publishStoryToChannels: jest.fn((gameId, p, fn, caption, opts) => {
          calls.story = { gameId, fn, caption, opts };
          return Promise.resolve({ success: true, results: [] });
        }),
      },
    };

    const res = await runDailyDondeJugar({ date: '2026-06-22', family: 'lotoanimalito' }, deps);

    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1920 }));
    expect(calls.story.gameId).toBe('game-1');
    expect(calls.story.opts.channelTypes).toEqual(['INSTAGRAM', 'FACEBOOK', 'TELEGRAM']);
    expect(calls.story.caption).toContain('→'); // bullets with links
    expect(calls.story.fn).toMatch(/^dondejugar_lotoanimalito_\d{8}_story\.png$/);
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-runner.test.js`
Expected: FAIL — `Cannot find module '../partner-runner.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/marketing/partner-runner.js`:

```javascript
// Renderiza y publica las piezas "¿dónde jugar?": story diaria (IG/FB/Telegram)
// y directorio on-demand para Twitter. Calca resumen-runner.
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import logger from '../logger.js';
import { renderTemplateToPng } from './html-renderer.js';
import { loadPartners, pickDailyGroup, buildLinksCaption, chunkThread } from './partner-catalog.js';
import { buildDondeJugarStoryFill, buildDondeJugarDirectorioFill, getFamily } from './partner-fill.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../../../storage/results');

function stampOf(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Story diaria "¿dónde jugar?" → IG/FB (story nativa) + Telegram (imagen + caption con 4 links).
 * @param {{date:(string|Date), family:string}} args
 * @param {object} [deps] inyección para tests
 */
export async function runDailyDondeJugar({ date, family }, deps = {}) {
  const {
    render = renderTemplateToPng,
    writeFile = fs.writeFile,
    mkdir = fs.mkdir,
    publication = null,
    findGameBySlug = (slug) => prisma.game.findFirst({ where: { slug } }),
  } = deps;
  const pub = publication || (await import('../../services/publication.service.js')).default;

  const fam = getFamily(family);
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  await mkdir(OUTPUT_PATH, { recursive: true });

  const partners = await loadPartners();
  const group = pickDailyGroup(partners, dateObj);
  logger.info(`[donde-jugar:${family}] casas del día: ${group.map((p) => p.name).join(', ')}`);

  const { templatePath, fill } = buildDondeJugarStoryFill(family, group);
  const buf = await render({ templatePath, fill, width: 1080, height: 1920 });

  const storyFilename = `dondejugar_${family}_${stampOf(dateObj)}_story.png`;
  const storyPath = path.join(OUTPUT_PATH, storyFilename);
  await writeFile(storyPath, buf);

  const game = await findGameBySlug(fam.gameSlug);
  if (!game) throw new Error(`Game ${fam.gameSlug} not found`);

  const caption = buildLinksCaption(group);

  try {
    await pub.publishStoryToChannels(game.id, storyPath, storyFilename, caption, {
      channelTypes: ['INSTAGRAM', 'FACEBOOK', 'TELEGRAM'],
    });
  } catch (err) {
    logger.warn(`[donde-jugar:${family}] error publicando story: ${err.message}`);
  }

  return { success: true, gameId: game.id, storyFilename, storyPath };
}

/**
 * Directorio (16 logos) para Twitter, on-demand: tweet raíz con imagen + hilo de links.
 * El pin es manual (la API de X no lo soporta). Devuelve las URLs de los tweets raíz.
 * @param {{family:string}} args
 * @param {object} [deps] inyección para tests
 */
export async function runTwitterDirectorio({ family }, deps = {}) {
  const {
    render = renderTemplateToPng,
    writeFile = fs.writeFile,
    mkdir = fs.mkdir,
    twitter = null,
    findGameBySlug = (slug) => prisma.game.findFirst({ where: { slug } }),
    findTwitterChannels = (gameId) => prisma.gameChannel.findMany({ where: { gameId, channelType: 'TWITTER', isActive: true } }),
  } = deps;
  const tw = twitter || (await import('../../services/twitter.service.js')).default;

  const fam = getFamily(family);
  await mkdir(OUTPUT_PATH, { recursive: true });

  const partners = await loadPartners();
  const { templatePath, fill } = buildDondeJugarDirectorioFill(family, partners);
  const buf = await render({ templatePath, fill, width: 1080, height: 1350 });

  const filename = `dondejugar_${family}_directorio.png`;
  await writeFile(path.join(OUTPUT_PATH, filename), buf);

  const game = await findGameBySlug(fam.gameSlug);
  if (!game) throw new Error(`Game ${fam.gameSlug} not found`);
  const channels = await findTwitterChannels(game.id);

  const baseUrl = process.env.BACKEND_PUBLIC_URL || 'https://toteback.atilax.io';
  const imageUrl = `${baseUrl}/api/public/images/results/${filename}`;
  const rootText = '🎰 ¿Dónde jugar? Estas son las casas donde puedes jugar 👇 Todos los links en el hilo.';
  const thread = chunkThread(partners);

  const out = [];
  for (const ch of channels) {
    const root = await tw.publishTweet(ch.twitterInstanceId, rootText, imageUrl);
    if (!root.success) {
      out.push({ channel: ch.name, success: false, error: root.error });
      continue;
    }
    let lastId = root.tweetId;
    for (const chunk of thread) {
      const r = await tw.replyTweet(ch.twitterInstanceId, chunk, lastId);
      if (r.success) lastId = r.tweetId;
    }
    out.push({ channel: ch.name, success: true, rootTweetId: root.tweetId, url: `https://x.com/i/web/status/${root.tweetId}` });
  }
  return { success: out.some((o) => o.success), results: out };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-runner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/lib/marketing/partner-runner.js backend/src/lib/marketing/__tests__/partner-runner.test.js
git commit -m "feat(marketing): donde-jugar runner (daily story + twitter directorio)"
```

---

### Task 6: Runner de Twitter — test del hilo encadenado

**Files:**
- Modify: `backend/src/lib/marketing/__tests__/partner-runner.test.js` (añadir suite)

**Interfaces:**
- Consumes: `runTwitterDirectorio` (Task 5).
- Produces: cobertura de que el directorio postea raíz con imagen y encadena replies con el id del tweet previo.

- [ ] **Step 1: Write the failing test (añadir al final del archivo de Task 5)**

Append to `backend/src/lib/marketing/__tests__/partner-runner.test.js`:

```javascript
import { runTwitterDirectorio } from '../partner-runner.js';

describe('runTwitterDirectorio', () => {
  test('posts root with image then chains the thread replies', async () => {
    const tweetIds = ['root', 'r1', 'r2', 'r3', 'r4'];
    let i = 0;
    const replyCalls = [];
    const deps = {
      render: jest.fn().mockResolvedValue(Buffer.from('png')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      findGameBySlug: jest.fn().mockResolvedValue({ id: 'game-1' }),
      findTwitterChannels: jest.fn().mockResolvedValue([{ name: 'tw', twitterInstanceId: 'inst-1' }]),
      twitter: {
        publishTweet: jest.fn().mockResolvedValue({ success: true, tweetId: tweetIds[i++] }),
        replyTweet: jest.fn((instanceId, text, inReplyTo) => {
          replyCalls.push(inReplyTo);
          return Promise.resolve({ success: true, tweetId: tweetIds[i++] });
        }),
      },
    };

    const res = await runTwitterDirectorio({ family: 'lottopantera' }, deps);

    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1350 }));
    expect(deps.twitter.publishTweet).toHaveBeenCalledWith('inst-1', expect.stringContaining('¿Dónde jugar?'), expect.stringContaining('/api/public/images/results/dondejugar_lottopantera_directorio.png'));
    // first reply chains off root, second off the first reply, etc.
    expect(replyCalls[0]).toBe('root');
    expect(replyCalls[1]).toBe('r1');
    expect(res.results[0]).toMatchObject({ channel: 'tw', success: true, rootTweetId: 'root' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-runner.test.js -t "runTwitterDirectorio"`
Expected: FAIL only if Task 5's `runTwitterDirectorio` body is wrong; if Task 5 is correct it should PASS. If it fails, fix `runTwitterDirectorio` until it matches the chaining contract.

- [ ] **Step 3: (No new impl — logic lives in Task 5)**

This task verifies Task 5's `runTwitterDirectorio`. If the test reveals a bug (e.g., not chaining `lastId`), fix `partner-runner.js` accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/lib/marketing/__tests__/partner-runner.test.js`
Expected: PASS (both suites).

- [ ] **Step 5: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/lib/marketing/__tests__/partner-runner.test.js
git commit -m "test(marketing): donde-jugar twitter thread chaining"
```

---

### Task 7: Queues + workers + registro pg-boss

**Files:**
- Modify: `backend/src/queue/constants.js` (añadir 2 queues + 2 configs)
- Create: `backend/src/queue/workers/donde-jugar-lotoanimalito.worker.js`
- Create: `backend/src/queue/workers/donde-jugar-lottopantera.worker.js`
- Modify: `backend/src/queue/register.js` (bloque `PGBOSS_SPECIAL_IMAGES`)
- Test: `backend/src/queue/__tests__/donde-jugar-queues.test.js`

**Interfaces:**
- Consumes: `runDailyDondeJugar` (Task 5).
- Produces: `QUEUES.DONDE_JUGAR_LOTOANIMALITO`, `QUEUES.DONDE_JUGAR_LOTTOPANTERA`; workers `dondeJugarLotoanimalitoWorker(jobs)`, `dondeJugarLottopanteraWorker(jobs)`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/queue/__tests__/donde-jugar-queues.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/queue/__tests__/donde-jugar-queues.test.js`
Expected: FAIL — worker modules / queue keys not found.

- [ ] **Step 3: Add queue constants**

In `backend/src/queue/constants.js`, inside the `QUEUES` object, after the `WINNER_STORY` line (line 40), add:

```javascript
  DONDE_JUGAR_LOTOANIMALITO: 'donde-jugar-lotoanimalito',
  DONDE_JUGAR_LOTTOPANTERA: 'donde-jugar-lottopantera',
```

In the same file, inside `QUEUE_CONFIGS`, after the `RESUMEN_LOTTOPANTERA` config block (line 215), add:

```javascript
  [QUEUES.DONDE_JUGAR_LOTOANIMALITO]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
  [QUEUES.DONDE_JUGAR_LOTTOPANTERA]: {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 3,
  },
```

- [ ] **Step 4: Create the two worker files**

Create `backend/src/queue/workers/donde-jugar-lotoanimalito.worker.js`:

```javascript
// backend/src/queue/workers/donde-jugar-lotoanimalito.worker.js
import { runDailyDondeJugar } from '../../lib/marketing/partner-runner.js';

export async function dondeJugarLotoanimalitoWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  return runDailyDondeJugar({ date: job.data.date, family: 'lotoanimalito' });
}
```

Create `backend/src/queue/workers/donde-jugar-lottopantera.worker.js`:

```javascript
// backend/src/queue/workers/donde-jugar-lottopantera.worker.js
import { runDailyDondeJugar } from '../../lib/marketing/partner-runner.js';

export async function dondeJugarLottopanteraWorker(jobs) {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  return runDailyDondeJugar({ date: job.data.date, family: 'lottopantera' });
}
```

- [ ] **Step 5: Register the workers**

In `backend/src/queue/register.js`, inside the `if (process.env.PGBOSS_SPECIAL_IMAGES === 'true') {` block: after the `pizarraTripleWorker` import (line 240) add:

```javascript
    const { dondeJugarLotoanimalitoWorker } = await import('./workers/donde-jugar-lotoanimalito.worker.js');
    const { dondeJugarLottopanteraWorker } = await import('./workers/donde-jugar-lottopantera.worker.js');
```

After the `await boss.createQueue(QUEUES.PIZARRA_TRIPLE);` line (line 253) add:

```javascript
    await boss.createQueue(QUEUES.DONDE_JUGAR_LOTOANIMALITO);
    await boss.createQueue(QUEUES.DONDE_JUGAR_LOTTOPANTERA);
```

After the `await boss.work(QUEUES.PIZARRA_TRIPLE, ...)` line (line 263) add:

```javascript
    await boss.work(QUEUES.DONDE_JUGAR_LOTOANIMALITO, QUEUE_CONFIGS[QUEUES.DONDE_JUGAR_LOTOANIMALITO], dondeJugarLotoanimalitoWorker);
    await boss.work(QUEUES.DONDE_JUGAR_LOTTOPANTERA, QUEUE_CONFIGS[QUEUES.DONDE_JUGAR_LOTTOPANTERA], dondeJugarLottopanteraWorker);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- src/queue/__tests__/donde-jugar-queues.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/queue/constants.js backend/src/queue/register.js \
        backend/src/queue/workers/donde-jugar-lotoanimalito.worker.js \
        backend/src/queue/workers/donde-jugar-lottopantera.worker.js \
        backend/src/queue/__tests__/donde-jugar-queues.test.js
git commit -m "feat(queue): donde-jugar queues + workers + registration"
```

---

### Task 8: Trigger Croner diario 07:30 VE

**Files:**
- Modify: `backend/src/jobs/special-images.job.js`

**Interfaces:**
- Consumes: `QUEUES.DONDE_JUGAR_LOTOANIMALITO/LOTTOPANTERA` + `QUEUE_CONFIGS` (Task 7); `getBoss`, `getVenezuelaDateAsUTC` (existentes).
- Produces: nueva tarea Croner `Cron('30 7 * * *', TZ America/Caracas)` + método `executeDondeJugar()` que encola ambas familias con `{ date }`.

- [ ] **Step 1: Add the task field + scheduling**

In `backend/src/jobs/special-images.job.js`:

In the `constructor()` (after `this.pizarraTask = null;`, line 17) add:

```javascript
    this.dondeJugarTask = null;
```

In `start()`, after the `this.pizarraTask = new Cron(...)` block (line 49) add:

```javascript
    // 7:30 AM Venezuela — "¿dónde jugar?" (recordatorio de casas)
    this.dondeJugarTask = new Cron('30 7 * * *', {
      timezone: 'America/Caracas',
      catch: (error) => {
        logger.error('[special-images] Error en donde-jugar job:', error);
      }
    }, async () => {
      await this.executeDondeJugar();
    });
```

Update the `logger.info` summary line in `start()` (line 51) to:

```javascript
    logger.info('[special-images] Job iniciado (7:00am piramides, 7:30am donde-jugar, 7:01pm resumenes, 7:30pm pizarra, TZ: America/Caracas)');
```

In `stop()` (after the `if (this.pizarraTask) this.pizarraTask.stop();` line) add:

```javascript
    if (this.dondeJugarTask) this.dondeJugarTask.stop();
```

- [ ] **Step 2: Add the executeDondeJugar method**

In the same class, after the `executePizarra()` method closes (line 211, before the final class-closing `}`), add:

```javascript
  async executeDondeJugar() {
    const today = getVenezuelaDateAsUTC();
    const dateStr = today.toISOString();
    logger.info(`[special-images] Encolando donde-jugar para ${dateStr}`);

    if (process.env.PGBOSS_SPECIAL_IMAGES === 'true') {
      const boss = getBoss();
      await Promise.all([
        boss.send(QUEUES.DONDE_JUGAR_LOTOANIMALITO, { date: dateStr }, {
          singletonKey: `donde-jugar-la-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.DONDE_JUGAR_LOTOANIMALITO],
        }),
        boss.send(QUEUES.DONDE_JUGAR_LOTTOPANTERA, { date: dateStr }, {
          singletonKey: `donde-jugar-lp-${dateStr}`,
          ...QUEUE_CONFIGS[QUEUES.DONDE_JUGAR_LOTTOPANTERA],
        }),
      ]);
      logger.info('[special-images] 2 donde-jugar encolados en pg-boss');
      return;
    }

    // Legacy: ejecución directa (sin pg-boss)
    try {
      const { runDailyDondeJugar } = await import('../lib/marketing/partner-runner.js');
      await Promise.allSettled([
        runDailyDondeJugar({ date: today, family: 'lotoanimalito' }),
        runDailyDondeJugar({ date: today, family: 'lottopantera' }),
      ]);
    } catch (error) {
      logger.error('[special-images] Error en ejecución donde-jugar:', error);
    }
  }
```

- [ ] **Step 3: Verify the file parses (no dedicated unit test — Croner+boss side effects)**

Run: `cd backend && node --check src/jobs/special-images.job.js`
Expected: no output (exit 0) — sintaxis válida.

- [ ] **Step 4: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/jobs/special-images.job.js
git commit -m "feat(jobs): schedule donde-jugar daily at 07:30 VE (Croner)"
```

---

### Task 9: Script on-demand para el directorio de Twitter

**Files:**
- Create: `backend/src/scripts/post-donde-jugar-twitter.mjs`

**Interfaces:**
- Consumes: `runTwitterDirectorio` (Task 5).
- Produces: script CLI que postea el directorio + hilo en cada familia e imprime las URLs (para fijar manualmente).

- [ ] **Step 1: Create the script**

Create `backend/src/scripts/post-donde-jugar-twitter.mjs`:

```javascript
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
```

- [ ] **Step 2: Verify it parses**

Run: `cd backend && node --check src/scripts/post-donde-jugar-twitter.mjs`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add backend/src/scripts/post-donde-jugar-twitter.mjs
git commit -m "feat(scripts): on-demand donde-jugar twitter directorio + thread"
```

---

### Task 10: Verificación dry-run local (render real + QA visual de logos)

**Files:**
- Create (temporal, NO commitear): `backend/scratch-render-donde-jugar.mjs`

**Interfaces:**
- Consumes: `runDailyDondeJugar` con `DISABLE_SOCIAL_CHANNELS=true` (genera imágenes, no publica). Requiere `npm install` hecho (Puppeteer) y los logos presentes en `backend/storage/marketing/partners/logos/`.

- [ ] **Step 1: Run the full test suite (regresión)**

Run: `cd backend && npm test -- src/lib/marketing src/queue/__tests__/donde-jugar-queues.test.js src/services/__tests__/twitter.service.test.js`
Expected: PASS en todos los archivos donde-jugar/partner/twitter.

- [ ] **Step 2: Render real ambas familias (sin publicar)**

Create `backend/scratch-render-donde-jugar.mjs`:

```javascript
import { runDailyDondeJugar } from './src/lib/marketing/partner-runner.js';
process.env.DISABLE_SOCIAL_CHANNELS = 'true';
// publishStoryToChannels se cortocircuita por el guard; igual inyectamos un pub no-op
// para no tocar prisma.game si no hay DB local con esos juegos.
const noopPub = { publishStoryToChannels: async () => ({ success: true, skipped: true, results: [] }) };
for (const family of ['lotoanimalito', 'lottopantera']) {
  const r = await runDailyDondeJugar(
    { date: new Date(), family },
    { publication: noopPub, findGameBySlug: async () => ({ id: 'local' }) },
  );
  console.log(family, '→', r.storyPath);
}
const { closeBrowser } = await import('./src/lib/marketing/html-renderer.js');
await closeBrowser();
process.exit(0);
```

Run: `cd backend && node scratch-render-donde-jugar.mjs`
Expected: imprime 2 rutas en `storage/results/dondejugar_*_story.png`.

- [ ] **Step 3: QA visual de los PNG (CRÍTICO — logos heterogéneos)**

Open the two generated PNGs (`backend/storage/results/dondejugar_lotoanimalito_*_story.png` y `dondejugar_lottopantera_*_story.png`) y verificar visualmente:
- Los 4 logos se ven completos dentro de su chip (no recortados ni deformados).
- **Ningún logo "desaparece" sobre el chip blanco.** Riesgo conocido: `casagrandebet` usa `LogoBlanco.svg` (logo BLANCO) → invisible sobre blanco. Si ocurre, en `partners.json` cambiar `casagrandebet.logo.file` a su variante PNG coloreada `logos/casagrandebet-png.png` (campo `altFile` ya documentado) y re-renderizar.
- Nombre + URL legibles bajo cada chip.

- [ ] **Step 4: Render del directorio (16 logos) y QA**

Edit `backend/scratch-render-donde-jugar.mjs` temporalmente para llamar al directorio, o crear un snippet:

```javascript
import { runTwitterDirectorio } from './src/lib/marketing/partner-runner.js';
const r = await runTwitterDirectorio(
  { family: 'lotoanimalito' },
  { twitter: { publishTweet: async () => ({ success: false, error: 'dry-run' }), replyTweet: async () => ({ success: true }) },
    findGameBySlug: async () => ({ id: 'local' }), findTwitterChannels: async () => [] },
);
console.log(r);
const { closeBrowser } = await import('./src/lib/marketing/html-renderer.js');
await closeBrowser();
process.exit(0);
```

Run: `cd backend && node scratch-render-donde-jugar.mjs`
Expected: genera `storage/results/dondejugar_lotoanimalito_directorio.png`. Abrirlo y verificar que las 16 casas entran en la grilla 4×4 legibles.

- [ ] **Step 5: Cleanup temporal**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web/backend
rm -f scratch-render-donde-jugar.mjs
rm -f storage/results/dondejugar_*_story.png storage/results/dondejugar_*_directorio.png
```

- [ ] **Step 6: Commit cualquier ajuste de QA (p.ej. swap de logo de casagrandebet)**

```bash
cd /Users/diazhh/Documents/GitHub/tote-web
git add -A backend/storage/marketing/partners/partners.json
git commit -m "fix(marketing): donde-jugar logo QA adjustments" || echo "sin cambios de QA"
```

---

## Deployment (post-merge, manual — fuera del alcance de los tasks)

1. Asegurar `PGBOSS_SPECIAL_IMAGES=true` en el `.env` de VPS 94 (ya activo: los resúmenes/pizarras corren por ahí).
2. `rsync` del código + las plantillas + los logos a `/var/proyectos/tote-web/` (los logos son binarios fuera de git):
   - `backend/storage/marketing/templates/` y `backend/storage/marketing/partners/`.
3. `ssh 94 "pm2 restart tote-backend"` (registra los nuevos workers + la tarea Croner 07:30).
4. **Twitter**: poner las apps de X en Read+Write + regenerar access token/secret de cada cuenta (pendiente del usuario); luego correr una vez `node src/scripts/post-donde-jugar-twitter.mjs` y **fijar manualmente** los tweets impresos.

## Self-Review

- **Cobertura del spec**: §3 canales → Tasks 5 (story IG/FB/TG), 5+9 (Twitter); §4 rotación → Task 1; §5.1 catálogo → Task 1; §5.2 plantillas → Tasks 2+3; §5.3 runner → Tasks 5+6; §5.4 replyTweet → Task 4; §5.5 scheduling → Tasks 7+8; §8 testing → tests en cada task + Task 10 dry-run. ✔ sin huecos.
- **Placeholders**: ninguno — cada step trae código/comando completo y salida esperada.
- **Consistencia de tipos**: `runDailyDondeJugar({date,family},deps)` y `runTwitterDirectorio({family},deps)` idénticos en Tasks 5/6/8/9; `replyTweet(instanceId,text,inReplyToTweetId,imageUrl)` idéntico en Tasks 4/5; nombres de queue (`donde-jugar-*`) idénticos en Tasks 7/8; selectores (`[data-logo="N"] .logo__img|.logo__name|.logo__url`, `.board__handle`, `#board`) idénticos entre Tasks 2/3.
- **Riesgo conocido** señalado explícitamente (logo blanco de casagrandebet) con remediación en Task 10 — sin cap silencioso.
