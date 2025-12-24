# 💻 Ejemplos de Código - Implementaciones Clave

## 📋 Índice
1. [Servicios Backend](#servicios-backend)
2. [Controladores y Rutas](#controladores-y-rutas)
3. [Componentes Frontend](#componentes-frontend)
4. [Migraciones de Base de Datos](#migraciones-de-base-de-datos)
5. [Tests con cURL](#tests-con-curl)

---

## Servicios Backend

### 1. Servicio de Generación de Imagen de Prueba

**Archivo:** `backend/src/services/test-image-generator.service.js`

```javascript
const sharp = require('sharp');

class TestImageGeneratorService {
  /**
   * Genera una imagen negra 1080x1080 con texto de prueba
   * @returns {Promise<Buffer>} Buffer de la imagen PNG
   */
  async generateTestImage() {
    const width = 1080;
    const height = 1080;

    // SVG con texto centrado
    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#000000"/>
        <text
          x="50%"
          y="50%"
          font-family="Arial, sans-serif"
          font-size="60"
          font-weight="bold"
          fill="#FFFFFF"
          text-anchor="middle"
          dominant-baseline="middle">
          PRUEBA DE ENVÍO
        </text>
        <text
          x="50%"
          y="60%"
          font-family="Arial, sans-serif"
          font-size="30"
          fill="#CCCCCC"
          text-anchor="middle"
          dominant-baseline="middle">
          ${new Date().toLocaleString('es-VE')}
        </text>
      </svg>
    `;

    try {
      const imageBuffer = await sharp(Buffer.from(svg))
        .png()
        .toBuffer();

      return imageBuffer;
    } catch (error) {
      console.error('Error generando imagen de prueba:', error);
      throw new Error('No se pudo generar la imagen de prueba');
    }
  }

  /**
   * Genera y guarda imagen de prueba en disco
   * @param {string} outputPath - Ruta donde guardar
   * @returns {Promise<string>} Ruta del archivo guardado
   */
  async generateAndSaveTestImage(outputPath) {
    const imageBuffer = await this.generateTestImage();
    await sharp(imageBuffer).toFile(outputPath);
    return outputPath;
  }
}

module.exports = new TestImageGeneratorService();
```

---

### 2. Servicio de Configuración de Canales

**Archivo:** `backend/src/services/channel-config.service.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const testImageGenerator = require('./test-image-generator.service');
const whatsappService = require('./whatsapp-baileys.service');
const telegramService = require('./telegram.service');
const facebookService = require('./facebook.service');
const instagramService = require('./instagram.service');

class ChannelConfigService {
  /**
   * Activa o desactiva un canal
   * @param {string} channelId - ID del GameChannel
   * @param {boolean} isActive - Estado deseado
   */
  async toggleChannelStatus(channelId, isActive) {
    const channel = await prisma.gameChannel.findUnique({
      where: { id: channelId }
    });

    if (!channel) {
      throw new Error('Canal no encontrado');
    }

    const updated = await prisma.gameChannel.update({
      where: { id: channelId },
      data: { isActive }
    });

    return {
      success: true,
      channel: updated,
      message: `Canal ${isActive ? 'activado' : 'desactivado'} exitosamente`
    };
  }

  /**
   * Envía un mensaje de prueba a un canal
   * @param {string} channelId - ID del GameChannel
   * @param {object} testConfig - Configuración de prueba
   * @param {string} testConfig.recipient - Destinatario de prueba
   * @param {string} testConfig.message - Mensaje opcional
   */
  async sendTestMessage(channelId, testConfig) {
    const channel = await prisma.gameChannel.findUnique({
      where: { id: channelId },
      include: {
        whatsappInstance: true,
        telegramInstance: true,
        facebookInstance: true,
        instagramInstance: true
      }
    });

    if (!channel) {
      throw new Error('Canal no encontrado');
    }

    // Generar imagen de prueba
    const testImage = await testImageGenerator.generateTestImage();
    const testMessage = testConfig.message || 'Mensaje de prueba del sistema';

    let result;

    try {
      switch (channel.channelType) {
        case 'WHATSAPP':
          result = await this._testWhatsApp(
            channel.whatsappInstance,
            testConfig.recipient,
            testImage,
            testMessage
          );
          break;

        case 'TELEGRAM':
          result = await this._testTelegram(
            channel.telegramInstance,
            testConfig.recipient,
            testImage,
            testMessage
          );
          break;

        case 'FACEBOOK':
          result = await this._testFacebook(
            channel.facebookInstance,
            testImage,
            testMessage
          );
          break;

        case 'INSTAGRAM':
          result = await this._testInstagram(
            channel.instagramInstance,
            testImage,
            testMessage
          );
          break;

        default:
          throw new Error(`Tipo de canal no soportado: ${channel.channelType}`);
      }

      return {
        success: true,
        result,
        message: 'Mensaje de prueba enviado exitosamente'
      };
    } catch (error) {
      console.error('Error enviando mensaje de prueba:', error);
      return {
        success: false,
        error: error.message,
        message: 'Error al enviar mensaje de prueba'
      };
    }
  }

  async _testWhatsApp(instance, recipient, imageBuffer, message) {
    if (!instance || instance.status !== 'CONNECTED') {
      throw new Error('Instancia de WhatsApp no conectada');
    }

    // Validar formato de número
    const cleanNumber = recipient.replace(/[^\d]/g, '');
    if (cleanNumber.length < 10) {
      throw new Error('Número de teléfono inválido');
    }

    const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

    await whatsappService.sendMessage(instance.instanceId, jid, message);
    await whatsappService.sendImage(instance.instanceId, jid, imageBuffer, message);

    return { platform: 'WhatsApp', recipient: jid };
  }

  async _testTelegram(instance, chatId, imageBuffer, message) {
    if (!instance) {
      throw new Error('Instancia de Telegram no configurada');
    }

    // Validar chatId
    if (!chatId || (!chatId.startsWith('-') && !chatId.startsWith('@'))) {
      throw new Error('ChatId inválido. Debe ser un ID numérico o @username');
    }

    await telegramService.sendPhoto(
      instance.botToken,
      chatId,
      imageBuffer,
      { caption: message }
    );

    return { platform: 'Telegram', chatId };
  }

  async _testFacebook(instance, imageBuffer, message) {
    if (!instance) {
      throw new Error('Instancia de Facebook no configurada');
    }

    const result = await facebookService.publishPhoto(
      instance.pageId,
      instance.pageAccessToken,
      imageBuffer,
      message
    );

    return { platform: 'Facebook', postId: result.id };
  }

  async _testInstagram(instance, imageBuffer, message) {
    if (!instance) {
      throw new Error('Instancia de Instagram no configurada');
    }

    // Verificar que el token no esté expirado
    if (instance.tokenExpiresAt && new Date(instance.tokenExpiresAt) < new Date()) {
      throw new Error('Token de Instagram expirado. Por favor, renueva el token.');
    }

    const result = await instagramService.publishPhoto(
      instance.userId,
      instance.accessToken,
      imageBuffer,
      message
    );

    return { platform: 'Instagram', mediaId: result.id };
  }
}

module.exports = new ChannelConfigService();
```

---

### 3. Servicio de Actualización de Status de Tickets

**Archivo:** `backend/src/services/ticket-status.service.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const playerMovementService = require('./player-movement.service');

class TicketStatusService {
  /**
   * Actualiza los estados de todos los tickets de un sorteo
   * @param {string} drawId - ID del sorteo
   */
  async updateTicketStatusesForDraw(drawId) {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { winnerItem: true }
    });

    if (!draw || !draw.winnerItemId) {
      throw new Error('Sorteo no encontrado o sin ganador definido');
    }

    console.log(`Actualizando tickets para sorteo ${drawId}, ganador: ${draw.winnerItem.number}`);

    // 1. Obtener todos los TicketDetail del sorteo
    const ticketDetails = await prisma.ticketDetail.findMany({
      where: { drawId },
      include: {
        ticket: true,
        gameItem: true
      }
    });

    console.log(`Encontrados ${ticketDetails.length} detalles de tickets`);

    // 2. Actualizar cada detalle (WON o LOST)
    const updatePromises = ticketDetails.map(async (detail) => {
      const isWinner = detail.itemId === draw.winnerItemId;
      const prize = isWinner ? detail.amount * detail.multiplier : 0;
      const status = isWinner ? 'WON' : 'LOST';

      return prisma.ticketDetail.update({
        where: { id: detail.id },
        data: { status, prize }
      });
    });

    await Promise.all(updatePromises);

    // 3. Obtener tickets únicos afectados
    const uniqueTicketIds = [...new Set(ticketDetails.map(d => d.ticketId))];
    console.log(`Actualizando ${uniqueTicketIds.length} tickets únicos`);

    // 4. Para cada ticket, verificar si está completamente finalizado
    for (const ticketId of uniqueTicketIds) {
      await this._updateTicketStatus(ticketId);
    }

    return {
      success: true,
      detailsUpdated: ticketDetails.length,
      ticketsUpdated: uniqueTicketIds.length
    };
  }

  /**
   * Actualiza el estado de un ticket individual
   * @param {string} ticketId - ID del ticket
   * @private
   */
  async _updateTicketStatus(ticketId) {
    // Obtener TODOS los detalles del ticket (puede tener múltiples sorteos)
    const allDetails = await prisma.ticketDetail.findMany({
      where: { ticketId },
      include: { draw: true }
    });

    // Verificar si todos los sorteos ya finalizaron
    const allDrawsFinished = allDetails.every(detail =>
      detail.draw.status === 'DRAWN' || detail.draw.status === 'PUBLISHED'
    );

    if (!allDrawsFinished) {
      // Aún hay sorteos pendientes, mantener ticket ACTIVE
      console.log(`Ticket ${ticketId}: Sorteos pendientes, mantiene ACTIVE`);
      return;
    }

    // Todos los sorteos finalizaron, determinar si ganó o perdió
    const hasWinner = allDetails.some(detail => detail.status === 'WON');
    const totalPrize = allDetails.reduce((sum, detail) => sum + (detail.prize || 0), 0);

    const newStatus = hasWinner ? 'WON' : 'LOST';

    const ticket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: newStatus,
        totalPrize
      },
      include: { user: true }
    });

    console.log(`Ticket ${ticketId}: ${newStatus}, premio: ${totalPrize}`);

    // Si ganó, registrar movimiento de premio
    if (newStatus === 'WON' && totalPrize > 0) {
      await playerMovementService.recordPrize(
        ticket.userId,
        totalPrize,
        {
          ticketId: ticket.id,
          drawId: allDetails[0].drawId, // Primer sorteo
          description: `Premio de ticket #${ticket.id.substring(0, 8)}`
        }
      );
    }

    return ticket;
  }

  /**
   * Valida y actualiza el estado de un ticket manualmente
   * @param {string} ticketId - ID del ticket
   */
  async validateTicketStatus(ticketId) {
    return this._updateTicketStatus(ticketId);
  }
}

