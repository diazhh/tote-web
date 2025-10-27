# Tareas Pendientes en el Backend

## Endpoints de Canales (CRÍTICO)

Actualmente el frontend está preparado para gestionar canales, pero faltan los endpoints en el backend.

### Archivos a Crear:

1. **`/backend/src/controllers/channel.controller.js`**
```javascript
// Controlador para gestión de canales
- getAll() - Listar todos los canales
- getById() - Obtener canal por ID
- create() - Crear nuevo canal
- update() - Actualizar canal
- delete() - Eliminar canal
- testConnection() - Probar conexión del canal
```

2. **`/backend/src/services/channel.service.js`**
```javascript
// Servicio de lógica de negocio
- Encriptar credenciales antes de guardar
- Desencriptar credenciales al leer
- Validar configuración según tipo de canal
- Probar conexión con APIs externas
```

3. **`/backend/src/routes/channel.routes.js`**
```javascript
// Rutas REST
GET    /api/channels          - Listar canales
GET    /api/channels/:id      - Obtener canal
POST   /api/channels          - Crear canal
PUT    /api/channels/:id      - Actualizar canal
DELETE /api/channels/:id      - Eliminar canal
POST   /api/channels/:id/test - Probar conexión
```

### Modelo de Datos:

Ya existe en Prisma Schema:
```prisma
model ChannelConfig {
  id          String    @id @default(uuid())
  name        String    // "Canal Telegram Principal"
  type        Channel   // TELEGRAM, WHATSAPP, FACEBOOK, INSTAGRAM
  config      Json      // Credenciales encriptadas
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@unique([type, name])
  @@index([type, isActive])
}
```

## Endpoint de Republicación

### Archivo a Modificar:

**`/backend/src/controllers/draw.controller.js`**

Agregar método:
```javascript
async republishToChannel(req, res) {
  const { id, channel } = req.params;
  // Lógica para reenviar resultado a un canal específico
  // 1. Obtener sorteo
  // 2. Verificar que tenga resultado
  // 3. Obtener configuración del canal
  // 4. Enviar a canal
  // 5. Actualizar DrawPublication
}
```

**`/backend/src/routes/draw.routes.js`**

Agregar ruta:
```javascript
POST /api/draws/:id/republish/:channel
```

## Servicios de Integración con Canales

### 1. Telegram Bot Service

**`/backend/src/services/integrations/telegram.service.js`**

```javascript
class TelegramService {
  async sendMessage(botToken, chatId, text, imageUrl) {
    // Usar Telegram Bot API
    // https://core.telegram.org/bots/api#sendphoto
  }
  
  async testConnection(botToken, chatId) {
    // Verificar que el bot tenga acceso al chat
  }
}
```

Dependencias:
```bash
npm install node-telegram-bot-api
```

### 2. Facebook Service

**`/backend/src/services/integrations/facebook.service.js`**

```javascript
class FacebookService {
  async publishPost(pageId, accessToken, message, imageUrl) {
    // Usar Facebook Graph API
    // https://developers.facebook.com/docs/graph-api/reference/page/feed
  }
  
  async testConnection(pageId, accessToken) {
    // Verificar credenciales
  }
}
```

Dependencias:
```bash
npm install axios
```

### 3. Instagram Service

**`/backend/src/services/integrations/instagram.service.js`**

```javascript
class InstagramService {
  async publishPost(accountId, accessToken, imageUrl, caption) {
    // Usar Instagram Graph API
    // https://developers.facebook.com/docs/instagram-api/guides/content-publishing
    // Proceso de 2 pasos:
    // 1. Crear media container
    // 2. Publicar media container
  }
  
  async testConnection(accountId, accessToken) {
    // Verificar credenciales
  }
}
```

### 4. WhatsApp Service

**`/backend/src/services/integrations/whatsapp.service.js`**

```javascript
class WhatsAppService {
  async sendMessage(apiUrl, id, token, message, imageUrl) {
    // Usar API personalizada del cliente
    // Formato depende de la implementación específica
  }
  
  async testConnection(apiUrl, id, token) {
    // Verificar credenciales
  }
}
```

## Servicio de Publicación Unificado

**`/backend/src/services/publication.service.js`**

```javascript
class PublicationService {
  constructor() {
    this.telegram = new TelegramService();
    this.facebook = new FacebookService();
    this.instagram = new InstagramService();
    this.whatsapp = new WhatsAppService();
  }
  
  async publishDraw(draw) {
    // 1. Obtener canales activos
    // 2. Para cada canal, crear DrawPublication
    // 3. Enviar a cada canal
    // 4. Actualizar estado de DrawPublication
  }
  
  async republishToChannel(draw, channel) {
    // Reenviar a un canal específico
  }
}
```

