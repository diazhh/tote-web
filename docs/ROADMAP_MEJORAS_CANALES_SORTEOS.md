# 🚀 Roadmap de Mejoras - Sistema de Canales y Sorteos

## 📋 Resumen Ejecutivo

Este documento detalla las mejoras planificadas para el sistema de gestión de canales de distribución, sorteos y tickets del proyecto Tote-Web.

**Fecha de creación:** 2025-12-24
**Estado:** En Planificación
**Prioridad:** Alta

---

## 🎯 Objetivos Principales

1. **Completar y verificar configuración de canales de distribución** (WhatsApp, Telegram, Facebook, Instagram)
2. **Implementar funcionalidades de activación/desactivación y prueba de canales**
3. **Mejorar gestión manual de sorteos** (totalización manual, regeneración, reenvío)
4. **Optimizar interfaz de tickets** (paginación, filtros avanzados)
5. **Mejorar ordenamiento en monitor de números**
6. **Unificar y mejorar modales de tickets y tripletas**
7. **Implementar alertas de riesgo de tripletas en monitor**
8. **Mejorar reportes PDF enviados a administradores vía Telegram**

---

## 📊 Estado Actual del Sistema

### ✅ Componentes Completamente Implementados
- Multi-instancia de WhatsApp con Baileys (QR, sesiones, envío)
- Multi-bot de Telegram (validación, envío, webhooks)
- Facebook Messenger y Pages API
- Instagram Basic Display/Graph API con OAuth
- Sistema de GameChannel y DrawPublication
- Generación automática de imágenes y videos
- Sistema de tickets con estados y premios
- Modales de tickets bien diseñados

### ✅ Tokens de Facebook Disponibles
- **Lotoanimalito:** Page ID `137321016700627` - Token configurado
- **Loto Pantera:** Page ID `116187448076947` - Token configurado
- **Triple Pantera:** Page ID `116187448076947` - Token configurado (comparte página con Loto Pantera)
- 📄 Ver detalles completos en: `docs/CONFIGURACION_META_TOKENS.md`

### ⚠️ Componentes que Requieren Mejoras
- Páginas de configuración de canales (activar/desactivar, pruebas)
- Gestión manual de sorteos (totalización, reenvío)
- Paginación y filtros de tickets
- Ordenamiento de números en monitor
- Unificación de modales de tickets
- Sistema de status de tickets y detalles post-sorteo
- Contador de sorteos en tickets de tripleta
- Alertas de riesgo en monitor
- Reportes PDF para administradores

---

## 🗓️ Planificación de Tareas

### **FASE 1: Sistema de Canales de Distribución** (Prioridad: Alta)

#### 1.1. Backend - Servicios y Endpoints de Canales

**Archivo:** `backend/src/services/channel-config.service.js` (nuevo)

**Tareas:**
- [ ] Crear servicio unificado para gestionar configuración de canales
- [ ] Implementar método `toggleChannelStatus(channelId, isActive)`
- [ ] Implementar método `sendTestMessage(channelId, testConfig)`
- [ ] Validar que el test envíe imagen negra + texto de prueba
- [ ] Soportar destinatarios de prueba (número de teléfono o grupo)

**Archivo:** `backend/src/controllers/channel.controller.js` (modificar)

**Tareas:**
- [ ] Agregar endpoint `POST /api/channels/:id/toggle-status`
- [ ] Agregar endpoint `POST /api/channels/:id/test`
- [ ] Validar permisos de administrador
- [ ] Manejar errores y respuestas apropiadas

---

#### 1.2. Backend - Configuración de WhatsApp Baileys

**Archivo:** `backend/src/services/whatsapp-baileys.service.js` (modificar)

**Tareas:**
- [ ] Verificar que `initializeInstance()` funciona correctamente
- [ ] Verificar que `getQRCode()` retorna QR en base64
- [ ] Verificar que `sendTestMessage()` envía a números y grupos
- [ ] Agregar validación de número/grupo en formato internacional
- [ ] Implementar envío de imagen negra de prueba con texto

**Archivo:** `backend/src/routes/whatsapp.routes.js` (verificar)

**Tareas:**
- [ ] Verificar endpoint `POST /api/whatsapp/instances` para crear instancia
- [ ] Verificar endpoint `GET /api/whatsapp/instances/:id/qr` para obtener QR
- [ ] Verificar endpoint `GET /api/whatsapp/instances` para listar instancias
- [ ] Verificar endpoint `DELETE /api/whatsapp/instances/:id` para eliminar
- [ ] Agregar endpoint `POST /api/whatsapp/instances/:id/test` para pruebas

