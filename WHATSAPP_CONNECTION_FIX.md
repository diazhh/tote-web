# Fix: Error de Conexión WhatsApp "Connection Closed"

## Problema

Al intentar vincular WhatsApp, el sistema generaba un error:

```
Error: Connection Closed
at Object.logout (baileys/lib/Socket/socket.js:330:19)
at WhatsAppSessionManager.closeSession
```

### Causa Raíz

El `session-manager.js` intentaba hacer `logout()` en conexiones que ya estaban cerradas cuando:
1. Se creaba una nueva sesión sobre una existente
2. Se intentaba reconectar automáticamente
3. La conexión se cerraba inesperadamente

## Soluciones Implementadas

### 1. Manejo Seguro de Cierre de Sesiones

**Archivo:** `backend/src/lib/whatsapp/session-manager.js`

#### Antes ❌
```javascript
async closeSession(instanceId) {
  const session = this.sessions.get(instanceId);
  if (session && session.socket) {
    await session.socket.logout(); // ❌ Falla si ya está cerrado
    session.socket.end();
  }
}
```

#### Después ✅
```javascript
async closeSession(instanceId) {
  const session = this.sessions.get(instanceId);
  if (session && session.socket) {
    try {
      // Solo hacer logout si está conectado
      if (session.status === 'connected') {
        await session.socket.logout();
      }
    } catch (logoutError) {
      logger.warn(`No se pudo hacer logout: ${logoutError.message}`);
    }
    
    try {
      session.socket.end();
    } catch (endError) {
      logger.warn(`Error al terminar socket: ${endError.message}`);
    }
  }
  
  // Siempre limpiar, incluso si hay errores
  this.sessions.delete(instanceId);
  this.qrCallbacks.delete(instanceId);
  this.connectionCallbacks.delete(instanceId);
  
  return true; // No lanzar error
}
```

### 2. Creación de Sesión sin Logout Previo

#### Antes ❌
```javascript
async createSession(instanceId, callbacks = {}) {
  if (this.sessions.has(instanceId)) {
    await this.closeSession(instanceId); // ❌ Podía fallar
  }
}
```

#### Después ✅
```javascript
async createSession(instanceId, callbacks = {}) {
  // Cerrar sesión existente sin logout
  if (this.sessions.has(instanceId)) {
    const session = this.sessions.get(instanceId);
    if (session && session.socket) {
      try {
        session.socket.end(); // Solo terminar socket
      } catch (error) {
        logger.warn(`Error al cerrar socket: ${error.message}`);
      }
    }
    this.sessions.delete(instanceId);
    this.qrCallbacks.delete(instanceId);
    this.connectionCallbacks.delete(instanceId);
  }
  // Continuar con creación...
}
```

### 3. Reconexión Automática Mejorada

#### Cambios:
- ✅ Solo reconectar en casos específicos (no en todos los errores)
- ✅ Evitar loops infinitos de reconexión
- ✅ Manejo de errores con try-catch
- ✅ Logging detallado de códigos de error

```javascript
if (connection === 'close') {
  const shouldReconnect = (lastDisconnect?.error instanceof Boom)
    ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
    : false; // ✅ false por defecto para evitar loops

  const statusCode = lastDisconnect?.error?.output?.statusCode;
  
  if (shouldReconnect && statusCode !== DisconnectReason.connectionClosed) {
    setTimeout(() => {
      this.createSession(instanceId, callbacks).catch(err => {
        logger.error(`Error en reconexión: ${err}`);
      });
    }, 5000);
  } else {
    sessionInfo.status = statusCode === DisconnectReason.loggedOut 
      ? 'logged_out' 
      : 'disconnected';
  }
}
```

### 4. Script de Limpieza

**Archivo:** `backend/src/scripts/clean-whatsapp-sessions.js`

Script para limpiar sesiones problemáticas:

```bash
node src/scripts/clean-whatsapp-sessions.js
```

Esto:
- Actualiza todas las instancias en estado `CONNECTING` o `QR_READY` a `DISCONNECTED`
- Limpia códigos QR obsoletos
- Lista directorios de sesión para diagnóstico

## Flujo Correcto Ahora

### Crear Nueva Instancia

1. ✅ Usuario crea instancia desde frontend
2. ✅ Backend crea registro en BD con estado `CONNECTING`
3. ✅ Se genera QR y actualiza a `QR_READY`
4. ✅ Usuario escanea QR en WhatsApp
5. ✅ Al conectar, actualiza a `CONNECTED` con número de teléfono
6. ✅ Sesión persiste en BD y disco

### Reconectar Instancia

1. ✅ Usuario hace clic en "Reconectar"
2. ✅ Backend cierra sesión anterior (si existe) sin errores
3. ✅ Crea nueva sesión y genera QR
4. ✅ Usuario escanea nuevo QR
5. ✅ Conexión exitosa

### Manejo de Errores

- ✅ Errores de logout no detienen el proceso
- ✅ Errores de cierre de socket se registran pero no fallan
- ✅ Reconexiones automáticas controladas
- ✅ Estado en BD siempre consistente

## Verificación

Después de los cambios:

```bash
# 1. Limpiar sesiones problemáticas
node src/scripts/clean-whatsapp-sessions.js

# 2. Reiniciar backend
npm run dev

# 3. Crear nueva instancia desde frontend
# 4. Escanear QR
# 5. Verificar conexión exitosa
```

## Archivos Modificados

- ✅ `backend/src/lib/whatsapp/session-manager.js` - Manejo robusto de errores
- ✅ `backend/src/scripts/clean-whatsapp-sessions.js` - Script de limpieza

## Prevención de Errores Futuros

1. **Nunca hacer logout en conexión cerrada**: Verificar estado antes
2. **Siempre usar try-catch**: En operaciones de socket
3. **No lanzar errores en cleanup**: Limpiar siempre, incluso con errores
4. **Logging detallado**: Para diagnóstico de problemas
5. **Reconexión controlada**: Evitar loops infinitos

## Estado Actual

✅ Backend funcionando correctamente
✅ Sesiones limpias en BD
✅ Listo para crear nuevas instancias
✅ Manejo robusto de errores implementado
