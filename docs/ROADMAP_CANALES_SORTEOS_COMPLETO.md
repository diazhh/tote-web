# 🚀 Roadmap Completo - Canales y Sorteos

## 📋 Resumen Ejecutivo

Este documento contiene un análisis **EXHAUSTIVO** del código existente, identificando qué funciona, qué NO funciona, y qué falta por implementar. Cada tarea está verificada contra el código real.

**Fecha de creación:** 2025-12-24
**Basado en:** Análisis línea por línea del código fuente
**Prioridad:** CRÍTICA

---

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. Botón "Probar" en Canales de Juegos - NO FUNCIONA
**Ubicación:** `frontend/components/admin/config/ChannelsTab.js` línea 63-66
```javascript
const handleTest = async (channel) => {
  // TODO: Implementar test de canal
  toast.info('Función de prueba en desarrollo');
};
```
**Impacto:** No se puede verificar si los canales de distribución envían correctamente.
**Solución:** Conectar con `channel-config.service.js` que YA tiene el método `sendTestMessage()`.

---

### 2. Endpoint de Sorteos para Tripletas - NO EXISTE
**Frontend llama a:** `GET /api/tripleta/:id/draws`
**Ubicación:** `frontend/components/shared/TripletaDetailModal.js` línea 30
```javascript
const drawsResponse = await axios.get(`/tripleta/${tripleta.id}/draws`);
```
**Backend:** El endpoint NO existe en `backend/src/routes/tripleta.routes.js`
**Impacto:** El contador de sorteos en el modal de tripleta **siempre muestra 0/10**.
**Solución:** Crear endpoint en backend y método en servicio.

---

### 3. Monitor NO ordena números de menor a mayor
**Ubicación:** `frontend/app/admin/monitor/page.js` línea 329
```javascript
<ResponsiveTable data={itemStats.items} ...>
```
**Impacto:** Los números aparecen desordenados, dificulta encontrar un número específico.
**Solución:** Agregar `.sort((a, b) => parseInt(a.number) - parseInt(b.number))` antes de renderizar.

---

### 4. Monitor NO tiene alertas de tripletas (pero Análisis SÍ)
**Análisis de Sorteo tiene:** `frontend/app/admin/analisis-sorteo/page.js` línea 288-311
```javascript
{analysis.analysis.some(a => a.tripleta.completedCount > 0) && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
    <AlertTriangle /> ¡Atención! Hay tripletas que se completarían...
  </div>
)}
```
**Monitor NO tiene:** `frontend/app/admin/monitor/page.js`
**Impacto:** El usuario debe ir a otra página para ver alertas de riesgo.
**Solución:** Copiar la lógica de alertas al tab de números del monitor.

---

### 5. Sorteos NO tiene totalización manual ni reenvío
**Ubicación:** `frontend/app/admin/sorteos/page.js`
**Falta:**
- Botón "Totalizar" para sorteos que pasaron su hora sin ejecutarse
- Botón "Regenerar Imagen" para sorteos ya ejecutados
- Botón "Reenviar a Canales" para republicar
- Botón "Pausar Envíos" para desactivar temporalmente la publicación

**Backend faltante:**
- `POST /api/draws/:id/force-totalize`
- `POST /api/draws/:id/regenerate-image`
- `POST /api/draws/:id/republish`

---

### 6. Tickets NO tiene paginación real del backend
**Ubicación:** `frontend/app/admin/tickets/page.js` línea 33-39
```javascript
const ticketsResponse = await axios.get('/admin/tickets');
const ticketsData = ticketsResponse.data.data || [];
setTickets(ticketsData);
```
**Impacto:** Carga TODOS los tickets, lento con muchos datos.
**Solución:** Implementar paginación en backend y frontend.

---

### 7. Toggle Activar/Desactivar Canal - PARCIAL
**Ubicación:** `frontend/components/admin/config/ChannelsTab.js`
El badge muestra "Activo/Inactivo" pero NO hay botón para cambiar el estado.
**Backend existe:** `channel-config.service.js` tiene `toggleChannelStatus()`
**Solución:** Agregar switch/toggle en la UI que llame al endpoint.

