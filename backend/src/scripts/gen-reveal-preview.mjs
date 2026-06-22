// Preview the "results reveal" story-video for the 3 daily pieces.
// Run from backend/: node src/scripts/gen-reveal-preview.mjs
import path from 'path';
import { buildRevealVideo } from '../lib/marketing/reveal-video.js';
import { buildDailyFill } from '../lib/marketing/board-fill.js';
import { closeBrowser } from '../lib/marketing/html-renderer.js';

const OUT = path.join(process.cwd(), 'storage/results');
const story = (p) => p.replace(/\.html$/, '-story.html');

const lotoNums = ['05', '33', '12', '09', '21', '0', '17', '28', '03', '25', '14', '31'];
const pantNums = ['05', '33', '12', '48', '21', '0', '17', '28', '41', '25', '14', '44'];
const slotsFrom = (nums) => { const s = {}; for (let h = 8; h <= 19; h++) s[h] = { number: nums[h - 8] }; return s; };
const tripleNums = [328, 369, 410, 451, 492, 533, 574, 615, 656, 697, 738, 779];
const tripleSlots = {}; for (let h = 8; h <= 19; h++) tripleSlots[h] = { number: tripleNums[h - 8] };

const jobs = [
  { ...buildDailyFill('lotoanimalito', { dateText: '21/06/26', slots: slotsFrom(lotoNums) }), file: 'pipe_reveal_daily_lotoanimalito.mp4' },
  { ...buildDailyFill('lottopantera', { dateText: '21/06/26', slots: slotsFrom(pantNums) }), file: 'pipe_reveal_daily_lottopantera.mp4' },
  { ...buildDailyFill('triple-pantera', { dateText: '21/06/26', slots: tripleSlots }), file: 'pipe_reveal_daily_triple.mp4' },
];

for (const j of jobs) {
  await buildRevealVideo({ templatePath: story(j.templatePath), fill: j.fill, outPath: path.join(OUT, j.file) });
  console.log('wrote', j.file);
}
await closeBrowser();
console.log('done');
