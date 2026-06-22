import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE = path.join(__dirname, '../../../storage');

function pad2(n) { return String(n) === '0' ? '0' : String(n).padStart(2, '0'); }

export const GAMES = {
  lotoanimalito: {
    slug: 'lotoanimalito',
    displayName: 'LOTOANIMALITO',
    dir: 1,
    cellMode: 'animal',
    logo: path.join(STORAGE, 'LOGO LOTTOANIMALITO.png'),
    marketingDir: path.join(STORAGE, 'bases/1/marketing'),
    dailyTemplate: path.join(STORAGE, 'bases/1/marketing/lotoanimalito.html'),
    pizarraTemplate: path.join(STORAGE, 'bases/1/marketing/pizarra-lotoanimalito.html'),
    dailyStoryTemplate: path.join(STORAGE, 'bases/1/marketing/lotoanimalito-story.html'),
    pizarraStoryTemplate: path.join(STORAGE, 'bases/1/marketing/pizarra-lotoanimalito-story.html'),
    palette: { bg1: '#0B6B3A', bg2: '#0A4F2C', card: 'rgba(8,40,24,0.55)', border: '#F5C542', number: '#FFF7E6', name: '#FFE9B0', hour: '#FFFFFF' },
    fonts: { display: 'panda.otf', label: 'Roboto-Bold.ttf' },
    assetFor: (number) => path.join(STORAGE, `bases/1/${pad2(number)}.png`),
  },
  lottopantera: {
    slug: 'lottopantera',
    displayName: 'LOTTOPANTERA',
    dir: 2,
    cellMode: 'animal',
    logo: path.join(STORAGE, 'LOGO LOTTOPANTERA.png'),
    marketingDir: path.join(STORAGE, 'bases/2/marketing'),
    dailyTemplate: path.join(STORAGE, 'bases/2/marketing/lottopantera.html'),
    pizarraTemplate: path.join(STORAGE, 'bases/2/marketing/pizarra-lottopantera.html'),
    dailyStoryTemplate: path.join(STORAGE, 'bases/2/marketing/lottopantera-story.html'),
    pizarraStoryTemplate: path.join(STORAGE, 'bases/2/marketing/pizarra-lottopantera-story.html'),
    palette: { bg1: '#3B0A0E', bg2: '#180405', card: 'rgba(20,5,7,0.6)', border: '#D4AF37', number: '#F5D67A', name: '#E8C97A', hour: '#FFFFFF' },
    fonts: { display: 'Alphakind.ttf', label: 'Roboto-Bold.ttf' },
    assetFor: (number) => path.join(STORAGE, `bases/2/${pad2(number)}.png`),
  },
  'triple-pantera': {
    slug: 'triple-pantera',
    displayName: 'TRIPLE PANTERA',
    dir: 3,
    cellMode: 'number',
    logo: path.join(STORAGE, 'LOGO TRIPLE PANTERA.png'),
    marketingDir: path.join(STORAGE, 'bases/3/marketing'),
    dailyTemplate: path.join(STORAGE, 'bases/3/marketing/triple.html'),
    pizarraTemplate: path.join(STORAGE, 'bases/3/marketing/pizarra-triple.html'),
    dailyStoryTemplate: path.join(STORAGE, 'bases/3/marketing/triple-story.html'),
    pizarraStoryTemplate: path.join(STORAGE, 'bases/3/marketing/pizarra-triple-story.html'),
    palette: { bg1: '#161616', bg2: '#000000', card: 'rgba(0,0,0,0.55)', border: '#D4AF37', number: '#F5C542', name: '#F5C542', hour: '#CFCFCF' },
    fonts: { display: 'Alphakind.ttf', label: 'Roboto-Bold.ttf' },
    assetFor: () => null,
  },
};

export function getGameConfig(slug) {
  const cfg = GAMES[slug];
  if (!cfg) throw new Error(`Unknown game slug for marketing renderer: ${slug}`);
  return cfg;
}
