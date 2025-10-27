# Solución: Persistencia de Instancias de WhatsApp

## Problema Identificado

Las instancias de WhatsApp **no tenían persistencia en base de datos**, solo existían en memoria del servidor. Esto causaba:

1. ✗ Al refrescar la página, las instancias desaparecían
2. ✗ Al reiniciar el servidor, se perdían todas las conexiones
3. ✗ No se restauraban sesiones automáticamente
4. ✗ El estado de conexión no se sincronizaba correctamente

## Solución Implementada

### 1. Modelo de Base de Datos

Se agregó el modelo `WhatsAppInstance` al schema de Prisma:

```prisma
model WhatsAppInstance {
  id              String            @id @default(uuid())
  instanceId      String            @unique
  name            String
  phoneNumber     String?
  status          WhatsAppStatus    @default(DISCONNECTED)
  qrCode          String?
  qrGeneratedAt   DateTime?
  connectedAt     DateTime?
  lastSeen        DateTime          @default(now())
  sessionData     Json?
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum WhatsAppStatus {
  CONNECTING
  QR_READY
  CONNECTED
  DISCONNECTED
  LOGGED_OUT
}
```

### 2. Servicio Actualizado

**Archivo:** `backend/src/services/whatsapp-baileys.service.js`

#### Cambios principales:

- **`initializeInstance()`**: Ahora crea/actualiza registro en BD al inicializar
- **`listInstances()`**: Lee instancias desde BD y combina con estado en memoria
- **`disconnectInstance()`**: Actualiza estado en BD
- **`deleteInstance()`**: Hace soft delete (marca como inactiva)
- **`restoreSessions()`**: Nueva función que restaura sesiones al iniciar servidor

### 3. Restauración Automática

**Archivo:** `backend/src/index.js`

Al iniciar el servidor, se ejecuta:

```javascript
// Restaurar sesiones de WhatsApp
try {
  await whatsappBaileysService.restoreSessions();
  logger.info('✅ Sesiones de WhatsApp restauradas');
} catch (error) {
  logger.error('⚠️  Error al restaurar sesiones de WhatsApp:', error);
}
```

Esto:
- Lee instancias activas de la BD
- Verifica si existen archivos de sesión en disco
- Reconecta automáticamente las sesiones válidas
- Marca como desconectadas las que no tienen datos

### 4. Frontend Mejorado

**Archivos modificados:**
- `frontend/lib/api/whatsapp.js`: Acepta parámetro `name`
- `frontend/components/admin/whatsapp/NewInstanceModal.js`: Campo para nombre
- `frontend/app/admin/whatsapp/page.js`: Muestra nombre e instanceId

#### Mejoras en UI:

- Campo de nombre descriptivo al crear instancia
- Muestra nombre principal e ID técnico como secundario
- Persistencia completa entre recargas de página

## Flujo de Trabajo

### Crear Nueva Instancia

1. Usuario ingresa **nombre** (ej: "WhatsApp Principal") e **instanceId** (ej: "whatsapp-1")
2. Se crea registro en BD con estado `CONNECTING`
3. Se genera QR y se guarda en BD con estado `QR_READY`
4. Usuario escanea QR en WhatsApp
5. Al conectar, se actualiza BD con estado `CONNECTED` y número de teléfono
6. Datos de sesión se guardan en disco: `storage/whatsapp-sessions/{instanceId}/`

### Refrescar Página

1. Frontend consulta `/api/whatsapp/instances`
2. Backend lee instancias de BD
3. Combina con estado en memoria (si existe)
4. Devuelve lista completa con estado actualizado

### Reiniciar Servidor

1. Servidor inicia y ejecuta `restoreSessions()`
2. Lee instancias activas de BD
3. Para cada instancia, verifica archivos de sesión en disco
4. Reconecta automáticamente sesiones válidas
5. Actualiza estado en BD según resultado

## Archivos Modificados

### Backend
- ✓ `backend/prisma/schema.prisma` - Modelo WhatsAppInstance
- ✓ `backend/src/services/whatsapp-baileys.service.js` - Persistencia
- ✓ `backend/src/controllers/whatsapp-baileys.controller.js` - Parámetro name
- ✓ `backend/src/index.js` - Restauración automática

### Frontend
- ✓ `frontend/lib/api/whatsapp.js` - API actualizada
- ✓ `frontend/components/admin/whatsapp/NewInstanceModal.js` - Campo nombre
- ✓ `frontend/app/admin/whatsapp/page.js` - UI mejorada

## Ventajas

✅ **Persistencia completa**: Las instancias sobreviven a reinicios
✅ **Restauración automática**: Sesiones se reconectan al iniciar servidor
✅ **Sincronización BD-Memoria**: Estado consistente entre ambos
✅ **Mejor UX**: Nombres descriptivos + IDs técnicos
✅ **Soft delete**: No se pierden datos al eliminar
✅ **Auditoría**: Historial completo de conexiones

## Pruebas Recomendadas

1. **Crear instancia**: Verificar que aparece en BD
2. **Escanear QR**: Confirmar que se actualiza estado
3. **Refrescar página**: Instancia debe seguir visible
4. **Reiniciar backend**: Sesión debe reconectarse automáticamente
5. **Eliminar instancia**: Verificar soft delete en BD

## Notas Técnicas

- Los archivos de sesión se guardan en `backend/storage/whatsapp-sessions/{instanceId}/`
- El QR se guarda temporalmente en BD para consultas rápidas
- Estado en memoria tiene prioridad sobre BD para datos en tiempo real
- Soft delete permite recuperar instancias si es necesario
