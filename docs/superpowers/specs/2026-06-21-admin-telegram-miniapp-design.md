# Mini App de Telegram para el Admin ("Monitor en Telegram") — Diseño

> **Estado:** aprobado en brainstorm 2026-06-21. Sketch interactivo aprobado por el usuario.
> **Sketch:** `docs/superpowers/sketches/2026-06-21-admin-miniapp.html`.
> **Repo:** tote-web (no es app nueva). Frontend Next.js + backend Express existentes.

## 1. Resumen

Una **Telegram Mini App** que le da al administrador, **dentro de Telegram**, una versión visual del *monitor*: ver el estado del próximo sorteo (números, ventas, riesgo, caídas, pre-seleccionado) y **actuar** sobre él — cambiar el pre-seleccionado, fijar cupo y bloquear/liberar números — sin abrir el panel web.

Hoy el admin hace esto por **comandos de texto** del bot (`cambiar 05`, `triple 123`, `panda 15`) que solo escriben el pre-seleccionado a ciegas. La Mini App **no reemplaza** esos comandos (coexisten); añade una capa visual con contexto (las mismas cifras que el monitor) antes de decidir.

La app es una **ruta nueva** del frontend Next.js existente, servida client-only, que se autentica con el `initData` de Telegram y **reusa los endpoints backend existentes** (`/api/monitor/*`, `/api/draws/*`). La única superficie backend nueva es **un endpoint de auth** que valida `initData` y emite un JWT.

## 2. Objetivos y no-objetivos

**Objetivos**
- Ver el monitor del sorteo seleccionado dentro de Telegram (números con ventas/riesgo/cupo/tripletas, "hace X días", caídas, pre-seleccionado actual).
- Cambiar el pre-seleccionado de forma visual (tap → confirmar).
- Fijar cupo y bloquear/liberar números (solo rol ADMIN).
- Navegación práctica por botones: juego → sorteo (próximo primero) → monitor; siempre con "volver".
- Reuso máximo del backend y del bot admin existentes; mínima superficie nueva.
- Aislamiento: cero cambios al pipeline de sorteos; solo se añade un endpoint de auth y (opcional) un botón a una notificación.

**No-objetivos**
- No reemplaza el panel web ni los comandos de texto del bot.
- No cierra/ejecuta/cancela sorteos (queda fuera de v1).
- No edita resultados de sorteos **ya sorteados** (DRAWN): esos son **solo lectura**.
- No es una app pública ni para jugadores.

## 3. Decisiones tomadas (brainstorm)

| Tema | Decisión |
|---|---|
| Alcance v1 | Ver monitor + cambiar pre-seleccionado + cupo/bloqueo. |
| Navegación | Botones: selector de juego → selector de sorteo → monitor. Próximo sorteo **de primero**; anteriores debajo (scroll) y **solo lectura**. |
| Arquitectura | Ruta nueva en el frontend Next.js existente (`ssr:false`), reusa backend + bot admin. |
| SDK | `@telegram-apps/sdk` v3 (+ `@telegram-apps/sdk-react`). No el `@twa-dev` legacy. |
| Auth | `initData` validado server-side (HMAC con token del bot) → `User` por `telegramUserId` → JWT corto → reuso de endpoints. |
| Sorteos cerrados | DRAWN = solo lectura (sin cambiar ganador/cupo/bloqueo). |
| Deep-link | Botón "🔮 Abrir monitor" en la notificación de pre-ganador (incluido en v1; recortable). |

## 4. Arquitectura

