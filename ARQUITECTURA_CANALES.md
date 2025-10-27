# Arquitectura del Sistema de Canales

## Diagrama de Flujo de Publicación

```
┌─────────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARD                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Juegos     │  │  Plantillas  │  │    Items     │          │
│  │   (CRUD)     │  │    (CRUD)    │  │   (CRUD)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Canales (CRUD)                               │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │ Telegram │ │ WhatsApp │ │ Facebook │ │Instagram │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Sorteos                                      │  │
│  │  - Lista de sorteos                                       │  │
│  │  - Ver detalles                                           │  │
│  │  - Estado de publicaciones                                │  │
│  │  - Reenviar a canales                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND API                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Controllers                            │  │
│  │  - GameController                                         │  │
│  │  - ItemController                                         │  │
│  │  - TemplateController                                     │  │
│  │  - ChannelController ← PENDIENTE                          │  │
│  │  - DrawController                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     Services                              │  │
│  │  - GameService                                            │  │
│  │  - ItemService                                            │  │
│  │  - TemplateService                                        │  │
│  │  - ChannelService ← PENDIENTE                             │  │
│  │  - DrawService                                            │  │
│  │  - PublicationService ← PENDIENTE                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Integration Services                         │  │
│  │  ┌──────────────┐  ┌──────────────┐                      │  │
│  │  │   Telegram   │  │   WhatsApp   │  ← PENDIENTE         │  │
│  │  │   Service    │  │   Service    │                      │  │
│  │  └──────────────┘  └──────────────┘                      │  │
│  │  ┌──────────────┐  ┌──────────────┐                      │  │
│  │  │   Facebook   │  │  Instagram   │  ← PENDIENTE         │  │
│  │  │   Service    │  │   Service    │                      │  │
│  │  └──────────────┘  └──────────────┘                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      Jobs                                 │  │
│  │  - generate-daily-draws.job                               │  │
│  │  - close-draw.job                                         │  │
│  │  - execute-draw.job                                       │  │
│  │  - publish-draw.job ← PENDIENTE                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE (PostgreSQL)                       │
│                                                                  │
│  - Game                                                          │
│  - GameItem                                                      │
│  - DrawTemplate                                                  │
│  - Draw                                                          │
│  - ChannelConfig                                                 │
│  - DrawPublication                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Telegram   │  │   WhatsApp   │  │   Facebook   │          │
│  │   Bot API    │  │  Custom API  │  │  Graph API   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐                                               │
│  │  Instagram   │                                               │
│  │  Graph API   │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Flujo de Publicación Detallado

### 1. Configuración Inicial (Admin)

```
Admin → Configuración → Canales
  │
  ├─ Crear Canal Telegram
  │   ├─ Nombre: "Canal Principal"
  │   ├─ Bot Token: "123456:ABC..."
  │   └─ Chat ID: "-1001234567890"
  │
  ├─ Crear Canal WhatsApp
  │   ├─ Nombre: "WhatsApp Oficial"
  │   ├─ API URL: "https://api.whatsapp.com"
  │   ├─ ID: "wa_12345"
  │   └─ Token: "secret_token"
  │
  ├─ Crear Canal Facebook
  │   ├─ Nombre: "Página Facebook"
  │   ├─ Page ID: "123456789"
  │   └─ Access Token: "EAAxxxx..."
  │
  └─ Crear Canal Instagram
      ├─ Nombre: "Instagram Oficial"
      ├─ Account ID: "17841400000"
      └─ Access Token: "EAAxxxx..."

                ↓
        
Backend → ChannelService
  │
  ├─ Validar credenciales
  ├─ Encriptar config con AES-256-GCM
  └─ Guardar en ChannelConfig table

                ↓

Database → ChannelConfig
  {
    id: "uuid",
    name: "Canal Principal",
    type: "TELEGRAM",
    config: {
      encrypted: "...",
      iv: "...",
      authTag: "..."
    },
    isActive: true
  }
```

### 2. Generación de Sorteo

```
Cron Job (cada minuto)
  │
  ├─ Verifica plantillas activas
  ├─ Genera sorteos del día
  └─ Estado: SCHEDULED

                ↓

5 minutos antes de la hora
  │
  ├─ close-draw.job
  └─ Estado: CLOSED

                ↓

A la hora programada
  │
  ├─ execute-draw.job
  ├─ Selecciona ganador (random o preseleccionado)
  ├─ Genera imagen
  └─ Estado: DRAWN

                ↓

