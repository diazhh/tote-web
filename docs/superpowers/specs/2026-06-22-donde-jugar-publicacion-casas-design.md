# Diseño — Publicación diaria "¿Dónde Jugar?" (casas de apuestas)

- **Fecha:** 2026-06-22
- **Estado:** Aprobado (pendiente revisión del spec antes del plan de implementación)
- **Autor:** diazhh + Claude
- **Branch:** `feat/donde-jugar-publicacion-casas`

## 1. Objetivo

Publicar de forma recurrente, en las redes sociales de las familias **LOTOANIMALITO** y **LOTTOPANTERA**, un recordatorio de **dónde pueden jugar** los usuarios (las 16 casas de apuestas/loterías online catalogadas). El contenido se arma con los logos de las casas y sus links.

No es contenido de un sorteo ni de un juego puntual: es una pieza de marca/recordatorio, reusando los canales sociales ya conectados de esos juegos.

## 2. Catálogo de origen (ya existe)

`backend/storage/marketing/partners/`
- `partners.json` — 16 casas con `name`, `slug`, `url`, `socials`, `logo.file`, `description`, `confidence`, `notes`.
- `logos/` — un archivo por casa (PNG/SVG/JPG).
- `README.md` — tabla legible.

Este catálogo es la **única fuente de verdad** para la lista de casas, sus URLs y sus logos.

## 3. Alcance por canal

| Canal | Pieza | Cadencia | Link |
|---|---|---|---|
| **Instagram** | Story 9:16 (1080×1920) "¿DÓNDE JUGAR?" con grilla **2×2 de 4 logos** rotando | Diario **07:30 VE** | Texto + "link en bio" (la API no permite link tappable en story) |
| **Facebook** | Misma story 9:16 (story nativa) | Diario 07:30 VE | Igual que IG |
| **Telegram** | Misma imagen + caption con los **4 links clickeables** (nombre → url) | Diario 07:30 VE | Links clickeables reales |
| **Twitter/X** | Imagen **directorio 4×4 (16 logos)** + hilo con los 16 links. El **pin es manual** (un toque en la app) — la API de X no soporta fijar tweets | **On-demand** (1 sola vez; re-correr al cambiar la lista) | Links en el hilo |

**Emisores:** los canales activos (`GameChannel.isActive = true`) de:
- Familia LOTOANIMALITO → game `lotoanimalito` (`d953f80c-...`).
- Familia LOTTOPANTERA → game `lottopantera` (`61580ccf-...`). Cubre triple/terminal (comparten cuentas; no hay cuentas propias de triple/terminal).

WhatsApp y TikTok quedan **fuera de alcance** en esta primera versión.

## 4. Rotación

- Orden estable de las 16 casas = el orden del array en `partners.json`.
- Agrupación en bloques de 4 → exactamente **4 grupos** (16/4).
- `pickDailyGroup(date)` = `(díaDelAño(date) % 4)` → devuelve el grupo de 4 del día.
- **Determinista**: misma fecha ⇒ mismo grupo (reproducible y compatible con reintentos/`resume` del worker, igual que los runners existentes que reciben `job.data.date`).
- Ciclo completo cada 4 días.

## 5. Arquitectura

Calca el patrón existente de marketing (`resumen-runner`, `pizarra-runner`, `winner-runner`). Reusa `html-renderer.js` (Puppeteer) y `publication.service.js`.

### 5.1 `backend/src/lib/marketing/partner-catalog.js` (nuevo)
- `loadPartners()` — lee y parsea `partners.json`, resuelve rutas absolutas de logos.
- `pickDailyGroup(date)` — rotación determinista (§4).
- `buildLinksCaption(partners)` — arma el texto de links para Telegram/Twitter.
- `chunkThread(partners, maxLen=280)` — trocea los 16 links en replies ≤280 caracteres para el hilo de Twitter.

### 5.2 Plantillas HTML (nuevas, en `storage/.../marketing/`)
- `donde-jugar-story.html` (**1080×1920**): titular "¿DÓNDE JUGAR?", grilla 2×2 con 4 logos. Cada logo va en un **chip** (rectángulo redondeado con fondo uniforme) para homogeneizar logos de distinto fondo/tamaño/formato. Debajo de cada chip: nombre + URL. CTA "🔗 link en bio". Recolor por familia (paleta animalito vs pantera, como ya se hace en `game-config.js`).
- `donde-jugar-directorio.html` (**1080×1350**): grilla 4×4 con las 16 logos en chips + titular. Para el pin de Twitter.

Carga de logos vía `file://` (patrón actual del renderer). SVG/PNG/JPG soportados por Chromium.