```
Admin toca el botón de menú del bot admin (ya existe)
        ↓  Telegram abre  https://tote.atilax.io/tg   (ruta nueva, ssr:false)
Mini App (Next.js + @telegram-apps/sdk-react) → init() → lee initData
        ↓  POST /api/telegram-miniapp/auth  { initData }
Backend valida HMAC con el/los token(es) de AdminTelegramBot
   + auth_date fresco → user.id → User por telegramUserId
   + exige role ∈ {ADMIN, OPERATOR} + isActive
   + emite JWT (misma función que /api/auth/login)
   → { token, user:{id,role,name}, games:[{id,slug,name}] }   (juegos asignados)
        ↓  La app guarda el token y lo manda como  Authorization: Bearer
Mini App reusa endpoints EXISTENTES (protegidos por JWT):
   GET  /api/draws?gameId&dateFrom&dateTo       → selector de sorteo
   GET  /api/monitor/items/:drawId              → tabla de números
   GET  /api/monitor/caidas/:drawId             → caídas
   GET  /api/draws/:drawId/quotas               → cupos del sorteo
   POST /api/draws/:id/change-winner | preselect→ cambiar pre-seleccionado
   PUT/DELETE /api/draws/:drawId/quotas/:itemId → cupo / bloquear-liberar (ADMIN)
```

- **Dependencia:** Mini App → backend (mismo origen). El backend no sabe que es una Mini App salvo en el endpoint de auth.
- **No SSR:** la raíz de `/tg` se carga con `dynamic(() => import('./Root'), { ssr:false })`; el SDK necesita `window`.

## 5. Autenticación (la parte crítica)

**Endpoint nuevo:** `POST /api/telegram-miniapp/auth`, body `{ initData: string }` (el query-string crudo de `Telegram.WebApp.initData`). **No** se confía en `initDataUnsafe`.

**Validación (util nuevo `validateTelegramInitData`):**
1. Parsear el query-string; extraer y quitar `hash` (y `signature` si viene).
2. Construir el *data-check-string*: `key=value` por cada campo restante, **ordenados alfabéticamente**, unidos por `\n`.
3. `secret = HMAC_SHA256("WebAppData", botToken)` (el token es la **clave**, `"WebAppData"` el **mensaje**).
4. `computed = hex(HMAC_SHA256(dataCheckString, secret))`.
5. Válido si `computed === hash` con comparación **constant-time** (`crypto.timingSafeEqual` con guarda de longitud — mismo patrón que `webhook-auth.middleware.js`).
6. **Frescura:** rechazar si `now - auth_date > VENTANA` (configurable; default 24 h — generoso porque el webview conserva el `initData` original; el JWT emitido es corto).

**Multi-bot:** puede haber varios `AdminTelegramBot` activos. Se prueba el HMAC contra cada `botToken` activo (más el fallback `ADMIN_TELEGRAM_BOT_TOKEN` de env) hasta que uno valide. El bot desde el que se lanzó la app es el que firmó.

**Identidad → sesión:**
- Del `initData` validado se toma `user.id` → `prisma.user.findFirst({ where:{ telegramUserId } })`.
- Exigir `role ∈ {ADMIN, OPERATOR}` y `isActive`. Si no → 403.
- Emitir JWT con la **función existente** de `auth.service.js` (la de `/api/auth/login`), para que el `authenticate` middleware lo acepte sin cambios.
- Devolver además los **juegos asignados** (`UserGame`) para poblar el selector sin otra llamada.

**Re-auth:** el cliente guarda el token en memoria. Ante 401 (expiró), re-`POST`ea el mismo `initData` (válido dentro de la ventana de frescura) y re-mintea. Fuera de ventana → "reabre desde el bot".

**Rol y permisos en la app:**
- **ADMIN:** todas las acciones (pre-seleccionado, cupo, bloqueo).
- **OPERATOR:** ver + cambiar pre-seleccionado. **Sin cupo/bloqueo** (esas rutas son `authorize('ADMIN')`; la app las oculta para no provocar 403).

## 6. Navegación y pantallas (ver sketch)

Tres pantallas, navegación por botones, BackButton nativo siempre + "Inicio" en el monitor.

