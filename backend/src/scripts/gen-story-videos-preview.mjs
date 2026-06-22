// Generate story-videos (9:16 MP4) from the story PNGs produced by
// render-marketing-story-preview.mjs, for local visual QA.
// Run from backend/ AFTER render-marketing-story-preview.mjs.
import path from 'path';
import { buildStoryVideo } from '../lib/marketing/video-renderer.js';

const OUT = path.join(process.cwd(), 'storage/results');
const names = [
  'pipe_story_daily_lotoanimalito',
  'pipe_story_daily_lottopantera',
  'pipe_story_daily_triple',
  'pipe_story_pizarra_lotoanimalito',
  'pipe_story_pizarra_lottopantera',
  'pipe_story_pizarra_triple',
];

for (const n of names) {
  const out = path.join(OUT, n + '.mp4');
  await buildStoryVideo({ imagePath: path.join(OUT, n + '.png'), outPath: out, durationSec: 6 });
  console.log('wrote', n + '.mp4');
}
console.log('done');
