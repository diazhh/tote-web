# Migración tote-web: VPS 144 → VPS 94

**Fecha:** 2026-04-24
**Estado:** Plan aprobado, ejecución en curso
**Constraints del usuario:**
- Próximo sorteo: mañana 8:00 AM (Caracas) — hard deadline
- Branch a deployar: `main` (mergear `diazhh` → `main` primero)
- 144 NO se borra. Sigue corriendo como rollback.
- Backup de DB en 144 ANTES de cualquier cosa.
- Verificar que se generan imágenes pero **NO publicar a redes sociales** durante testing.
- Dominios críticos para providers PUSH (no se pueden romper).

## Inventario

### Origen — VPS 144 (`144.126.150.120`)
- Postgres NATIVO en localhost:5433 — `postgresql.service`
- Node 20.19.6, npm 10.8.2
- HAProxy 2.8.15 (multi-tenant: tote, atilax, erp, dentista, etc.)
- pm2: `tote-backend` (id 6, 1.1 GB), `tote-frontend` (id 14, 151 MB)
- Branch actual: `diazhh` @ `e4c2b93` (atrás de los 11 commits del cupo)
- DB `tote_db`: **421 MB**
- `backend/storage/`: **4.4 GB**
- HAProxy ACLs (verificado en /etc/haproxy/haproxy.cfg):
  - `tote.atilax.io` → backend `frontend_app` → `127.0.0.1:4006` (Next.js)
  - `toteback.atilax.io` → backend `backend_api` → `127.0.0.1:3001` (Express)
  - `webhook.atilax.io` → backend `webhook_server` → `127.0.0.1:9000` — **es del proyecto ERP (process `erp-webhook`), NO de tote. NO migrar.**
- Providers PUSH usan `https://toteback.atilax.io/api/webhooks/{slug}` (ruteo por host, todos los paths van al backend)
- Cert: `/etc/haproxy/tote.atilax.io.pem` (multi-cert PEM combinada)

### Destino — VPS 94 (`94.72.116.98`)
- Ubuntu 24.04.4 LTS fresca: 23 GB RAM, 8 CPU, 193 GB disk
- Solo `git` instalado

### Cloudflare
- Zone `atilax.io`: `f3d4e5f0ea624f4ca7fd3e923998b24a`
- Token: stored out-of-band; reference as `$CF_TOKEN` env var in scripts
- DNS records a actualizar (proxied):
  - `tote.atilax.io` → record id `d89136506f1a37bb8f5cdfbfc737be17`
  - `toteback.atilax.io` → record id `30dbc225a807cb8dcc1db4c98d748aab`
- **NO tocar** `webhook.atilax.io` (record id `a5571471eed73528504ca99214fceec6`) — pertenece al proyecto ERP que sigue en 144.
- DNS legacy a IGNORAR (no aparecen en HAProxy ni pm2 de 144): `tote-hasura.atilax.io`, `tote-node-red.atilax.io`, `tote-nr.atilax.io`

## Fases (con orden de ejecución)

### Fase 1 — Setup base en 94 (paralelo, sin riesgo)
1. Instalar paquetes apt: postgresql-16, nodejs (vía NodeSource 20.x), git, haproxy, certbot + dns-cloudflare plugin, ffmpeg, build-essential, rsync, ufw
2. Instalar pm2 global vía npm
3. Configurar Postgres en port 5433 (mismo que 144)
4. Crear user `tote_user` + db `tote_db` con password matching 144's (out-of-band)
5. UFW: 22, 80, 443; cerrar 5433 al exterior
6. Crear `/var/proyectos/tote-web/`

### Fase 2 — Código
1. **Local**: `git checkout main && git merge diazhh && git push origin main`
2. **94**: generar SSH deploy key (`/root/.ssh/id_github`)
3. **Usuario**: pega la pubkey en GitHub repo Settings → Deploy keys (read-only)
4. **94**: configurar `~/.ssh/config` con github.com → id_github
5. **94**: `git clone git@github.com:diazhh/tote-web.git /var/proyectos/tote-web`
6. **94**: `cd backend && npm ci && cd ../frontend && npm ci`

