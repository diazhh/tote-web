# Migración del gateway de WhatsApp a Baileys — Design Spec

**Fecha:** 2026-06-22
**Estado:** Aprobado (diseño) — pendiente revisión del spec
**Autor:** diazhh + Claude

## 1. Contexto y problema

El sistema publica resultados/marketing a grupos de WhatsApp a través de un microservicio
gateway separado: `whatsapp-service/` (Express en `:3002`), que hoy usa **whatsapp-web.js**
(Puppeteer manejando WhatsApp Web en un Chromium headless). El backend lo consume por HTTP
vía `backend/src/lib/whatsapp-client.js` (axios).

**Síntoma:** la sesión de whatsapp-web.js se cayó alrededor del **2026-05-10** (`connectionStatus:"error"`,
`isReady:false`, sin QR, sin reintentar) y nunca se recuperó. Por eso los 3 canales `WHATSAPP`
están en `isActive:false`. whatsapp-web.js es pesado (un Chromium por sesión) y frágil: se rompe
con updates de WhatsApp Web y requiere re-escanear QR.

**Decisión del usuario:** migrar el motor a **Baileys** (`@whiskeysockets/baileys`), que es liviano
(WebSocket directo, sin navegador) y donde el viejo bug de envío a grupos / migración LID ya está
resuelto en las versiones recientes.

## 2. Objetivos / No-objetivos

**Objetivos**
- Reemplazar whatsapp-web.js por Baileys **dentro del mismo servicio**, conservando la API HTTP
  (el backend NO se modifica).
- Sesión persistente que **sobrevive a reinicios** del servicio y **reconecta automáticamente**.
- Seguir publicando a los grupos ya configurados en DB sin cambios de formato.

**No-objetivos**
- No se mueve Baileys dentro del backend (la sesión debe ser independiente de los reinicios del backend).
- No se cambia el contrato HTTP ni `whatsapp-client.js` del backend.
- No se migra a la API oficial de Meta (no sirve para grupos).
- No se rediseñan los mensajes/plantillas de publicación.

## 3. Decisiones clave

| Tema | Decisión |
|---|---|
| Enfoque | **Swap del motor in-place**: reescribir solo `services/whatsapp.service.js`; `routes/`, `controller/`, `middleware/`, `index.js`, puerto y API HTTP quedan iguales. |
| Versión Baileys | **6.7.23** (npm tag `legacy`, estable). NO 7.0.0-rc. |
| Cuenta WhatsApp | **El mismo número** de antes (mantiene membresía en los grupos). |
| Emparejamiento | Manual por el usuario, **después** del deploy (no tiene el teléfono ahora). |
| Rollout | Reemplazo **in-place en :3002**. Código viejo queda en git para rollback. |
| Persistencia de sesión | `useMultiFileAuthState('./whatsapp-session')` (misma carpeta que ya existe en prod). |

## 4. Arquitectura

```
backend (sin cambios)
  └─ lib/whatsapp-client.js  ── HTTP :3002 ──▶  whatsapp-service
                                                  ├─ routes/whatsapp.routes.js     (SIN cambios)
                                                  ├─ controllers/whatsapp...js     (SIN cambios)
                                                  ├─ middleware/auth.middleware.js (SIN cambios)
                                                  └─ services/whatsapp.service.js  ◀── REESCRITO con Baileys
                                                       └─ Baileys socket ── WebSocket ──▶ WhatsApp
                                                       └─ ./whatsapp-session/  (creds persistentes)
```

**Qué se mantiene idéntico:** `routes/`, `controllers/`, `middleware/auth`, `index.js`, puerto `:3002`,
API HTTP y *response shapes*. El cliente del backend (`whatsapp-client.js`) no se toca.

**Qué se reescribe:** `services/whatsapp.service.js` (el motor) y `package.json` (deps).

## 5. Paridad de API (contrato a preservar)

El servicio debe seguir exponiendo los mismos métodos con las mismas shapes:

| Endpoint | Método servicio | Notas Baileys |
|---|---|---|
| `POST /initialize` | `initialize()` | `makeWASocket` + bind de eventos |
| `GET /status` | `getStatus()` → `{isReady,isInitializing,connectionStatus,hasQR}` | derivado de `connection.update` |
| `GET /qr` | `getQRCode()` → `{qrCode}` o 404 | QR string → data URL con `qrcode` |
| `GET /groups` | `getGroups()` | `groupFetchAllParticipating()` |
| `GET /groups/:id` | `getGroupDetails(id)` | `groupMetadata(id)` |
| `GET /contacts/:id` | `getContactInfo(id)` | store de contactos / `onWhatsApp` |
| `POST /send/text` | `sendTextMessage(chatId,msg)` | `sendMessage(jid,{text})` |
| `POST /send/image` | `sendImageFromUrl/Path/Base64(...)` | `sendMessage(jid,{image:buffer,caption})` |
| `POST /send/multiple` | `sendToMultipleChats(chatIds,msg,imageData)` → `[{success,...}]` | itera con delay anti-spam |
| `POST /logout` | `logout()` | `sock.logout()` + limpiar creds |
| `POST /destroy` | `destroy()` | cerrar socket |

