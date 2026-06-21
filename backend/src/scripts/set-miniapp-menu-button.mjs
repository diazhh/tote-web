// backend/src/scripts/set-miniapp-menu-button.mjs
// Uso: node src/scripts/set-miniapp-menu-button.mjs
// Configura el botón de menú web_app del/los bot(s) admin activos hacia la Mini App.
// IMPORTANTE: Ejecutar una sola vez por bot, apuntando a la URL pública de producción.
// DEFERRED MANUAL STEP — no ejecutar en CI ni en local sin verificar la URL destino.
import { prisma } from '../lib/prisma.js';

const URL = process.env.MINIAPP_URL || 'https://tote.atilax.io/tg';

const bots = await prisma.adminTelegramBot.findMany({ where: { isActive: true }, select: { botToken: true, name: true } });
for (const b of bots) {
  const res = await fetch(`https://api.telegram.org/bot${b.botToken}/setChatMenuButton`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_button: { type: 'web_app', text: '📊 Monitor', web_app: { url: URL } } }),
  });
  console.log(b.name, await res.json());
}
await prisma.$disconnect();
