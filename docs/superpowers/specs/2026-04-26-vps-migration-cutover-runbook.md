# Runbook: Cutover tote-web 144 → 94

**Cuándo se ejecuta:** Cuando el usuario diga "autorizo la migración" (planeado domingo nocturno).

**Pre-condición:** El dry run del 2026-04-24 dejó la VPS 94 lista (Postgres + storage + HAProxy + cert + .env safe-mode + pm2 detenido). Este runbook **NO** repite el setup base — solo hace el cutover.

**Tiempo total estimado:** 8–15 min (depende del tamaño del delta).

**Ventana de impacto:**
- Webhooks de providers PUSH: ~30–60 s sin servicio mientras se hace el switch (los providers reintentarán).
- Frontend para usuarios admin/players: ~10–30 s (DNS via Cloudflare proxy, propagación rápida).

**Estado al iniciar (verificar antes):**
- VPS 94 corriendo HAProxy en 80/443, pm2 con tote-backend y tote-frontend en estado `stopped`.
- VPS 144 corriendo normal (pm2 list debe mostrar `tote-backend` y `tote-frontend` `online`).
- DNS de `tote.atilax.io` y `toteback.atilax.io` aún apuntando a `144.126.150.120` (proxied por Cloudflare).
- En 94: `backend/storage/whatsapp-sessions.disabled-94` existe (sesión Baileys de la última copia, que será reemplazada por la fresca).

---

## Variables a setear antes de pegar comandos

```bash
# En la máquina LOCAL del operador (necesarios para los curl a Cloudflare)
export CF_TOKEN="<tu Cloudflare API token con Zone:DNS:Edit sobre atilax.io>"
export CF_ZONE="f3d4e5f0ea624f4ca7fd3e923998b24a"
export REC_TOTE="d89136506f1a37bb8f5cdfbfc737be17"      # tote.atilax.io
export REC_TOTEBACK="30dbc225a807cb8dcc1db4c98d748aab"  # toteback.atilax.io
# NOTA: webhook.atilax.io (record id a5571471eed73528504ca99214fceec6) NO se toca — pertenece al ERP, sigue en 144.

export PG_PASS="<password de tote_user — es la misma en 144 y 94>"
```

---

## Fase 0 — Pre-flight (3 min, sin riesgo)

```bash
# 0.1 — Confirmar que 144 está vivo y tote corriendo
ssh 144 'pm2 list | grep -E "tote-backend|tote-frontend"'
# Esperado: ambos con status=online

# 0.2 — Confirmar que 94 está vivo y HAProxy escucha
ssh 94 'systemctl is-active haproxy && pm2 list && ss -tlnp | grep -E ":80|:443"'
# Esperado: haproxy active, pm2 con tote-backend y tote-frontend en stopped

# 0.3 — Verificar conectividad SSH directa 144 → 94 (necesaria para transferencia rápida)
ssh 144 'ssh -o BatchMode=yes root@94.72.116.98 "echo ok"'
# Esperado: ok

# 0.4 — Confirmar valores actuales de los DNS records (deben apuntar a 144)
curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records/$REC_TOTE" | grep -o '"content":"[^"]*"'
curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records/$REC_TOTEBACK" | grep -o '"content":"[^"]*"'
# Esperado: ambos "144.126.150.120"
```

Si algo de Fase 0 falla, **abortar** y diagnosticar. No continuar.

---

## Fase 1 — Backup pre-cutover en 144 (2 min)

> Por si algo sale mal: este backup es independiente del que se hizo el 24/04. Si el rollback no alcanza, este es el fallback.

```bash
ssh 144 '
DIR=/root/backups/tote-cutover-$(date +%Y%m%d-%H%M)
mkdir -p $DIR
PGPASSWORD="'$PG_PASS'" pg_dump -Fc -h localhost -p 5433 -U tote_user tote_db > $DIR/tote_db.dump
echo "DB dump:" && ls -lh $DIR/tote_db.dump
echo "$DIR" > /tmp/cutover-backup-path
'
```

Esto NO incluye el tar de storage (es muy grande y el rsync del paso siguiente lo cubre).

---

## Fase 2 — Sync delta de storage (1–3 min)

