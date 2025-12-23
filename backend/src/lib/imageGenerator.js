import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(__dirname, '../../storage');
const BASES_PATH = path.join(STORAGE_PATH, 'bases');
const FONTS_PATH = path.join(STORAGE_PATH, 'fonts');
const OUTPUT_PATH = path.join(STORAGE_PATH, 'results');

// Ensure output directory exists
await fs.mkdir(OUTPUT_PATH, { recursive: true });

/**
 * Calculate Easter date using Meeus/Jones/Butcher algorithm
 */
function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Get special layer for a given date (Ruleta)
 */
function getSpecialLayer(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Navidad (todo diciembre)
  if (month === 12) {
    return 'capa_navidad.png';
  }
  
  // Halloween (25-31 octubre)
  if (month === 10 && day >= 25) {
    return 'capa_halloween.png';
  }
  
  // Efemérides específicas
  if ((month === 1 && day === 1) || 
      (month === 7 && day === 5) || 
      (month === 12 && (day === 24 || day === 31))) {
    return 'capa_efemerides.png';
  }
  
  // Semana Santa (Domingo de Ramos hasta Domingo de Pascua)
  const easter = calculateEaster(date.getFullYear());
  const palmSunday = new Date(easter);
  palmSunday.setDate(easter.getDate() - 7);
  
  if (date >= palmSunday && date <= easter) {
    return 'capa_semanasanta.png';
  }
  
  // Carnaval (47 días antes de Pascua, duración 5 días)
  const carnivalEnd = new Date(easter);
  carnivalEnd.setDate(easter.getDate() - 47);
  const carnivalStart = new Date(carnivalEnd);
  carnivalStart.setDate(carnivalEnd.getDate() - 4);
  
  if (date >= carnivalStart && date <= carnivalEnd) {
    return 'capa_carnaval.png';
  }
  
  return null;
}

/**
 * Get background color for Ruleta number
 */
function getRouletteBackground(number) {
  const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const blackNumbers = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
  
  if (number === '0' || number === '00') {
    return 'fondo_verde.png';
  } else if (redNumbers.includes(parseInt(number))) {
    return 'fondo_rojo.png';
  } else if (blackNumbers.includes(parseInt(number))) {
    return 'fondo_negro.png';
  }
  
  return 'fondo_negro.png';
}

/**
 * Create SVG text buffer
 */