1. **Juegos** — botones de los juegos asignados al admin (de la respuesta de auth).
2. **Sorteos** — al elegir juego, `GET /api/draws?gameId&dateFrom=hoy&dateTo=hoy` (o rango corto). Orden: **próximo sorteo primero** (resaltado), luego programados; separador **"Anteriores · solo lectura"** y debajo los ya sorteados (con su ganador), accesibles por scroll.
3. **Monitor** — del sorteo elegido:
   - Cabecera: total vendido, tickets, **⭐ pre-seleccionado actual** (número + nombre + multiplicador).
   - **Caídas** 🔮 del ganador anterior con riesgo ALTO/MEDIO/BAJO.
   - **Buscador** por número/nombre (clave en TRIPLE: 000–999) + chips de filtro (todos / con ventas / riesgo alto / caídas / orden por días).
   - **Lista de números:** por cada uno → número+nombre, apostado, premio potencial, **"hace X días"** (`daysAgo`), tripletas, cupo/disponible (rojo si excede), borde morado si es caída, **%venta** con color de riesgo, ⭐ si es el pre-seleccionado.
   - Tap en un número → **hoja de acciones**: Preseleccionar · Fijar cupo · Bloquear/Liberar. Cada acción confirma con el diálogo **nativo de Telegram** (`showConfirm`) + haptic al éxito. El **MainButton** muestra la acción contextual.
   - **Solo lectura** si el sorteo está DRAWN: banda "👁️ solo lectura", sin hoja de acciones de escritura.

## 7. Endpoints reusados (sin cambios) y datos

| Necesidad | Endpoint existente | Auth | Notas |
|---|---|---|---|
| Juegos del admin | (de la respuesta de `/auth`) | — | `UserGame` del usuario |
| Lista de sorteos | `GET /api/draws?gameId&dateFrom&dateTo` | ADMIN/OPERATOR | selector de sorteo |
| Tabla de números | `GET /api/monitor/items/:drawId` | ADMIN/OPERATOR | ventas/riesgo/tripletas |
| "Hace X días" por ítem | `GET /api/monitor/items-last-drawn?gameId` | ADMIN/OPERATOR | `daysAgo` (o `caidas`/`items` si ya lo traen) |
| Caídas | `GET /api/monitor/caidas/:drawId` | ADMIN/OPERATOR | riesgo por número |
| Cupos del sorteo | `GET /api/draws/:drawId/quotas` | ADMIN | estado de cupo por ítem |
| Cambiar pre-seleccionado | `POST /api/draws/:id/change-winner` `{newWinnerItemId}` (o `/preselect` `{itemId}` si no hay) | ADMIN/OPERATOR | misma lógica que `DrawDetailModal` web; notifica a otros admins |
| Fijar cupo | `PUT /api/draws/:drawId/quotas/:gameItemId` | ADMIN | `maxAmount` |
| Bloquear | `PUT …/quotas/:gameItemId` con `maxAmount: 0` | ADMIN | = setQuota(0) |
| Liberar | `DELETE /api/draws/:drawId/quotas/:gameItemId` | ADMIN | quita el cupo |

## 8. Superficie backend nueva (mínima)

- `lib/validateTelegramInitData.js` (o `middlewares/`) — validador HMAC + frescura + multi-bot.
- `controllers/telegram-miniapp.controller.js` + `routes/telegram-miniapp.routes.js` → `POST /api/telegram-miniapp/auth`. Es una ruta **pública** (sin `authenticate`; su seguridad es el HMAC del `initData`), montada junto a las demás en `index.js`. Usa `express.json()` (no raw body) y queda cubierta por el rate-limiter general de `/api/`.
- (Opcional v1) En `admin-notification.service.js` / el formato de `🎯 PRE-GANADOR SELECCIONADO`: añadir un `inline_keyboard` con un botón `web_app`/url de deep-link (`…/tg?startapp=<drawId>`) "🔮 Abrir monitor".
- **Setup del bot:** configurar el botón de menú `web_app` del bot admin (vía `setChatMenuButton` o BotFather) apuntando a `https://tote.atilax.io/tg`.

## 9. Frontend nuevo (ruta `/tg`)

- `frontend/app/tg/` — layout client-only (`ssr:false`), carga el script/SDK, `init()`, `ready()`, `expand()`.
- Estado: token + user + games en memoria (Zustand o context). Cliente API que inyecta `Authorization: Bearer`.
- Componentes: `GamePicker`, `DrawPicker`, `Monitor` (cabecera + caídas + buscador + lista), `NumberSheet` (hoja de acciones). Reusar lógica/labels del monitor web donde aplique.
- Tema: derivar colores de `themeParams` de Telegram. BackButton/MainButton/haptics vía SDK.
- Dev fuera de Telegram: `mockTelegramEnv` para correr en navegador normal; servir HTTPS en dev.