---

#### 1.3. Backend - Configuración de Telegram

**Archivo:** `backend/src/services/telegram.service.js` (modificar)

**Tareas:**
- [ ] Verificar `createInstance()` y `validateBotToken()`
- [ ] Implementar `sendTestPhoto()` con imagen negra + texto
- [ ] Validar formato de chatId (canales inician con `-100`)
- [ ] Agregar método para verificar si el bot es admin del canal

**Archivo:** `backend/src/routes/telegram.routes.js` (verificar)

**Tareas:**
- [ ] Verificar endpoint `POST /api/telegram/instances`
- [ ] Verificar endpoint `GET /api/telegram/instances`
- [ ] Agregar endpoint `POST /api/telegram/instances/:id/test`

---

#### 1.4. Backend - Configuración de Facebook

⚡ **TOKENS DISPONIBLES:** Los Page Access Tokens para los 3 juegos ya están disponibles. Ver `docs/CONFIGURACION_META_TOKENS.md`

**Archivo:** `backend/src/scripts/import-facebook-tokens.js` (NUEVO - PRIMERA PRIORIDAD)

**Tareas:**
- [ ] **Ejecutar script de importación de tokens de Facebook** (ver `CONFIGURACION_META_TOKENS.md`)
- [ ] Verificar que las instancias se crearon correctamente en BD
- [ ] Vincular cada instancia con su respectivo juego en GameChannel

**Archivo:** `backend/src/services/facebook.service.js` (modificar)

**Tareas:**
- [ ] Verificar `createInstance()` y `validatePageToken()`
- [ ] Implementar `sendTestPhoto()` con imagen negra
- [ ] Validar que `publishPhoto()` funciona correctamente
- [ ] Manejar errores de permisos de página

**Archivo:** `backend/src/routes/facebook.routes.js` (verificar)

**Tareas:**
- [ ] Verificar endpoints existentes
- [ ] Agregar endpoint `POST /api/facebook/instances/:id/test`

---

#### 1.5. Backend - Configuración de Instagram

**Archivo:** `backend/src/services/instagram.service.js` (modificar)

**Tareas:**
- [ ] Verificar flujo OAuth completo
- [ ] Implementar `sendTestPhoto()` con imagen negra
- [ ] Validar `refreshAccessToken()` funciona antes de expiración
- [ ] Agregar logs de depuración para tokens

**Archivo:** `backend/src/routes/instagram.routes.js` (verificar)

**Tareas:**
- [ ] Verificar endpoints de OAuth
- [ ] Agregar endpoint `POST /api/instagram/instances/:id/test`

---

#### 1.6. Frontend - Página de Configuración de WhatsApp

**Archivo:** `frontend/app/admin/whatsapp/page.js` (modificar)

**Tareas:**
- [ ] Implementar sección de escaneo de QR
- [ ] Mostrar QR en imagen cuando estado es `QR_READY`
- [ ] Implementar auto-refresh del QR cada 5 segundos
- [ ] Agregar toggle de activar/desactivar instancia
- [ ] Agregar botón "Probar Envío" con modal
- [ ] Modal de prueba debe permitir ingresar número/grupo
- [ ] Mostrar estado de conexión en tiempo real
- [ ] Agregar indicadores visuales (verde=conectado, amarillo=QR, rojo=desconectado)

---

#### 1.7. Frontend - Página de Configuración de Telegram

**Archivo:** `frontend/app/admin/telegram/page.js` (modificar)

**Tareas:**
- [ ] Agregar toggle de activar/desactivar instancia
- [ ] Agregar botón "Probar Envío" con modal
- [ ] Modal debe permitir ingresar chatId de canal/grupo
- [ ] Mostrar estado de validación del token
- [ ] Mostrar información del bot (username, nombre)
- [ ] Agregar instrucciones para obtener chatId

---

#### 1.8. Frontend - Página de Configuración de Facebook

**Archivo:** `frontend/app/admin/facebook/page.js` (modificar)

**Tareas:**
- [ ] Agregar toggle de activar/desactivar instancia
- [ ] Agregar botón "Probar Envío"
- [ ] Mostrar información de la página (nombre, ID)
- [ ] Validar token y mostrar expiración
- [ ] Agregar instrucciones para obtener Page Access Token

