# Estrategia de Persistencia de Sesiones WhatsApp

## 📋 Resumen

Se ha implementado una estrategia robusta de persistencia de sesiones WhatsApp que garantiza la continuidad de las conexiones después de reiniciar el backend. El sistema ahora mantiene sincronización automática entre memoria, base de datos y archivos de sesión.

## 🏗️ Arquitectura de Persistencia

### 1. **Triple Almacenamiento**
- **Memoria**: Session Manager mantiene sesiones activas en RAM
- **Base de Datos**: PostgreSQL almacena metadatos y estados
- **Disco**: Archivos de credenciales de Baileys en `/storage/whatsapp-sessions/`

### 2. **Sincronización Automática**
- Sincronización cada 30 segundos entre memoria y BD
- Actualización inmediata en eventos de conexión/desconexión
- Detección automática de sesiones huérfanas

## 🔄 Flujo de Restauración

### Al Iniciar el Backend:

1. **Escaneo de BD**: Busca todas las instancias activas
2. **Verificación de Archivos**: Confirma existencia de `creds.json`
3. **Inicialización**: Restaura sesiones con archivos válidos
4. **Auto-Conexión**: Intenta conectar automáticamente sesiones guardadas
5. **Limpieza**: Marca como desconectadas las instancias sin archivos

### Durante la Ejecución:

1. **Eventos en Tiempo Real**: Actualiza BD inmediatamente
2. **Sincronización Periódica**: Verifica consistencia cada 30s
3. **Detección de Huérfanos**: Identifica y limpia sesiones inconsistentes

## 📁 Estructura de Archivos

```
storage/whatsapp-sessions/
├── instanceId1/
│   ├── creds.json          # Credenciales de WhatsApp
│   ├── keys.json           # Claves de cifrado
│   └── session-info.json   # Metadatos de sesión
├── instanceId2/
│   └── ...
└── .gitkeep
```

## 🗄️ Esquema de Base de Datos

### WhatsAppInstance
```sql
- id: UUID (PK)
- instanceId: String (Unique) -- ID de la instancia
- name: String               -- Nombre descriptivo
- phoneNumber: String?       -- Número conectado
- status: WhatsAppStatus     -- CONNECTING|QR_READY|CONNECTED|DISCONNECTED|LOGGED_OUT
- qrCode: String?           -- Último QR generado
- qrGeneratedAt: DateTime?  -- Timestamp del QR
- connectedAt: DateTime?    -- Momento de conexión
- lastSeen: DateTime        -- Última actividad
- sessionData: Json?        -- Datos adicionales
- isActive: Boolean         -- Si está activa
```

## 🔧 Scripts de Gestión

### 1. **Reinicio Completo**
```bash
./restart-backend.sh
```
- Mata procesos existentes
- Limpia logs
- Inicia backend con restauración automática

### 2. **Gestión Interactiva**
```bash
cd backend && node src/scripts/whatsapp-manager.js
```
- Diagnóstico completo
- Restauración manual
- Limpieza de huérfanos
- Sincronización forzada

### 3. **Solo Matar Procesos**
```bash
./kill-backend.sh
```

## 🔄 Estados de Sesión

| Estado | Descripción | En Memoria | En BD | Archivo |
|--------|-------------|------------|-------|---------|
| `CONNECTING` | Iniciando conexión | ✅ | ✅ | ✅ |
| `QR_READY` | QR generado, esperando escaneo | ✅ | ✅ | ✅ |
| `CONNECTED` | Conectado y funcional | ✅ | ✅ | ✅ |
| `DISCONNECTED` | Desconectado temporalmente | ❌ | ✅ | ✅ |
| `LOGGED_OUT` | Sesión cerrada por usuario | ❌ | ✅ | ❌ |

## 🔄 Sincronización Automática

### Eventos que Actualizan BD Inmediatamente:
- Generación de QR
- Conexión exitosa
- Desconexión
- Logout del usuario
- Cambio de número de teléfono

### Sincronización Periódica (30s):
- Compara estados memoria vs BD
- Detecta sesiones huérfanas
- Actualiza timestamps de actividad
- Limpia QR codes obsoletos

## 🛠️ Métodos Principales

### WhatsAppBaileysService

#### `restoreSessions()`
- Restaura todas las sesiones al iniciar
- Inicializa sesiones con archivos válidos
- Marca como desconectadas las inválidas
- Inicia sincronización periódica

#### `syncSessionStates()`
- Sincroniza memoria con BD
- Detecta y corrige inconsistencias
- Limpia sesiones huérfanas

#### `updateInstanceStateInDB(instanceId, updates)`
- Actualiza estado inmediatamente en BD
- Usado en callbacks de eventos

### SessionManager

#### `createSession(instanceId, callbacks)`
- Crea nueva sesión con callbacks
- Maneja eventos de Baileys
- Persiste credenciales automáticamente

#### `getAllSessions()`
- Retorna todas las sesiones en memoria
- Usado para sincronización

## 🚨 Manejo de Errores

### Escenarios Cubiertos:
1. **Archivos corruptos**: Se eliminan y se marca como desconectado
2. **BD inconsistente**: Se sincroniza automáticamente
3. **Sesiones huérfanas**: Se detectan y limpian
4. **Procesos zombie**: Scripts de limpieza los eliminan
5. **Reconexión fallida**: Se marca como desconectado tras reintentos

## 📊 Monitoreo y Diagnóstico

### Logs Estructurados:
- `backend/logs/whatsapp.log`: Eventos específicos de WhatsApp
- `backend/logs/combined.log`: Logs generales del sistema

### Métricas Disponibles:
- Sesiones restauradas vs fallidas
- Tiempo de reconexión
- Estados de sincronización
- Detección de huérfanos

## 🔐 Seguridad

### Protección de Credenciales:
- Archivos de sesión en directorio protegido
- No se almacenan credenciales en BD
- Limpieza automática al hacer logout

### Validación:
- Verificación de integridad de archivos
- Validación de estados antes de actualizar
- Timeouts para evitar bloqueos

## 🚀 Uso Recomendado

### Para Reiniciar el Backend:
1. Ejecutar `./restart-backend.sh`
2. Verificar logs de restauración
3. Confirmar que las sesiones se conectan automáticamente

### Para Diagnóstico:
1. Ejecutar `node src/scripts/whatsapp-manager.js`
2. Opción 1: Diagnosticar estado
3. Revisar inconsistencias reportadas

### Para Limpieza:
1. Usar el gestor interactivo
2. Opción 3: Limpiar sesiones huérfanas
3. Verificar que solo quedan sesiones válidas

## ✅ Beneficios Implementados

1. **Persistencia Completa**: Las sesiones sobreviven reinicios
2. **Auto-Restauración**: Conexión automática al iniciar
3. **Sincronización**: Consistencia entre memoria y BD
4. **Limpieza Automática**: Eliminación de datos obsoletos
5. **Monitoreo**: Diagnóstico completo del estado
6. **Scripts de Gestión**: Herramientas para administración
7. **Manejo de Errores**: Recuperación automática de fallos

## 🔮 Próximos Pasos

- [ ] Implementar heartbeat para verificar conexiones activas
- [ ] Agregar métricas de rendimiento
- [ ] Implementar backup automático de sesiones críticas
- [ ] Agregar notificaciones de estado por Telegram/Email
