# 🎲 Servicio de Generación Automática de Jugadas

## 📋 Descripción

El **Servicio de Generación Automática de Jugadas** es una funcionalidad que permite crear tickets de prueba de forma automática para simular actividad de jugadores en el sistema. Esto es útil para:

- Probar el sistema con datos realistas
- Simular actividad antes del lanzamiento
- Generar volumen de apuestas para pruebas de carga
- Validar el flujo completo de tickets y sorteos

---

## 🎯 Estado Actual

**⚠️ PENDIENTE DE IMPLEMENTACIÓN**

Este servicio está documentado en el roadmap pero **aún NO está implementado**. Consulta `ROADMAP_MEJORAS_V2.md` FASE 0 para ver el plan completo de implementación.

---

## 📍 Dónde se Activará (Cuando esté implementado)

### Frontend - Panel de Administración

**Ubicación:** `http://localhost:3000/admin/configuracion`

En esta página encontrarás una nueva sección llamada **"Generador de Jugadas"** con:

#### Controles Principales:
- **Toggle ON/OFF**: Activar o desactivar el servicio
- **Frecuencia**: Cada cuántos minutos se ejecuta (ej: cada 30 minutos)
- **Jugadas por ejecución**: Cantidad de tickets a generar en cada ejecución
- **Monto mínimo**: Monto mínimo por jugada (ej: 1.00 Bs)
- **Monto máximo**: Monto máximo por jugada (ej: 100.00 Bs)
- **Juegos activos**: Selección de juegos donde generar jugadas
- **Botón "Generar Ahora"**: Ejecutar manualmente para pruebas

#### Indicadores:
- Estado actual (Activo/Inactivo)
- Última ejecución
- Total de jugadas generadas hoy
- Total de jugadas generadas esta semana

---

## 🔧 Cómo Funcionará

### 1. Activación del Servicio

```bash
# En el panel de admin:
1. Ir a http://localhost:3000/admin/configuracion
2. Buscar sección "Generador de Jugadas"
3. Activar el toggle
4. Configurar parámetros deseados
5. Guardar configuración
```

### 2. Ejecución Automática

Una vez activado, el servicio:
- Se ejecutará automáticamente según la frecuencia configurada
- Generará jugadas aleatorias respetando las reglas de cada juego
- Creará tickets con usuarios de prueba
- Registrará todas las operaciones en logs de auditoría

### 3. Ejecución Manual

Para pruebas inmediatas:
```bash
# En el panel de admin:
1. Click en botón "Generar Ahora"
2. El sistema generará jugadas inmediatamente
3. Verás confirmación con cantidad de tickets creados
```

### 4. Detener el Servicio

```bash
# En el panel de admin:
1. Ir a http://localhost:3000/admin/configuracion
2. Desactivar el toggle en "Generador de Jugadas"
3. El servicio dejará de ejecutarse automáticamente
```

---

## 🔌 API Endpoints (Cuando esté implementado)

### Obtener Configuración
```bash
GET /api/system/play-generator
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "enabled": false,
    "frequency": 30,
    "minAmount": 1.0,
    "maxAmount": 100.0,
    "playsPerRun": 10,
    "lastRunAt": "2025-12-24T18:30:00Z"
  }
}
```

### Actualizar Configuración
```bash
PUT /api/system/play-generator
Authorization: Bearer {token}
Content-Type: application/json

{
  "enabled": true,
  "frequency": 30,
  "minAmount": 5.0,
  "maxAmount": 50.0,
  "playsPerRun": 20
}

Response:
{
  "success": true,
  "message": "Configuración actualizada"
}
```

### Ejecutar Manualmente
```bash
POST /api/system/play-generator/run
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "ticketsCreated": 20,
    "totalAmount": 450.50,
    "executionTime": "2.3s"
  }
}
```

---

## 🗄️ Base de Datos

### Tabla: PlayGeneratorConfig
```sql
-- Configuración del generador
id            String   @id @default(cuid())
enabled       Boolean  @default(false)
frequency     Int      @default(30)      -- minutos
minAmount     Float    @default(1.0)
maxAmount     Float    @default(100.0)
playsPerRun   Int      @default(10)
lastRunAt     DateTime?
createdAt     DateTime @default(now())
updatedAt     DateTime @updatedAt
```

### Tabla: GeneratedPlay
```sql
-- Registro de jugadas generadas
id          String   @id @default(cuid())
ticketId    String
amount      Float
gameId      String
generatedAt DateTime @default(now())
```

### Campo en Ticket
```sql
-- Marca tickets generados automáticamente
isGenerated Boolean @default(false)
```

---

## 🔒 Seguridad

### Restricciones:
- Solo usuarios con rol **ADMIN** pueden configurar el servicio
- Límite máximo de jugadas por día: **1000**
- Las jugadas generadas se marcan con `isGenerated: true`
- Se excluyen de reportes de ganancias reales
- Todas las ejecuciones se registran en AuditLog

### Usuarios de Sistema:
El servicio creará usuarios especiales para las jugadas:
- Username: `system_player_1`, `system_player_2`, etc.
- Role: `PLAYER`
- Balance: Ilimitado (no se descuenta)
- Marcados como usuarios de prueba

---

## 📊 Monitoreo

### Logs de Auditoría
Todas las ejecuciones se registran:
```javascript
{
  action: "PLAY_GENERATOR_RUN",
  userId: "admin_id",
  metadata: {
    ticketsCreated: 20,
    totalAmount: 450.50,
    executionTime: "2.3s",
    mode: "automatic" // o "manual"
  }
}
```

### Estadísticas
En el panel de configuración verás:
- Total de jugadas generadas hoy
- Total de jugadas generadas esta semana
- Promedio de monto por jugada
- Última ejecución exitosa

---

## 🚀 Implementación Pendiente

Para implementar este servicio, sigue el plan en `ROADMAP_MEJORAS_V2.md` FASE 0:

### Pasos:
1. ✅ Crear modelos en Prisma (`PlayGeneratorConfig`, `GeneratedPlay`)
2. ✅ Crear servicio `play-generator.service.js`
3. ✅ Crear job cron `play-generator.job.js`
4. ✅ Crear endpoints en `system-config.controller.js`
5. ✅ Crear componente `PlayGeneratorConfig.js` en frontend
6. ✅ Integrar en página `/admin/configuracion`
7. ✅ Agregar campo `isGenerated` a modelo Ticket
8. ✅ Crear migración de base de datos
9. ✅ Implementar auditoría y seguridad

### Tiempo estimado: 2 días

---

## 📞 Soporte

Si tienes dudas sobre la implementación, consulta:
- `ROADMAP_MEJORAS_V2.md` - Plan detallado FASE 0
- `ESTRUCTURA_PROYECTO.md` - Arquitectura del sistema
- `API_ENDPOINTS.md` - Documentación de APIs

---

**Última actualización:** 2025-12-24  
**Estado:** 📝 Documentado - ⚠️ Pendiente de implementación
