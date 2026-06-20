/**
 * Tabla estática de "caídas" de animalitos (folklore curado).
 * Fuente = aristas no dirigidas con un criterio (reason); se simetrizan al
 * construir los mapas → reciprocidad garantizada por construcción.
 * Ver docs/superpowers/specs/2026-06-20-caidas-animalitos-design.md
 */

const NAMES = {
  '0':'DELFÍN','00':'BALLENA','01':'CARNERO','02':'TORO','03':'CIEMPIES','04':'ALACRÁN',
  '05':'LEÓN','06':'RANA','07':'PERICO','08':'RATÓN','09':'ÁGUILA','10':'TIGRE',
  '11':'GATO','12':'CABALLO','13':'MONO','14':'PALOMA','15':'ZORRO','16':'OSO',
  '17':'PAVO','18':'BURRO','19':'CHIVO','20':'COCHINO','21':'GALLO','22':'CAMELLO',
  '23':'CEBRA','24':'IGUANA','25':'GALLINA','26':'VACA','27':'PERRO','28':'ZAMURO',
  '29':'ELEFANTE','30':'CAIMÁN','31':'LAPA','32':'ARDILLA','33':'PESCADO','34':'VENADO',
  '35':'JIRAFA','36':'CULEBRA','37':'CHIGÜIRE','38':'TURPIAL','39':'ARAÑA','40':'PANTERA',
  '41':'CONEJO','42':'GUACAMAYA','43':'TORTUGA','44':'BÚHO','45':'PATO','46':'TIBURÓN',
  '47':'CANGREJO','48':'TUCÁN',
};

const ORDER = Object.keys(NAMES);

// Aristas base (válidas para pantera; animalito = base filtrada a 0-36)
const EDGES = [
  // espejo numérico
  ['01','10','espejo'],['02','20','espejo'],['03','30','espejo'],['04','40','espejo'],
  ['12','21','espejo'],['13','31','espejo'],['14','41','espejo'],['23','32','espejo'],
  ['24','42','espejo'],['34','43','espejo'],
  // acuáticos
  ['0','00','familia:acuáticos'],['0','33','familia:acuáticos'],['0','46','familia:acuáticos'],
  ['0','43','familia:acuáticos'],['0','47','familia:acuáticos'],
  ['00','33','familia:acuáticos'],['00','46','familia:acuáticos'],['00','47','familia:acuáticos'],
  ['33','46','familia:acuáticos'],['33','47','familia:acuáticos'],['33','06','familia:acuáticos'],['33','45','familia:acuáticos'],
  ['46','47','familia:acuáticos'],['46','30','afinidad:agua'],
  ['47','43','familia:acuáticos'],
  ['43','24','familia:reptiles'],['43','30','afinidad:agua'],
  ['06','36','depredador'],['06','24','afinidad:agua'],['06','30','afinidad:agua'],['06','45','afinidad:agua'],
  ['45','25','familia:aves'],['45','21','familia:aves'],['45','48','familia:aves'],
  // aves
  ['09','07','familia:aves'],['09','42','familia:aves'],['09','44','familia:aves'],['09','48','familia:aves'],['09','14','familia:aves'],['09','28','familia:aves'],
  ['07','42','familia:aves'],['07','48','familia:aves'],['07','21','familia:aves'],['07','17','familia:aves'],['07','38','familia:aves'],
  ['14','25','familia:aves'],['14','38','familia:aves'],['14','11','depredador'],['14','28','familia:aves'],
  ['21','25','familia:aves'],['21','15','depredador'],
  ['25','17','familia:aves'],['25','15','depredador'],['25','27','depredador'],
  ['17','42','familia:aves'],['17','48','familia:aves'],['17','28','familia:aves'],
  ['28','44','familia:aves'],['28','38','familia:aves'],
  ['38','42','familia:aves'],['38','48','familia:aves'],
  ['42','48','familia:aves'],
  ['44','08','depredador'],['44','39','depredador'],['44','48','familia:aves'],
  // felinos
  ['05','10','familia:felinos'],['05','11','familia:felinos'],['05','40','familia:felinos'],['05','34','depredador'],['05','23','depredador'],
  ['10','11','familia:felinos'],['10','40','familia:felinos'],['10','23','depredador'],['10','34','depredador'],
  ['11','27','recíproco'],['11','08','depredador'],
  ['40','34','depredador'],
  // roedores / pequeños
  ['08','36','depredador'],['08','32','familia:roedores'],['08','37','familia:roedores'],['08','41','familia:roedores'],
  ['32','37','familia:roedores'],['32','39','afinidad'],['32','41','familia:roedores'],
  ['31','37','familia:roedores'],['31','41','familia:roedores'],['31','16','afinidad'],['31','34','afinidad'],
  ['37','41','familia:roedores'],['37','30','afinidad:agua'],
  ['41','27','depredador'],['41','15','depredador'],
  // bichos / artrópodos
  ['03','04','familia:bichos'],['03','39','familia:bichos'],['03','36','afinidad:rastreros'],['03','24','afinidad:rastreros'],
  ['04','39','familia:bichos'],['04','36','afinidad:rastreros'],['04','24','afinidad:rastreros'],
  ['39','36','afinidad:rastreros'],
  // reptiles
  ['36','24','familia:reptiles'],['36','30','familia:reptiles'],
  ['24','30','familia:reptiles'],
  // ganado / corral
  ['02','26','familia:ganado'],['02','12','familia:ganado'],['02','18','familia:ganado'],['02','01','familia:ganado'],
  ['26','12','familia:ganado'],['26','18','familia:ganado'],['26','19','familia:ganado'],['26','01','familia:ganado'],
  ['12','18','familia:ganado'],['12','23','familia:ganado'],
  ['18','22','familia:ganado'],['18','01','familia:ganado'],
  ['01','19','familia:ganado'],
  ['19','22','afinidad'],['19','16','afinidad'],['19','34','afinidad'],
  ['20','22','familia:ganado'],['20','37','afinidad'],['20','26','familia:ganado'],['20','01','familia:ganado'],
  ['22','29','familia:safari'],['22','35','familia:safari'],['22','23','familia:safari'],
  ['27','15','familia:cánidos'],['27','25','depredador'],['27','08','depredador'],
  // salvajes / monte
  ['16','33','depredador'],['16','13','familia:monte'],['16','29','familia:monte'],
  ['13','32','afinidad'],['13','35','familia:monte'],['13','29','familia:monte'],
  ['29','35','familia:safari'],['29','23','familia:safari'],
  ['35','23','familia:safari'],['35','34','familia:safari'],
  // balance de grado
  ['15','45','depredador'],['40','11','familia:felinos'],['00','43','familia:acuáticos'],
];