---

### 8. Configuración de Destinatarios en Canales - INCOMPLETO
**Ubicación:** `frontend/components/admin/config/GameChannelModal.js`
Falta campo para configurar:
- WhatsApp: números de teléfono o IDs de grupos
- Telegram: Chat IDs de canales/grupos
- Facebook: Page IDs
- Instagram: User IDs

---

## 📊 Estado Actual del Sistema

### ✅ Funciona Correctamente

| Componente | Ubicación | Funcionalidad |
|------------|-----------|---------------|
| WhatsApp QR | `/admin/whatsapp` | Escanear QR, conectar sesión |
| WhatsApp Test | `/admin/whatsapp` | Enviar mensaje de prueba (en página de instancias) |
| Telegram Instancias | `/admin/telegram` | Crear, probar conexión, eliminar |
| Facebook Instancias | `/admin/facebook` | Crear, probar conexión, eliminar |
| Instagram Instancias | `/admin/instagram` | Crear, OAuth, eliminar |
| Análisis de Sorteo | `/admin/analisis-sorteo` | Alertas de tripletas, recomendaciones |
| Cambiar Ganador | `/admin/sorteos` | Modal para cambiar ganador de sorteo cerrado |

### ⚠️ Funciona Parcialmente

| Componente | Problema |
|------------|----------|
| Canales en Juegos | Botón probar no funciona, no hay toggle activar |
| Modal Tripleta | Contador de sorteos siempre 0/10 |
| Monitor Números | Sin ordenar, sin alertas de tripletas |
| Tickets Admin | Sin paginación real |

### ❌ No Existe

| Funcionalidad | Descripción |
|---------------|-------------|
| Totalización Manual | Ejecutar sorteo que no se totalizó automáticamente |
| Regenerar Imagen | Volver a generar imagen de resultado |
| Reenviar a Canales | Republicar sorteo en canales seleccionados |
| Pausar Envíos | Desactivar temporalmente publicación automática |
| PDF Mejorado | Reporte PDF similar al monitor para admins |

---

## 📝 TAREAS DETALLADAS POR FASE

### FASE 1: Canales de Distribución (CRÍTICA)

#### 1.1 Implementar Botón "Probar" en Canales de Juegos

**Backend - Ya existe pero no conectado:**
- `backend/src/services/channel-config.service.js` → `sendTestMessage(channelId, testConfig)`

**Frontend - Modificar:**
```
Archivo: frontend/components/admin/config/ChannelsTab.js
Línea: 63-66

CAMBIAR:
const handleTest = async (channel) => {
  // TODO: Implementar test de canal
  toast.info('Función de prueba en desarrollo');
};

POR:
const handleTest = async (channel) => {
  setTestingChannel(channel.id);
  try {
    // Mostrar modal para ingresar destinatario de prueba
    setSelectedChannel(channel);
    setShowTestModal(true);
  } catch (error) {
    toast.error('Error al preparar prueba');
  } finally {
    setTestingChannel(null);
  }
};
```

**Crear Modal de Prueba:**
```
Archivo: frontend/components/admin/config/ChannelTestModal.js (NUEVO)

Funcionalidad:
- Input para destinatario según tipo de canal:
  - WhatsApp: número de teléfono o ID de grupo
  - Telegram: Chat ID
  - Facebook: (usa Page ID configurado)
  - Instagram: (usa User ID configurado)
- Botón "Enviar Prueba"
- Mostrar resultado (éxito/error)
```

**API Frontend:**
```
Archivo: frontend/lib/api/game-channels.js

AGREGAR:
async sendTest(channelId, recipient) {
  const response = await axios.post(`/game-channels/${channelId}/test`, { recipient });
  return response.data;
}
```

