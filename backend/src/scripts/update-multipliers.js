// backend/src/scripts/update-multipliers.js
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function updateGame(slug, getMultiplier) {
  const game = await prisma.game.findUnique({
    where: { slug },
    include: { items: true },
  });
  if (!game) {
    console.log(`  ⚠️  Not found: ${slug}`);
    return 0;
  }

  const changes = game.items
    .map(item => {
      const next = getMultiplier(item.number);
      return parseFloat(item.multiplier) !== next
        ? { id: item.id, number: item.number, from: item.multiplier, to: next }
        : null;
    })
    .filter(Boolean);

  console.log(`\n${game.name}: ${changes.length} items`);
  changes.slice(0, 5).forEach(c => console.log(`  [${c.number}] ${c.from} → ${c.to}`));
  if (changes.length > 5) console.log(`  ... and ${changes.length - 5} more`);

  if (!DRY_RUN) {
    for (const c of changes) {
      await prisma.gameItem.update({ where: { id: c.id }, data: { multiplier: c.to } });
    }
  }
  return changes.length;
}

async function main() {
  console.log(DRY_RUN ? '\n🔍 DRY RUN\n' : '\n🔧 Updating multipliers\n');

  let total = 0;
  total += await updateGame('lotoanimalito',    n => n === '16' ? 50 : 30);
  total += await updateGame('lottopantera',     n => n === '40' ? 100 : 37);
  // Triple Pantera: x1000 para números que terminan en 00 (100, 200, …, 900).
  // El 000 NO aplica la regla — usa el multiplicador base 600.
  total += await updateGame('triple-pantera',   n => (n !== '000' && parseInt(n, 10) % 100 === 0) ? 1000 : 600);
  total += await updateGame('terminal-pantera', () => 70);

  const triple = await prisma.game.findUnique({
    where: { slug: 'triple-pantera' },
    select: { config: true },
  });
  const currentConfig = triple?.config || {};
  const nextConfig = { ...currentConfig, aproximacion: { enabled: true, multiplier: 5 } };

  if (!DRY_RUN) {
    await prisma.game.update({
      where: { slug: 'triple-pantera' },
      data: { config: nextConfig },
    });
    console.log('\n✅ Triple Pantera config.aproximacion → { enabled: true, multiplier: 5 }');
    console.log(`   (preserved existing keys: ${Object.keys(currentConfig).filter(k => k !== 'aproximacion').join(', ') || 'none'})`);
  } else {
    console.log('\n🔍 Would merge aproximacion into existing Game.config:');
    console.log(`   existing keys: ${Object.keys(currentConfig).join(', ') || 'none'}`);
    console.log(`   resulting config: ${JSON.stringify(nextConfig)}`);
  }

  console.log(`\nTotal items changed: ${total}`);
  if (DRY_RUN) console.log('Run without --dry-run to apply.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
