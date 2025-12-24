# ✅ Checklist de Tareas - Mejoras Sistema

## 🎯 FASE 1: Canales de Distribución

### Backend - Core
- [ ] `backend/src/services/channel-config.service.js` - Servicio unificado canales
- [ ] `backend/src/services/test-image-generator.service.js` - Generador imagen prueba
- [ ] `backend/src/controllers/channel.controller.js` - Endpoints toggle/test

### WhatsApp (Baileys)
- [ ] `backend/src/services/whatsapp-baileys.service.js` - Mejoras test y validación
- [ ] `backend/src/routes/whatsapp.routes.js` - Endpoint test
- [ ] `frontend/app/admin/whatsapp/page.js` - UI QR + toggle + test
- [ ] ✅ Test cURL: Crear instancia, obtener QR, test envío

### Telegram
- [ ] `backend/src/services/telegram.service.js` - Método sendTestPhoto
- [ ] `backend/src/routes/telegram.routes.js` - Endpoint test
- [ ] `frontend/app/admin/telegram/page.js` - UI toggle + test
- [ ] ✅ Test cURL: Crear instancia, test envío

### Facebook
- [ ] `backend/src/services/facebook.service.js` - Método sendTestPhoto
- [ ] `backend/src/routes/facebook.routes.js` - Endpoint test
- [ ] `frontend/app/admin/facebook/page.js` - UI toggle + test
- [ ] ✅ Test cURL: Crear instancia, test envío

### Instagram
- [ ] `backend/src/services/instagram.service.js` - Método sendTestPhoto
- [ ] `backend/src/routes/instagram.routes.js` - Endpoint test
- [ ] `frontend/app/admin/instagram/page.js` - UI toggle + test + refresh token
- [ ] ✅ Test cURL: OAuth, test envío

### Configuración por Juego
- [ ] `frontend/app/admin/juegos/page.js` - Config canales multi-instancia

---

## 🎯 FASE 2: Gestión Manual Sorteos

### Backend
- [ ] `backend/src/controllers/draw.controller.js` - POST /api/draws/:id/force-totalize
- [ ] `backend/src/controllers/draw.controller.js` - POST /api/draws/:id/regenerate-image
- [ ] `backend/src/controllers/draw.controller.js` - POST /api/draws/:id/republish
- [ ] `backend/src/services/ticket-status.service.js` - updateTicketStatusesForDraw
- [ ] `backend/src/services/draw.service.js` - Integrar actualización status tickets
- [ ] ✅ Test cURL: Totalizar, regenerar, reenviar

### Frontend
- [ ] `frontend/app/admin/sorteos/page.js` - Botones acción manual
- [ ] `frontend/app/admin/sorteos/page.js` - Modal confirmación totalizar
- [ ] `frontend/app/admin/sorteos/page.js` - Modal selección canales reenvío

---

## 🎯 FASE 3: Tickets - Paginación y Filtros

### Backend
- [ ] `backend/src/controllers/ticket.controller.js` - Paginación en GET /api/tickets
- [ ] `backend/src/controllers/ticket.controller.js` - Filtros avanzados
- [ ] ✅ Test cURL: Paginación, filtros, ordenamiento

### Frontend
- [ ] `frontend/app/admin/tickets/page.js` - Controles paginación
- [ ] `frontend/app/admin/tickets/page.js` - Filtros header (juego, sorteo, estado, fecha, monto)
- [ ] `frontend/app/admin/tickets/page.js` - Select ordenamiento
- [ ] `frontend/app/admin/tickets/page.js` - URL query params

---

## 🎯 FASE 4: Monitor - Mejoras

### Ordenamiento Números
- [ ] `backend/src/services/monitor.service.js` - Ordenar números ASC
- [ ] `frontend/app/admin/monitor/page.js` - Verificar orden números

### Alertas Riesgo Tripletas
- [ ] `backend/src/services/triplet-risk.service.js` - analyzeRiskForDraw
- [ ] `backend/src/controllers/draw.controller.js` - GET /api/draws/:id/triplet-risk
- [ ] `frontend/app/admin/monitor/page.js` - Alerta riesgo tripletas
- [ ] `frontend/app/admin/monitor/page.js` - Resaltar números riesgo
- [ ] ✅ Test cURL: Endpoint riesgo tripletas

