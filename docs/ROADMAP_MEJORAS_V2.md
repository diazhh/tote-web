# 🚀 Roadmap de Mejoras - Sistema de Canales y Sorteos V2

## 📋 Resumen Ejecutivo

Este documento contiene un análisis **EXHAUSTIVO** del código existente, identificando qué funciona, qué NO funciona, y qué falta por implementar. Cada tarea está verificada contra el código real.

**Fecha de actualización:** 2025-12-24
**Estado:** En Desarrollo
**Prioridad:** Alta

---

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. Botón "Probar" en Canales de Juegos - NO FUNCIONA
**Archivo:** `frontend/components/admin/config/ChannelsTab.js` línea 63-66
```javascript
const handleTest = async (channel) => {
  // TODO: Implementar test de canal
  toast.info('Función de prueba en desarrollo');
};
```
**Impacto:** No se puede verificar si los canales envían correctamente.

### 2. Endpoint de Sorteos para Tripletas - NO EXISTE
**Frontend llama a:** `GET /api/tripleta/:id/draws`
**Archivo:** `frontend/components/shared/TripletaDetailModal.js` línea 30
```javascript
const drawsResponse = await axios.get(`/tripleta/${tripleta.id}/draws`);
```
**Backend:** El endpoint NO existe en `backend/src/routes/tripleta.routes.js`
**Impacto:** El contador de sorteos en el modal de tripleta siempre muestra 0/10.

### 3. Monitor NO ordena números
**Archivo:** `frontend/app/admin/monitor/page.js` línea 329
Los números se muestran en el orden que vienen del backend, no ordenados de menor a mayor.

### 4. Monitor NO tiene alertas de tripletas
**Archivo:** `frontend/app/admin/analisis-sorteo/page.js` línea 288-311 tiene la alerta.
**Archivo:** `frontend/app/admin/monitor/page.js` NO tiene la alerta.

### 5. Sorteos NO tiene totalización manual
**Archivo:** `frontend/app/admin/sorteos/page.js`
No hay botones para: Totalizar, Regenerar Imagen, Reenviar a Canales.
**Backend:** Los endpoints `force-totalize`, `regenerate-image`, `republish` NO existen.

### 6. Tickets NO tiene paginación real
**Archivo:** `frontend/app/admin/tickets/page.js`
Carga todos los tickets de una vez, filtra en frontend. No hay paginación del backend.

---

## 📊 Estado Actual del Sistema (Verificado)

### ✅ Componentes YA Implementados

#### Backend - Servicios de Canales
| Servicio | Archivo | Estado | Funcionalidades |
| WhatsApp Baileys | `whatsapp-baileys.service.js` | ✅ Completo | QR, sesiones, envío mensajes/imágenes |
| Telegram | `telegram.service.js` | ✅ Completo | Validación token, envío mensajes/fotos |
| Facebook | `facebook.service.js` | ✅ Completo | Publicación en páginas |
| Instagram | `instagram.service.js` | ✅ Completo | OAuth, publicación |
| Channel Config | `channel-config.service.js` | ✅ Completo | Toggle status, test de envío |
| Test Image | `test-image-generator.service.js` | ✅ Completo | Imagen negra 1080x1080 con texto |
| Publication | `publication.service.js` | ✅ Completo | Publicar en todos los canales |
| Admin Notification | `admin-notification.service.js` | ✅ Parcial | Notificaciones pre-ganador |

#### Frontend - Páginas de Administración
| Página | Archivo | Estado |
|--------|---------|--------|
| WhatsApp | `/admin/whatsapp/page.js` | ✅ Completo - QR, test, reconexión |
| Telegram | `/admin/telegram/page.js` | ✅ Completo |
| Facebook | `/admin/facebook/page.js` | ✅ Completo |
| Instagram | `/admin/instagram/page.js` | ✅ Completo |
| Sorteos | `/admin/sorteos/page.js` | ⚠️ Parcial - Falta totalización manual |
| Tickets | `/admin/tickets/page.js` | ⚠️ Parcial - Falta paginación |
| Monitor | `/admin/monitor/page.js` | ⚠️ Parcial - Falta ordenamiento y alertas |

