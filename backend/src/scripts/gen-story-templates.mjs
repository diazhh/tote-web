// Derives the 9:16 story templates (1080×1920) from the approved 4:5 feed
// templates. Single source of truth = the feed template (colors live there);
// the story is a mechanical portrait transform. Re-run after any recolor.
// Run from backend/: node src/scripts/gen-story-templates.mjs
import fs from 'fs/promises';
import path from 'path';

const MK = path.join(process.cwd(), 'storage/bases');
const files = [
  ['1/marketing/lotoanimalito.html',        '1/marketing/lotoanimalito-story.html',        'daily'],
  ['2/marketing/lottopantera.html',         '2/marketing/lottopantera-story.html',         'daily'],
  ['3/marketing/triple.html',               '3/marketing/triple-story.html',               'daily'],
  ['1/marketing/pizarra-lotoanimalito.html','1/marketing/pizarra-lotoanimalito-story.html','pizarra'],
  ['2/marketing/pizarra-lottopantera.html', '2/marketing/pizarra-lottopantera-story.html', 'pizarra'],
  ['3/marketing/pizarra-triple.html',       '3/marketing/pizarra-triple-story.html',       'pizarra'],
];

function toStory(html, kind) {
  let out = html
    // 4:5 → 9:16 canvas
    .replace(/height:1350px/g, 'height:1920px')
    // wider side margins + generous top/bottom IG safe zones
    .replace(/padding:46px 42px 30px/g, 'padding:150px 56px 140px')
    .replace(/padding:44px 40px 28px/g, 'padding:150px 52px 140px');

  if (kind === 'daily') {
    // give the grid breathing room and let the extra vertical space enlarge cells
    out = out
      .replace(/(\.board__header\{[^}]*?)margin-bottom:24px;/g, '$1margin-bottom:40px;')
      .replace(/(\.board__header\{[^}]*?)margin-bottom:22px;/g, '$1margin-bottom:40px;')
      .replace(/(\.board__grid\{[^}]*?)gap:18px;/g, '$1gap:26px;')
      .replace(/(\.board__footer\{[^}]*?)margin-top:14px;/g, '$1margin-top:30px;');
  } else {
    out = out
      .replace(/(\.board__header\{[^}]*?)margin-bottom:22px;/g, '$1margin-bottom:40px;')
      .replace(/(\.matrix\{[^}]*?)gap:7px;/g, '$1gap:11px;')
      .replace(/(\.board__footer\{[^}]*?)margin-top:14px;/g, '$1margin-top:30px;');
  }
  return out;
}

for (const [src, dst, kind] of files) {
  const html = await fs.readFile(path.join(MK, src), 'utf8');
  await fs.writeFile(path.join(MK, dst), toStory(html, kind));
  console.log('wrote', dst);
}
console.log('done');