// Suplementos SOLO-animalito (dentro de 0-36) para rellenar nodos que perdían
// caídas al quitar los animales 37-48 de pantera.
const ANIMALITO_EXTRA = [
  ['0','30','afinidad:agua'],['0','06','afinidad:agua'],['0','24','afinidad:agua'],
  ['00','30','afinidad:agua'],['00','06','afinidad:agua'],
  ['15','17','depredador'],['15','08','depredador'],
  ['17','21','familia:aves'],
  ['28','25','familia:aves'],['28','21','familia:aves'],
  ['31','32','familia:roedores'],['31','08','familia:roedores'],
  ['32','16','afinidad'],
  ['04','30','afinidad:rastreros'],
  ['07','14','familia:aves'],
  ['09','25','depredador'],['09','21','familia:aves'],
];

function buildMap(edges) {
  const m = new Map();
  const add = (a, b, r) => {
    if (!m.has(a)) m.set(a, []);
    if (!m.get(a).some((x) => x.number === b)) {
      m.get(a).push({ number: b, name: NAMES[b], reason: r });
    }
  };
  for (const [a, b, r] of edges) { add(a, b, r); add(b, a, r); }
  for (const list of m.values()) {
    list.sort((x, y) => ORDER.indexOf(x.number) - ORDER.indexOf(y.number));
  }
  return m;
}

const isAnimalito = (n) => n === '0' || n === '00' || (parseInt(n, 10) >= 1 && parseInt(n, 10) <= 36);

export const CAIDAS = {
  lottopantera: buildMap(EDGES),
  lotoanimalito: buildMap([
    ...EDGES.filter(([a, b]) => isAnimalito(a) && isAnimalito(b)),
    ...ANIMALITO_EXTRA,
  ]),
};

export function hasCaidas(gameSlug) {
  return Object.prototype.hasOwnProperty.call(CAIDAS, gameSlug);
}

export function getCaidas(gameSlug, number) {
  const map = CAIDAS[gameSlug];
  if (!map) return [];
  return map.get(number) || [];
}

export default { CAIDAS, hasCaidas, getCaidas };