---

#### 1.9. Frontend - Página de Configuración de Instagram

**Archivo:** `frontend/app/admin/instagram/page.js` (modificar)

**Tareas:**
- [ ] Agregar toggle de activar/desactivar instancia
- [ ] Agregar botón "Probar Envío"
- [ ] Mostrar información del usuario (username, userId)
- [ ] Mostrar fecha de expiración del token
- [ ] Implementar botón "Renovar Token" que ejecute refresh
- [ ] Agregar instrucciones de OAuth

---

#### 1.10. Frontend - Configuración de Canales en Juegos

**Archivo:** `frontend/app/admin/juegos/page.js` (verificar/modificar)

**Tareas:**
- [ ] Verificar sección de configuración de canales por juego
- [ ] Permitir seleccionar múltiples instancias de cada tipo de canal
- [ ] Agregar campo de destinatarios (IDs de grupos/teléfonos/chatIds)
- [ ] Validar formato de destinatarios según tipo de canal
- [ ] Mostrar preview de mensaje con template Mustache

---

#### 1.11. Backend - Generación de Imagen de Prueba

**Archivo:** `backend/src/services/test-image-generator.service.js` (nuevo)

**Tareas:**
- [ ] Crear servicio para generar imagen negra 1080x1080
- [ ] Agregar texto centrado "PRUEBA DE ENVÍO"
- [ ] Usar Sharp para generación
- [ ] Retornar buffer o base64
- [ ] Cachear imagen para reutilizar

---

### **FASE 2: Gestión Manual de Sorteos** (Prioridad: Alta)

#### 2.1. Backend - Endpoints de Gestión Manual

**Archivo:** `backend/src/controllers/draw.controller.js` (modificar)

**Tareas:**
- [ ] Agregar endpoint `POST /api/draws/:id/force-totalize`
- [ ] Validar que el sorteo esté en estado `CLOSED` o `SCHEDULED`
- [ ] Ejecutar preselección, sorteo, generación de imagen
- [ ] Cambiar estado a `DRAWN` y luego `PUBLISHED`
- [ ] Procesar premios de tickets automáticamente
- [ ] Registrar en audit log la totalización manual

**Tareas adicionales:**
- [ ] Agregar endpoint `POST /api/draws/:id/regenerate-image`
- [ ] Validar que el sorteo ya tenga ganador
- [ ] Regenerar imagen con Sharp usando template del juego
- [ ] Actualizar campo `imageUrl` en BD
- [ ] Retornar nueva URL de imagen

**Tareas adicionales:**
- [ ] Agregar endpoint `POST /api/draws/:id/republish`
- [ ] Validar que el sorteo esté en estado `PUBLISHED`
- [ ] Permitir seleccionar canales específicos (query param `channels[]`)
- [ ] Si no se especifican canales, reenviar a todos los activos
- [ ] Crear nuevos DrawPublication con estado `PENDING`
- [ ] Ejecutar envío inmediato o agregar a cola

---

#### 2.2. Backend - Validación Post-Sorteo de Tickets

**Archivo:** `backend/src/services/ticket-status.service.js` (nuevo)

**Tareas:**
- [ ] Crear método `updateTicketStatusesForDraw(drawId)`
- [ ] Obtener todos los TicketDetail del sorteo
- [ ] Para cada detalle, verificar si el número ganó
- [ ] Actualizar estado del detalle a `WON` o `LOST`
- [ ] Para cada ticket único:
  - Verificar si TODOS sus detalles están finalizados
  - Verificar si al menos uno ganó → `WON`
  - Si ninguno ganó → `LOST`
  - Si aún tiene detalles activos → mantener `ACTIVE`
- [ ] Actualizar estado del ticket en BD
- [ ] Registrar en PlayerMovement si cambia a WON/LOST

**Tareas adicionales:**
- [ ] Llamar a este servicio desde `draw.service.js` después de ejecutar sorteo
- [ ] Llamar también después de cambiar ganador manualmente

---

#### 2.3. Frontend - Interfaz de Totalización Manual

**Archivo:** `frontend/app/admin/sorteos/page.js` (modificar)