#### Base de Datos (Prisma)
- ✅ `WhatsAppInstance` - Multi-instancia con QR y estados
- ✅ `TelegramInstance` - Bot tokens y webhooks
- ✅ `FacebookInstance` - Page tokens
- ✅ `InstagramInstance` - OAuth tokens
- ✅ `GameChannel` - Canales por juego con destinatarios
- ✅ `DrawPublication` - Registro de publicaciones
- ✅ `Ticket` / `TicketDetail` - Con estados WON/LOST/ACTIVE
- ✅ `TripleBet` - Tripletas con drawsCount

---

## ❌ Tareas Pendientes (Priorizadas)

### **FASE 0: Servicio de Generación Automática de Jugadas** (Prioridad: CRÍTICA)

#### 0.1. Backend - Servicio de Generación de Jugadas

**Archivo:** `backend/src/services/play-generator.service.js` (NUEVO)

**Descripción:** Servicio que genera jugadas automáticas para simular actividad de jugadores.

**Tareas:**
- [ ] Crear servicio `PlayGeneratorService` con método `generateRandomPlays()`
- [ ] Configurar parámetros: cantidad de jugadas, rango de montos, juegos activos
- [ ] Generar números aleatorios según las reglas de cada juego
- [ ] Crear tickets automáticos con usuarios de prueba o sistema
- [ ] Implementar lógica de distribución realista (evitar patrones obvios)
- [ ] Agregar logs de auditoría para jugadas generadas automáticamente

**Archivo:** `backend/src/jobs/play-generator.job.js` (NUEVO)

**Tareas:**
- [ ] Crear job cron configurable para ejecutar el generador
- [ ] Permitir configurar frecuencia (cada X minutos)
- [ ] Integrar con el sistema de jobs existente

#### 0.2. Backend - Endpoints de Configuración

**Archivo:** `backend/src/controllers/system-config.controller.js`

```javascript
// AGREGAR estos métodos:

/**
 * GET /api/system/play-generator
 * Obtener configuración del generador de jugadas
 */
async getPlayGeneratorConfig(req, res) { ... }

/**
 * PUT /api/system/play-generator
 * Actualizar configuración del generador
 * Body: { enabled, frequency, minAmount, maxAmount, playsPerRun, gameIds }
 */
async updatePlayGeneratorConfig(req, res) { ... }

/**
 * POST /api/system/play-generator/run
 * Ejecutar generador manualmente (para pruebas)
 */
async runPlayGenerator(req, res) { ... }
```

**Tareas:**
- [ ] Crear tabla `PlayGeneratorConfig` en Prisma con campos: enabled, frequency, minAmount, maxAmount, playsPerRun
- [ ] Implementar endpoints GET/PUT para configuración
- [ ] Implementar endpoint POST para ejecución manual
- [ ] Agregar validaciones de permisos (solo ADMIN)

#### 0.3. Frontend - Panel de Control del Generador

**Archivo:** `frontend/app/admin/configuracion/page.js`

**Tareas:**
- [ ] Agregar sección "Generador de Jugadas" en la página de configuración
- [ ] Toggle para activar/desactivar el servicio
- [ ] Campos de configuración:
  - Frecuencia (minutos entre ejecuciones)
  - Cantidad de jugadas por ejecución
  - Monto mínimo y máximo por jugada
  - Selección de juegos activos
- [ ] Botón "Generar Ahora" para pruebas manuales
- [ ] Indicador de estado (activo/inactivo, última ejecución)
- [ ] Estadísticas: total de jugadas generadas hoy/semana

**Componente:** `frontend/components/admin/config/PlayGeneratorConfig.js` (NUEVO)

```javascript
// Componente dedicado para la configuración del generador
export default function PlayGeneratorConfig() {
  // Estado, formulario, y lógica de actualización
}
```

#### 0.4. Base de Datos - Schema de Prisma

**Archivo:** `backend/prisma/schema.prisma`

```prisma
model PlayGeneratorConfig {
  id            String   @id @default(cuid())
  enabled       Boolean  @default(false)
  frequency     Int      @default(30) // minutos
  minAmount     Float    @default(1.0)
  maxAmount     Float    @default(100.0)
  playsPerRun   Int      @default(10)
  lastRunAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model GeneratedPlay {
  id          String   @id @default(cuid())
  ticketId    String
  ticket      Ticket   @relation(fields: [ticketId], references: [id])
  amount      Float
  gameId      String
  game        Game     @relation(fields: [gameId], references: [id])
  generatedAt DateTime @default(now())
  
  @@index([generatedAt])
  @@index([gameId])
}
```

