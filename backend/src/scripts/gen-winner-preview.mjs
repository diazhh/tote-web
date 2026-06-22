// Preview the per-draw winner story (PNG + reveal video) for the 3 games.
// Templates carry sample data; run from backend/.
import path from 'path';
import fs from 'fs/promises';
import { renderTemplateToPng, closeBrowser } from '../lib/marketing/html-renderer.js';
import { buildRevealVideo } from '../lib/marketing/reveal-video.js';

const OUT = path.join(process.cwd(), 'storage/results');
const tpls = [
  ['storage/bases/1/marketing/winner-lotoanimalito-story.html', 'pipe_winner_lotoanimalito'],
  ['storage/bases/2/marketing/winner-lottopantera-story.html', 'pipe_winner_lottopantera'],
  ['storage/bases/3/marketing/winner-triple-story.html', 'pipe_winner_triple'],
];

for (const [tpl, name] of tpls) {
  const templatePath = path.resolve(tpl);
  const buf = await renderTemplateToPng({ templatePath, fill: {}, width: 1080, height: 1920 });
  await fs.writeFile(path.join(OUT, name + '.png'), buf);
  console.log('wrote', name + '.png');
  await buildRevealVideo({ templatePath, fill: {}, outPath: path.join(OUT, name + '.mp4'), durationSec: 2.6, fps: 24 });
  console.log('wrote', name + '.mp4');
}
await closeBrowser();
console.log('done');