> Storage growth típico: nuevas imágenes generadas + sesiones Baileys actualizadas. Rsync incremental copia solo lo cambiado.

```bash
ssh 144 '
rsync -avz --delete \
  /var/proyectos/tote-web/backend/storage/ \
  root@94.72.116.98:/var/proyectos/tote-web/backend/storage/ 2>&1 | tail -20
'
```

Esperado:
- Tamaño transferido < 500 MB (solo el delta).
- En 94, la carpeta `whatsapp-sessions/` ahora existe con datos frescos del 144 (gracias al `--delete`, la versión renombrada del dry run sigue ahí pero será irrelevante).

```bash
# 2.1 — Limpiar la sesión renombrada del dry run para evitar confusión
ssh 94 'rm -rf /var/proyectos/tote-web/backend/storage/whatsapp-sessions.disabled-94 && ls /var/proyectos/tote-web/backend/storage/ | grep whatsapp'
# Esperado: whatsapp-sessions  (sin "disabled")
```

---

## Fase 3 — Stop pm2 en 144 (LA VENTANA EMPIEZA AQUÍ)

> A partir de este punto, los webhooks de providers entran en modo "no atendido" hasta que 94 esté arriba. Mantenerlo corto.

```bash
# 3.1 — Detener pm2 en 144 (Baileys hace logout limpio, Telegram bots dejan de pollear)
ssh 144 'pm2 stop tote-backend tote-frontend && pm2 list | grep -E "tote-backend|tote-frontend"'
# Esperado: ambos con status=stopped
```

---

## Fase 4 — Final delta DB (1–2 min)

> Captura todos los tickets/draws creados durante Fase 1–2.

```bash
# 4.1 — pg_dump final desde 144
ssh 144 '
PGPASSWORD="'$PG_PASS'" pg_dump -Fc -h localhost -p 5433 -U tote_user tote_db > /tmp/tote_final.dump
ls -lh /tmp/tote_final.dump
scp /tmp/tote_final.dump root@94.72.116.98:/tmp/
'

# 4.2 — pg_restore en 94 (--clean elimina los datos del dry run y carga lo nuevo)
ssh 94 '
PGPASSWORD="'$PG_PASS'" pg_restore -h localhost -p 5433 -U tote_user -d tote_db \
  --clean --if-exists --no-owner --no-acl /tmp/tote_final.dump 2>&1 | tail -10
'

# 4.3 — Verificar counts en 94
ssh 94 'PGPASSWORD="'$PG_PASS'" psql -U tote_user -h localhost -p 5433 -d tote_db -c "
SELECT (SELECT count(*) FROM \"Draw\") draws,
       (SELECT count(*) FROM \"Ticket\") tickets,
       (SELECT count(*) FROM \"User\") users,
       (SELECT count(*) FROM \"AdminTelegramBot\" WHERE \"isActive\"=true) bots_activos;
"'
# Verificar que los counts son razonables y que bots_activos > 0 (vienen activos de 144).

# 4.4 — Asegurar que el schema más nuevo (DrawItemQuota) sigue aplicado
ssh 94 '
cd /var/proyectos/tote-web/backend
DATABASE_URL="postgresql://tote_user:'$PG_PASS'@localhost:5433/tote_db?schema=public" \
  npx prisma db push --skip-generate 2>&1 | tail -5
'
# Esperado: "Your database is now in sync"
```

---

## Fase 5 — Activar flags de producción en .env de 94

```bash
ssh 94 '
cd /var/proyectos/tote-web/backend
sed -i "s/^DISABLE_SOCIAL_CHANNELS=true/DISABLE_SOCIAL_CHANNELS=false/" .env
sed -i "s/^ENABLE_JOBS=false/ENABLE_JOBS=true/" .env
echo "=== flags activos ==="
grep -E "^(DISABLE_SOCIAL_CHANNELS|ENABLE_JOBS)=" .env
'
# Esperado:
#   DISABLE_SOCIAL_CHANNELS=false
#   ENABLE_JOBS=true
```

---

## Fase 6 — Arrancar pm2 en 94

