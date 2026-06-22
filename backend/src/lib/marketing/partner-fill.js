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

// Chip oscuro para logos claros/blancos que se perderían sobre el chip blanco.
const DARK_CHIP_STYLE = 'background:linear-gradient(180deg,#2b2b2b,#141414);';

function buildFill(templatePath, familyKey, partners) {
  const fam = getFamily(familyKey);
  const texts = [['.board__handle', fam.handle]];
  const attrs = [['#board', 'style', paletteVars(fam.palette)]];
  partners.forEach((p, i) => {
    const n = i + 1;
    attrs.push([`[data-logo="${n}"] .logo__img`, 'src', 'file://' + p.logoPath]);
    texts.push([`[data-logo="${n}"] .logo__name`, p.name]);
    texts.push([`[data-logo="${n}"] .logo__url`, prettyUrl(p.url)]);
    if (p.darkChip) attrs.push([`[data-logo="${n}"] .logo__chip`, 'style', DARK_CHIP_STYLE]);
  });
  return { templatePath, fill: { texts, attrs } };
}

export function buildDondeJugarStoryFill(familyKey, partners) {
  return buildFill(STORY_TEMPLATE, familyKey, partners);
}

export function buildDondeJugarDirectorioFill(familyKey, partners) {
  return buildFill(DIRECTORIO_TEMPLATE, familyKey, partners);
}