## Job de Publicación Automática

**`/backend/src/jobs/publish-draw.job.js`**

```javascript
// Job que se ejecuta cuando un sorteo pasa a estado DRAWN
// Automáticamente publica a todos los canales activos

async function publishDrawJob(drawId) {
  // 1. Obtener sorteo
  // 2. Verificar que tenga imagen generada
  // 3. Llamar a PublicationService.publishDraw()
  // 4. Actualizar estado del sorteo a PUBLISHED
}
```

## Encriptación de Credenciales

**`/backend/src/lib/encryption.js`**

```javascript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.ENCRYPTION_KEY; // 32 bytes

export function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export function decrypt(encryptedData) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    SECRET_KEY,
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

Agregar a `.env`:
```
ENCRYPTION_KEY=your-32-byte-secret-key-here-change-this
```

## Modificaciones al Job de Execute Draw

**`/backend/src/jobs/execute-draw.job.js`**

Después de seleccionar ganador y generar imagen:

```javascript
// Al final del job, después de actualizar el sorteo a DRAWN
// Llamar al job de publicación
await publishDrawJob(draw.id);
```

## Variables de Entorno Adicionales

Agregar a `/backend/.env`:

```env
# Encriptación
ENCRYPTION_KEY=generate-a-32-byte-key-here

# Telegram (opcional, para testing)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Facebook (opcional, para testing)
FACEBOOK_PAGE_ID=
FACEBOOK_ACCESS_TOKEN=

# Instagram (opcional, para testing)
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=

# WhatsApp (opcional, para testing)
WHATSAPP_API_URL=
WHATSAPP_ID=
WHATSAPP_TOKEN=
```

## Orden de Implementación Recomendado

1. ✅ **Encriptación** - Implementar primero para seguridad
2. ✅ **Endpoints de Canales** - CRUD básico
3. ✅ **Servicio de Telegram** - Más simple de implementar
4. ✅ **Servicio de WhatsApp** - API personalizada
5. ✅ **Servicio de Facebook** - Requiere configuración
6. ✅ **Servicio de Instagram** - Más complejo (2 pasos)
7. ✅ **Servicio de Publicación Unificado**
8. ✅ **Job de Publicación Automática**
9. ✅ **Endpoint de Republicación**
10. ✅ **Testing completo**

## Testing

### Test de Canales:

```javascript
// /backend/src/tests/channels.test.js

describe('Channel Management', () => {
  it('should create a Telegram channel', async () => {
    // Test crear canal
  });
  
  it('should encrypt credentials', async () => {
    // Test encriptación
  });
  
  it('should test Telegram connection', async () => {
    // Test conexión
  });
});
```

### Test de Publicación:

```javascript
// /backend/src/tests/publication.test.js

describe('Publication Service', () => {
  it('should publish to Telegram', async () => {
    // Test publicación
  });
  
  it('should handle failed publications', async () => {
    // Test manejo de errores
  });
  
  it('should republish to specific channel', async () => {
    // Test republicación
  });
});
```

## Documentación de APIs Externas

### Telegram Bot API
- Documentación: https://core.telegram.org/bots/api
- Método principal: `sendPhoto`
- Autenticación: Bot Token en URL

### Facebook Graph API
- Documentación: https://developers.facebook.com/docs/graph-api
- Endpoint: `/{page-id}/feed`
- Autenticación: Page Access Token

### Instagram Graph API
- Documentación: https://developers.facebook.com/docs/instagram-api
- Proceso de 2 pasos para publicar
- Requiere cuenta Business vinculada a Facebook

### WhatsApp
- API personalizada del cliente
- Especificaciones a definir según implementación

## Notas de Seguridad

1. **Nunca** guardar credenciales en texto plano
2. Usar encriptación AES-256-GCM
3. Rotar claves de encriptación periódicamente
4. Limitar intentos de conexión fallidos
5. Implementar rate limiting en endpoints de publicación
6. Validar tokens antes de guardar
7. Implementar logs de auditoría para publicaciones
8. Usar HTTPS para todas las comunicaciones

## Estimación de Tiempo

- Encriptación: 2 horas
- Endpoints de Canales: 4 horas
- Servicio Telegram: 3 horas
- Servicio WhatsApp: 2 horas
- Servicio Facebook: 4 horas
- Servicio Instagram: 6 horas
- Servicio Unificado: 3 horas
- Jobs de Publicación: 3 horas
- Testing: 4 horas
- **Total estimado: 31 horas**
