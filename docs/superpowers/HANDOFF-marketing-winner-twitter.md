# Handoff — cablear story del ganador por sorteo + deploy-prep VPS 94 + Twitter

Pegá el bloque que te da Claude en una sesión nueva. Este doc es el detalle técnico.

## Estado (todo en `main` local, NO pusheado, NO desplegado)

Sesión 2026-06-22 dejó construido + verificado local + commiteado en `main`:
- Recolor corporativo 6 plantillas feed (loto=rojo, pantera=verde+amarillo, triple=morado).
- Story 9:16 (6 plantillas) + `board-fill` variante feed/story + `game-config` `*StoryTemplate`.
- Video story: `lib/marketing/video-renderer.js` (Ken Burns) y **`lib/marketing/reveal-video.js`** (revelado celda-por-celda con "pop" — estilo elegido para la diaria). Verificados.
- Pizarra semanal: runner + 3 workers + colas `PIZARRA_*` + cron Croner 19:30.
- Limpieza motor Sharp + tests (10 pasan).
- **Plantillas WINNER (story del ganador por sorteo)** en `storage/bases/{1,2,3}/marketing/winner-{lotoanimalito,lottopantera,triple}-story.html` — diseño aprobado. **storage/ está gitignored → NO en git, viajan por rsync.**

> Las plantillas en `storage/bases/*/marketing/*.html` NO están en git (gitignored). Existen en disco local y se despliegan por rsync.

## PENDIENTE 1 — Cablear la story-video del ganador (cada sorteo)

Decisiones tomadas: diseño = plantilla nueva de marca (ya hecha); canales = **solo IG/FB** (story nativa); texto = "¡GANADOR!" + "Sorteo de las HH:MM" + "¡Felicidades a los ganadores!" (horneado en la plantilla).

1. **`game-config.js`**: añadir `winnerStoryTemplate` por juego → `storage/bases/{1,2,3}/marketing/winner-{slug}-story.html`.
2. **`board-fill.js`**: `buildWinnerFill(slug, { hourText, number, name })`:
   - siempre: `['.winner__hour', 'Sorteo de las ' + hourText]`.
   - animal (loto/pantera): `attrs` `['.winner__art','src','file://'+assetFor(number)]`. **NO** inyectar número/nombre: el arte `bases/{1,2}/NN.png` ya trae nº+nombre horneado.
   - number (triple): `['.winner__number', String(number).padStart(3,'0')]`.
3. **`winner-runner.js`** (nuevo, espejo de resumen-runner):
   - `generateWinnerStory({ slug, fileSlug, number, name, drawTime })` → render PNG 1080×1920 (`renderTemplateToPng`) + `buildRevealVideo({ templatePath, fill, outPath, durationSec: 2.6, fps: 24 })`. Archivos `winner_{slug}_{drawId}.png/.mp4` en `storage/results`.
   - `runWinnerWorker` → `publicationService.publishStoryToChannels(gameId, png, file, caption, { videoFilename, channelTypes: ['INSTAGRAM','FACEBOOK'] })`. (publishStoryToChannels YA soporta `channelTypes` y fallback video→imagen.)
4. **Hook en el pipeline de ejecución de sorteo** como paso **NO bloqueante**, DESPUÉS del publish de feed y DESPUÉS del prize-processing (no frenar el camino crítico). Opciones: cola pg-boss `WINNER_STORY_*` encolada al final del worker de publicación, o fire-and-forget dentro del worker. Investigar `queue/workers/execute-draw*` y `publication.publishDraw`. Cada video ~8-12s de render → async sí o sí.
5. **Volumen**: ~12 sorteos/día × 3 juegos = ~36 stories/día. IG permite 100 publicaciones API/24h **por cuenta**; con 1 cuenta IG por juego (~27/día c/u) hay margen.

Verificación local (sin DB): `node src/scripts/gen-winner-preview.mjs` (PNG + video con data de muestra).

## PENDIENTE 2 — Deploy-prep VPS 94 (NO desplegar hasta autorización del usuario)

Chequeado read-only el 2026-06-22:
- ✅ ffmpeg 6.1.1, node v20.20.2, libnss3, libgbm1, caché Chromium en `/root/.cache/puppeteer` (chrome + chrome-headless-shell).
- ❌ **`puppeteer` NO está en `/var/proyectos/tote-web/backend/node_modules`.** El código nuevo importa puppeteer → **se rompe** si no se instala.

**Antes de subir:** deploy = rsync de `backend/src/**` + `backend/storage/bases/*/marketing/*.html` (gitignored). Luego en el VPS: `cd /var/proyectos/tote-web/backend && npm install` (agrega puppeteer + sharp). Verificar:
```bash
ssh 94 'cd /var/proyectos/tote-web/backend && node -e "import(\"puppeteer\").then(()=>console.log(\"puppeteer OK\"))"'
ssh 94 'cd /var/proyectos/tote-web/backend && node src/scripts/render-marketing-preview.mjs'   # render headless real
```
Si el render headless da 0 y escribe PNGs, recién ahí `pm2 restart tote-backend`. **Esperar OK explícito del usuario.**

## PENDIENTE 3 — Twitter (discutir + implementar)

- El usuario quiere que Twitter postee **textos llamativos + hashtags** (no solo la imagen con caption genérico).
- Credenciales (las pasa el usuario en el prompt): app **Lotoanimalito** y app **lottopantera** — la app de **lottopantera sirve para lottopantera Y triple-pantera** (2 juegos, 1 app).
- Per memoria [[project_twitter_x_channel]]: las apps estaban en Read-only (bloqueo). Verificar que estos tokens nuevos tengan **Read+Write**; si postear tira 403, el usuario debe regenerar access token con permisos R+W.
- Revisar `services/twitter.service.js` (publishTweet) + cómo se arma el texto; añadir copy llamativo + hashtags por juego.

## Reglas
- **NO desplegar** hasta autorización explícita del usuario.
- Deploy es rsync manual; git no toca prod.
- Todo el trabajo está en `main` local (NO pusheado).