```bash
ssh 94 'cd /var/proyectos/tote-web && pm2 start ecosystem.config.js && sleep 8 && pm2 list'
# Esperado: tote-backend y tote-frontend con status=online, sin restarts (↺ debe ser 0)
```

```bash
# 6.1 — Smoke test interno antes de flipear DNS
ssh 94 '
curl -sS http://localhost:4003/health
echo
curl -sS --resolve tote.atilax.io:443:127.0.0.1 -k https://tote.atilax.io/ -o /dev/null -w "frontend HTTP %{http_code}\n"
curl -sS --resolve toteback.atilax.io:443:127.0.0.1 -k https://toteback.atilax.io/health -o /dev/null -w "backend HTTP %{http_code}\n"
'
# Esperado: health JSON ok, ambos HTTP 200

# 6.2 — Logs sin errores críticos
ssh 94 'pm2 logs tote-backend --lines 30 --nostream 2>&1 | grep -iE "error|warn|fail" | head -10'
# Si hay errores de Baileys QR scan: el usuario debe re-emparejar WhatsApp desde el admin (esperar a que aparezca el QR en logs, capturar)
```

---

## Fase 7 — Flip DNS en Cloudflare (cutover real)

> Punto de no retorno suave. Cloudflare actualiza el A record y el proxy edge empieza a forwardear a 94 en segundos.

```bash
# 7.1 — Update tote.atilax.io
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records/$REC_TOTE" \
  -d '{"content":"94.72.116.98"}' | grep -o '"success":[^,]*'

# 7.2 — Update toteback.atilax.io
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records/$REC_TOTEBACK" \
  -d '{"content":"94.72.116.98"}' | grep -o '"success":[^,]*'

# Esperado: ambos {"success":true
```

---

## Fase 8 — Verificación post-cutover (5–10 min)

```bash
# 8.1 — DNS propagado a Cloudflare edge (debe ser inmediato — CF push instantáneo)
sleep 15
dig +short toteback.atilax.io @1.1.1.1   # con proxy on muestra IPs CF (104.x / 172.x), no 94
                                          # esto es esperado — el A record real lo ves desde dentro de CF

# 8.2 — Acceso real desde fuera (DNS real, sin --resolve)
curl -sS https://toteback.atilax.io/health
# Esperado: {"status":"ok",...}

curl -sS https://tote.atilax.io/ -o /dev/null -w "HTTP %{http_code}\n"
# Esperado: HTTP 200

# 8.3 — Verificar que el tráfico llega a 94 (no a 144)
ssh 94 'tail -f /var/log/haproxy.log | grep tote' &
HAP=$!
sleep 5
curl -sS https://tote.atilax.io/ > /dev/null
sleep 2
kill $HAP 2>/dev/null
# Esperado: ver una línea de access log en 94 (request del curl).

# 8.4 — Login admin desde browser
echo "Abrí https://tote.atilax.io/admin/login y entrá con tu cuenta admin. Verifica:"
echo " 1. Login funciona"
echo " 2. Dashboard carga datos (no errores)"
echo " 3. Monitor → tab Números → ver columnas Cupo/Disponible"
echo " 4. Configurar un cupo de prueba en un draw SCHEDULED"
echo " 5. Eliminar el cupo de prueba"

# 8.5 — Webhook test desde un provider (cuando haya tráfico real)
ssh 94 'pm2 logs tote-backend --lines 30 --nostream 2>&1 | grep -iE "webhook|premier|virtuales" | tail -10'
# Esperado: ver webhooks llegando y tickets creados.

# 8.6 — Bots Telegram conectan
ssh 94 'pm2 logs tote-backend --lines 40 --nostream 2>&1 | grep -iE "telegram|bot.*started|bot.*connected"'
# Esperado: ver "✅ X bot(s) de administración iniciados"

# 8.7 — Baileys WhatsApp
ssh 94 'pm2 logs tote-backend --lines 40 --nostream 2>&1 | grep -iE "baileys|whatsapp|qr"'
# Si dice "QR code generated": re-emparejar desde el admin con el celular original
# Si conectó silently: la sesión sobrevivió la migración
```

**Si algo de 8.1–8.7 falla:** ir a "Procedimiento de rollback".

---

## Fase 9 — Limpieza y monitoreo (post-cutover)