**Normalización de JID:** grupos `...@g.us` van directo a Baileys. Individuales en formato
whatsapp-web.js `...@c.us` se convierten a `...@s.whatsapp.net`. Los recipients guardados en DB
(`120363...@g.us`) son compatibles tal cual.

## 6. Ciclo de conexión y reconexión (la ganancia de robustez)

- Escuchar `connection.update`:
  - `qr` → guardar para `/qr` (data URL) y, si se pidió, emitir pairing-code.
  - `connection: 'open'` → `isReady=true`, `connectionStatus='connected'`.
  - `connection: 'connecting'` → `isInitializing=true`.
  - `connection: 'close'` → leer `lastDisconnect.error` (`DisconnectReason`):
    - si ≠ `loggedOut` → **reconectar** automáticamente con backoff (esto evita el "se cayó y no volvió").
    - si `loggedOut` → limpiar creds, requerir re-emparejamiento (marcar `connectionStatus='logged_out'`).
- `creds.update` → persistir con `saveCreds()`.
- Al arrancar el proceso, si existen creds en `./whatsapp-session`, **reconecta sin re-emparejar**.

## 7. Emparejamiento (lo hace el usuario, después)

Se soportan **ambos** métodos:
- **QR** (compat con el admin UI): `GET /qr` devuelve el QR como data URL.
- **Pairing-code** (nuevo, aditivo): endpoint `POST /pair` con `{ phoneNumber }` → `requestPairingCode()`
  devuelve un código de 8 dígitos que el usuario mete en WhatsApp → Dispositivos vinculados →
  "Vincular con número". Más cómodo para emparejar en remoto sin ver pantalla.

> El endpoint `/pair` es **aditivo** — no rompe el contrato existente; el backend no lo usa.

## 8. Envío de imágenes

`sendMessage(jid, { image: <Buffer>, caption })`. Resolución del buffer:
- `imageData.type==='url'` → fetch con axios (`responseType:'arraybuffer'`).
- path → `fs.readFile`.
- base64+filename → `Buffer.from(base64,'base64')`.

`sendToMultipleChats` itera los grupos con un pequeño delay entre envíos (anti-spam/anti-ban) y
devuelve `[{ chatId, success, error? }]` (shape que el backend ya agrega en `summary`).

## 9. Manejo de errores

- Si la sesión no está lista, `sendToMultipleChats` devuelve **por-grupo** `{success:false, error:'WhatsApp not ready'}`
  (no tira 500 global) — igual que hoy.
- Errores por grupo no abortan el resto del lote.
- Logging con `pino` (logger que Baileys requiere); nivel silencioso para Baileys interno, info para el servicio.

## 10. Dependencias

- **+** `@whiskeysockets/baileys@6.7.23`
- **+** `pino` (requerido por Baileys)
- **−** `whatsapp-web.js` (y con eso se elimina el Chromium pesado de Puppeteer)
- Se conserva: `express`, `cors`, `qrcode` (para el QR data URL), `dotenv`, `axios`, `winston`.

## 11. Pruebas

**Unit (sin WhatsApp real):**
- Normalización de JID (`@c.us`→`@s.whatsapp.net`, `@g.us` intacto).
- Armado del payload de imagen (url/path/base64 → buffer).
- Mapeo `connection.update` → `getStatus()` (shapes exactas).
- Forma del resultado de `sendToMultipleChats` (array por grupo + agregación del controller).

**Integración (tras emparejar, manual):**
- Enviar a un **grupo de prueba** (no a los de producción) antes de reactivar canales.

## 12. Rollout y verificación post-emparejamiento

1. Reescribir el servicio + deps; correr unit tests.
2. Deploy in-place a `:3002` en VPS 94 (reemplaza el whatsapp-web.js muerto). Queda "listo para emparejar".
3. **El usuario empareja** (pairing-code o QR) con el mismo número.
4. **Verificación post-emparejamiento:**
   - `GET /status` → `isReady:true`.
   - `GET /groups` → confirmar que aparecen los 2 JIDs guardados
     (`120363049206495531@g.us` lotoanimalito, `120363058911718517@g.us` pantera/triple).
     Si el número fue removido de algún grupo en estas ~6 semanas, re-agregarlo.
   - Enviar 1 mensaje de prueba a un grupo de prueba.
5. Recién entonces: `UPDATE "GameChannel" SET "isActive"=true WHERE "channelType"='WHATSAPP'`.
   Desde ahí publica automáticamente en el próximo resumen/resultado.

## 13. Riesgos

- **Membresía del número:** si fue removido de un grupo, ese JID falla hasta re-agregarlo (se detecta en paso 4).
- **Ban por automatización:** riesgo inherente a cualquier API no oficial (whatsapp-web.js o Baileys). Mitigación: delay entre envíos, un solo número, volumen moderado.
- **Re-emparejamiento:** linkear el nuevo dispositivo desloguea la sesión vieja de whatsapp-web.js (ya muerta, sin pérdida real).

## 14. Fuera de alcance

- Multi-sesión / multi-número.
- Migrar OTP u otros flujos a otra cosa (siguen usando `/send/text`, que se preserva).
- Cambios de formato de mensajes/plantillas de publicación.