**Tareas:**
- [ ] Agregar modelos al schema de Prisma
- [ ] Crear migración: `npx prisma migrate dev --name add_play_generator`
- [ ] Actualizar relaciones en modelos existentes (Ticket, Game)

#### 0.5. Seguridad y Auditoría

**Tareas:**
- [ ] Marcar jugadas generadas automáticamente (campo `isGenerated` en Ticket)
- [ ] Registrar en AuditLog cada ejecución del generador
- [ ] Implementar límites de seguridad (máximo de jugadas por día)
- [ ] Crear usuarios de sistema para las jugadas generadas
- [ ] Excluir jugadas generadas de reportes de ganancias reales

---

### **FASE 1: Gestión Manual de Sorteos** (Prioridad: CRÍTICA)

#### 1.1. Backend - Endpoints de Totalización Manual

**Archivo:** `backend/src/controllers/draw.controller.js`

```javascript
// AGREGAR estos métodos al controlador existente:

/**
 * POST /api/draws/:id/force-totalize
 * Totaliza manualmente un sorteo que no se ejecutó automáticamente
 */
async forceTotalize(req, res, next) { ... }

/**
 * POST /api/draws/:id/regenerate-image
 * Regenera la imagen del resultado
 */
async regenerateImage(req, res, next) { ... }

/**
 * POST /api/draws/:id/republish
 * Reenvía el sorteo a canales específicos o todos
 */
async republish(req, res, next) { ... }
```

**Archivo:** `backend/src/routes/draw.routes.js`

```javascript
// AGREGAR estas rutas:
router.post('/:id/force-totalize', drawController.forceTotalize.bind(drawController));
router.post('/:id/regenerate-image', drawController.regenerateImage.bind(drawController));
router.post('/:id/republish', drawController.republish.bind(drawController));
```

**Tareas:**
- [ ] Implementar `forceTotalize` - Ejecutar preselección + sorteo + imagen + publicación
- [ ] Implementar `regenerateImage` - Regenerar imagen con Sharp
- [ ] Implementar `republish` - Reenviar a canales seleccionados
- [ ] Agregar validaciones de estado y permisos
- [ ] Registrar en AuditLog las acciones manuales

---

#### 1.2. Frontend - Botones de Acción Manual en Sorteos

**Archivo:** `frontend/app/admin/sorteos/page.js`

**Tareas:**
- [ ] Agregar columna "Acciones" en la tabla de sorteos
- [ ] Botón "Totalizar" visible si: `status === 'SCHEDULED' || status === 'CLOSED'` y hora ya pasó
- [ ] Botón "Regenerar Imagen" visible si: `status === 'DRAWN' || status === 'PUBLISHED'`
- [ ] Botón "Reenviar" visible si: `status === 'PUBLISHED'`
- [ ] Modal de confirmación para totalizar
- [ ] Modal de selección de canales para reenviar
- [ ] Feedback visual durante operación (spinner)

---

### **FASE 2: Actualización de Status de Tickets** (Prioridad: ALTA)

#### 2.1. Backend - Servicio de Actualización de Status

**Archivo:** `backend/src/services/ticket-status.service.js` (NUEVO)

**Tareas:**
- [ ] Crear método `updateTicketStatusesForDraw(drawId)`
- [ ] Actualizar TicketDetail a WON/LOST según winnerItemId
- [ ] Calcular premio: `amount * multiplier` si ganó
- [ ] Verificar si TODOS los detalles del ticket están finalizados
- [ ] Actualizar Ticket a WON si algún detalle ganó, LOST si todos perdieron
- [ ] Registrar en PlayerMovement los premios

#### 2.2. Integración con Flujo de Sorteo

**Archivo:** `backend/src/jobs/execute-draw.job.js` (o donde se ejecute el sorteo)

**Tareas:**
- [ ] Llamar a `ticketStatusService.updateTicketStatusesForDraw(drawId)` después de ejecutar sorteo
- [ ] Llamar también después de cambiar ganador manualmente