**Endpoint Backend:**
```
Archivo: backend/src/routes/game-channels.routes.js

AGREGAR:
router.post('/:id/test', authenticate, authorize('ADMIN'), gameChannelsController.sendTest);
```

**Controlador Backend:**
```
Archivo: backend/src/controllers/game-channels.controller.js

AGREGAR:
async sendTest(req, res) {
  const { id } = req.params;
  const { recipient, message } = req.body;
  
  const result = await channelConfigService.sendTestMessage(id, {
    recipient,
    message: message || 'Mensaje de prueba del sistema'
  });
  
  res.json(result);
}
```

**Test con cURL:**
```bash
curl -X POST "http://localhost:5000/api/game-channels/{CHANNEL_ID}/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipient": "584121234567", "message": "Prueba"}'
```

---

#### 1.2 Implementar Toggle Activar/Desactivar Canal

**Frontend - Modificar:**
```
Archivo: frontend/components/admin/config/ChannelsTab.js

EN la card del canal, AGREGAR switch:
<Switch
  checked={channel.isActive}
  onChange={() => handleToggleActive(channel)}
/>

AGREGAR función:
const handleToggleActive = async (channel) => {
  try {
    await gameChannelsAPI.toggleActive(channel.id, !channel.isActive);
    toast.success(`Canal ${channel.isActive ? 'desactivado' : 'activado'}`);
    loadChannels();
  } catch (error) {
    toast.error('Error al cambiar estado del canal');
  }
};
```

**API Frontend:**
```
Archivo: frontend/lib/api/game-channels.js

AGREGAR:
async toggleActive(channelId, isActive) {
  const response = await axios.patch(`/game-channels/${channelId}/toggle`, { isActive });
  return response.data;
}
```

**Endpoint Backend:**
```
Archivo: backend/src/routes/game-channels.routes.js

AGREGAR:
router.patch('/:id/toggle', authenticate, authorize('ADMIN'), gameChannelsController.toggleActive);
```

---

#### 1.3 Configurar Destinatarios en Modal de Canal

**Frontend - Modificar:**
```
Archivo: frontend/components/admin/config/GameChannelModal.js

AGREGAR campo según tipo de canal:

{channelType === 'WHATSAPP' && (
  <div>
    <label>Destinatarios (números o grupos)</label>
    <textarea
      value={recipients.join('\n')}
      onChange={(e) => setRecipients(e.target.value.split('\n').filter(Boolean))}
      placeholder="584121234567&#10;584141234567&#10;120363012345678901@g.us"
    />
    <p className="text-xs">Un número o ID de grupo por línea</p>
  </div>
)}

{channelType === 'TELEGRAM' && (
  <div>
    <label>Chat ID del Canal/Grupo</label>
    <input
      value={telegramChatId}
      onChange={(e) => setTelegramChatId(e.target.value)}
      placeholder="-1001234567890"
    />
  </div>
)}
```

---

### FASE 2: Endpoint de Sorteos para Tripletas

#### 2.1 Backend - Crear Endpoint

**Archivo:** `backend/src/routes/tripleta.routes.js`
```javascript
// AGREGAR después de la línea 15:
router.get('/:id/draws', authenticate, tripletaController.getDrawsForTripleta);
```

**Archivo:** `backend/src/controllers/tripleta.controller.js`
```javascript
// AGREGAR método:
async getDrawsForTripleta(req, res) {
  try {
    const { id } = req.params;
    const result = await tripletaService.getDrawsForTripleta(id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}
```