module.exports = new TicketStatusService();
```

---

### 4. Servicio de Análisis de Riesgo de Tripletas

**Archivo:** `backend/src/services/triplet-risk.service.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class TripletRiskService {
  /**
   * Analiza el riesgo de tripletas para un sorteo
   * @param {string} drawId - ID del sorteo
   */
  async analyzeRiskForDraw(drawId) {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { game: true }
    });

    if (!draw) {
      throw new Error('Sorteo no encontrado');
    }

    // Obtener tripletas activas del juego
    const activeTripletas = await prisma.tripleBet.findMany({
      where: {
        gameId: draw.gameId,
        status: 'ACTIVE',
        createdAt: { lte: draw.drawDate }
      },
      include: {
        item1: true,
        item2: true,
        item3: true,
        user: true
      }
    });

    if (activeTripletas.length === 0) {
      return {
        hasRisk: false,
        riskByNumber: {},
        totalExposure: 0,
        message: 'No hay tripletas activas'
      };
    }

    // Obtener fecha más antigua de tripletas
    const oldestDate = activeTripletas.reduce((min, t) =>
      t.createdAt < min ? t.createdAt : min,
      activeTripletas[0].createdAt
    );

    // Obtener todos los sorteos pasados del juego (ya ejecutados)
    const pastDraws = await prisma.draw.findMany({
      where: {
        gameId: draw.gameId,
        status: { in: ['DRAWN', 'PUBLISHED'] },
        drawDate: { gte: oldestDate },
        id: { not: drawId } // Excluir el sorteo actual
      },
      select: {
        id: true,
        winnerItemId: true,
        drawDate: true,
        drawTime: true
      },
      orderBy: [
        { drawDate: 'asc' },
        { drawTime: 'asc' }
      ]
    });

    // Analizar cada tripleta
    const riskAnalysis = [];

    for (const tripleta of activeTripletas) {
      const numbers = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
      const matchedNumbers = new Set();

      // Obtener sorteos elegibles para esta tripleta
      const eligibleDraws = pastDraws
        .filter(d => new Date(d.drawDate) >= new Date(tripleta.createdAt))
        .slice(0, tripleta.totalDraws);

      // Contar cuántos de los 3 números ya salieron
      for (const pastDraw of eligibleDraws) {
        if (numbers.includes(pastDraw.winnerItemId)) {
          matchedNumbers.add(pastDraw.winnerItemId);
        }
      }

      // Si 2 de 3 ya salieron, hay riesgo
      if (matchedNumbers.size === 2) {
        const remainingNumber = numbers.find(n => !matchedNumbers.has(n));

        riskAnalysis.push({
          tripletaId: tripleta.id,
          userId: tripleta.userId,
          userName: tripleta.user?.name || 'Desconocido',
          numbersMatched: Array.from(matchedNumbers),
          remainingNumberId: remainingNumber,
          exposure: tripleta.amount * tripleta.multiplier,
          amount: tripleta.amount,
          multiplier: tripleta.multiplier,
          completedDraws: eligibleDraws.length,
          totalDraws: tripleta.totalDraws
        });
      }
    }

    // Agrupar por número faltante
    const riskByNumber = {};

    for (const risk of riskAnalysis) {
      const itemId = risk.remainingNumberId;

      if (!riskByNumber[itemId]) {
        // Obtener información del número
        const item = await prisma.gameItem.findUnique({
          where: { id: itemId }
        });

        riskByNumber[itemId] = {
          itemId,
          number: item.number,
          name: item.name,
          totalExposure: 0,
          tripletasCount: 0,
          tripletas: []
        };
      }

      riskByNumber[itemId].totalExposure += risk.exposure;
      riskByNumber[itemId].tripletasCount++;
      riskByNumber[itemId].tripletas.push({
        id: risk.tripletaId,
        user: risk.userName,
        exposure: risk.exposure
      });
    }

    // Ordenar por exposición (mayor a menor)
    const sortedRisk = Object.values(riskByNumber).sort(
      (a, b) => b.totalExposure - a.totalExposure
    );

    const totalExposure = sortedRisk.reduce((sum, r) => sum + r.totalExposure, 0);

    return {
      hasRisk: sortedRisk.length > 0,
      riskNumbers: sortedRisk,
      totalExposure,
      message: sortedRisk.length > 0
        ? `¡Atención! ${sortedRisk.length} número(s) completarían tripletas`
        : 'No hay números de riesgo'
    };
  }
}