### Fase 3 — Backup crítico + sync data inicial
1. **144**: `pg_dump -Fc` → `/root/backups/tote-pre-migration-YYYYMMDD/tote_db.dump` (queda permanente)
2. **144**: `tar -czf .../storage.tar.gz` del backend/storage
3. Transfer ambos a 94 (`scp`)
4. **94**: `pg_restore --clean --if-exists`
5. **94**: extraer `storage.tar.gz` en `/var/proyectos/tote-web/backend/`
6. **94**: `npm run db:push` (aplica schema `DrawItemQuota` que no estaba en prod)

### Fase 4 — Configuración (env, HAProxy, certs)
1. Copiar `.env` de 144, modificar para SAFE testing:
   - `DISABLE_SOCIAL_CHANNELS=true`
   - `ENABLE_JOBS=false`
2. HAProxy en 94: config minimal con 2 backends (`backend_api` → 127.0.0.1:3001, `frontend_app` → 127.0.0.1:4006). NO incluir `webhook_server` — ese sigue siendo del ERP en 144.
3. Cert vía DNS-01 con Cloudflare (no requiere DNS apuntando a 94 todavía):
   ```
   certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/cf.ini \
     -d tote.atilax.io -d toteback.atilax.io \
     --non-interactive --agree-tos -m diazhh@gmail.com
   ```
4. Combinar cert + key en `/etc/haproxy/tote.atilax.io.pem`
5. `systemctl restart haproxy`

### Fase 5 — Verificación interna en 94 (DNS aún en 144)
1. `pm2 start ecosystem.config.js`
2. `npm test` (debe pasar las 32 pruebas)
3. `pm2 logs --lines 50` — sin errores críticos
4. curl con Host header al loopback HTTPS — health 200, frontend HTML 200
5. `node src/scripts/test-image-generation.js` — verifica Sharp + assets
6. SQL: confirmar count de Draws/Tickets matches 144
7. Browser test con `/etc/hosts` override local: login admin, ver dashboard, monitor, modal de cupo
8. Verificar logs: `[SOCIAL DISABLED]` aparece, ningún post real a Telegram/WhatsApp/Facebook

**Gate**: NO continuar a Fase 6 hasta que TODOS los checks pasen.

### Fase 6 — Cutover (hora a definir, sugerido 6:00 AM)
1. Final delta DB: `pg_dump` en 144 → restore en 94
2. Final delta storage: rsync incremental
3. **144**: `pm2 stop tote-backend tote-frontend && pm2 save`
4. **94**: cambiar `.env` — `DISABLE_SOCIAL_CHANNELS=false`, `ENABLE_JOBS=true`
5. **94**: `pm2 restart tote-backend tote-frontend`
6. Cloudflare API: actualizar 2 A records → `94.72.116.98` (`tote.atilax.io`, `toteback.atilax.io`). **NO** tocar `webhook.atilax.io`.
7. Smoke test externo desde local

### Fase 7 — Verificación post-cutover (hasta 8 AM)
1. `curl https://toteback.atilax.io/health` desde local
2. Login admin desde browser
3. Webhook test: enviar payload de provider PUSH
4. Watch `pm2 logs tote-backend` durante 10 min
5. **8 AM**: observar el draw end-to-end
   - Image generated
   - Posted to Telegram/WhatsApp/Facebook
   - Prizes calculated
   - Stats updated

## Rollback (si algo falla en Fase 7)
1. Revertir 3 DNS A records a `144.126.150.120` (curl al CF API)
2. `ssh 144 'pm2 start tote-backend tote-frontend'`
3. Tiempo estimado: < 2 min
4. **144 nunca se modifica** durante este plan, así que el rollback es trivial

## Variables claves
| Variable | Valor |
|---|---|
| Postgres user | `tote_user` |
| Postgres password | (matches 144 — out-of-band) |
| Postgres DB | `tote_db` |
| Postgres port | `5433` |
| Backend port | `3001` |
| Frontend port | `10000` |
| Webhook server port (HAProxy backend) | `9000` |
| Cloudflare zone id | `f3d4e5f0ea624f4ca7fd3e923998b24a` |
| GitHub repo | `git@github.com:diazhh/tote-web.git` |
| Cert email | `diazhh@gmail.com` |

## Decisiones cerradas
- Branch: `main` (merge `diazhh` primero)
- Postgres en 94: nativo (matches 144)
- Cleanup de 144: NO. Permanece como rollback.
- Cutover sugerido: 6:00 AM (2h antes del draw)
- Domains legacy `tote-hasura/node-red/nr`: ignorados