publish-draw.job ← PENDIENTE
  │
  ├─ Obtiene canales activos
  ├─ Para cada canal:
  │   ├─ Crea DrawPublication (status: PENDING)
  │   ├─ Desencripta credenciales
  │   ├─ Llama al servicio correspondiente
  │   └─ Actualiza DrawPublication
  │       ├─ SENT (exitoso)
  │       └─ FAILED (error)
  │
  └─ Estado: PUBLISHED
```

### 3. Publicación a Telegram

```
PublicationService
  │
  └─ publishToTelegram(draw, channelConfig)
      │
      ├─ Desencripta config
      │   ├─ botToken
      │   └─ chatId
      │
      ├─ TelegramService.sendPhoto()
      │   │
      │   ├─ URL: https://api.telegram.org/bot{token}/sendPhoto
      │   ├─ Method: POST
      │   ├─ Body:
      │   │   ├─ chat_id: chatId
      │   │   ├─ photo: imageUrl
      │   │   └─ caption: "Resultado: {number} - {name}"
      │   │
      │   └─ Response:
      │       ├─ Success → message_id
      │       └─ Error → error_description
      │
      └─ Actualiza DrawPublication
          ├─ status: SENT
          ├─ sentAt: now()
          └─ externalId: message_id
```

### 4. Publicación a WhatsApp

```
PublicationService
  │
  └─ publishToWhatsApp(draw, channelConfig)
      │
      ├─ Desencripta config
      │   ├─ apiUrl
      │   ├─ id
      │   └─ token
      │
      ├─ WhatsAppService.sendMessage()
      │   │
      │   ├─ URL: {apiUrl}/send
      │   ├─ Method: POST
      │   ├─ Headers:
      │   │   └─ Authorization: Bearer {token}
      │   ├─ Body:
      │   │   ├─ id: id
      │   │   ├─ message: "Resultado: {number} - {name}"
      │   │   └─ image: imageUrl
      │   │
      │   └─ Response:
      │       ├─ Success → message_id
      │       └─ Error → error_message
      │
      └─ Actualiza DrawPublication
```

### 5. Publicación a Facebook

```
PublicationService
  │
  └─ publishToFacebook(draw, channelConfig)
      │
      ├─ Desencripta config
      │   ├─ pageId
      │   └─ accessToken
      │
      ├─ FacebookService.publishPost()
      │   │
      │   ├─ URL: https://graph.facebook.com/v18.0/{pageId}/feed
      │   ├─ Method: POST
      │   ├─ Params:
      │   │   ├─ access_token: accessToken
      │   │   ├─ message: "Resultado: {number} - {name}"
      │   │   └─ link: imageUrl
      │   │
      │   └─ Response:
      │       ├─ Success → post_id
      │       └─ Error → error
      │
      └─ Actualiza DrawPublication
```

### 6. Publicación a Instagram

```
PublicationService
  │
  └─ publishToInstagram(draw, channelConfig)
      │
      ├─ Desencripta config
      │   ├─ accountId
      │   └─ accessToken
      │
      ├─ InstagramService.publishPost()
      │   │
      │   ├─ PASO 1: Crear Media Container
      │   │   ├─ URL: https://graph.facebook.com/v18.0/{accountId}/media
      │   │   ├─ Method: POST
      │   │   ├─ Params:
      │   │   │   ├─ image_url: imageUrl
      │   │   │   ├─ caption: "Resultado: {number} - {name}"
      │   │   │   └─ access_token: accessToken
      │   │   └─ Response: creation_id
      │   │
      │   ├─ PASO 2: Publicar Media Container
      │   │   ├─ URL: https://graph.facebook.com/v18.0/{accountId}/media_publish
      │   │   ├─ Method: POST
      │   │   ├─ Params:
      │   │   │   ├─ creation_id: creation_id
      │   │   │   └─ access_token: accessToken
      │   │   └─ Response: media_id
      │   │
      │   └─ Response:
      │       ├─ Success → media_id
      │       └─ Error → error
      │
      └─ Actualiza DrawPublication
```

### 7. Republicación Manual

```
Admin → Ver Detalles del Sorteo
  │
  ├─ Ve estado de publicaciones
  │   ├─ Telegram: SENT ✓
  │   ├─ WhatsApp: FAILED ✗
  │   ├─ Facebook: SENT ✓
  │   └─ Instagram: PENDING ⏳
  │
  └─ Click "Reenviar" en WhatsApp
      │
      ├─ POST /api/draws/{drawId}/republish/WHATSAPP
      │
      ├─ DrawController.republishToChannel()
      │   │
      │   ├─ Obtiene sorteo
      │   ├─ Obtiene canal WhatsApp
      │   ├─ Actualiza DrawPublication a PENDING
      │   ├─ Llama PublicationService.publishToWhatsApp()
      │   └─ Actualiza DrawPublication
      │
      └─ Frontend muestra resultado