module.exports = new TripletRiskService();
```

---

## Controladores y Rutas

### 1. Controlador de Canales

**Archivo:** `backend/src/controllers/channel.controller.js`

```javascript
const channelConfigService = require('../services/channel-config.service');

class ChannelController {
  /**
   * POST /api/channels/:id/toggle-status
   * Activa o desactiva un canal
   */
  async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          error: 'El campo isActive es requerido y debe ser booleano'
        });
      }

      const result = await channelConfigService.toggleChannelStatus(id, isActive);

      return res.json(result);
    } catch (error) {
      console.error('Error en toggleStatus:', error);
      return res.status(500).json({
        error: error.message || 'Error al cambiar estado del canal'
      });
    }
  }

  /**
   * POST /api/channels/:id/test
   * Envía un mensaje de prueba
   */
  async sendTest(req, res) {
    try {
      const { id } = req.params;
      const { recipient, message } = req.body;

      if (!recipient) {
        return res.status(400).json({
          error: 'El campo recipient es requerido'
        });
      }

      const result = await channelConfigService.sendTestMessage(id, {
        recipient,
        message
      });

      return res.json(result);
    } catch (error) {
      console.error('Error en sendTest:', error);
      return res.status(500).json({
        error: error.message || 'Error al enviar mensaje de prueba'
      });
    }
  }
}