**Tareas:**
- [ ] Agregar columna "Acciones Manuales" en tabla de sorteos
- [ ] Mostrar botón "Totalizar" si estado es `SCHEDULED` o `CLOSED` y ya pasó la hora
- [ ] Mostrar botón "Regenerar Imagen" si estado es `DRAWN` o `PUBLISHED`
- [ ] Mostrar botón "Reenviar a Canales" si estado es `PUBLISHED`
- [ ] Implementar modal de confirmación para totalizar
- [ ] Implementar modal de selección de canales para reenviar
- [ ] Mostrar spinner y feedback visual durante operación
- [ ] Actualizar tabla automáticamente después de acción

---

### **FASE 3: Mejoras en Tickets** (Prioridad: Media)

#### 3.1. Backend - Paginación y Filtros de Tickets

**Archivo:** `backend/src/controllers/ticket.controller.js` (modificar)

**Tareas:**
- [ ] Modificar endpoint `GET /api/tickets` para soportar paginación
- [ ] Agregar parámetros: `page`, `limit`, `sortBy`, `sortOrder`
- [ ] Agregar filtros: `status`, `gameId`, `drawId`, `userId`, `dateFrom`, `dateTo`
- [ ] Agregar filtro por rango de montos: `amountMin`, `amountMax`
- [ ] Retornar metadata de paginación: `total`, `page`, `totalPages`, `hasNext`, `hasPrev`
- [ ] Optimizar queries con índices apropiados

---

#### 3.2. Frontend - Tabla de Tickets con Paginación

**Archivo:** `frontend/app/admin/tickets/page.js` (modificar)

**Tareas:**
- [ ] Implementar controles de paginación (página, límite por página)
- [ ] Agregar filtros en header:
  - Select de juego
  - Select de sorteo (filtrado por juego seleccionado)
  - Select de estado
  - Input de usuario (búsqueda por nombre/teléfono)
  - Date picker de rango de fechas
  - Inputs de rango de montos
- [ ] Agregar botón "Aplicar Filtros" y "Limpiar Filtros"
- [ ] Implementar select de ordenamiento (fecha, monto, premio)
- [ ] Mostrar contador de resultados totales
- [ ] Agregar indicador de carga durante fetch
- [ ] Mantener filtros en URL query params para compartir

---

### **FASE 4: Mejoras en Monitor** (Prioridad: Media)

#### 4.1. Backend - Ordenamiento de Números

**Archivo:** `backend/src/services/monitor.service.js` (modificar)

**Tareas:**
- [ ] Modificar método que retorna números en el tab de "Números"
- [ ] Agregar ordenamiento por `number` ascendente
- [ ] Asegurar que el orden se mantiene en toda la respuesta

---

#### 4.2. Frontend - Ordenamiento en Tab de Números

**Archivo:** `frontend/app/admin/monitor/page.js` (modificar)

**Tareas:**
- [ ] Verificar que los números se ordenan de menor a mayor
- [ ] Si el backend ya lo envía ordenado, solo renderizar
- [ ] Si no, agregar `.sort((a, b) => a.number - b.number)` antes de renderizar

---

#### 4.3. Backend - Análisis de Riesgo de Tripletas

**Archivo:** `backend/src/services/triplet-risk.service.js` (nuevo)

**Tareas:**
- [ ] Crear método `analyzeRiskForDraw(drawId)`
- [ ] Obtener todas las tripletas activas del juego
- [ ] Para cada tripleta, verificar cuántos números ya salieron ganadores
- [ ] Identificar las que tienen 2/3 números ganadores
- [ ] Calcular el número faltante que completaría la tripleta
- [ ] Calcular exposición total (suma de apuestas de esas tripletas)
- [ ] Retornar lista de números de riesgo con su exposición

**Archivo:** `backend/src/controllers/draw.controller.js` (modificar)

**Tareas:**
- [ ] Agregar endpoint `GET /api/draws/:id/triplet-risk`
- [ ] Llamar al servicio de análisis
- [ ] Retornar números de riesgo y exposición

---

#### 4.4. Frontend - Alertas de Riesgo en Monitor

**Archivo:** `frontend/app/admin/monitor/page.js` (modificar)

**Tareas:**
- [ ] En el tab de "Números", mostrar alerta en la parte superior
- [ ] Mensaje: "¡Atención! Hay tripletas que se completarían"
- [ ] Listar los números de riesgo con su exposición
- [ ] Usar colores de alerta (rojo/naranja)
- [ ] Agregar icono de advertencia
- [ ] Resaltar los números de riesgo en la tabla principal

---

### **FASE 5: Unificación de Modales de Tickets** (Prioridad: Media)

