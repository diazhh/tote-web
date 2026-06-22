// Verify the production render path (Puppeteer + selector injection) reproduces
// the approved templates. Renders all 6 feed pieces (3 daily + 3 pizarra).
// Run from backend/: node src/scripts/render-marketing-preview.mjs
import fs from 'fs/promises';
import path from 'path';
import { renderTemplateToPng, closeBrowser } from '../lib/marketing/html-renderer.js';
import { buildDailyFill, buildPizarraFill } from '../lib/marketing/board-fill.js';

const OUT = path.join(process.cwd(), 'storage/results');
await fs.mkdir(OUT, { recursive: true });

// Art numbers that exist as PNGs in each game's base dir.
const lotoNums = ['05', '33', '12', '09', '21', '0', '17', '28', '03', '25', '14', '31'];
const pantNums = ['05', '33', '12', '48', '21', '0', '17', '28', '41', '25', '14', '44'];
const slotsFrom = (nums) => {
  const s = {};
  for (let h = 8; h <= 19; h++) s[h] = { number: nums[h - 8] };
  return s;
};

const tripleNums = [328, 369, 410, 451, 492, 533, 574, 615, 656, 697, 738, 779];
const tripleSlots = {};
for (let h = 8; h <= 19; h++) tripleSlots[h] = { number: tripleNums[h - 8] };

const animalMatrix = Array.from({ length: 12 }, (_, r) =>
  Array.from({ length: 7 }, (_, c) => String((r * 7 + c) % 37).padStart(2, '0')));
const tripleMatrix = Array.from({ length: 12 }, (_, r) =>
  Array.from({ length: 7 }, (_, c) => String(((r * 7 + c) * 13) % 1000).padStart(3, '0')));

const jobs = [
  { ...buildDailyFill('lotoanimalito', { dateText: '21/06/26', slots: slotsFrom(lotoNums) }), file: 'pipe_daily_lotoanimalito.png' },
  { ...buildDailyFill('lottopantera', { dateText: '21/06/26', slots: slotsFrom(pantNums) }), file: 'pipe_daily_lottopantera.png' },
  { ...buildDailyFill('triple-pantera', { dateText: '21/06/26', slots: tripleSlots }), file: 'pipe_daily_triple.png' },
  { ...buildPizarraFill('lotoanimalito', { weekText: '16 – 22 jun', matrix: animalMatrix }), file: 'pipe_pizarra_lotoanimalito.png' },
  { ...buildPizarraFill('lottopantera', { weekText: '16 – 22 jun', matrix: animalMatrix }), file: 'pipe_pizarra_lottopantera.png' },
  { ...buildPizarraFill('triple-pantera', { weekText: '16 – 22 jun', matrix: tripleMatrix }), file: 'pipe_pizarra_triple.png' },
];

for (const j of jobs) {
  const buf = await renderTemplateToPng({ templatePath: j.templatePath, fill: j.fill });
  await fs.writeFile(path.join(OUT, j.file), buf);
  console.log('wrote', j.file, buf.length, 'bytes');
}
await closeBrowser();
console.log('done');