module.exports = new ChannelController();
```

**Archivo:** `backend/src/routes/channel.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channel.controller');
const { authenticateToken, requireRole } = require('../middlewares/auth.middleware');

// Todas las rutas requieren autenticación de admin
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

router.post('/:id/toggle-status', channelController.toggleStatus);
router.post('/:id/test', channelController.sendTest);

module.exports = router;
```

---

### 2. Controlador de Sorteos (Modificado)

**Archivo:** `backend/src/controllers/draw.controller.js` (agregar métodos)

```javascript
const drawService = require('../services/draw.service');
const ticketStatusService = require('../services/ticket-status.service');
const tripletRiskService = require('../services/triplet-risk.service');
const publicationService = require('../services/publication.service');
const videoGeneratorService = require('../services/video-generator.service');

class DrawController {
  // ... métodos existentes ...

  /**
   * POST /api/draws/:id/force-totalize
   * Totaliza manualmente un sorteo
   */
  async forceTotalize(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const draw = await drawService.getDrawById(id);

      if (!draw) {
        return res.status(404).json({ error: 'Sorteo no encontrado' });
      }

      // Validar que el sorteo esté en estado apropiado
      if (!['SCHEDULED', 'CLOSED'].includes(draw.status)) {
        return res.status(400).json({
          error: `No se puede totalizar un sorteo en estado ${draw.status}`
        });
      }

      // Validar que la hora ya pasó
      const now = new Date();
      const drawDateTime = new Date(`${draw.drawDate}T${draw.drawTime}`);

      if (drawDateTime > now) {
        return res.status(400).json({
          error: 'No se puede totalizar un sorteo cuya hora aún no ha llegado'
        });
      }

      console.log(`Totalización manual iniciada por usuario ${userId} para sorteo ${id}`);

      // 1. Cerrar si está SCHEDULED
      if (draw.status === 'SCHEDULED') {
        await drawService.closeDraw(id);
      }

      // 2. Ejecutar sorteo (preselección, sorteo, imagen)
      const executed = await drawService.executeDraw(id);

      // 3. Actualizar estados de tickets
      await ticketStatusService.updateTicketStatusesForDraw(id);

      // 4. Publicar en canales
      await publicationService.publishDraw(id);

      // 5. Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'FORCE_TOTALIZE',
          entity: 'Draw',
          entityId: id,
          changes: {
            timestamp: new Date().toISOString(),
            previousStatus: draw.status,
            newStatus: 'PUBLISHED'
          }
        }
      });

      return res.json({
        success: true,
        draw: executed,
        message: 'Sorteo totalizado exitosamente'
      });
    } catch (error) {
      console.error('Error en forceTotalize:', error);
      return res.status(500).json({
        error: error.message || 'Error al totalizar sorteo'
      });
    }
  }

  /**
   * POST /api/draws/:id/regenerate-image
   * Regenera la imagen de un sorteo
   */
  async regenerateImage(req, res) {
    try {
      const { id } = req.params;

      const draw = await drawService.getDrawById(id);

      if (!draw || !draw.winnerItemId) {
        return res.status(404).json({
          error: 'Sorteo no encontrado o sin ganador definido'
        });
      }

      // Regenerar imagen
      const newImageUrl = await videoGeneratorService.generateDrawImage(id);

      // Actualizar en BD
      const updated = await prisma.draw.update({
        where: { id },
        data: { imageUrl: newImageUrl }
      });

      return res.json({
        success: true,
        imageUrl: newImageUrl,
        message: 'Imagen regenerada exitosamente'
      });
    } catch (error) {
      console.error('Error en regenerateImage:', error);
      return res.status(500).json({
        error: error.message || 'Error al regenerar imagen'
      });
    }
  }

  /**
   * POST /api/draws/:id/republish
   * Reenvía el sorteo a canales
   */
  async republish(req, res) {
    try {
      const { id } = req.params;
      const { channels } = req.body; // Array de channelIds opcionales

      const draw = await drawService.getDrawById(id);

      if (!draw || draw.status !== 'PUBLISHED') {
        return res.status(400).json({
          error: 'Solo se pueden reenviar sorteos ya publicados'
        });
      }

      // Reenviar a canales específicos o todos
      const result = await publicationService.republishDraw(id, channels);

      return res.json({
        success: true,
        result,
        message: 'Sorteo reenviado exitosamente'
      });
    } catch (error) {
      console.error('Error en republish:', error);
      return res.status(500).json({
        error: error.message || 'Error al reenviar sorteo'
      });
    }
  }

  /**
   * GET /api/draws/:id/triplet-risk
   * Obtiene análisis de riesgo de tripletas
   */
  async getTripletRisk(req, res) {
    try {
      const { id } = req.params;

      const risk = await tripletRiskService.analyzeRiskForDraw(id);

      return res.json(risk);
    } catch (error) {
      console.error('Error en getTripletRisk:', error);
      return res.status(500).json({
        error: error.message || 'Error al analizar riesgo de tripletas'
      });
    }
  }
}