#### 5.1. Frontend - Modal Unificado de Ticket

**Archivo:** `frontend/components/modals/TicketDetailModal.js` (crear nuevo)

**Tareas:**
- [ ] Crear componente modal unificado para tickets normales
- [ ] Mostrar información del ticket:
  - ID, fecha de creación, usuario
  - Monto total, premio total
  - Estado general del ticket con badge visual
- [ ] Agrupar detalles por sorteo/juego
- [ ] Para cada grupo de detalles mostrar:
  - Nombre del juego
  - Fecha y hora del sorteo
  - Estado del sorteo (PROGRAMADO, CERRADO, SORTEADO, etc.)
  - Número ganador (si ya sorteó)
- [ ] Para cada detalle individual mostrar:
  - Número jugado (con nombre si es animalito)
  - Monto apostado
  - Multiplicador
  - Premio ganado (si aplica)
  - Estado del detalle (badge: ACTIVE, WON, LOST)
- [ ] Usar colores consistentes:
  - Verde para ganadores
  - Gris para perdedores
  - Azul para activos
- [ ] Diseño responsive y scrollable

---

#### 5.2. Frontend - Modal Unificado de Tripleta

**Archivo:** `frontend/components/modals/TripletaDetailModal.js` (crear nuevo)

**Tareas:**
- [ ] Crear componente modal unificado para tripletas
- [ ] Mostrar información de la tripleta:
  - ID, fecha de creación, usuario
  - Los 3 números seleccionados (con nombres)
  - Monto apostado, multiplicador, premio potencial
  - Estado general de la tripleta
- [ ] **Implementar contador de sorteos:**
  - Mostrar "Sorteos completados: X/Y"
  - X = cantidad de sorteos ya realizados del juego desde la creación
  - Y = total de sorteos configurados para la tripleta
  - Calcular X consultando draws del juego con fecha >= tripletBet.createdAt y status DRAWN
- [ ] Mostrar historial de sorteos:
  - Lista de sorteos incluidos en la tripleta
  - Fecha, hora, número ganador de cada sorteo
  - Indicar si alguno de los 3 números salió (resaltar)
- [ ] Mostrar progreso visual (barra de progreso)
- [ ] Indicar cuántos números falta que salgan para ganar
- [ ] Si ganó, resaltar en verde
- [ ] Si expiró sin ganar, mostrar en rojo

---

#### 5.3. Backend - Cálculo de Sorteos de Tripleta

**Archivo:** `backend/src/services/tripleta.service.js` (modificar)

**Tareas:**
- [ ] Agregar método `getDrawsForTripleta(tripletaId)`
- [ ] Obtener la tripleta con sus datos (createdAt, gameId, totalDraws)
- [ ] Consultar draws del juego con:
  - `gameId = tripleta.gameId`
  - `drawDate >= tripleta.createdAt`
  - `status = 'DRAWN'`
  - Ordenar por fecha/hora
  - Limitar a `totalDraws`
- [ ] Retornar lista de sorteos con información relevante
- [ ] Indicar cuáles tuvieron alguno de los 3 números como ganador

**Tareas adicionales:**
- [ ] Modificar endpoint `GET /api/tripletas/:id` para incluir esta información
- [ ] Agregar campo calculado `completedDraws` y `totalDraws`

---

#### 5.4. Frontend - Integrar Modales Unificados

**Archivo:** `frontend/app/admin/jugadores/[id]/page.js` (modificar)

**Tareas:**
- [ ] Reemplazar modal actual de tickets con el nuevo unificado
- [ ] Asegurar que se pasa toda la información necesaria

**Archivo:** `frontend/app/admin/tickets/page.js` (modificar)

**Tareas:**
- [ ] Reemplazar modal actual con el nuevo unificado

**Archivo:** `frontend/app/admin/monitor/page.js` (modificar)

**Tareas:**
- [ ] Reemplazar modal actual con el nuevo unificado (tickets y tripletas)

---

### **FASE 6: Mejoras en Reportes para Administradores** (Prioridad: Media-Baja)

#### 6.1. Backend - Generación de PDF Mejorado

**Archivo:** `backend/src/services/admin-report-pdf.service.js` (crear nuevo)