**No tocar 144 todavía.** Dejarlo corriendo intacto por al menos 24 h como rollback de emergencia.

```bash
# Monitoreo continuo durante el primer sorteo después del cutover
ssh 94 'pm2 logs tote-backend --lines 100'  # Ctrl+C para salir
# Mirar: image generation, publication a redes sociales, prize processing, stats
```

Después de 24 h sin incidentes, opcional:
```bash
# (NO ejecutar a menos que confirmes que todo funciona)
ssh 144 'pm2 delete tote-backend tote-frontend && pm2 save'
# Y opcionalmente droppear la DB tote en 144 cuando ya no necesites el rollback.
```

---

## Procedimiento de rollback (si Fase 7 o 8 fallan)

> Tiempo total: < 3 min.

```bash
# R.1 — Revertir DNS a 144
curl -sS -X PATCH -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records/$REC_TOTE" \
  -d '{"content":"144.126.150.120"}'
curl -sS -X PATCH -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/dns_records/$REC_TOTEBACK" \
  -d '{"content":"144.126.150.120"}'

# R.2 — Detener pm2 en 94 (evita conflictos Telegram cuando 144 vuelva)
ssh 94 'pm2 stop tote-backend tote-frontend'

# R.3 — Arrancar pm2 en 144
ssh 144 'pm2 start tote-backend tote-frontend'

# R.4 — Verificar que 144 retoma el servicio
sleep 30
curl -sS https://toteback.atilax.io/health
ssh 144 'pm2 logs tote-backend --lines 20 --nostream | tail -20'
```

Los datos creados en 94 entre Fase 6 y rollback se pierden (los tickets nuevos, etc.) — pero la DB original en 144 sigue siendo la fuente de verdad porque el pg_restore en Fase 4 fue al 94, no al 144.

---

## Checklist final (printable)

```
☐ Fase 0 — Pre-flight pasa
☐ Fase 1 — Backup pre-cutover en 144
☐ Fase 2 — rsync storage 144 → 94
☐ Fase 3 — pm2 stop en 144
☐ Fase 4 — pg_dump final + restore + db push en 94
☐ Fase 5 — flags de producción en .env de 94
☐ Fase 6 — pm2 start en 94 + smoke test interno
☐ Fase 7 — flip DNS Cloudflare (2 records)
☐ Fase 8 — verificación externa
   ☐ /health responde desde DNS público
   ☐ Login admin funciona
   ☐ Webhook entra y crea ticket
   ☐ Bots Telegram conectan
   ☐ Baileys conecta o QR para re-pair
☐ Fase 9 — monitoreo del primer sorteo post-cutover
```

---

## Notas operativas

1. **Telegram conflict 409**: si te aparece esto en logs de 94, es porque 144 NO se detuvo bien. `ssh 144 'pm2 list'` y verificá que `tote-backend` está stopped.

2. **WhatsApp Baileys re-pair**: si la sesión no sobrevivió, el bot va a generar un QR. El usuario tiene que escanearlo desde el celular original (el que fue emparejado la última vez). Si pasa, va a aparecer en `pm2 logs tote-backend` y en la UI admin.

3. **pg-boss queues**: las jobs en cola viven en la DB. Como copiamos la DB completa, todas las jobs pendientes vienen con. Cuando 94 arranca con `ENABLE_JOBS=true`, el worker las retoma automáticamente.

4. **PORT del backend**: HAProxy en 94 ya está configurado para `127.0.0.1:4003` (que coincide con el `PORT: 4003` del `ecosystem.config.js`). No tocar.

5. **Cert renewal**: certbot ya configuró el renew automático. La PEM combinada se reconstruye con un hook (verificá `/etc/letsencrypt/renewal-hooks/` en 94).

6. **Si los providers PUSH retoman antes de que 94 esté listo**: durante la ventana de Fase 3–7 los webhooks reciben 502/503. Los providers serios reintentán; lo peor que pasa es algunos tickets duplicados que `createWebhookTicket` deduplica por `externalTicketId`.

7. **DNS TTL**: con CF proxy on, el TTL del A record interno no afecta a usuarios — CF hace propagación inmediata en su edge. Solo importa si alguna integración bypasea CF.