function createTextSVG(text, x, y, fontSize, fontFamily, fontPath, color = '#000000', bold = false) {
  const weight = bold ? 'bold' : 'normal';
  return Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face {
          font-family: '${fontFamily}';
          src: url('file://${fontPath}');
          font-weight: ${weight};
        }
      </style>
      <text x="${x}" y="${y}" 
        font-family="${fontFamily}" 
        font-size="${fontSize}px" 
        font-weight="${weight}"
        fill="${color}">
        ${text}
      </text>
    </svg>
  `);
}

/**
 * Generate Ruleta result image
 */
export async function generateRouletteImage(drawData) {
  const { result, scheduledAt, gameId } = drawData;
  const date = new Date(scheduledAt);
  
  const basePath = path.join(BASES_PATH, '1');
  const layers = [];
  
  // 1. Background (color)
  const background = getRouletteBackground(result);
  layers.push({
    input: path.join(basePath, background),
    top: 0,
    left: 0
  });
  
  // 2. Special layer (if applicable)
  const specialLayer = getSpecialLayer(date);
  if (specialLayer) {
    const specialPath = path.join(basePath, specialLayer);
    try {
      await fs.access(specialPath);
      layers.push({
        input: specialPath,
        top: 0,
        left: 0
      });
    } catch (err) {
      // Layer doesn't exist, skip
    }
  }
  
  // 3. Number image
  layers.push({
    input: path.join(basePath, `${result}.png`),
    top: 0,
    left: 0
  });
  
  // 4. Final layer
  layers.push({
    input: path.join(basePath, 'final.png'),
    top: 0,
    left: 0
  });
  
  // 5. Text overlays
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
  const hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours} ${ampm}`;
  
  const fontPath = path.join(FONTS_PATH, 'panda.otf');
  
  const dateText = createTextSVG(dateStr, 910, 110, 40, 'Panda', fontPath, '#000000');
  const timeText = createTextSVG(timeStr, 930, 235, 45, 'Panda', fontPath, '#000000');
  
  layers.push({ input: dateText, top: 0, left: 0 });
  layers.push({ input: timeText, top: 0, left: 0 });
  
  // Composite and save
  const outputFilename = `ruleta_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(hours).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);
  
  await sharp(layers[0].input)
    .composite(layers.slice(1))
    .toFile(outputPath);
  
  return {
    filename: outputFilename,
    path: outputPath
  };
}

/**
 * Generate Animalitos result image
 */
export async function generateAnimalitosImage(drawData) {
  const { result, scheduledAt, gameId } = drawData;
  const date = new Date(scheduledAt);
  
  const basePath = path.join(BASES_PATH, '2');
  const layers = [];
  
  // 1. Base image
  layers.push({
    input: path.join(basePath, 'base.png'),
    top: 0,
    left: 0
  });
  
  // 2. Animal image (with leading zero)
  const animalNumber = String(result).padStart(2, '0');
  layers.push({
    input: path.join(basePath, `${animalNumber}.png`),
    top: 0,
    left: 0
  });
  
  // 3. Text overlays
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
  const hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours} ${ampm}`;
  
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');
  
  const dateText = createTextSVG(dateStr, 93, 110, 40, 'Alphakind', fontPath, '#000000');
  const timeText = createTextSVG(timeStr, 155, 213, 40, 'Alphakind', fontPath, '#000000');
  
  layers.push({ input: dateText, top: 0, left: 0 });
  layers.push({ input: timeText, top: 0, left: 0 });
  
  // Composite and save
  const outputFilename = `animalitos_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(hours).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);
  
  await sharp(layers[0].input)
    .composite(layers.slice(1))
    .toFile(outputPath);
  
  return {
    filename: outputFilename,
    path: outputPath
  };
}

/**
 * Generate Triple result image
 */
export async function generateTripleImage(drawData) {
  const { result, scheduledAt, gameId } = drawData;
  const date = new Date(scheduledAt);
  
  const basePath = path.join(BASES_PATH, '3');
  const numerosPath = path.join(basePath, 'numeros');
  const fechasPath = path.join(basePath, 'fechas');
  
  const layers = [];
  const resultStr = String(result).padStart(3, '0');
  
  // Determine background
  const isSpecial = resultStr.endsWith('00') && resultStr !== '000';
  const background = isSpecial ? 'fondo1.png' : 'fondo.png';
  
  layers.push({
    input: path.join(numerosPath, background),
    top: 0,
    left: 0
  });
  
  // Add number images
  if (isSpecial) {
    // Special case: X00 - single digit image
    const firstDigit = resultStr[0];
    layers.push({
      input: path.join(numerosPath, `${firstDigit}.png`),
      top: 0,
      left: 0
    });
  } else {
    // Normal case: three separate digits
    const d1 = resultStr[0];
    const d2 = resultStr[1];
    const d3 = resultStr[2];
    
    layers.push({
      input: path.join(numerosPath, `${d1}.A.png`),
      top: 0,
      left: 0
    });
    layers.push({
      input: path.join(numerosPath, `${d2}.B.png`),
      top: 0,
      left: 0
    });
    layers.push({
      input: path.join(numerosPath, `${d3}.C.png`),
      top: 0,
      left: 0
    });
  }
  
  // Add date images
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const month = monthNames[date.getMonth()];
  
  layers.push({
    input: path.join(fechasPath, `${day}.png`),
    top: 0,
    left: 0
  });
  layers.push({
    input: path.join(fechasPath, `${month}.png`),
    top: 0,
    left: 0
  });
  
  // Add time images
  const hours = date.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  
  // Check for special hour images (10_1, 11_1, 12_1)
  let hourImage = `${displayHours}.png`;
  if (displayHours >= 10) {
    const specialHourPath = path.join(fechasPath, `${displayHours}_1.png`);
    try {
      await fs.access(specialHourPath);
      hourImage = `${displayHours}_1.png`;
    } catch (err) {
      // Use regular hour image
    }
  }
  
  layers.push({
    input: path.join(fechasPath, hourImage),
    top: 0,
    left: 0
  });
  layers.push({
    input: path.join(fechasPath, `${ampm}.png`),
    top: 0,
    left: 0
  });
  
  // Composite and save
  const outputFilename = `triple_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(hours).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);
  
  await sharp(layers[0].input)
    .composite(layers.slice(1))
    .toFile(outputPath);
  
  return {
    filename: outputFilename,
    path: outputPath
  };
}