---

### **FASE 3: Mejoras en Tickets** (Prioridad: MEDIA)

#### 3.1. Backend - Paginación y Filtros

**Archivo:** `backend/src/controllers/ticket.controller.js`

**Tareas:**
- [ ] Agregar parámetros: `page`, `limit`, `sortBy`, `sortOrder`
- [ ] Agregar filtros: `status`, `gameId`, `drawId`, `userId`, `dateFrom`, `dateTo`
- [ ] Retornar metadata: `{ data, total, page, totalPages, hasNext, hasPrev }`

#### 3.2. Frontend - Paginación y Filtros

**Archivo:** `frontend/app/admin/tickets/page.js`

**Tareas:**
- [ ] Implementar controles de paginación
- [ ] Agregar filtros en header (juego, sorteo, estado, fecha, usuario)
- [ ] Mantener filtros en URL query params

---

### **FASE 4: Mejoras en Monitor** (Prioridad: MEDIA)

#### 4.1. Ordenamiento de Números

**Archivo:** `frontend/app/admin/monitor/page.js`

**Tareas:**
- [ ] En tab "Números", ordenar de menor a mayor por número
- [ ] Agregar `.sort((a, b) => parseInt(a.number) - parseInt(b.number))` antes de renderizar

#### 4.2. Alertas de Riesgo de Tripletas

**Archivo:** `backend/src/services/triplet-risk.service.js` (NUEVO)

**Tareas:**
- [ ] Crear método `analyzeRiskForDraw(drawId)`
- [ ] Identificar tripletas con 2/3 números ya ganadores
- [ ] Calcular exposición total por número faltante
- [ ] Retornar lista de números de riesgo

**Archivo:** `backend/src/controllers/draw.controller.js`

**Tareas:**
- [ ] Agregar endpoint `GET /api/draws/:id/triplet-risk`

**Archivo:** `frontend/app/admin/monitor/page.js`

**Tareas:**
- [ ] Mostrar alerta en tab "Números" si hay riesgo
- [ ] Mensaje: "¡Atención! Hay tripletas que se completarían"
- [ ] Listar números de riesgo con exposición
- [ ] Resaltar números de riesgo en la tabla

---

### **FASE 5: Modal de Tripleta - Contador de Sorteos** (Prioridad: MEDIA)

#### 5.1. Backend - Cálculo de Sorteos Completados

**Archivo:** `backend/src/services/tripleta.service.js`

**Tareas:**
- [ ] Agregar método `getDrawsForTripleta(tripletaId)`
- [ ] Consultar sorteos del juego con `drawDate >= tripleta.createdAt` y `status = 'DRAWN'`
- [ ] Limitar a `tripleta.drawsCount`
- [ ] Indicar cuáles tuvieron alguno de los 3 números como ganador
- [ ] Retornar `{ completedDraws, totalDraws, draws[], numbersMatched }`

**Archivo:** `backend/src/controllers/tripleta.controller.js`

**Tareas:**
- [ ] Modificar `GET /api/tripletas/:id` para incluir info de sorteos

#### 5.2. Frontend - Actualizar Modal

**Archivo:** `frontend/components/shared/TripletaDetailModal.js`

**Tareas:**
- [ ] Mostrar "Sorteos: X/Y" con datos reales del backend
- [ ] Mostrar barra de progreso visual
- [ ] Listar sorteos con números ganadores resaltados

---

### **FASE 6: Unificación de Modales de Tickets** (Prioridad: BAJA)

**Archivos afectados:**
- `frontend/components/player/TicketDetailModal.js`
- `frontend/components/shared/TripletaDetailModal.js`

**Tareas:**
- [ ] Verificar que ambos modales muestran la misma información
- [ ] En detalles del ticket, mostrar juego/sorteo/hora por cada detalle
- [ ] Mostrar estado del detalle (WON/LOST/ACTIVE) con badge visual
- [ ] Agrupar detalles por sorteo si hay múltiples

---

### **FASE 7: Mejoras en Reportes PDF** (Prioridad: BAJA)

**Archivo:** `backend/src/services/pdf-report.service.js` (modificar)