**Archivo:** `backend/src/services/tripleta.service.js`
```javascript
// AGREGAR método:
async getDrawsForTripleta(tripletaId) {
  const tripleta = await prisma.tripleBet.findUnique({
    where: { id: tripletaId },
    include: { game: true }
  });

  if (!tripleta) throw new Error('Tripleta no encontrada');

  // Obtener sorteos desde la creación hasta expiración
  const draws = await prisma.draw.findMany({
    where: {
      gameId: tripleta.gameId,
      scheduledAt: {
        gte: tripleta.createdAt,
        lte: tripleta.expiresAt
      }
    },
    orderBy: { scheduledAt: 'asc' },
    take: tripleta.drawsCount,
    include: { winnerItem: true }
  });

  // Contar ejecutados
  const executed = draws.filter(d => 
    d.status === 'DRAWN' || d.status === 'PUBLISHED'
  ).length;

  // Marcar si algún número de la tripleta ganó
  const tripletaItemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
  const drawsWithRelevance = draws.map(draw => ({
    id: draw.id,
    scheduledAt: draw.scheduledAt,
    status: draw.status,
    winnerItemId: draw.winnerItemId,
    isRelevant: tripletaItemIds.includes(draw.winnerItemId)
  }));

  return {
    total: tripleta.drawsCount,
    executed,
    remaining: tripleta.drawsCount - executed,
    draws: drawsWithRelevance
  };
}
```

**Test con cURL:**
```bash
curl -X GET "http://localhost:5000/api/tripleta/{TRIPLETA_ID}/draws" \
  -H "Authorization: Bearer $TOKEN"
```

---

### FASE 3: Totalización Manual de Sorteos

#### 3.1 Backend - Crear Endpoints

**Archivo:** `backend/src/routes/draw.routes.js`
```javascript
// AGREGAR después de línea 50:
router.post('/:id/force-totalize', drawController.forceTotalize.bind(drawController));
router.post('/:id/regenerate-image', drawController.regenerateImage.bind(drawController));
router.post('/:id/republish', drawController.republish.bind(drawController));
```

**Archivo:** `backend/src/controllers/draw.controller.js`
```javascript
// AGREGAR métodos:

/**
 * POST /api/draws/:id/force-totalize
 * Totaliza manualmente un sorteo que no se ejecutó automáticamente
 */
async forceTotalize(req, res, next) {
  try {
    const { id } = req.params;
    const { winnerItemId } = req.body;
    
    // Validar que el sorteo existe y está en estado válido
    const draw = await drawService.getDrawById(id);
    if (!draw) {
      return res.status(404).json({ success: false, error: 'Sorteo no encontrado' });
    }
    
    if (!['SCHEDULED', 'CLOSED'].includes(draw.status)) {
      return res.status(400).json({ 
        success: false, 
        error: `No se puede totalizar un sorteo en estado ${draw.status}` 
      });
    }
    
    // Ejecutar el sorteo
    const result = await drawService.executeDraw(id, winnerItemId);
    
    // Generar imagen
    await imageService.generateDrawImage(id);
    
    // Publicar en canales
    await publicationService.publishDraw(id);
    
    res.json({
      success: true,
      data: result,
      message: 'Sorteo totalizado y publicado exitosamente'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/draws/:id/regenerate-image
 */
async regenerateImage(req, res, next) {
  try {
    const { id } = req.params;
    
    const draw = await drawService.getDrawById(id);
    if (!draw || !draw.winnerItemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'El sorteo debe tener un ganador para generar imagen' 
      });
    }
    
    const imageUrl = await imageService.generateDrawImage(id);
    
    res.json({
      success: true,
      data: { imageUrl },
      message: 'Imagen regenerada exitosamente'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/draws/:id/republish
 */
async republish(req, res, next) {
  try {
    const { id } = req.params;
    const { channels } = req.body; // Array opcional de canales específicos
    
    const draw = await drawService.getDrawById(id);
    if (!draw || draw.status !== 'PUBLISHED') {
      return res.status(400).json({ 
        success: false, 
        error: 'Solo se pueden republicar sorteos ya publicados' 
      });
    }
    
    const result = await publicationService.republishDraw(id, channels);
    
    res.json({
      success: true,
      data: result,
      message: 'Sorteo republicado exitosamente'
    });
  } catch (error) {
    next(error);
  }
}
```

#### 3.2 Frontend - Agregar Botones en Sorteos

**Archivo:** `frontend/app/admin/sorteos/page.js`

