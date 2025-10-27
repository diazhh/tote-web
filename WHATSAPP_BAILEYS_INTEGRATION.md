# Integración de WhatsApp con Baileys

## Descripción

Este documento describe la integración de WhatsApp usando [Baileys](https://baileys.wiki/docs/intro/), una biblioteca de código abierto que permite conectar WhatsApp Web sin necesidad de la API oficial de Meta.

## Características

- ✅ **Multi-instancia**: Soporta múltiples cuentas de WhatsApp simultáneamente
- ✅ **Escaneo QR**: Interfaz para escanear código QR desde el backend
- ✅ **Reconexión automática**: Reconecta automáticamente si se pierde la conexión
- ✅ **Envío de mensajes**: Texto e imágenes con caption
- ✅ **Gestión de sesiones**: Persistencia de sesiones en disco
- ✅ **Publicación de sorteos**: Integrado con el sistema de publicaciones

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Gestión de Instancias WhatsApp               │  │
│  │  - Crear instancia                                   │  │
│  │  - Escanear QR                                       │  │
│  │  - Ver estado                                        │  │
│  │  - Desconectar/Eliminar                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND API                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         WhatsApp Baileys Controller                  │  │
│  │  /api/whatsapp/instances                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         WhatsApp Baileys Service                     │  │
│  │  - initializeInstance()                              │  │
│  │  - getQRCode()                                       │  │
│  │  - publishDraw()                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Session Manager                              │  │
│  │  - Gestión de sesiones múltiples                     │  │
│  │  - Manejo de QR y conexiones                         │  │
│  │  - Envío de mensajes                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Baileys Library                              │  │
│  │  @whiskeysockets/baileys                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              WhatsApp Web (Multi-Device)                    │
└─────────────────────────────────────────────────────────────┘
```

## Instalación

Las dependencias ya están instaladas en el proyecto:

```bash
npm install @whiskeysockets/baileys qrcode-terminal pino
```

## Configuración

### 1. Estructura de Directorios

Las sesiones se almacenan en:
```
backend/storage/whatsapp-sessions/
  ├── instance-1/
  │   ├── creds.json
  │   └── ...
  ├── instance-2/
  │   ├── creds.json
  │   └── ...
```

### 2. Configuración de Canal

Para crear un canal de WhatsApp con Baileys:

```json
{
  "type": "WHATSAPP",
  "name": "WhatsApp Principal",
  "config": {
    "type": "baileys",
    "instanceId": "instance-1",
    "recipients": [
      "584121234567",
      "584129876543"
    ]
  },
  "isActive": true
}
```

**Campos:**
- `type`: Debe ser `"baileys"` para usar esta integración
- `instanceId`: Identificador único de la instancia (ej: "instance-1", "wa-canal-1")
- `recipients`: Array de números de teléfono (con código de país, sin +)

## API Endpoints

### Gestión de Instancias

#### 1. Inicializar Instancia
```http
POST /api/whatsapp/instances
Authorization: Bearer {token}
Content-Type: application/json

{
  "instanceId": "instance-1",
  "channelConfigId": "uuid-del-canal" // opcional
}
```

**Respuesta:**
```json
{
  "success": true,
  "instanceId": "instance-1",
  "status": "connecting",
  "message": "Instancia inicializada. Escanea el código QR para conectar."
}
```

#### 2. Obtener Código QR
```http
GET /api/whatsapp/instances/:instanceId/qr
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "status": "qr_ready",
  "qr": "2@...", // String del QR
  "qrImage": "data:image/png;base64,...", // Imagen base64
  "timestamp": "2025-10-03T17:00:00.000Z"
}
```

Si ya está conectado:
```json
{
  "status": "connected",
  "message": "La instancia ya está conectada",
  "phoneNumber": "584121234567"
}
```

#### 3. Obtener Estado de Instancia
```http
GET /api/whatsapp/instances/:instanceId/status
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "instanceId": "instance-1",
  "status": "connected",
  "phoneNumber": "584121234567",
  "connectedAt": "2025-10-03T17:00:00.000Z",
  "lastSeen": "2025-10-03T17:28:00.000Z",
  "hasQR": false
}
```

**Estados posibles:**
- `connecting`: Iniciando conexión
- `qr_ready`: QR generado, esperando escaneo
- `connected`: Conectado y listo
- `disconnected`: Desconectado
- `logged_out`: Usuario cerró sesión

#### 4. Listar Todas las Instancias
```http
GET /api/whatsapp/instances
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "instances": [
    {
      "instanceId": "instance-1",
      "status": "connected",
      "phoneNumber": "584121234567",
      "connectedAt": "2025-10-03T17:00:00.000Z",
      "lastSeen": "2025-10-03T17:28:00.000Z",
      "channelConfigId": "uuid-del-canal",
      "channelName": "WhatsApp Principal"
    }
  ]
}
```

#### 5. Reconectar Instancia
```http
POST /api/whatsapp/instances/:instanceId/reconnect
Authorization: Bearer {token}
```

#### 6. Desconectar Instancia
```http
POST /api/whatsapp/instances/:instanceId/disconnect
Authorization: Bearer {token}
```

#### 7. Eliminar Instancia
```http
DELETE /api/whatsapp/instances/:instanceId
Authorization: Bearer {token}
```

**Nota:** Esto elimina la instancia y todos sus datos de sesión del disco.

### Pruebas y Utilidades

#### 8. Enviar Mensaje de Prueba
```http
POST /api/whatsapp/instances/:instanceId/test
Authorization: Bearer {token}
Content-Type: application/json