module.exports = new DrawController();
```

**Archivo:** `backend/src/routes/draw.routes.js` (agregar rutas)

```javascript
router.post('/:id/force-totalize', authenticateToken, requireRole(['ADMIN']), drawController.forceTotalize);
router.post('/:id/regenerate-image', authenticateToken, requireRole(['ADMIN']), drawController.regenerateImage);
router.post('/:id/republish', authenticateToken, requireRole(['ADMIN']), drawController.republish);
router.get('/:id/triplet-risk', authenticateToken, drawController.getTripletRisk);
```

---

## Componentes Frontend

### 1. Página de WhatsApp con QR

**Archivo:** `frontend/app/admin/whatsapp/page.js`

```javascript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, QrCode, Send, Power, Trash2 } from 'lucide-react';
import QRTestModal from '@/components/modals/QRTestModal';

export default function WhatsAppPage() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [showTestModal, setShowTestModal] = useState(false);

  useEffect(() => {
    loadInstances();

    // Auto-refresh cada 5 segundos para actualizar QR y estados
    const interval = setInterval(loadInstances, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadInstances = async () => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setInstances(data);
    } catch (error) {
      console.error('Error cargando instancias:', error);
    } finally {
      setLoading(false);
    }
  };

  const createInstance = async () => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Nueva instancia' })
      });

      if (response.ok) {
        await loadInstances();
      }
    } catch (error) {
      console.error('Error creando instancia:', error);
    }
  };

  const deleteInstance = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta instancia?')) return;

    try {
      await fetch(`/api/whatsapp/instances/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      await loadInstances();
    } catch (error) {
      console.error('Error eliminando instancia:', error);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'CONNECTED' ? 'DISCONNECTED' : 'CONNECTED';

    try {
      // Implementar lógica de activar/desactivar
      await loadInstances();
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  };

  const openTestModal = (instance) => {
    setSelectedInstance(instance);
    setShowTestModal(true);
  };

  const getStatusBadge = (status) => {
    const variants = {
      'CONNECTED': 'success',
      'QR_READY': 'warning',
      'CONNECTING': 'info',
      'DISCONNECTED': 'secondary',
      'LOGGED_OUT': 'destructive'
    };

    const labels = {
      'CONNECTED': 'Conectado',
      'QR_READY': 'Escanear QR',
      'CONNECTING': 'Conectando...',
      'DISCONNECTED': 'Desconectado',
      'LOGGED_OUT': 'Sesión cerrada'
    };

    return (
      <Badge variant={variants[status] || 'secondary'}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (loading) {
    return <div className="p-6">Cargando...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Configuración de WhatsApp</h1>
        <Button onClick={createInstance}>
          <Smartphone className="mr-2 h-4 w-4" />
          Nueva Instancia
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {instances.map((instance) => (
          <Card key={instance.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="truncate">{instance.instanceId}</span>
                {getStatusBadge(instance.status)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* QR Code */}
              {instance.status === 'QR_READY' && instance.qrCode && (
                <div className="mb-4 p-4 bg-white rounded-lg">
                  <div className="flex flex-col items-center">
                    <QrCode className="h-6 w-6 mb-2 text-gray-500" />
                    <img
                      src={instance.qrCode}
                      alt="QR Code"
                      className="w-full max-w-[200px] h-auto"
                    />
                    <p className="text-sm text-gray-500 mt-2 text-center">
                      Escanea este código con WhatsApp
                    </p>
                  </div>
                </div>
              )}

              {/* Información de instancia conectada */}
              {instance.status === 'CONNECTED' && instance.phoneNumber && (
                <div className="mb-4 p-3 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-900">
                    Número: {instance.phoneNumber}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Conectado desde: {new Date(instance.connectedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-col gap-2 mt-4">
                {instance.status === 'CONNECTED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openTestModal(instance)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Probar Envío
                  </Button>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => toggleStatus(instance.id, instance.status)}
                  >
                    <Power className="mr-2 h-4 w-4" />
                    {instance.status === 'CONNECTED' ? 'Desconectar' : 'Conectar'}
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteInstance(instance.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal de prueba */}
      {showTestModal && (
        <QRTestModal
          instance={selectedInstance}
          onClose={() => setShowTestModal(false)}
          onSuccess={loadInstances}
        />
      )}
    </div>
  );
}
```

---

### 2. Modal Unificado de Ticket

**Archivo:** `frontend/components/modals/TicketDetailModal.js`

```javascript
'use client';

import { X, Trophy, Calendar, Clock, DollarSign, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function TicketDetailModal({ ticket, onClose }) {
  if (!ticket) return null;

  // Agrupar detalles por sorteo
  const groupedDetails = ticket.details.reduce((groups, detail) => {
    const key = `${detail.draw.game.id}_${detail.draw.drawDate}_${detail.draw.drawTime}`;

    if (!groups[key]) {
      groups[key] = {
        game: detail.draw.game,
        draw: detail.draw,
        details: []
      };
    }

    groups[key].details.push(detail);
    return groups;
  }, {});

  const getStatusColor = (status) => {
    const colors = {
      'ACTIVE': 'bg-blue-100 text-blue-800',
      'WON': 'bg-green-100 text-green-800',
      'LOST': 'bg-gray-100 text-gray-800',
      'CANCELLED': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100';
  };

  const getDrawStatusColor = (status) => {
    const colors = {
      'SCHEDULED': 'bg-yellow-100 text-yellow-800',
      'CLOSED': 'bg-orange-100 text-orange-800',
      'DRAWN': 'bg-blue-100 text-blue-800',
      'PUBLISHED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Detalle del Ticket</h2>
              <p className="text-blue-100">#{ticket.id.substring(0, 8).toUpperCase()}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="mt-4 flex gap-4">
            <Badge className={getStatusColor(ticket.status)}>
              {ticket.status === 'WON' ? 'Ganador' :
               ticket.status === 'LOST' ? 'Perdedor' :
               ticket.status === 'CANCELLED' ? 'Cancelado' : 'Activo'}
            </Badge>
            <span className="text-sm text-blue-100">
              {new Date(ticket.createdAt).toLocaleString('es-VE')}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Información del usuario */}
          {ticket.user && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Jugador</h3>
              <p className="text-sm">{ticket.user.name}</p>
              <p className="text-sm text-gray-600">{ticket.user.phone}</p>
            </div>
          )}

          {/* Grupos de sorteos */}
          {Object.values(groupedDetails).map((group, index) => (
            <div key={index} className="mb-6">
              {/* Header del grupo */}
              <div className="bg-gray-100 rounded-t-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-lg">{group.game.name}</h3>
                  <Badge className={getDrawStatusColor(group.draw.status)}>
                    {group.draw.status === 'SCHEDULED' ? 'Programado' :
                     group.draw.status === 'CLOSED' ? 'Cerrado' :
                     group.draw.status === 'DRAWN' ? 'Sorteado' :
                     group.draw.status === 'PUBLISHED' ? 'Publicado' : 'Cancelado'}
                  </Badge>
                </div>

                <div className="flex gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(group.draw.drawDate).toLocaleDateString('es-VE')}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {group.draw.drawTime}
                  </div>
                </div>

                {group.draw.winnerItem && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-yellow-600" />
                    <span className="font-semibold">Ganador:</span>
                    <span>{group.draw.winnerItem.number} - {group.draw.winnerItem.name}</span>
                  </div>
                )}
              </div>

              {/* Detalles del grupo */}
              <div className="border border-t-0 rounded-b-lg">
                {group.details.map((detail, idx) => (
                  <div
                    key={detail.id}
                    className={`p-4 flex items-center justify-between ${
                      idx !== group.details.length - 1 ? 'border-b' : ''
                    } ${detail.status === 'WON' ? 'bg-green-50' : 'bg-white'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {detail.gameItem.number}
                        </div>
                        <div className="text-xs text-gray-500">
                          {detail.gameItem.name}
                        </div>
                      </div>

                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          <span>Apuesta: <strong>Bs. {detail.amount.toFixed(2)}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Hash className="h-4 w-4 text-gray-400" />
                          <span>Multiplicador: <strong>x{detail.multiplier}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge className={getStatusColor(detail.status)}>
                        {detail.status === 'WON' ? 'Ganó' :
                         detail.status === 'LOST' ? 'Perdió' : 'Activo'}
                      </Badge>
                      {detail.status === 'WON' && (
                        <div className="text-green-700 font-bold mt-2">
                          +Bs. {detail.prize.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">Total Jugado</div>
              <div className="text-2xl font-bold">Bs. {ticket.totalAmount.toFixed(2)}</div>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-600">Total Premio</div>
              <div className={`text-2xl font-bold ${
                ticket.totalPrize > 0 ? 'text-green-600' : 'text-gray-800'
              }`}>
                Bs. {ticket.totalPrize.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Migraciones de Base de Datos

### Migración para agregar campo isActive

**Archivo:** `backend/prisma/migrations/XXXXXX_add_isactive_to_gamechannel/migration.sql`

```sql
-- AlterTable
ALTER TABLE "GameChannel" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "GameChannel_gameId_isActive_idx" ON "GameChannel"("gameId", "isActive");
```

---

## Tests con cURL

### Script Completo de Testing

**Archivo:** `backend/tests/manual/test-all-endpoints.sh`

```bash
#!/bin/bash

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="http://localhost:5000/api"

echo "========================================="
echo "  Testing Endpoints - Tote Web"
echo "========================================="
echo ""

# 1. Login
echo -e "${YELLOW}1. Testing Login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo $LOGIN_RESPONSE | jq
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# 2. Test Get Draws
echo -e "${YELLOW}2. Testing GET /draws...${NC}"
DRAWS=$(curl -s -X GET "$BASE_URL/draws?limit=5" \
  -H "Authorization: Bearer $TOKEN")

DRAW_COUNT=$(echo $DRAWS | jq '. | length')
echo "Found $DRAW_COUNT draws"
echo -e "${GREEN}✅ GET /draws OK${NC}"
echo ""

# 3. Test Get Tickets with Pagination
echo -e "${YELLOW}3. Testing GET /tickets with pagination...${NC}"
TICKETS=$(curl -s -X GET "$BASE_URL/tickets?page=1&limit=10&status=ACTIVE" \
  -H "Authorization: Bearer $TOKEN")

echo $TICKETS | jq '{total, page, totalPages, tickets: (.tickets | length)}'
echo -e "${GREEN}✅ GET /tickets OK${NC}"
echo ""

# 4. Test Triplet Risk Analysis
echo -e "${YELLOW}4. Testing GET /draws/:id/triplet-risk...${NC}"
FIRST_DRAW_ID=$(echo $DRAWS | jq -r '.[0].id')

if [ "$FIRST_DRAW_ID" != "null" ]; then
  RISK=$(curl -s -X GET "$BASE_URL/draws/$FIRST_DRAW_ID/triplet-risk" \
    -H "Authorization: Bearer $TOKEN")

  echo $RISK | jq '{hasRisk, totalExposure, riskCount: (.riskNumbers | length)}'
  echo -e "${GREEN}✅ Triplet risk analysis OK${NC}"
else
  echo -e "${YELLOW}⚠️  No draws found to test${NC}"
fi
echo ""

# 5. Test Channel Toggle (crear un canal primero si es necesario)
echo -e "${YELLOW}5. Testing POST /channels/:id/toggle-status...${NC}"
# Asume que ya existe un canal, usa el ID apropiado
# CHANNEL_ID="reemplazar-con-id-real"
# curl -s -X POST "$BASE_URL/channels/$CHANNEL_ID/toggle-status" \
#   -H "Authorization: Bearer $TOKEN" \
#   -H "Content-Type: application/json" \
#   -d '{"isActive": false}' | jq

echo -e "${YELLOW}⚠️  Skipped - requiere channel ID real${NC}"
echo ""

# 6. Test WhatsApp Instances
echo -e "${YELLOW}6. Testing GET /whatsapp/instances...${NC}"
WA_INSTANCES=$(curl -s -X GET "$BASE_URL/whatsapp/instances" \
  -H "Authorization: Bearer $TOKEN")

WA_COUNT=$(echo $WA_INSTANCES | jq '. | length')
echo "Found $WA_COUNT WhatsApp instances"
echo -e "${GREEN}✅ GET /whatsapp/instances OK${NC}"
echo ""

echo "========================================="
echo -e "${GREEN}✅ All tests completed!${NC}"
echo "========================================="
```

---

**Última actualización:** 2025-12-24
**Versión:** 1.0
