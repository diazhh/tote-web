# Configuración Multi-Plataforma de Canales

Este documento describe cómo configurar y usar las instancias de múltiples plataformas (WhatsApp, Telegram, Instagram, Facebook, TikTok) para el envío de resultados de sorteos.

## Plataformas Soportadas

### 1. WhatsApp (Baileys)
- **Tipo**: Conexión directa usando Baileys
- **Autenticación**: Código QR
- **Funcionalidades**: Envío de mensajes, imágenes, verificación de números

### 2. Telegram Bot API
- **Tipo**: Bot API oficial
- **Autenticación**: Bot Token de @BotFather
- **Funcionalidades**: Envío de mensajes, imágenes, webhooks

### 3. Instagram Basic Display API
- **Tipo**: OAuth 2.0
- **Autenticación**: Facebook App ID/Secret + OAuth
- **Funcionalidades**: Acceso a perfil y media (solo lectura)

### 4. Facebook Messenger API
- **Tipo**: Page Access Token
- **Autenticación**: Page Access Token + App Secret
- **Funcionalidades**: Envío de mensajes, imágenes, webhooks

### 5. TikTok for Business API
- **Tipo**: OAuth 2.0
- **Autenticación**: Client Key/Secret + OAuth
- **Funcionalidades**: Acceso a perfil y videos (solo lectura)

## Configuración por Plataforma

### WhatsApp (Baileys)

#### Requisitos
- Número de teléfono dedicado
- Dispositivo para escanear código QR

#### Configuración
1. Ir a **Admin → Canales → WhatsApp**
2. Crear nueva instancia
3. Escanear código QR con WhatsApp
4. Configurar destinatarios

#### Parámetros
- `instanceId`: Identificador único
- `name`: Nombre descriptivo
- `recipients`: Lista de números de teléfono

### Telegram Bot

#### Requisitos
- Cuenta de Telegram
- Bot creado con @BotFather

#### Configuración
1. Crear bot con @BotFather: `/newbot`
2. Obtener Bot Token
3. Ir a **Admin → Canales → Telegram**
4. Crear nueva instancia con el token

#### Parámetros
- `instanceId`: Identificador único
- `name`: Nombre descriptivo
- `botToken`: Token del bot (de @BotFather)
- `chatId`: ID del chat/canal (opcional)
- `webhookUrl`: URL del webhook (opcional)

#### Obtener Chat ID
```bash
# Enviar mensaje al bot y obtener chat ID
curl https://api.telegram.org/bot<TOKEN>/getUpdates
```

### Instagram Basic Display API

#### Requisitos
- Cuenta de Facebook Developer
- App de Facebook configurada
- Instagram Business/Creator Account

