# WhatsApp Baileys - Guía Rápida

## Inicio Rápido en 5 Minutos

### 1. Verificar Instalación

Las dependencias ya están instaladas. Verifica que el servidor esté corriendo:

```bash
cd backend
npm run dev
```

### 2. Crear Instancia desde el Backend

Puedes usar curl o Postman:

```bash
# 1. Login (obtener token)
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"tu-password"}' \
  | jq -r '.token')

# 2. Crear canal de WhatsApp
CHANNEL_ID=$(curl -X POST http://localhost:3001/api/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "WHATSAPP",
    "name": "WhatsApp Test",
    "config": {
      "type": "baileys",
      "instanceId": "test-instance",
      "recipients": ["584121234567"]
    }
  }' | jq -r '.id')

# 3. Inicializar instancia
curl -X POST http://localhost:3001/api/whatsapp/instances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceId\": \"test-instance\",
    \"channelConfigId\": \"$CHANNEL_ID\"
  }"

# 4. Obtener QR (abre en navegador o guarda imagen)
curl -X GET http://localhost:3001/api/whatsapp/instances/test-instance/qr \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.qrImage' > qr.txt

# Ver el QR en terminal (requiere qrencode)
cat qr.txt | base64 -d | qrencode -t ansiutf8

# O simplemente abre el navegador y pega la URL:
echo "data:image/png;base64,$(cat qr.txt)" | pbcopy
```

### 3. Escanear QR

1. Abre WhatsApp en tu teléfono
2. Ve a **Configuración** → **Dispositivos vinculados**
3. Toca **Vincular un dispositivo**
4. Escanea el código QR

### 4. Verificar Conexión

```bash
curl -X GET http://localhost:3001/api/whatsapp/instances/test-instance/status \
  -H "Authorization: Bearer $TOKEN"
```

Deberías ver:
```json
{
  "instanceId": "test-instance",
  "status": "connected",
  "phoneNumber": "584121234567",
  "connectedAt": "2025-10-03T17:00:00.000Z"
}
```

### 5. Enviar Mensaje de Prueba

```bash
curl -X POST http://localhost:3001/api/whatsapp/instances/test-instance/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "584121234567",
    "message": "¡Hola desde Tote System!"
  }'
```

## Integración con Frontend

### Opción 1: Usar el Componente Incluido

```jsx
// app/admin/whatsapp/page.js
import WhatsAppInstanceManager from '@/components/admin/WhatsAppInstanceManager';

export default function WhatsAppPage() {
  return (
    <div className="container mx-auto p-6">
      <WhatsAppInstanceManager />
    </div>
  );
}
```

### Opción 2: Integración Manual

```jsx
'use client';

import { useState } from 'react';

export default function WhatsAppSetup() {
  const [qrImage, setQrImage] = useState(null);
  const [status, setStatus] = useState('disconnected');

  const initializeWhatsApp = async () => {
    const token = localStorage.getItem('token');
    
    // 1. Crear canal
    const channelRes = await fetch('/api/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'WHATSAPP',
        name: 'Mi WhatsApp',
        config: {
          type: 'baileys',
          instanceId: 'my-instance',
          recipients: ['584121234567']
        }
      })
    });
    
    const channel = await channelRes.json();
    
    // 2. Inicializar instancia
    await fetch('/api/whatsapp/instances', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instanceId: 'my-instance',
        channelConfigId: channel.id
      })
    });
    
    // 3. Obtener QR
    const qrRes = await fetch('/api/whatsapp/instances/my-instance/qr', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const qrData = await qrRes.json();
    setQrImage(qrData.qrImage);
    
    // 4. Polling para verificar conexión
    const checkConnection = setInterval(async () => {
      const statusRes = await fetch('/api/whatsapp/instances/my-instance/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const statusData = await statusRes.json();
      setStatus(statusData.status);
      
      if (statusData.status === 'connected') {
        clearInterval(checkConnection);
        setQrImage(null);
        alert('¡WhatsApp conectado!');
      }
    }, 2000);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Configurar WhatsApp</h1>
      
      {status === 'disconnected' && (
        <button 
          onClick={initializeWhatsApp}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          Conectar WhatsApp
        </button>
      )}
      
      {qrImage && (
        <div className="mt-4">
          <p className="mb-2">Escanea este código QR con WhatsApp:</p>
          <img src={qrImage} alt="QR Code" className="border-4 border-gray-200" />
        </div>
      )}
      
      {status === 'connected' && (
        <div className="mt-4 p-4 bg-green-100 text-green-800 rounded">
          ✅ WhatsApp conectado correctamente
        </div>
      )}
    </div>
  );
}
```