**Tareas:**
- [ ] Crear servicio de generación de PDF para reportes de cierre
- [ ] Incluir secciones similares a Monitor y Análisis:
  - **Resumen General:**
    - Juego, fecha, hora
    - Número ganador con nombre
    - Total vendido, total premios, ganancia
  - **Top Números Vendidos:**
    - Tabla con número, nombre, cantidad de tickets, monto total
    - Top 10
  - **Estadísticas de Ventas:**
    - Gráfico de distribución de ventas por número (si es posible en PDF)
    - O tabla de distribución
  - **Tripletas:**
    - Total de tripletas activas
    - Tripletas completadas (si hay)
    - Números de riesgo (que completarían tripletas)
    - Exposición total en tripletas
  - **Preselección:**
    - Número preseleccionado vs número ganador
    - Si cambió, indicar por qué
    - Análisis de optimización (si se usó)
  - **Tickets Ganadores:**
    - Lista de tickets ganadores (top 10 por premio)
    - Usuario, monto ganado
  - **Resumen de Publicaciones:**
    - Canales a los que se envió
    - Estado de cada publicación (SENT, FAILED)
- [ ] Usar PDFKit para generación
- [ ] Diseño limpio y profesional
- [ ] Incluir logo del sistema (si existe)
- [ ] Fecha y hora de generación del reporte

---

#### 6.2. Backend - Envío de Reporte a Administradores

**Archivo:** `backend/src/services/admin-notification.service.js` (modificar)

**Tareas:**
- [ ] Modificar método de notificación de cierre de sorteo
- [ ] Generar PDF con el nuevo servicio
- [ ] Enviar PDF adjunto al mensaje de Telegram
- [ ] Mejorar mensaje de texto del Telegram:
  - Usar emojis para mejor visualización
  - Incluir resumen ejecutivo (ventas, premios, ganancia)
  - Incluir información de preselección y ganador
  - Incluir alertas (si hubo tripletas completadas)
  - Incluir estado de publicaciones
- [ ] Enviar a todos los AdminTelegramBot configurados para el juego

---

### **FASE 7: Testing y Validación** (Prioridad: Crítica)

#### 7.1. Testing de Endpoints con cURL

**Tareas:**
- [ ] Crear script de pruebas `backend/tests/manual/test-endpoints.sh`
- [ ] Incluir tests para:
  - Autenticación: `POST /api/auth/login` (admin / admin123)
  - Canales: toggle status, test de envío
  - WhatsApp: crear instancia, obtener QR, test
  - Telegram: crear instancia, validar token, test
  - Facebook: crear instancia, test
  - Instagram: crear instancia, test
  - Sorteos: totalización manual, regenerar imagen, reenviar
  - Tickets: paginación, filtros
  - Tripletas: obtener detalles con sorteos
  - Monitor: números ordenados, riesgo de tripletas
- [ ] Documentar respuestas esperadas
- [ ] Validar códigos de estado HTTP correctos

---

#### 7.2. Validación de Base de Datos

**Tareas:**
- [ ] Antes de cada migración, hacer backup:
  - `pg_dump tote_db > backup_YYYYMMDD_HHMMSS.sql`
- [ ] Validar que no se borren datos existentes
- [ ] Usar migraciones de Prisma para cambios de esquema
- [ ] Validar índices para optimizar queries de paginación y filtros

---

#### 7.3. Testing Frontend

**Tareas:**
- [ ] Probar cada página modificada manualmente
- [ ] Validar responsive design (móvil, tablet, desktop)
- [ ] Validar manejo de errores (mensajes claros al usuario)
- [ ] Validar loading states (spinners, skeleton screens)
- [ ] Validar que los modales se cierran correctamente
- [ ] Validar que los filtros se mantienen al navegar

---

### **FASE 8: Documentación** (Prioridad: Media)

#### 8.1. Documentación Técnica

**Archivo:** `docs/CANALES_DISTRIBUCION.md` (crear)

**Tareas:**
- [ ] Documentar configuración de cada canal
- [ ] Incluir instrucciones para obtener tokens/credentials
- [ ] Documentar formato de destinatarios
- [ ] Incluir ejemplos de uso
- [ ] Documentar troubleshooting común

**Archivo:** `docs/API_ENDPOINTS.md` (actualizar)

**Tareas:**
- [ ] Documentar nuevos endpoints
- [ ] Incluir ejemplos de requests/responses
- [ ] Documentar parámetros de paginación y filtros

---

#### 8.2. Documentación de Usuario

**Archivo:** `docs/MANUAL_USUARIO_ADMIN.md` (crear)

