# ✅ Checklist de Tareas V2 - Estado Real del Sistema

**Actualizado:** 2025-12-24 | **Basado en:** Análisis de código existente

---

## 🎯 FASE 1: Totalización Manual de Sorteos (CRÍTICA)

### Backend
- [ ] `draw.controller.js` - Agregar método `forceTotalize()`
- [ ] `draw.controller.js` - Agregar método `regenerateImage()`
- [ ] `draw.controller.js` - Agregar método `republish()`
- [ ] `draw.routes.js` - Agregar rutas POST para los 3 endpoints
- [ ] Validar estado del sorteo antes de totalizar
- [ ] Registrar en AuditLog las acciones manuales
- [ ] ✅ Test cURL: `POST /api/draws/:id/force-totalize`
- [ ] ✅ Test cURL: `POST /api/draws/:id/regenerate-image`
- [ ] ✅ Test cURL: `POST /api/draws/:id/republish`

### Frontend
- [ ] `sorteos/page.js` - Agregar columna "Acciones" en tabla
- [ ] Botón "Totalizar" (si SCHEDULED/CLOSED y hora pasó)
- [ ] Botón "Regenerar Imagen" (si DRAWN/PUBLISHED)
- [ ] Botón "Reenviar" (si PUBLISHED)
- [ ] Modal de confirmación para totalizar
- [ ] Modal de selección de canales para reenviar

---

## 🎯 FASE 2: Status de Tickets Post-Sorteo (ALTA)

### Backend
- [ ] **CREAR** `ticket-status.service.js`
- [ ] Método `updateTicketStatusesForDraw(drawId)`
- [ ] Actualizar TicketDetail a WON/LOST
- [ ] Calcular premio: `amount * multiplier`
- [ ] Actualizar Ticket padre según detalles
- [ ] Registrar en PlayerMovement los premios
- [ ] Integrar en flujo de sorteo (execute-draw.job.js)
- [ ] ✅ Test: Verificar que tickets cambian status después de sorteo

---

## 🎯 FASE 3: Paginación de Tickets (MEDIA)

### Backend
- [ ] `ticket.controller.js` - Agregar params: page, limit, sortBy
- [ ] Agregar filtros: status, gameId, drawId, userId, dateFrom, dateTo
- [ ] Retornar metadata de paginación
- [ ] ✅ Test cURL: `GET /api/admin/tickets?page=1&limit=20&status=ACTIVE`

### Frontend
- [ ] `tickets/page.js` - Controles de paginación
- [ ] Filtros en header (juego, sorteo, estado, fecha)
- [ ] Mantener filtros en URL query params

---

## 🎯 FASE 4: Mejoras en Monitor (MEDIA)

### Ordenamiento de Números
- [ ] `monitor/page.js` - Ordenar números de menor a mayor
- [ ] Agregar `.sort((a, b) => parseInt(a.number) - parseInt(b.number))`

### Alertas de Riesgo de Tripletas
- [ ] **CREAR** `triplet-risk.service.js`
- [ ] Método `analyzeRiskForDraw(drawId)`
- [ ] `draw.controller.js` - Endpoint `GET /api/draws/:id/triplet-risk`
- [ ] `draw.routes.js` - Agregar ruta
- [ ] `monitor/page.js` - Mostrar alerta en tab "Números"
- [ ] Resaltar números de riesgo en tabla
- [ ] ✅ Test cURL: `GET /api/draws/:id/triplet-risk`

---

## 🎯 FASE 5: Contador de Sorteos en Tripleta (MEDIA)

### Backend
- [ ] `tripleta.service.js` - Método `getDrawsForTripleta(tripletaId)`
- [ ] Consultar sorteos ejecutados desde creación de tripleta
- [ ] Retornar `{ completedDraws, totalDraws, draws[], numbersMatched }`
- [ ] `tripleta.controller.js` - Incluir info en `GET /api/tripletas/:id`
- [ ] ✅ Test cURL: `GET /api/tripletas/:id` (verificar completedDraws)

### Frontend
- [ ] `TripletaDetailModal.js` - Mostrar "Sorteos: X/Y" real
- [ ] Barra de progreso visual
- [ ] Lista de sorteos con números resaltados

---

## 🎯 FASE 6: Unificación de Modales (BAJA)

- [ ] Verificar consistencia entre modales de ticket
- [ ] Mostrar juego/sorteo/hora por cada detalle
- [ ] Badge de estado por detalle (WON/LOST/ACTIVE)
- [ ] Agrupar detalles por sorteo

---

## 🎯 FASE 7: Reportes PDF Mejorados (BAJA)

- [ ] `pdf-report.service.js` - Incluir análisis similar al Monitor
- [ ] Sección de tripletas (riesgo, completadas)
- [ ] Resumen de publicaciones
- [ ] `admin-notification.service.js` - Mejorar mensaje Telegram

---

## 📊 Progress Tracker

| Fase | Tareas | Completadas | Progreso |
|------|--------|-------------|----------|
| 1 | 15 | 0 | 0% |
| 2 | 8 | 0 | 0% |
| 3 | 7 | 0 | 0% |
| 4 | 8 | 0 | 0% |
| 5 | 7 | 0 | 0% |
| 6 | 4 | 0 | 0% |
| 7 | 4 | 0 | 0% |
| **Total** | **53** | **0** | **0%** |

---

## 🚀 Comandos Rápidos

### Autenticación
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
```

### Verificar Servicios
```bash
# Backend corriendo
curl -s http://localhost:5000/api/health | jq

# Sorteos de hoy
curl -s -X GET "http://localhost:5000/api/draws/today" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'

# Instancias WhatsApp
curl -s -X GET "http://localhost:5000/api/whatsapp/instances" \
  -H "Authorization: Bearer $TOKEN" | jq '.instances | length'
```

### Iniciar Servidores
```bash
# Backend
cd backend && yarn dev

# Frontend
cd frontend && yarn dev
```

---

## ✅ Componentes YA Implementados (No Tocar)

| Componente | Estado |
|------------|--------|
| `whatsapp-baileys.service.js` | ✅ Completo |
| `telegram.service.js` | ✅ Completo |
| `facebook.service.js` | ✅ Completo |
| `instagram.service.js` | ✅ Completo |
| `channel-config.service.js` | ✅ Completo |
| `test-image-generator.service.js` | ✅ Completo |
| `publication.service.js` | ✅ Completo |
| Página WhatsApp (QR, test) | ✅ Completo |
| Página Telegram | ✅ Completo |
| Página Facebook | ✅ Completo |
| Página Instagram | ✅ Completo |
| Modelos Prisma (canales) | ✅ Completo |

---

**Estado:** ⏳ Pendiente de inicio