## Publicación Automática de Sorteos

Una vez configurado el canal, los sorteos se publican automáticamente cuando están en estado `DRAWN`.

### Configurar Destinatarios

Edita el canal para agregar/modificar destinatarios:

```bash
curl -X PUT http://localhost:3001/api/channels/$CHANNEL_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "type": "baileys",
      "instanceId": "test-instance",
      "recipients": [
        "584121234567",
        "584129876543",
        "584141111111"
      ]
    }
  }'
```

### Publicar Manualmente

Si necesitas republicar un sorteo:

```bash
# Obtener ID del sorteo
DRAW_ID="uuid-del-sorteo"

# Republicar
curl -X POST http://localhost:3001/api/draws/$DRAW_ID/republish/WHATSAPP \
  -H "Authorization: Bearer $TOKEN"
```

## Gestión de Múltiples Instancias

Puedes tener múltiples instancias de WhatsApp:

```bash
# Instancia 1: Canal Principal
curl -X POST http://localhost:3001/api/whatsapp/instances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "canal-principal"
  }'

# Instancia 2: Canal VIP
curl -X POST http://localhost:3001/api/whatsapp/instances \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "canal-vip"
  }'

# Listar todas
curl -X GET http://localhost:3001/api/whatsapp/instances \
  -H "Authorization: Bearer $TOKEN"
```

## Monitoreo

### Ver Estado de Todas las Instancias

```bash
curl -X GET http://localhost:3001/api/whatsapp/instances \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Ver Logs

```bash
# En tiempo real
tail -f backend/logs/combined.log | grep -i whatsapp

# Errores
tail -f backend/logs/error.log | grep -i whatsapp
```

## Troubleshooting Rápido

### Problema: QR no aparece

```bash
# Verificar que la instancia se creó
curl -X GET http://localhost:3001/api/whatsapp/instances/test-instance/status \
  -H "Authorization: Bearer $TOKEN"

# Reintentar
curl -X POST http://localhost:3001/api/whatsapp/instances/test-instance/reconnect \
  -H "Authorization: Bearer $TOKEN"
```

### Problema: Instancia se desconecta

```bash
# Reconectar
curl -X POST http://localhost:3001/api/whatsapp/instances/test-instance/reconnect \
  -H "Authorization: Bearer $TOKEN"

# Si persiste, eliminar y recrear
curl -X DELETE http://localhost:3001/api/whatsapp/instances/test-instance \
  -H "Authorization: Bearer $TOKEN"
```

### Problema: Mensajes no se envían

```bash
# 1. Verificar conexión
curl -X GET http://localhost:3001/api/whatsapp/instances/test-instance/status \
  -H "Authorization: Bearer $TOKEN"

# 2. Verificar número
curl -X POST http://localhost:3001/api/whatsapp/instances/test-instance/check-number \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "584121234567"}'

# 3. Probar mensaje
curl -X POST http://localhost:3001/api/whatsapp/instances/test-instance/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "584121234567",
    "message": "Test"
  }'
```

## Limpieza

### Limpiar Sesiones Inactivas

```bash
curl -X POST http://localhost:3001/api/whatsapp/cleanup \
  -H "Authorization: Bearer $TOKEN"
```

### Eliminar Instancia Completamente

```bash
# Esto elimina la instancia y todos sus datos
curl -X DELETE http://localhost:3001/api/whatsapp/instances/test-instance \
  -H "Authorization: Bearer $TOKEN"
```

## Próximos Pasos

1. ✅ Conectar primera instancia
2. ✅ Enviar mensaje de prueba
3. ✅ Configurar destinatarios
4. ✅ Probar publicación de sorteo
5. 📱 Agregar más instancias si es necesario
6. 📊 Monitorear logs y métricas

## Recursos

- [Documentación Completa](./WHATSAPP_BAILEYS_INTEGRATION.md)
- [Baileys Wiki](https://baileys.wiki/docs/intro/)
- [API Endpoints](./API_ENDPOINTS.md)

## Soporte

Si tienes problemas:
1. Revisa los logs: `backend/logs/`
2. Verifica el estado de la instancia
3. Consulta la documentación completa
4. Revisa issues de Baileys en GitHub