---

## 🎯 FASE 5: Modales Unificados

### Modal Ticket
- [ ] `frontend/components/modals/TicketDetailModal.js` - Componente nuevo
- [ ] Diseño: Info ticket, agrupación por sorteo/juego
- [ ] Mostrar: Juego, fecha, hora, estado sorteo por grupo
- [ ] Mostrar: Detalles con estados individuales
- [ ] Colores consistentes (verde/gris/azul)

### Modal Tripleta
- [ ] `frontend/components/modals/TripletaDetailModal.js` - Componente nuevo
- [ ] `backend/src/services/tripleta.service.js` - getDrawsForTripleta
- [ ] `backend/src/controllers/tripleta.controller.js` - GET /api/tripletas/:id (mejorado)
- [ ] Diseño: Info tripleta, 3 números
- [ ] **Contador sorteos: X/Y** (completados/total)
- [ ] Historial sorteos con números resaltados
- [ ] Barra de progreso
- [ ] ✅ Test cURL: Endpoint tripleta detalle

### Integración
- [ ] `frontend/app/admin/jugadores/[id]/page.js` - Usar modal unificado
- [ ] `frontend/app/admin/tickets/page.js` - Usar modal unificado
- [ ] `frontend/app/admin/monitor/page.js` - Usar modales unificados

---

## 🎯 FASE 6: Reportes PDF Administradores

### Backend
- [ ] `backend/src/services/admin-report-pdf.service.js` - Generador PDF mejorado
- [ ] Secciones: Resumen, Top números, Estadísticas, Tripletas
- [ ] Secciones: Preselección, Tickets ganadores, Publicaciones
- [ ] `backend/src/services/admin-notification.service.js` - Envío PDF + mensaje
- [ ] Mensaje Telegram mejorado con emojis y resumen
- [ ] ✅ Test: Generar PDF real y verificar contenido

---

## 🎯 FASE 7: Testing Integral

### Scripts de Testing
- [ ] `backend/tests/manual/test-endpoints.sh` - Script cURL completo
- [ ] Tests: Auth, Canales, Sorteos, Tickets, Tripletas, Monitor
- [ ] Documentar respuestas esperadas

### Base de Datos
- [ ] Script backup: `pg_dump tote_db > backup_$(date +%Y%m%d_%H%M%S).sql`
- [ ] Validar migraciones Prisma
- [ ] Agregar índices para performance

### Frontend Manual
- [ ] Probar todas las páginas modificadas
- [ ] Validar responsive (móvil, tablet, desktop)
- [ ] Validar manejo de errores
- [ ] Validar loading states

---

## 🎯 FASE 8: Documentación

- [ ] `docs/CANALES_DISTRIBUCION.md` - Guía configuración canales
- [ ] `docs/API_ENDPOINTS.md` - Actualizar con nuevos endpoints
- [ ] `docs/MANUAL_USUARIO_ADMIN.md` - Manual usuario final
- [ ] Screenshots de cada sección

---

## 📊 Progress Tracker

**Total Tareas:** 80
**Completadas:** 0
**Progreso:** 0%

### Por Fase
- FASE 1: 0/17 (0%)
- FASE 2: 0/9 (0%)
- FASE 3: 0/7 (0%)
- FASE 4: 0/5 (0%)
- FASE 5: 0/13 (0%)
- FASE 6: 0/6 (0%)
- FASE 7: 0/9 (0%)
- FASE 8: 0/4 (0%)

---

## 🚀 Inicio Rápido

### Hoy empezar con:
1. [ ] Crear servicio `test-image-generator.service.js`
2. [ ] Crear servicio `channel-config.service.js`
3. [ ] Agregar endpoints en `channel.controller.js`
4. [ ] Probar con cURL

### Comandos útiles:
```bash
# Autenticación
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Guardar token
TOKEN="tu_token_aqui"

# Probar endpoint (ejemplo)
curl -X GET http://localhost:5000/api/channels \
  -H "Authorization: Bearer $TOKEN"
```

---

**Última actualización:** 2025-12-24
**Estado:** ⏳ Pendiente de inicio