#### Configuración
1. Crear app en [developers.facebook.com](https://developers.facebook.com)
2. Agregar producto "Instagram Basic Display"
3. Configurar OAuth redirect URI
4. Ir a **Admin → Canales → Instagram**
5. Crear instancia y autorizar

#### Parámetros
- `instanceId`: Identificador único
- `name`: Nombre descriptivo
- `appId`: Facebook App ID
- `appSecret`: Facebook App Secret
- `redirectUri`: URI de redirección OAuth

#### URLs de Configuración
- **Redirect URI**: `https://tu-dominio.com/auth/instagram/callback`
- **Deauthorize URL**: `https://tu-dominio.com/auth/instagram/deauthorize`
- **Data Deletion URL**: `https://tu-dominio.com/auth/instagram/delete`

### Facebook Messenger API

#### Requisitos
- Página de Facebook
- App de Facebook Developer
- Page Access Token

#### Configuración
1. Crear app en [developers.facebook.com](https://developers.facebook.com)
2. Agregar producto "Messenger"
3. Generar Page Access Token
4. Configurar webhooks
5. Ir a **Admin → Canales → Facebook**
6. Crear instancia

#### Parámetros
- `instanceId`: Identificador único
- `name`: Nombre descriptivo
- `pageAccessToken`: Token de acceso de la página
- `appSecret`: App Secret de Facebook
- `webhookToken`: Token de verificación del webhook
- `pageId`: ID de la página de Facebook

#### Webhook Configuration
- **Webhook URL**: `https://tu-dominio.com/api/facebook/instances/{instanceId}/webhook`
- **Verify Token**: Token personalizado para verificación

### TikTok for Business API

#### Requisitos
- Cuenta de TikTok for Business
- App registrada en TikTok Developers

#### Configuración
1. Registrar app en [developers.tiktok.com](https://developers.tiktok.com)
2. Obtener Client Key y Client Secret
3. Configurar redirect URI
4. Ir a **Admin → Canales → TikTok**
5. Crear instancia y autorizar

#### Parámetros
- `instanceId`: Identificador único
- `name`: Nombre descriptivo
- `clientKey`: TikTok Client Key
- `clientSecret`: TikTok Client Secret
- `redirectUri`: URI de redirección OAuth

#### Scopes Requeridos
- `user.info.basic`: Información básica del usuario
- `video.list`: Lista de videos del usuario

## Configuración de Canales por Juego

### Asociar Instancias a Juegos

1. Ir a **Admin → Juegos**
2. Seleccionar un juego
3. Ir a la pestaña "Canales"
4. Agregar canal y seleccionar:
   - **Tipo de canal**: WhatsApp, Telegram, Instagram, Facebook, TikTok
   - **Instancia**: Seleccionar instancia configurada
   - **Plantilla de mensaje**: Personalizar mensaje
   - **Destinatarios**: Lista específica (si aplica)

### Plantillas de Mensaje

Las plantillas usan sintaxis Mustache:

```mustache
🎰 *{{gameName}}*

⏰ Hora: {{time}}
🎯 Resultado: *{{winnerNumber}}*
🏆 {{winnerName}}

✨ ¡Buena suerte en el próximo sorteo!
```

#### Variables Disponibles
- `{{gameName}}`: Nombre del juego
- `{{time}}`: Hora del sorteo
- `{{winnerNumber}}`: Número ganador
- `{{winnerName}}`: Nombre del número ganador
- `{{imageUrl}}`: URL de la imagen generada

## Estructura de Base de Datos

### Nuevas Tablas

#### TelegramInstance
```sql
- id: UUID
- instanceId: String (único)
- name: String
- botToken: String
- chatId: String (opcional)
- webhookUrl: String (opcional)
- status: PlatformStatus
- connectedAt: DateTime
- lastSeen: DateTime
- config: JSON
- isActive: Boolean
```

#### InstagramInstance
```sql
- id: UUID
- instanceId: String (único)
- name: String
- appId: String
- appSecret: String (encriptado)
- accessToken: String
- refreshToken: String
- tokenExpiresAt: DateTime
- userId: String
- username: String
- status: PlatformStatus
```

#### FacebookInstance
```sql
- id: UUID
- instanceId: String (único)
- name: String
- pageAccessToken: String (encriptado)
- appSecret: String (encriptado)
- webhookToken: String
- pageId: String
- pageName: String
- status: PlatformStatus
```

#### TikTokInstance
```sql
- id: UUID
- instanceId: String (único)
- name: String
- clientKey: String
- clientSecret: String (encriptado)
- accessToken: String
- refreshToken: String
- tokenExpiresAt: DateTime
- refreshExpiresAt: DateTime
- openId: String
- scope: String
- status: PlatformStatus
```

### GameChannel Actualizado
```sql
- whatsappInstanceId: String (referencia a WhatsAppInstance)
- telegramInstanceId: String (referencia a TelegramInstance)
- instagramInstanceId: String (referencia a InstagramInstance)
- facebookInstanceId: String (referencia a FacebookInstance)
- tiktokInstanceId: String (referencia a TikTokInstance)
```

## API Endpoints

### Telegram
- `POST /api/telegram/instances` - Crear instancia
- `GET /api/telegram/instances` - Listar instancias
- `POST /api/telegram/instances/:id/send-message` - Enviar mensaje
- `POST /api/telegram/instances/:id/test` - Probar conexión

### Instagram
- `POST /api/instagram/instances` - Crear instancia
- `POST /api/instagram/instances/:id/authorize` - Autorizar OAuth
- `GET /api/instagram/instances/:id/media` - Obtener media
- `POST /api/instagram/instances/:id/refresh-token` - Refrescar token

### Facebook
- `POST /api/facebook/instances` - Crear instancia
- `POST /api/facebook/instances/:id/send-message` - Enviar mensaje
- `GET /api/facebook/instances/:id/webhook` - Verificar webhook
- `POST /api/facebook/instances/:id/webhook` - Procesar webhook

### TikTok
- `POST /api/tiktok/instances` - Crear instancia
- `POST /api/tiktok/instances/:id/authorize` - Autorizar OAuth
- `GET /api/tiktok/instances/:id/videos` - Obtener videos
- `POST /api/tiktok/instances/:id/refresh-token` - Refrescar token

## Seguridad

### Encriptación
- Todos los tokens y secrets se almacenan encriptados en base64
- En producción, usar librerías de encriptación robustas (AES-256)

### Webhooks
- Verificación de firmas para Facebook
- Tokens de verificación para Telegram
- HTTPS obligatorio para todos los webhooks

### Tokens
- Rotación automática de tokens cuando sea posible
- Monitoreo de expiración de tokens
- Logs de acceso y errores

## Monitoreo y Logs

### Estados de Instancias
- `CONNECTING`: Iniciando conexión
- `CONNECTED`: Conectado y activo
- `DISCONNECTED`: Desconectado
- `ERROR`: Error de conexión
- `EXPIRED`: Token expirado (OAuth)

### Logs
- Conexiones y desconexiones
- Envío de mensajes
- Errores de API
- Renovación de tokens

## Troubleshooting

### Problemas Comunes

#### WhatsApp
- **QR no aparece**: Reinicializar instancia
- **Desconexión frecuente**: Verificar conexión a internet
- **Número bloqueado**: Usar número diferente

#### Telegram
- **Bot no responde**: Verificar token
- **Webhook falla**: Verificar URL y certificado SSL
- **Chat ID incorrecto**: Usar getUpdates para obtener ID

#### Instagram
- **Token expirado**: Usar refresh token
- **App en modo desarrollo**: Solicitar revisión de Facebook
- **Permisos insuficientes**: Verificar scopes

#### Facebook
- **Webhook no verifica**: Verificar verify token
- **Página no autorizada**: Verificar permisos de página
- **Token inválido**: Regenerar Page Access Token

#### TikTok
- **OAuth falla**: Verificar redirect URI
- **API limitada**: Verificar límites de rate limiting
- **Permisos denegados**: Verificar scopes solicitados

## Próximos Pasos

1. **Implementar persistencia similar a WhatsApp** para otras plataformas
2. **Agregar más funcionalidades** (envío de videos, stickers, etc.)
3. **Implementar analytics** de envíos por plataforma
4. **Agregar más plataformas** (Discord, Twitter, etc.)
5. **Mejorar seguridad** con encriptación avanzada
6. **Implementar rate limiting** por plataforma
7. **Agregar templates avanzados** con condicionales
8. **Implementar A/B testing** de mensajes