En la sección de `actions` (línea 261-280), MODIFICAR:
```javascript
actions={(draw) => (
  <div className="flex items-center gap-2">
    <button
      onClick={() => handleViewDetail(draw)}
      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
      title="Ver detalles"
    >
      <Eye className="w-4 h-4" />
    </button>
    
    {/* Totalizar - solo si SCHEDULED/CLOSED y hora pasó */}
    {['SCHEDULED', 'CLOSED'].includes(draw.status) && new Date(draw.scheduledAt) < new Date() && (
      <button
        onClick={() => handleForceTotalize(draw)}
        className="p-2 text-orange-600 hover:text-orange-900 hover:bg-orange-50 rounded-lg"
        title="Totalizar manualmente"
      >
        <Play className="w-4 h-4" />
      </button>
    )}
    
    {/* Regenerar imagen - si tiene ganador */}
    {draw.winnerItemId && (
      <button
        onClick={() => handleRegenerateImage(draw)}
        className="p-2 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-lg"
        title="Regenerar imagen"
      >
        <Image className="w-4 h-4" />
      </button>
    )}
    
    {/* Reenviar - si está publicado */}
    {draw.status === 'PUBLISHED' && (
      <button
        onClick={() => handleRepublish(draw)}
        className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg"
        title="Reenviar a canales"
      >
        <Send className="w-4 h-4" />
      </button>
    )}
    
    {/* Cambiar ganador - si está cerrado */}
    {draw.status === 'CLOSED' && (
      <button
        onClick={() => handleChangeWinner(draw)}
        className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg"
        title="Cambiar ganador"
      >
        <Edit2 className="w-4 h-4" />
      </button>
    )}
  </div>
)}
```

---

### FASE 4: Mejoras en Monitor

#### 4.1 Ordenar Números de Menor a Mayor

**Archivo:** `frontend/app/admin/monitor/page.js`

CAMBIAR línea 329:
```javascript
// ANTES:
<ResponsiveTable data={itemStats.items} ...>

// DESPUÉS:
<ResponsiveTable 
  data={[...itemStats.items].sort((a, b) => parseInt(a.number) - parseInt(b.number))} 
  ...>
```

#### 4.2 Agregar Alertas de Tripletas

**Archivo:** `frontend/app/admin/monitor/page.js`

AGREGAR después de línea 328 (antes de ResponsiveTable):
```javascript
{/* Alerta de tripletas de alto riesgo */}
{itemStats.items.some(i => i.tripletaCount > 0 && i.wouldCompleteTripletaCount > 0) && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-red-800">¡Atención! Hay tripletas que se completarían</p>
        <p className="text-sm text-red-700 mt-1">
          Los siguientes números completarían tripletas si salen como ganadores:
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {itemStats.items
            .filter(i => i.wouldCompleteTripletaCount > 0)
            .map((item, idx) => (
              <span key={idx} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                {item.number} - {item.name} ({item.wouldCompleteTripletaCount} tripletas = {formatCurrency(item.tripletaPrize)})
              </span>
            ))
          }
        </div>
      </div>
    </div>
  </div>
)}
```

**Backend - Agregar campo wouldCompleteTripletaCount:**
El servicio de monitor debe calcular cuántas tripletas se completarían si ese número sale ganador.

---

### FASE 5: Paginación de Tickets

#### 5.1 Backend - Modificar Endpoint

**Archivo:** `backend/src/controllers/ticket.controller.js`

MODIFICAR método getAll:
```javascript
async getAll(req, res) {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    gameId, 
    drawId, 
    userId,
    dateFrom,
    dateTo,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const where = {};
  if (status) where.status = status;
  if (gameId) where.draw = { gameId };
  if (drawId) where.drawId = drawId;
  if (userId) where.userId = userId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { [sortBy]: sortOrder },
      include: {
        user: { select: { id: true, username: true } },
        draw: { include: { game: true } },
        details: { include: { gameItem: true } }
      }
    }),
    prisma.ticket.count({ where })
  ]);

  res.json({
    success: true,
    data: tickets,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      hasNext: skip + tickets.length < total,
      hasPrev: parseInt(page) > 1
    }
  });
}
```