/**
 * Generate Pyramid image for Animalitos (LOTTOPANTERA)
 */
export async function generatePyramidImage(date) {
  const basePath = path.join(BASES_PATH, '2/piramide');
  const layers = [];
  
  // Get day of week (1=Monday, 7=Sunday)
  const dayOfWeek = date.getDay() || 7;
  
  // Base pyramid image for the day
  layers.push({
    input: path.join(BASES_PATH, '2', `piramide${dayOfWeek}.png`),
    top: 0,
    left: 0
  });
  
  // Calculate pyramid from date (DDMMYYYY)
  const dateStr = `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${date.getFullYear()}`;
  const pyramid = calculatePyramid(dateStr);
  
  // Add pyramid numbers as text
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');
  const pyramidSVG = createPyramidSVG(pyramid, fontPath);
  layers.push({ input: pyramidSVG, top: 0, left: 0 });
  
  // Find most repeated numbers and add mini animals
  const mostRepeated = findMostRepeated(pyramid);
  for (let i = 0; i < Math.min(4, mostRepeated.length); i++) {
    const positions = [
      { x: -25, y: 400 },
      { x: 790, y: 400 },
      { x: 50, y: 710 },
      { x: 700, y: 680 }
    ];
    
    const animalNum = String(mostRepeated[i]).padStart(2, '0');
    const miniPath = path.join(BASES_PATH, '2/min', `${animalNum}.png`);
    
    try {
      await fs.access(miniPath);
      // Resize mini image to 300x300
      const resizedMini = await sharp(miniPath)
        .resize(300, 300)
        .toBuffer();
      
      layers.push({
        input: resizedMini,
        top: positions[i].y,
        left: positions[i].x
      });
    } catch (err) {
      // Mini image doesn't exist, skip
    }
  }
  
  // Add date text
  const dateText = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
  const dateTextSVG = createTextSVG(dateText, 615, 105, 40, 'Alphakind', fontPath, '#000000', true);
  layers.push({ input: dateTextSVG, top: 0, left: 0 });
  
  // Composite and save
  const outputFilename = `animalitos_pyramid_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);
  
  await sharp(layers[0].input)
    .composite(layers.slice(1))
    .toFile(outputPath);
  
  return {
    filename: outputFilename,
    path: outputPath
  };
}

/**
 * Calculate pyramid from date string
 */
function calculatePyramid(dateStr) {
  const rows = [dateStr.split('').map(Number)];
  
  while (rows[rows.length - 1].length > 1) {
    const lastRow = rows[rows.length - 1];
    const newRow = [];
    
    for (let i = 0; i < lastRow.length - 1; i++) {
      newRow.push((lastRow[i] + lastRow[i + 1]) % 10);
    }
    
    rows.push(newRow);
  }
  
  return rows;
}

/**
 * Find most repeated numbers in pyramid
 */
function findMostRepeated(pyramid) {
  const counts = {};
  
  pyramid.forEach(row => {
    row.forEach(num => {
      counts[num] = (counts[num] || 0) + 1;
    });
  });
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([num]) => parseInt(num))
    .slice(0, 4);
}

/**
 * Create SVG for pyramid numbers
 */
function createPyramidSVG(pyramid, fontPath) {
  const startY = 275;
  const endY = 970;
  const startX = 210;
  const endX = 870;
  
  const rowHeight = (endY - startY) / (pyramid.length - 1);
  
  let svgContent = `<svg width="1080" height="1080">
    <style>
      @font-face {
        font-family: 'Alphakind';
        src: url('file://${fontPath}');
        font-weight: bold;
      }
    </style>`;
  
  pyramid.forEach((row, rowIndex) => {
    const y = startY + (rowIndex * rowHeight);
    const totalWidth = endX - startX;
    const spacing = row.length > 1 ? totalWidth / (row.length - 1) : 0;
    
    row.forEach((num, colIndex) => {
      const x = row.length === 1 ? (startX + endX) / 2 : startX + (colIndex * spacing);
      svgContent += `
        <text x="${x}" y="${y}" 
          font-family="Alphakind" 
          font-size="45px" 
          font-weight="bold"
          fill="#000000"
          text-anchor="middle">
          ${num}
        </text>`;
    });
  });
  
  svgContent += '</svg>';
  return Buffer.from(svgContent);
}

/**
 * Generate Recommendations image for Triple Pantera
 */
export async function generateRecommendationsImage(gameId, date) {
  const basePath = path.join(BASES_PATH, '3/recomendaciones');
  const layers = [];
  
  // Base image
  layers.push({
    input: path.join(basePath, 'base.png'),
    top: 0,
    left: 0
  });
  
  // Generate recommended numbers (simplified algorithm)
  const recommendations = await generateRecommendedNumbers(gameId, date);
  
  // Add permuta (center) with images
  const permuta = recommendations.permuta;
  layers.push({
    input: path.join(basePath, `${permuta[0]}.A.png`),
    top: 0,
    left: 0
  });
  layers.push({
    input: path.join(basePath, `${permuta[1]}.B.png`),
    top: 0,
    left: 0
  });
  layers.push({
    input: path.join(basePath, `${permuta[2]}.C.png`),
    top: 0,
    left: 0
  });
  
  // Add date text
  const fontPath = path.join(FONTS_PATH, 'Alphakind.ttf');
  const dateText = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
  const dateTextSVG = createTextSVG(dateText, 540, 250, 50, 'Alphakind', fontPath, '#FFFFFF', true);
  layers.push({ input: dateTextSVG, top: 0, left: 0 });
  
  // Add favoritos (black text)
  const favoritosSVG = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face {
          font-family: 'Alphakind';
          src: url('file://${fontPath}');
          font-weight: bold;
        }
      </style>
      <text x="140" y="785" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#000000">${recommendations.favorito1}</text>
      <text x="375" y="785" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#000000">${recommendations.favorito2}</text>
    </svg>
  `);
  layers.push({ input: favoritosSVG, top: 0, left: 0 });
  
  // Add explosivos (red text)
  const explosivosSVG = Buffer.from(`
    <svg width="1080" height="1080">
      <style>
        @font-face {
          font-family: 'Alphakind';
          src: url('file://${fontPath}');
          font-weight: bold;
        }
      </style>
      <text x="650" y="915" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#FF0000">${recommendations.explosivo1}</text>
      <text x="910" y="915" font-family="Alphakind" font-size="65px" font-weight="bold" fill="#FF0000">${recommendations.explosivo2}</text>
    </svg>
  `);
  layers.push({ input: explosivosSVG, top: 0, left: 0 });
  
  // Composite and save
  const outputFilename = `triple_recommendations_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.png`;
  const outputPath = path.join(OUTPUT_PATH, outputFilename);
  
  await sharp(layers[0].input)
    .composite(layers.slice(1))
    .toFile(outputPath);
  
  return {
    filename: outputFilename,
    path: outputPath
  };
}

/**
 * Generate recommended numbers (simplified algorithm)
 */
async function generateRecommendedNumbers(gameId, date) {
  // Simplified: generate random recommendations
  // In production, this should analyze last 50 draws
  const random3Digit = () => String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  
  return {
    permuta: random3Digit().split(''),
    favorito1: random3Digit(),
    favorito2: random3Digit(),
    explosivo1: random3Digit(),
    explosivo2: random3Digit()
  };
}

/**
 * Main function to generate image based on game type
 */
export async function generateResultImage(drawData) {
  const { gameId } = drawData;
  
  // gameId: 1 = LOTOANIMALITO (Ruleta/Animalitos), 2 = LOTTOPANTERA, 3 = TRIPLE PANTERA
  switch (gameId) {
    case 1:
      return await generateRouletteImage(drawData); // LOTOANIMALITO uses Ruleta style
    case 2:
      return await generateAnimalitosImage(drawData); // LOTTOPANTERA
    case 3:
      return await generateTripleImage(drawData); // TRIPLE PANTERA
    default:
      throw new Error(`Unknown game type: ${gameId}`);
  }
}

export { OUTPUT_PATH };