**Tareas:**
- [ ] Incluir sección similar al Monitor (top números, estadísticas)
- [ ] Incluir análisis de tripletas (riesgo, completadas)
- [ ] Incluir resumen de publicaciones (canales, estados)
- [ ] Mejorar diseño visual del PDF

**Archivo:** `backend/src/services/admin-notification.service.js`

**Tareas:**
- [ ] Mejorar mensaje de Telegram con emojis y resumen
- [ ] Adjuntar PDF mejorado al mensaje

---

## 🧪 Testing con cURL

### Autenticación
```bash
# Obtener token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

echo "Token: $TOKEN"
```

### Probar Endpoints Existentes
```bash
# Listar sorteos de hoy
curl -s -X GET "http://localhost:5000/api/draws/today" \
  -H "Authorization: Bearer $TOKEN" | jq

# Listar instancias de WhatsApp
curl -s -X GET "http://localhost:5000/api/whatsapp/instances" \
  -H "Authorization: Bearer $TOKEN" | jq

# Listar canales
curl -s -X GET "http://localhost:5000/api/channels" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Probar Endpoints Nuevos (después de implementar)
```bash
# Totalizar sorteo manualmente
curl -s -X POST "http://localhost:5000/api/draws/{DRAW_ID}/force-totalize" \
  -H "Authorization: Bearer $TOKEN" | jq

# Regenerar imagen
curl -s -X POST "http://localhost:5000/api/draws/{DRAW_ID}/regenerate-image" \
  -H "Authorization: Bearer $TOKEN" | jq

# Reenviar a canales
curl -s -X POST "http://localhost:5000/api/draws/{DRAW_ID}/republish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channels": ["WHATSAPP", "TELEGRAM"]}' | jq

# Análisis de riesgo de tripletas
curl -s -X GET "http://localhost:5000/api/draws/{DRAW_ID}/triplet-risk" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 📈 Métricas de Éxito

| Funcionalidad | Criterio de Éxito |
|---------------|-------------------|
| Generador de jugadas | Genera jugadas configurables en < 5s, distribución realista |
| Panel de control generador | Toggle activa/desactiva servicio correctamente |
| Totalización manual | Sorteo pasa de SCHEDULED/CLOSED a PUBLISHED en < 30s |
| Regenerar imagen | Nueva imagen generada en < 5s |
| Reenvío a canales | 100% de canales seleccionados reciben el mensaje |
| Paginación tickets | Respuesta < 500ms con 1000+ tickets |
| Ordenamiento números | Números ordenados 00-37 correctamente |
| Alertas tripletas | Alerta visible si hay números de riesgo |
| Contador tripleta | Muestra X/Y correcto según sorteos ejecutados |

---

## 🔄 Orden de Implementación Recomendado

1. **Día 1-2:** FASE 0 - Generador de jugadas automáticas (crítico para simulación)
2. **Día 3-4:** FASE 1 - Totalización manual (crítico para operación)
3. **Día 5:** FASE 2 - Status de tickets (integridad de datos)
4. **Día 6:** FASE 4.1 - Ordenamiento números (quick win)
5. **Día 7:** FASE 5 - Contador tripleta (fix de bug reportado)
6. **Día 8-9:** FASE 3 - Paginación tickets
7. **Día 10:** FASE 4.2 - Alertas de riesgo
8. **Día 11-12:** FASE 6-7 - Modales y reportes

---

## 📝 Notas Importantes

### Sobre Facebook API
La API de Facebook para publicar en páginas requiere:
- **Page Access Token** (long-lived, 60 días)
- **Page ID** de la página
- Endpoint: `POST https://graph.facebook.com/v18.0/{page-id}/photos`

Los tokens ya están documentados en `CONFIGURACION_META_TOKENS.md`.

### Sobre Baileys
La librería `@whiskeysockets/baileys` ya está implementada correctamente:
- Sesiones persistentes en `/backend/sessions/`
- QR en base64 guardado en BD
- Reconexión automática

### Sobre Base de Datos
**IMPORTANTE:** Antes de cualquier migración:
```bash
pg_dump tote_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

**Última actualización:** 2025-12-24
**Autor:** Análisis de código existente
**Estado:** ✅ Roadmap Actualizado