### 5.3 `backend/src/lib/marketing/partner-runner.js` (nuevo)
- `runDailyDondeJugar({ date, family })`:
  1. `pickDailyGroup(date)` → 4 casas.
  2. Render `donde-jugar-story.html` → PNG 1080×1920 en `storage/results/`.
  3. `publishStoryToChannels(...)` → IG + FB (story nativa) de la familia.
  4. `publishImageToChannels(...)` → Telegram de la familia, con caption = `buildLinksCaption(4)`.
- `runTwitterDirectorio({ family })`:
  1. Render `donde-jugar-directorio.html` → PNG 1080×1350.
  2. Por cada `GameChannel` TWITTER activo de la familia: postear tweet raíz con imagen (`twitterService.publishTweet`) → publicar hilo (`chunkThread(16)`) como replies encadenados (`twitterService.replyTweet`).
  3. Devolver la URL del tweet raíz para que el usuario lo **fije manualmente** (la API de X no soporta pin).

### 5.4 `backend/src/services/twitter.service.js` (extender)
- `replyTweet(instanceId, text, inReplyToTweetId, imageUrl?)` — encadena el hilo (reusa la subida de media existente vía `client.v2.tweet({ text, reply: { in_reply_to_tweet_id } })`).
- **No** se implementa `pinTweet`: la API pública de X v2 no expone fijar un tweet al perfil. El pin queda como paso manual (un toque), una sola vez.

### 5.5 Scheduling
- **Queues nuevas** en `queue/constants.js`: `donde-jugar-lotoanimalito`, `donde-jugar-lottopantera` (config tipo `RESUMEN_*`: 3 reintentos, backoff, expiry corto).
- **Workers nuevos** en `queue/workers/` + registro en `register.js` dentro del bloque `PGBOSS_SPECIAL_IMAGES` (patrón `createQueue` ANTES de `work`).
- **Trigger diario** vía el job Croner existente `jobs/special-images.job.js` (TZ `America/Caracas`): se agrega una tarea `Cron('30 7 * * *')` que hace `boss.send(QUEUE, { date: dateStr })` para ambas familias. (Las imágenes de marketing NO usan `/etc/cron.d/tote-triggers` ni `trigger-pgboss-cron.mjs` — ese camino manda payload vacío; el payload `{ date }` lo provee Croner.)
- **Twitter directorio**: NO va en cron. Se ejecuta on-demand vía script (`backend/src/scripts/`) que dispara `runTwitterDirectorio` para cada familia.

## 6. Flujo diario

```
Croner special-images.job.js  Cron('30 7 * * *', TZ America/Caracas)
  → boss.send('donde-jugar-lotoanimalito', { date })   (e idem lottopantera)
  → worker
  → runDailyDondeJugar({ date, family })
  → render story PNG
  → publishStoryToChannels(gameId, ..., { channelTypes: ['INSTAGRAM','FACEBOOK','TELEGRAM'] })
     (IG/FB story nativa + Telegram imagen 9:16 con caption de 4 links)
```

## 7. Requisitos / supuestos

1. **Twitter Read+Write**: las apps de X deben estar en modo Read+Write con access token/secret regenerados (pendiente del usuario). Sin esto, el post del directorio + hilo falla; IG/FB/Telegram funcionan igual.
2. **IG/FB stories sin link tappable**: la Graph API no permite añadir sticker de link por API → el link va como texto en la imagen + "link en bio".
3. **Twitter pin manual**: la API pública de X v2 no expone fijar un tweet. El bot publica el directorio + hilo y devuelve la URL; el usuario lo fija con un toque (una sola vez).
4. **Logos heterogéneos**: se normalizan visualmente en chips. `fanaticash` usa su avatar de IG (cuadrado); a futuro se podría sustituir por un wordmark más limpio.
5. **TZ**: el trigger usa Croner con `timezone: 'America/Caracas'`, así que 07:30 es hora Venezuela sin depender del TZ del VPS.
6. **Canales**: se publican solo a `GameChannel` activos de lotoanimalito y lottopantera; si alguno no existe/está inactivo, se omite sin romper el job.

## 8. Testing

- **Unit**: `pickDailyGroup` (determinismo + cobertura de los 4 grupos), `buildLinksCaption`, `chunkThread` (cada reply ≤280, todos los 16 cubiertos).
- **Render**: snapshot de dimensiones (1080×1920 y 1080×1350) y de que los 4/16 chips se llenan (estilo de los tests `board-fill`/`render-lock`).
- **Dry-run**: con `DISABLE_SOCIAL_CHANNELS=true` se generan las imágenes sin publicar, para QA visual.

## 9. Fuera de alcance (YAGNI)

- Motor genérico de campañas configurables (se evaluará si surgen más casos).
- WhatsApp y TikTok.
- Link tappable en stories / "link sticker".
- Métricas/analítica de la publicación.
- Auto-actualización del pin de Twitter (es on-demand a propósito).