#### 5.2 Frontend - Implementar Paginación

**Archivo:** `frontend/app/admin/tickets/page.js`

AGREGAR estado y controles de paginación similar a sorteos/page.js.

---

### FASE 6: Reportes PDF Mejorados

#### 6.1 Mejorar PDF de Notificación a Admins

**Archivo:** `backend/src/services/pdf-report.service.js` (crear o modificar)

El PDF debe incluir:
- Resumen similar al Monitor (ventas, premios, balance)
- Top 10 números más jugados
- Alertas de tripletas de alto riesgo
- Estadísticas por banca
- Gráfico de distribución de ventas

---

## 🧪 Comandos de Prueba

### Autenticación
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
echo "Token: $TOKEN"
```

### Probar Endpoints Nuevos
```bash
# Test de canal
curl -X POST "http://localhost:5000/api/game-channels/{ID}/test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipient": "584121234567"}'

# Sorteos de tripleta
curl -X GET "http://localhost:5000/api/tripleta/{ID}/draws" \
  -H "Authorization: Bearer $TOKEN"

# Totalizar sorteo
curl -X POST "http://localhost:5000/api/draws/{ID}/force-totalize" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"winnerItemId": "..."}'

# Regenerar imagen
curl -X POST "http://localhost:5000/api/draws/{ID}/regenerate-image" \
  -H "Authorization: Bearer $TOKEN"

# Republicar
curl -X POST "http://localhost:5000/api/draws/{ID}/republish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channels": ["WHATSAPP", "TELEGRAM"]}'
```

---

## 📈 Orden de Implementación Recomendado

| Día | Fase | Tareas | Prioridad |
|-----|------|--------|-----------|
| 1 | 1.1 | Botón Probar en Canales | CRÍTICA |
| 1 | 1.2 | Toggle Activar/Desactivar | CRÍTICA |
| 2 | 2 | Endpoint sorteos tripleta | ALTA |
| 2 | 4.1 | Ordenar números en monitor | ALTA |
| 3 | 3.1 | Endpoints totalización manual | ALTA |
| 3 | 3.2 | UI totalización en sorteos | ALTA |
| 4 | 4.2 | Alertas tripletas en monitor | MEDIA |
| 5 | 5 | Paginación tickets | MEDIA |
| 6 | 1.3 | Configurar destinatarios | MEDIA |
| 7 | 6 | PDF mejorado | BAJA |

---

## ✅ Checklist de Verificación

### Canales
- [ ] Botón "Probar" funciona en `/admin/juegos/{id}?tab=channels`
- [ ] Toggle activar/desactivar cambia estado del canal
- [ ] Se pueden configurar destinatarios por canal
- [ ] Imagen de prueba se envía correctamente a WhatsApp
- [ ] Imagen de prueba se envía correctamente a Telegram
- [ ] Imagen de prueba se publica correctamente en Facebook
- [ ] Imagen de prueba se publica correctamente en Instagram

### Tripletas
- [ ] Modal de tripleta muestra X/Y sorteos correctamente
- [ ] Lista de sorteos involucrados aparece en el modal

### Monitor
- [ ] Números ordenados de 00 a 37 (o 000 a 999 para triple)
- [ ] Alerta de tripletas visible cuando hay riesgo

### Sorteos
- [ ] Botón "Totalizar" visible para sorteos pasados no ejecutados
- [ ] Botón "Regenerar Imagen" visible para sorteos con ganador
- [ ] Botón "Reenviar" visible para sorteos publicados
- [ ] Totalización manual funciona correctamente

### Tickets
- [ ] Paginación funciona (20 por página)
- [ ] Filtros funcionan (estado, juego, fecha)

---

**Última actualización:** 2025-12-24
**Autor:** Análisis exhaustivo del código fuente
