/**
 * Onboarding del proveedor WinBigVzla (PUSH webhook + portal user).
 *
 * Idempotente: si el ApiSystem o el portal user ya existen, no los duplica
 * (reporta el estado actual). El token y la contraseña se pasan por env para
 * que coincidan con la documentación entregada al proveedor:
 *
 *   WBV_WEBHOOK_TOKEN=<64 hex>  WBV_PORTAL_PASSWORD=<pw>  node onboard-winbigvzla.mjs
 *
 * Ejecutar en el VPS desde /var/proyectos/tote-web/backend.
 */
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';

const SLUG = 'winbigvzla';
const NAME = 'WinBigVzla';
const DESCRIPTION = 'Proveedor PUSH — webhook con aceptación parcial (split/diferencial)';
const USERNAME = process.env.WBV_PORTAL_USERNAME || 'winbigvzla';
const TOKEN = process.env.WBV_WEBHOOK_TOKEN;
const PASSWORD = process.env.WBV_PORTAL_PASSWORD;

if (!TOKEN || !/^[a-f0-9]{64}$/.test(TOKEN)) {
  console.error('ERROR: WBV_WEBHOOK_TOKEN debe ser 64 chars hex.');
  process.exit(1);
}
if (!PASSWORD || PASSWORD.length < 10) {
  console.error('ERROR: WBV_PORTAL_PASSWORD debe tener al menos 10 caracteres.');
  process.exit(1);
}

async function main() {
  // ── 1. ApiSystem ──
  let system = await prisma.apiSystem.findUnique({ where: { slug: SLUG } });
  if (system) {
    console.log(`[=] ApiSystem ya existe: ${system.name} (${system.id}) mode=${system.mode}`);
    // No pisamos el token existente; solo aseguramos PUSH + activo.
    if (system.mode !== 'PUSH' || !system.isActive) {
      system = await prisma.apiSystem.update({
        where: { id: system.id },
        data: { mode: 'PUSH', isActive: true },
      });
      console.log('[~] ApiSystem actualizado a mode=PUSH, isActive=true');
    }
    if (!system.webhookToken) {
      system = await prisma.apiSystem.update({
        where: { id: system.id },
        data: { webhookToken: TOKEN },
      });
      console.log('[~] webhookToken asignado (estaba vacío).');
    }
  } else {
    system = await prisma.apiSystem.create({
      data: {
        name: NAME,
        description: DESCRIPTION,
        slug: SLUG,
        mode: 'PUSH',
        isActive: true,
        webhookToken: TOKEN,
      },
    });
    console.log(`[+] ApiSystem creado: ${system.name} (${system.id})`);
  }

  // ── 2. Portal user (role PROVIDER) ──
  const existingPortal = await prisma.user.findFirst({
    where: { apiSystemId: system.id, role: 'PROVIDER' },
  });
  if (existingPortal) {
    console.log(`[=] Portal user ya existe: ${existingPortal.username} (${existingPortal.id})`);
  } else {
    const usernameTaken = await prisma.user.findUnique({ where: { username: USERNAME } });
    if (usernameTaken) {
      console.error(`ERROR: el username "${USERNAME}" ya está tomado por otro usuario.`);
      process.exit(1);
    }
    const hashed = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        username: USERNAME,
        email: `portal-${SLUG}@internal.tote`,
        password: hashed,
        role: 'PROVIDER',
        apiSystemId: system.id,
        isActive: true,
      },
      select: { id: true, username: true, role: true, apiSystemId: true },
    });
    console.log(`[+] Portal user creado: ${user.username} (${user.id})`);
  }

  // ── 3. Resumen ──
  const tokenMatches = system.webhookToken === TOKEN;
  console.log('\n──────── RESUMEN ────────');
  console.log(`slug:            ${system.slug}`);
  console.log(`apiSystemId:     ${system.id}`);
  console.log(`mode:            ${system.mode}`);
  console.log(`isActive:        ${system.isActive}`);
  console.log(`endpoint:        https://toteback.atilax.io/api/webhooks/${system.slug}`);
  console.log(`webhookToken:    ${system.webhookToken}`);
  console.log(`token == arg:    ${tokenMatches ? 'sí' : 'NO (existía otro token, úsalo en la doc)'}`);
  console.log(`portal username: ${USERNAME}`);
  console.log('─────────────────────────');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
