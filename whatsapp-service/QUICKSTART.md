# Inicio Rápido - Servicio WhatsApp

## Instalación en 5 Pasos

### 1. Navegar al directorio
```bash
cd whatsapp-service
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
nano .env  # o usar tu editor preferido
```

Configurar:
```env
PORT=3002
BACKEND_URL=http://localhost:3000
BACKEND_API_KEY=ToteWhatsApp2024SecureKey
SESSION_PATH=./whatsapp-session
LOG_LEVEL=info
```

### 4. Iniciar el servicio
```bash
# Opción 1: Con script automático
chmod +x start.sh
./start.sh

# Opción 2: Directamente con PM2
pm2 start ecosystem.config.js

# Opción 3: Modo desarrollo
npm run dev
```

### 5. Verificar funcionamiento
```bash
curl http://localhost:3002/health
```

## Conectar WhatsApp

### Desde la línea de comandos:

```bash
# 1. Inicializar cliente
curl -X POST http://localhost:3002/api/whatsapp/initialize \
  -H "x-api-key: ToteWhatsApp2024SecureKey"

# 2. Obtener QR (esperar 5 segundos después de inicializar)
curl http://localhost:3002/api/whatsapp/qr \
  -H "x-api-key: ToteWhatsApp2024SecureKey"

# 3. Copiar el data URL del QR y abrirlo en navegador
# O usar una herramienta para mostrar el QR en terminal
```

### Desde el backoffice (recomendado):

1. Ir a la sección de Configuración WhatsApp
2. Hacer clic en "Inicializar WhatsApp"
3. Escanear el QR con tu teléfono
4. ¡Listo!

## Verificar Conexión

```bash
# Ver estado
curl http://localhost:3002/api/whatsapp/status \
  -H "x-api-key: ToteWhatsApp2024SecureKey"

# Listar grupos disponibles
curl http://localhost:3002/api/whatsapp/groups \
  -H "x-api-key: ToteWhatsApp2024SecureKey"
```

## Prueba de Envío

```bash
# Enviar mensaje de prueba
curl -X POST http://localhost:3002/api/whatsapp/send/text \
  -H "x-api-key: ToteWhatsApp2024SecureKey" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "GRUPO_ID@g.us",
    "message": "Mensaje de prueba desde Tote"
  }'
```

## Comandos Útiles

```bash
# Ver logs en tiempo real
pm2 logs whatsapp-service

# Ver estado del servicio
pm2 status

# Reiniciar servicio
pm2 restart whatsapp-service

# Detener servicio
pm2 stop whatsapp-service

# Eliminar del PM2
pm2 delete whatsapp-service
```

## Solución de Problemas

### El QR no aparece
```bash
# Verificar logs
pm2 logs whatsapp-service --lines 50

# Reiniciar e intentar de nuevo
pm2 restart whatsapp-service
sleep 5
curl -X POST http://localhost:3002/api/whatsapp/initialize \
  -H "x-api-key: ToteWhatsApp2024SecureKey"
```

### Desconexión frecuente
```bash
# Eliminar sesión y reconectar
rm -rf whatsapp-session
pm2 restart whatsapp-service
# Volver a escanear QR
```

### Puerto ocupado
```bash
# Cambiar puerto en .env
PORT=3003

# Reiniciar
pm2 restart whatsapp-service
```

## Integración con Backend

Ver archivo `INTEGRATION.md` para detalles completos de integración con el backend de Tote.

## Próximos Pasos

1. ✅ Conectar WhatsApp escaneando QR
2. ✅ Obtener lista de grupos
3. ✅ Configurar grupos en `publication_channels` del backend
4. ✅ Probar envío manual desde el backoffice
5. ✅ Verificar publicación automática de sorteos

## Soporte

Para más información, consultar:
- `README.md` - Documentación completa de la API
- `INTEGRATION.md` - Guía de integración con backend
- Logs: `logs/combined.log` y `logs/error.log`