**Tareas:**
- [ ] Guía de configuración de canales
- [ ] Guía de totalización manual de sorteos
- [ ] Guía de gestión de tickets
- [ ] Guía de uso del monitor
- [ ] Screenshots de cada sección

---

## 📈 Métricas de Éxito

### Indicadores Clave (KPIs)

1. **Canales de Distribución:**
   - ✅ 100% de canales configurables vía UI
   - ✅ Test exitoso de envío en cada canal
   - ✅ Tiempo de respuesta < 2s para activar/desactivar

2. **Gestión de Sorteos:**
   - ✅ Totalización manual funcional
   - ✅ Regeneración de imagen < 5s
   - ✅ Reenvío a canales exitoso 100%

3. **Tickets:**
   - ✅ Paginación con < 500ms de respuesta
   - ✅ Filtros aplicables en < 1s
   - ✅ Estados de tickets actualizados correctamente post-sorteo

4. **Monitor:**
   - ✅ Números ordenados correctamente
   - ✅ Alertas de riesgo visibles
   - ✅ Información de tripletas precisa

5. **Modales:**
   - ✅ Información unificada y consistente
   - ✅ Contador de sorteos de tripleta funcional
   - ✅ Estados visuales claros

6. **Reportes:**
   - ✅ PDF generado con toda la información relevante
   - ✅ Envío exitoso a administradores
   - ✅ Tiempo de generación < 10s

---

## 🚧 Riesgos y Mitigaciones

### Riesgo 1: Pérdida de datos al modificar esquema de BD
**Mitigación:** Siempre hacer backup antes de migraciones. Usar migraciones de Prisma.

### Riesgo 2: Tokens de APIs expirados
**Mitigación:** Implementar refresh automático de tokens. Alertar a admins cuando falte < 7 días para expiración.

### Riesgo 3: Fallos en envío a canales durante test
**Mitigación:** Validar credenciales antes de test. Mostrar errores claros al usuario.

### Riesgo 4: Performance con paginación de miles de tickets
**Mitigación:** Agregar índices en BD para campos filtrados. Limitar máximo de registros por página a 100.

### Riesgo 5: Cálculo incorrecto de sorteos de tripleta
**Mitigación:** Validar lógica con tests unitarios. Comparar con datos históricos.

---

## 🔄 Proceso de Implementación

### Workflow Recomendado

1. **Por cada tarea:**
   - [ ] Crear rama Git: `feature/FASE-X-descripcion`
   - [ ] Implementar cambios
   - [ ] Probar con cURL (backend) o manualmente (frontend)
   - [ ] Hacer commit con mensaje descriptivo
   - [ ] Merge a `main` (o crear PR si hay equipo)

2. **Testing continuo:**
   - [ ] Probar cada endpoint después de crearlo/modificarlo
   - [ ] Validar que no se rompan funcionalidades existentes

3. **Despliegue:**
   - [ ] Hacer backup de BD antes de deploy
   - [ ] Ejecutar migraciones de Prisma
   - [ ] Reiniciar servicios backend
   - [ ] Validar que todo funciona en producción

---

## 📝 Notas Adicionales

### Dependencias Requeridas

Verificar que estén instaladas:
- `@whiskeysockets/baileys` (WhatsApp)
- `node-telegram-bot-api` (Telegram)
- `sharp` (Generación de imágenes)
- `pdfkit` (Generación de PDFs)
- `qrcode` (QR para WhatsApp)

### Variables de Entorno

Verificar que existan en `.env`:
```bash
# WhatsApp Baileys
WHATSAPP_SESSION_PATH=/path/to/sessions

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Facebook
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ACCESS_TOKEN=

# Instagram
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
INSTAGRAM_REDIRECT_URI=

# General
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=
```

---

## 🎉 Conclusión

Este roadmap cubre todas las mejoras solicitadas de forma estructurada y priorizada. Se estima que la implementación completa tomará:

- **FASE 1-2:** Trabajo principal (canales + sorteos)
- **FASE 3-5:** Mejoras de UX (tickets + monitor + modales)
- **FASE 6:** Reportes avanzados
- **FASE 7-8:** Testing y documentación

**Próximos pasos:**
1. Revisar y aprobar este roadmap
2. Comenzar con FASE 1 (Canales de distribución)
3. Ir completando tareas según prioridad
4. Mantener este documento actualizado con el progreso

---

**Última actualización:** 2025-12-24
**Autor:** Claude Code
**Estado:** ✅ Planificación Completa
