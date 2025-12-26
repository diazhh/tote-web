# WhatsApp Service for Tote System

Standalone WhatsApp service using `whatsapp-web.js` that provides a REST API for WhatsApp integration with the Tote backend.

## Features

- 📱 QR Code generation for authentication
- 👥 Group management and listing
- 📤 Send text messages to users and groups
- 🖼️ Send images (from URL, file path, or base64)
- 📊 Multiple recipient support
- 🔐 API key authentication
- 📝 Comprehensive logging
- 🔄 Session persistence

## Installation

```bash
cd whatsapp-service
npm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:
```env
PORT=3002
BACKEND_URL=http://localhost:3000
BACKEND_API_KEY=your_secure_api_key_here
SESSION_PATH=./whatsapp-session
LOG_LEVEL=info
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Using PM2
```bash
pm2 start src/index.js --name whatsapp-service
pm2 save
```

## API Endpoints

All endpoints require the `x-api-key` header with your configured API key.

### Authentication & Status

#### Initialize WhatsApp Client
```bash
POST /api/whatsapp/initialize
```

#### Get Status
```bash
GET /api/whatsapp/status
```

Response:
```json
{
  "isReady": true,
  "isInitializing": false,
  "connectionStatus": "connected",
  "hasQR": false
}
```

#### Get QR Code
```bash
GET /api/whatsapp/qr
```

Response:
```json
{
  "qrCode": "data:image/png;base64,..."
}
```

### Groups Management

#### List All Groups
```bash
GET /api/whatsapp/groups
```

Response:
```json
{
  "groups": [
    {
      "id": "123456789@g.us",
      "name": "Group Name",
      "participantsCount": 10,
      "isReadOnly": false,
      "timestamp": 1234567890
    }
  ]
}
```

#### Get Group Details
```bash
GET /api/whatsapp/groups/:groupId
```

### Messaging

#### Send Text Message
```bash
POST /api/whatsapp/send/text
Content-Type: application/json

{
  "chatId": "123456789@g.us",
  "message": "Hello from Tote!"
}
```

#### Send Image from URL
```bash
POST /api/whatsapp/send/image
Content-Type: application/json

{
  "chatId": "123456789@g.us",
  "imageUrl": "https://example.com/image.jpg",
  "caption": "Check out this image!"
}
```

#### Send Image from File Path
```bash
POST /api/whatsapp/send/image
Content-Type: application/json

{
  "chatId": "123456789@g.us",
  "imagePath": "/path/to/image.jpg",
  "caption": "Image from file"
}
```

#### Send Image from Base64
```bash
POST /api/whatsapp/send/image
Content-Type: application/json

{
  "chatId": "123456789@g.us",
  "imageBase64": "base64_encoded_image_data",
  "filename": "image.jpg",
  "caption": "Image from base64"
}
```

#### Send to Multiple Recipients
```bash
POST /api/whatsapp/send/multiple
Content-Type: application/json

{
  "chatIds": ["123456789@g.us", "987654321@g.us"],
  "message": "Broadcast message",
  "imageData": {
    "type": "url",
    "url": "https://example.com/image.jpg"
  }
}
```

Response:
```json
{
  "success": true,
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  },
  "results": [
    {
      "chatId": "123456789@g.us",
      "success": true,
      "messageId": "...",
      "timestamp": 1234567890
    }
  ]
}
```

### Contact Information

#### Get Contact Info
```bash
GET /api/whatsapp/contacts/:contactId
```

### Session Management

#### Logout
```bash
POST /api/whatsapp/logout
```

#### Destroy Client
```bash
POST /api/whatsapp/destroy
```

## Integration with Backend

### Example: Send Draw Results to Groups

```javascript
const axios = require('axios');

async function sendDrawResultsToGroups(drawData, groupIds) {
  const response = await axios.post(
    'http://localhost:3002/api/whatsapp/send/multiple',
    {
      chatIds: groupIds,
      message: `🎰 Resultados del Sorteo\n\nJuego: ${drawData.gameName}\nHora: ${drawData.drawTime}\nResultado: ${drawData.result}`,
      imageData: {
        type: 'url',
        url: drawData.imageUrl
      }
    },
    {
      headers: {
        'x-api-key': process.env.WHATSAPP_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
}
```

### Example: Get Available Groups

```javascript
async function getWhatsAppGroups() {
  const response = await axios.get(
    'http://localhost:3002/api/whatsapp/groups',
    {
      headers: {
        'x-api-key': process.env.WHATSAPP_API_KEY
      }
    }
  );
  
  return response.data.groups;
}
```

## Architecture

```
whatsapp-service/
├── src/
│   ├── config/
│   │   ├── config.js          # Configuration management
│   │   └── logger.js          # Winston logger setup
│   ├── controllers/
│   │   └── whatsapp.controller.js  # Request handlers
│   ├── middleware/
│   │   └── auth.middleware.js      # API key authentication
│   ├── routes/
│   │   └── whatsapp.routes.js      # Express routes
│   ├── services/
│   │   └── whatsapp.service.js     # WhatsApp client logic
│   └── index.js               # Express app entry point
├── logs/                      # Application logs
├── whatsapp-session/          # WhatsApp session data
├── .env                       # Environment variables
├── .env.example              # Example environment file
├── package.json
└── README.md
```

## Security Considerations

1. **API Key**: Always use a strong, unique API key
2. **Session Files**: Keep `whatsapp-session/` directory secure and backed up
3. **Network**: Run behind a firewall or reverse proxy in production
4. **Rate Limiting**: Consider adding rate limiting for production use

## Troubleshooting

### QR Code Not Appearing
- Ensure the client is initialized: `POST /api/whatsapp/initialize`
- Check logs in `logs/combined.log`
- Verify session directory is writable

### Authentication Failures
- Delete `whatsapp-session/` directory and re-authenticate
- Check if WhatsApp Web is accessible from your server

### Image Sending Fails
- Verify image URL is accessible
- Check file path permissions for local files
- Ensure base64 data is properly encoded

### Client Disconnects
- WhatsApp may disconnect after inactivity
- Implement automatic reconnection in your backend
- Monitor the `/api/whatsapp/status` endpoint

## Logs

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

## Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "whatsapp-service",
  "whatsapp": {
    "isReady": true,
    "isInitializing": false,
    "connectionStatus": "connected",
    "hasQR": false
  }
}
```

## License

ISC