## 10. Manejo de errores

- `initData` inválido/viejo → 401; la app muestra "Sesión de Telegram inválida, reábrela desde el bot".
- Usuario no admin / no vinculado → 403 "No tienes acceso de administrador" (con hint de `/vincular`).
- JWT expirado → re-auth silenciosa con el `initData`; si falla, prompt de reabrir.
- Acción sobre sorteo DRAWN → bloqueada en UI (solo lectura); defensa server-side opcional.
- Cambio concurrente (otro admin movió el pre-seleccionado) → al escribir, refrescar y mostrar el estado actual antes de confirmar.
- Errores de red → toast + reintento; las escrituras siempre pasan por `showConfirm`.

## 11. Pruebas

- **Backend (jest ESM, estilo `webhook-auth.middleware.test.js`):** `validateTelegramInitData` con vectores válido / hash inválido / `auth_date` viejo / bot equivocado / multi-bot; y el flujo `/auth` → 403 si rol insuficiente / usuario inexistente, 200 + token + games si ADMIN/OPERATOR. Generar un `initData` de prueba firmando con un token de test.
- **Frontend:** `mockTelegramEnv` para boot fuera de Telegram; tests ligeros de render del picker y de la lista (filtros/búsqueda); guarda de solo-lectura en DRAWN.
- **E2E manual:** dentro de Telegram tras desplegar (botón de menú + HTTPS). Verificar cambiar pre-seleccionado refleja en el monitor web y notifica a otros admins.

## 12. Riesgos y temas abiertos

- **Frescura de `initData`:** ventana 24 h es cómoda pero amplia; si se quiere más estricto, acortar y aceptar reabrir más seguido. (Configurable.)
- **Múltiples bots admin:** validar contra todos los tokens activos; si crecen mucho, indexar por `bot_id` del `initData`.
- **Rol OPERATOR vs ADMIN:** cupo/bloqueo es ADMIN-only; la app oculta esas acciones a OPERATOR. Confirmar que es el comportamiento deseado.
- **CSP/headers:** el webview de Telegram carga la URL como documento top-level (no iframe de terceros), así que `frame-ancestors` no debería bloquear; verificar que helmet no rompa la carga del script de Telegram en `/tg`.
- **`items-last-drawn`:** confirmar en planning si "hace X días" se obtiene de ahí o ya viene en `items`/`caidas` para evitar una llamada extra.

## 13. Fases de implementación

1. **Auth + esqueleto:** `validateTelegramInitData` + `POST /api/telegram-miniapp/auth` (con tests) + ruta `/tg` que autentica y muestra el nombre del admin + sus juegos. Setup del botón de menú del bot.
2. **Monitor (lectura):** pickers (juego/sorteo con próximo-primero + solo-lectura en DRAWN) + lista de números + caídas + buscador/filtros, reusando `/api/monitor/*`.
3. **Acciones de escritura:** cambiar pre-seleccionado (ADMIN/OPERATOR) + cupo/bloqueo (ADMIN), con `showConfirm` + haptics + refresh.
4. **Deep-link:** botón "🔮 Abrir monitor" en la notificación de pre-ganador (`startapp=drawId`).

## 14. Criterios de éxito

- Desde el botón del bot admin, un ADMIN abre la Mini App, navega juego → sorteo → monitor y ve las mismas cifras que el monitor web.
- Cambia el pre-seleccionado del próximo sorteo desde la app; se refleja en `Draw.preselectedItemId`, queda en `AuditLog` y notifica a los demás admins.
- Fija cupo y bloquea/libera un número (ADMIN); los sorteos ya sorteados quedan en solo lectura.
- Un OPERATOR ve el monitor y cambia pre-seleccionado, pero no ve cupo/bloqueo.
- Cero cambios al pipeline de sorteos; toda la lógica de datos es reuso de endpoints existentes.