```

## Modelo de Datos

### ChannelConfig
```javascript
{
  id: "uuid",
  name: "Canal Telegram Principal",
  type: "TELEGRAM", // TELEGRAM | WHATSAPP | FACEBOOK | INSTAGRAM
  config: {
    // Encriptado con AES-256-GCM
    encrypted: "...",
    iv: "...",
    authTag: "..."
  },
  isActive: true,
  createdAt: "2025-10-01T10:00:00Z",
  updatedAt: "2025-10-01T10:00:00Z"
}
```

### DrawPublication
```javascript
{
  id: "uuid",
  drawId: "draw-uuid",
  channel: "TELEGRAM", // TELEGRAM | WHATSAPP | FACEBOOK | INSTAGRAM
  status: "SENT", // PENDING | SENT | FAILED | SKIPPED
  sentAt: "2025-10-01T12:00:00Z",
  externalId: "telegram-message-id",
  error: null,
  retries: 0,
  createdAt: "2025-10-01T12:00:00Z",
  updatedAt: "2025-10-01T12:00:00Z"
}
```

## Seguridad

### Encriptación de Credenciales

```javascript
// Guardar
const config = {
  botToken: "123456:ABC...",
  chatId: "-1001234567890"
};

const encrypted = encrypt(JSON.stringify(config));
// {
//   encrypted: "hex-string",
//   iv: "hex-string",
//   authTag: "hex-string"
// }

// Recuperar
const decrypted = decrypt(encrypted);
const config = JSON.parse(decrypted);
// {
//   botToken: "123456:ABC...",
//   chatId: "-1001234567890"
// }
```

### Variables de Entorno

```env
# Clave de encriptación (32 bytes)
ENCRYPTION_KEY=your-32-byte-secret-key-here-change-this-in-production

# Opcional: Credenciales de prueba
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
FACEBOOK_PAGE_ID=
FACEBOOK_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
WHATSAPP_API_URL=
WHATSAPP_ID=
WHATSAPP_TOKEN=
```

## Manejo de Errores

### Estrategia de Reintentos

```javascript
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 segundos

async function publishWithRetry(draw, channel, config) {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      await publish(draw, channel, config);
      return { success: true };
    } catch (error) {
      retries++;
      
      if (retries >= MAX_RETRIES) {
        // Marcar como FAILED
        return { success: false, error: error.message };
      }
      
      // Esperar antes de reintentar
      await sleep(RETRY_DELAY * retries);
    }
  }
}
```

### Logs de Auditoría

```javascript
// Cada publicación debe registrarse
await AuditLog.create({
  userId: 'system',
  action: 'DRAW_PUBLISHED',
  entity: 'Draw',
  entityId: draw.id,
  changes: {
    channel: 'TELEGRAM',
    status: 'SENT',
    externalId: 'message-id'
  }
});
```

## Testing

### Test de Integración

```javascript
describe('Publication Service', () => {
  it('should publish to Telegram successfully', async () => {
    const draw = await createTestDraw();
    const channel = await createTestChannel('TELEGRAM');
    
    const result = await publicationService.publishToTelegram(draw, channel);
    
    expect(result.success).toBe(true);
    expect(result.externalId).toBeDefined();
  });
  
  it('should handle failed publications', async () => {
    const draw = await createTestDraw();
    const channel = await createInvalidChannel('TELEGRAM');
    
    const result = await publicationService.publishToTelegram(draw, channel);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

## Monitoreo

### Métricas a Monitorear

- Total de publicaciones por canal
- Tasa de éxito/fallo por canal
- Tiempo promedio de publicación
- Reintentos por canal
- Canales activos/inactivos

### Dashboard de Métricas (Futuro)

```
┌─────────────────────────────────────────┐
│     Publicaciones Últimas 24h           │
├─────────────────────────────────────────┤
│ Telegram:  150 ✓ | 2 ✗ | 98.7% éxito   │
│ WhatsApp:  145 ✓ | 5 ✗ | 96.7% éxito   │
│ Facebook:  148 ✓ | 2 ✗ | 98.7% éxito   │
│ Instagram: 140 ✓ | 10 ✗ | 93.3% éxito  │
└─────────────────────────────────────────┘
```

---

**Nota:** Este documento describe la arquitectura completa del sistema de canales. El frontend está 100% implementado, el backend necesita los servicios de integración marcados como PENDIENTE.
