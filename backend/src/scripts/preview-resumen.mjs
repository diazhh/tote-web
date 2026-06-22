import fs from 'fs/promises';
import path from 'path';
import { renderResultsBoard } from '../lib/marketing/renderer.js';

const OUT = path.join(process.cwd(), 'storage/results');
await fs.mkdir(OUT, { recursive: true });

const animalSlots = {};
for (let h = 8; h <= 19; h++) animalSlots[h] = { number: String((h * 3) % 37).padStart(2, '0'), name: ['PANDA','LEON','TIGRE','MONO','RANA','GATO'][h % 6] };
const numberSlots = {};
for (let h = 8; h <= 19; h++) numberSlots[h] = { number: String((h * 41) % 1000).padStart(3, '0') };

const jobs = [
  { slug: 'lotoanimalito', slots: animalSlots, file: 'preview_lotoanimalito.png' },
  { slug: 'lottopantera', slots: animalSlots, file: 'preview_lottopantera.png' },
  { slug: 'triple-pantera', slots: numberSlots, file: 'preview_triple.png' },
];

for (const j of jobs) {
  const buf = await renderResultsBoard({ slug: j.slug, title: 'RESULTADOS DEL DÍA', dateText: '21/06/26', slots: j.slots });
  await fs.writeFile(path.join(OUT, j.file), buf);
  console.log('wrote', j.file);
}
