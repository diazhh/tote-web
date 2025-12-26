# Integración con Backend Tote

Esta guía explica cómo integrar el servicio de WhatsApp con el backend de Tote.

## Configuración Inicial

### 1. Instalar Dependencias

```bash
cd whatsapp-service
npm install
```

### 2. Configurar Variables de Entorno

Crear archivo `.env`:

```env
PORT=3002
BACKEND_URL=http://localhost:3000
BACKEND_API_KEY=ToteWhatsApp2024SecureKey
SESSION_PATH=./whatsapp-session
LOG_LEVEL=info
```

### 3. Iniciar el Servicio

```bash
# Con PM2 (recomendado para producción)
pm2 start ecosystem.config.js

# O directamente
npm start
```

## Integración con Backend

### Agregar Cliente HTTP en Backend

Crear `backend/src/lib/whatsapp-client.js`:

```javascript
const axios = require('axios');

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3002';
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || 'ToteWhatsApp2024SecureKey';

const whatsappClient = axios.create({
  baseURL: `${WHATSAPP_SERVICE_URL}/api/whatsapp`,
  headers: {
    'x-api-key': WHATSAPP_API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

module.exports = {
  async getStatus() {
    const response = await whatsappClient.get('/status');
    return response.data;
  },

  async getGroups() {
    const response = await whatsappClient.get('/groups');
    return response.data.groups;
  },

  async sendTextMessage(chatId, message) {
    const response = await whatsappClient.post('/send/text', {
      chatId,
      message
    });
    return response.data;
  },

  async sendImageFromUrl(chatId, imageUrl, caption = '') {
    const response = await whatsappClient.post('/send/image', {
      chatId,
      imageUrl,
      caption
    });
    return response.data;
  },

  async sendToMultipleGroups(groupIds, message, imageUrl = null) {
    const payload = {
      chatIds: groupIds,
      message
    };

    if (imageUrl) {
      payload.imageData = {
        type: 'url',
        url: imageUrl
      };
    }

    const response = await whatsappClient.post('/send/multiple', payload);
    return response.data;
  },

  async initialize() {
    const response = await whatsappClient.post('/initialize');
    return response.data;
  },

  async getQRCode() {
    const response = await whatsappClient.get('/qr');
    return response.data;
  }
};
```

### Modificar Job de Publicación

Actualizar `backend/src/jobs/publish-draw.job.js`:

```javascript
const whatsappClient = require('../lib/whatsapp-client');

async function publishToWhatsApp(draw, result, imageUrl) {
  try {
    // Verificar estado del servicio
    const status = await whatsappClient.getStatus();
    
    if (!status.isReady) {
      logger.warn('WhatsApp service not ready, skipping publication');
      return { success: false, reason: 'Service not ready' };
    }

    // Obtener grupos configurados para este juego
    const channels = await prisma.publicationChannel.findMany({
      where: {
        platform: 'WHATSAPP',
        isActive: true,
        games: {
          some: {
            gameId: draw.gameId
          }
        }
      }
    });

    if (channels.length === 0) {
      logger.info('No WhatsApp channels configured for this game');
      return { success: true, sent: 0 };
    }

    const groupIds = channels.map(ch => ch.channelId);
    
    // Formatear mensaje
    const message = formatDrawMessage(draw, result);
    
    // Enviar a múltiples grupos
    const sendResult = await whatsappClient.sendToMultipleGroups(
      groupIds,
      message,
      imageUrl
    );

    logger.info(`WhatsApp publication completed: ${sendResult.summary.successful}/${sendResult.summary.total} sent`);
    
    return {
      success: true,
      sent: sendResult.summary.successful,
      failed: sendResult.summary.failed,
      details: sendResult.results
    };

  } catch (error) {
    logger.error('Error publishing to WhatsApp:', error);
    return { success: false, error: error.message };
  }
}

function formatDrawMessage(draw, result) {
  return `🎰 *RESULTADOS DEL SORTEO*\n\n` +
         `🎮 Juego: *${draw.game.name}*\n` +
         `🕐 Hora: *${draw.drawTime}*\n` +
         `📅 Fecha: *${draw.drawDate}*\n` +
         `🎯 Resultado: *${result}*\n\n` +
         `¡Gracias por jugar con nosotros!`;
}
```

### Agregar Endpoints de Administración

Crear `backend/src/controllers/whatsapp-admin.controller.js`:

```javascript
const whatsappClient = require('../lib/whatsapp-client');

exports.getWhatsAppStatus = async (req, res) => {
  try {
    const status = await whatsappClient.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.initializeWhatsApp = async (req, res) => {
  try {
    const result = await whatsappClient.initialize();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getQRCode = async (req, res) => {
  try {
    const result = await whatsappClient.getQRCode();
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

exports.getGroups = async (req, res) => {
  try {
    const groups = await whatsappClient.getGroups();
    res.json({ groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.testMessage = async (req, res) => {
  try {
    const { chatId, message } = req.body;
    const result = await whatsappClient.sendTextMessage(chatId, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

### Agregar Rutas de Administración

En `backend/src/index.js` o archivo de rutas:

```javascript
const whatsappAdminController = require('./controllers/whatsapp-admin.controller');

// Rutas protegidas para administradores
router.get('/admin/whatsapp/status', 
  authenticate, 
  authorize(['ADMIN']), 
  whatsappAdminController.getWhatsAppStatus
);

router.post('/admin/whatsapp/initialize', 
  authenticate, 
  authorize(['ADMIN']), 
  whatsappAdminController.initializeWhatsApp
);

router.get('/admin/whatsapp/qr', 
  authenticate, 
  authorize(['ADMIN']), 
  whatsappAdminController.getQRCode
);

router.get('/admin/whatsapp/groups', 
  authenticate, 
  authorize(['ADMIN']), 
  whatsappAdminController.getGroups
);

router.post('/admin/whatsapp/test', 
  authenticate, 
  authorize(['ADMIN']), 
  whatsappAdminController.testMessage
);
```

## Interfaz de Administración (Frontend)

### Componente de Configuración WhatsApp

Crear `frontend/components/admin/WhatsAppConfig.js`:

```javascript
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function WhatsAppConfig() {
  const [status, setStatus] = useState(null);
  const [qrCode, setQRCode] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/admin/whatsapp/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setStatus(data);

      if (data.hasQR) {
        loadQRCode();
      }
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const loadQRCode = async () => {
    try {
      const response = await fetch('/api/admin/whatsapp/qr', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setQRCode(data.qrCode);
    } catch (error) {
      console.error('Error loading QR:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await fetch('/api/admin/whatsapp/groups', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setGroups(data.groups);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const handleInitialize = async () => {
    setLoading(true);
    try {
      await fetch('/api/admin/whatsapp/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      setTimeout(() => {
        loadStatus();
        setLoading(false);
      }, 3000);
    } catch (error) {
      console.error('Error initializing:', error);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Estado de WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          {status && (
            <div className="space-y-2">
              <p>Estado: <span className="font-bold">{status.connectionStatus}</span></p>
              <p>Listo: {status.isReady ? '✅' : '❌'}</p>
              
              {!status.isReady && (
                <Button onClick={handleInitialize} disabled={loading}>
                  {loading ? 'Inicializando...' : 'Inicializar WhatsApp'}
                </Button>
              )}

              {status.isReady && (
                <Button onClick={loadGroups}>
                  Cargar Grupos
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {qrCode && (
        <Card>
          <CardHeader>
            <CardTitle>Escanear QR</CardTitle>
          </CardHeader>
          <CardContent>
            <img src={qrCode} alt="QR Code" className="max-w-sm mx-auto" />
            <p className="text-center mt-4">
              Escanea este código con WhatsApp para conectar
            </p>
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Grupos Disponibles</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {groups.map(group => (
                <li key={group.id} className="p-2 border rounded">
                  <p className="font-bold">{group.name}</p>
                  <p className="text-sm text-gray-600">
                    ID: {group.id} | Participantes: {group.participantsCount}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

## Variables de Entorno del Backend

Agregar a `backend/.env`:

```env
WHATSAPP_SERVICE_URL=http://localhost:3002
WHATSAPP_API_KEY=ToteWhatsApp2024SecureKey
```

## Flujo de Trabajo

1. **Iniciar servicio WhatsApp**: `pm2 start whatsapp-service`
2. **Inicializar desde admin**: POST `/api/admin/whatsapp/initialize`
3. **Escanear QR**: GET `/api/admin/whatsapp/qr` y escanear con WhatsApp
4. **Configurar grupos**: Obtener lista y configurar en `publication_channels`
5. **Publicación automática**: Los jobs usarán el servicio automáticamente

## Monitoreo

```bash
# Ver logs del servicio
pm2 logs whatsapp-service

# Ver estado
pm2 status

# Reiniciar si es necesario
pm2 restart whatsapp-service
```