{
  "phoneNumber": "584121234567",
  "message": "Mensaje de prueba"
}
```

#### 9. Verificar Número
```http
POST /api/whatsapp/instances/:instanceId/check-number
Authorization: Bearer {token}
Content-Type: application/json

{
  "phoneNumber": "584121234567"
}
```

**Respuesta:**
```json
{
  "phoneNumber": "584121234567",
  "exists": true,
  "message": "Número válido en WhatsApp"
}
```

#### 10. Limpiar Sesiones Inactivas
```http
POST /api/whatsapp/cleanup
Authorization: Bearer {token}
```

## Flujo de Uso

### 1. Crear y Conectar Instancia

```javascript
// 1. Crear canal en la base de datos
const channel = await fetch('/api/channels', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'WHATSAPP',
    name: 'WhatsApp Principal',
    config: {
      type: 'baileys',
      instanceId: 'instance-1',
      recipients: ['584121234567']
    }
  })
});

// 2. Inicializar instancia
await fetch('/api/whatsapp/instances', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    instanceId: 'instance-1',
    channelConfigId: channel.id
  })
});

// 3. Obtener QR y mostrarlo
const qrResponse = await fetch('/api/whatsapp/instances/instance-1/qr', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { qrImage } = await qrResponse.json();

// Mostrar qrImage en un <img src={qrImage} />

// 4. Polling para verificar conexión
const checkStatus = setInterval(async () => {
  const statusResponse = await fetch('/api/whatsapp/instances/instance-1/status', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { status } = await statusResponse.json();
  
  if (status === 'connected') {
    clearInterval(checkStatus);
    console.log('¡Conectado!');
  }
}, 2000);
```

### 2. Publicar Sorteo

Una vez configurado el canal, los sorteos se publican automáticamente:

```javascript
// El sistema de jobs automáticamente publica cuando un sorteo está DRAWN
// O puedes publicar manualmente:

import publicationService from './services/publication.service.js';

await publicationService.publishDraw(drawId);
```

### 3. Republicar en Canal Específico

```javascript
import publicationService from './services/publication.service.js';

await publicationService.republishToChannel(drawId, 'WHATSAPP');
```

## Formato de Mensajes

Los sorteos se publican con el siguiente formato:

```
🎰 *LOTOANIMALITO*

⏰ Hora: 08:00
🎯 Resultado: *00*
🏆 BALLENA

✨ ¡Buena suerte en el próximo sorteo!
```

Si el sorteo tiene imagen generada, se envía la imagen con este texto como caption.

## Gestión de Sesiones

### Persistencia

Las sesiones se guardan automáticamente en disco usando `useMultiFileAuthState` de Baileys. Esto permite que las instancias se reconecten automáticamente después de reiniciar el servidor.

### Reconexión Automática

El sistema maneja automáticamente:
- Desconexiones temporales
- Pérdida de conexión a internet
- Reinicio del servidor

**No se reconecta automáticamente si:**
- El usuario cierra sesión desde WhatsApp
- Se elimina la instancia manualmente

### Limpieza Automática

Las sesiones inactivas (sin conexión por más de 30 minutos) se limpian automáticamente para liberar recursos.

## Seguridad

### Autenticación

Todos los endpoints requieren autenticación JWT:

```http
Authorization: Bearer {token}
```

### Almacenamiento de Credenciales

Las credenciales de WhatsApp (creds.json) se almacenan en:
```
backend/storage/whatsapp-sessions/{instanceId}/
```

**Importante:** Este directorio debe estar en `.gitignore` y tener permisos restringidos.

### Recomendaciones

1. **No compartir sesiones**: Cada instancia debe usarse en un solo servidor
2. **Backup regular**: Hacer backup del directorio de sesiones
3. **Monitoreo**: Monitorear el estado de las instancias
4. **Límites de envío**: Respetar límites de WhatsApp para evitar baneos

## Limitaciones de WhatsApp

### Límites de Envío

WhatsApp tiene límites no documentados oficialmente:
- ~15-20 mensajes por minuto (aproximado)
- Evitar enviar a números que no te tienen guardado
- Evitar spam o mensajes masivos

### Mejores Prácticas

1. **Pausas entre mensajes**: El sistema incluye pausas de 1 segundo entre mensajes
2. **Verificar números**: Usar el endpoint de verificación antes de enviar
3. **Listas de difusión**: Considerar usar listas de difusión de WhatsApp
4. **Grupos**: Alternativamente, usar grupos de WhatsApp

## Troubleshooting

### QR no se genera

**Problema:** No aparece el QR después de inicializar.

**Solución:**
1. Verificar que la instancia se inicializó correctamente
2. Esperar unos segundos (puede tardar 5-10 segundos)
3. Verificar logs del servidor

### Instancia se desconecta constantemente

**Problema:** La instancia se desconecta cada pocos minutos.

**Solución:**
1. Verificar conexión a internet del servidor
2. Verificar que no haya otra sesión activa con el mismo número
3. Revisar logs para errores específicos

### No se envían mensajes

**Problema:** Los mensajes no llegan a los destinatarios.

**Solución:**
1. Verificar que la instancia está conectada (`status: 'connected'`)
2. Verificar formato de números (código de país sin +)
3. Verificar que los números existen en WhatsApp
4. Revisar logs para errores específicos

### Error: "This session is already open"

**Problema:** WhatsApp detecta sesión duplicada.

**Solución:**
1. Cerrar WhatsApp Web en otros dispositivos
2. Desconectar la instancia y volver a conectar
3. Si persiste, eliminar la instancia y crear una nueva

## Monitoreo

### Logs

Los logs se encuentran en:
```
backend/logs/
```

Buscar por:
- `WhatsApp` - Eventos generales
- `QR generado` - Generación de QR
- `conectado` - Conexiones exitosas
- `Error` - Errores

### Métricas Recomendadas

- Número de instancias activas
- Mensajes enviados por instancia
- Tasa de éxito/fallo de envíos
- Tiempo de conexión de instancias

## Comparación: Baileys vs API Oficial

| Característica | Baileys | API Oficial |
|---------------|---------|-------------|
| Costo | Gratis | De pago |
| Configuración | Escanear QR | Proceso de aprobación |
| Límites | No documentados | Documentados |
| Soporte | Comunidad | Meta |
| Estabilidad | Buena | Excelente |
| Riesgo de baneo | Medio | Bajo |
| Multi-instancia | ✅ | ✅ |
| Envío masivo | ⚠️ Limitado | ✅ |

## Próximos Pasos

- [ ] Implementar webhooks para mensajes entrantes
- [ ] Agregar soporte para grupos
- [ ] Implementar listas de difusión
- [ ] Agregar métricas y dashboard
- [ ] Implementar rate limiting inteligente
- [ ] Agregar soporte para archivos multimedia adicionales

## Referencias

- [Baileys Documentation](https://baileys.wiki/docs/intro/)
- [WhatsApp Multi-Device](https://faq.whatsapp.com/1324084875126592)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)

## Soporte

Para problemas o preguntas:
1. Revisar logs del servidor
2. Consultar documentación de Baileys
3. Revisar issues en GitHub de Baileys
