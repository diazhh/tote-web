# API Endpoints - Sistema Totalizador de Loterías

Base URL: `http://localhost:3001/api`

---

## APIs PÚBLICAS (sin autenticación)

### GET `/api/public/games`
Listar juegos activos

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Triple Pantera",
      "slug": "triple",
      "type": "TRIPLE",
      "description": "Juego de 3 cifras"
    },
    {
      "id": "uuid",
      "name": "Ruleta",
      "slug": "ruleta",
      "type": "ROULETTE"
    },
    {
      "id": "uuid",
      "name": "Animalitos",
      "slug": "animalitos",
      "type": "ROULETTE"
    }
  ]
}
```

---

### GET `/api/public/draws/today`
Obtener sorteos de hoy (todos los juegos)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "game": {
        "name": "Triple Pantera",
        "slug": "triple"
      },
      "scheduledAt": "2025-10-01T08:00:00Z",
      "status": "PUBLISHED",
      "winnerItem": {
        "number": "123",
        "name": "Mariposa"
      },
      "imageUrl": "/storage/images/draws/triple_20251001_0800.png"
    }
  ]
}
```

---

### GET `/api/public/draws/game/:gameSlug/today`
Obtener sorteos de hoy para un juego específico

**Params:**
- `gameSlug`: slug del juego (triple, ruleta, animalitos)

---

### GET `/api/public/draws/game/:gameSlug/history`
Obtener histórico de sorteos de un juego

**Params:**
- `gameSlug`: slug del juego

**Query params:**
- `page` (number): Página (default: 1)
- `pageSize` (number): Tamaño (default: 20)
- `startDate` (ISO date): Fecha inicio
- `endDate` (ISO date): Fecha fin
- `number` (string): Filtrar por número ganador

**Response:**
```json
{
  "success": true,
  "data": {
    "draws": [
      {
        "id": "uuid",
        "scheduledAt": "2025-10-01T08:00:00Z",
        "winnerItem": {
          "number": "123",
          "name": "Mariposa"
        },
        "imageUrl": "/storage/images/draws/triple_20251001_0800.png"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

### GET `/api/public/draws/:id`
Obtener detalle de un sorteo específico

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "game": {
      "name": "Triple Pantera",
      "slug": "triple"
    },
    "scheduledAt": "2025-10-01T08:00:00Z",
    "winnerItem": {
      "number": "123",
      "name": "Mariposa"
    },
    "imageUrl": "/storage/images/draws/triple_20251001_0800.png",
    "publishedAt": "2025-10-01T08:01:00Z"
  }
}
```

---

### GET `/api/public/stats/:gameSlug`
Estadísticas públicas de un juego

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDraws": 156,
    "mostDrawnNumbers": [
      { "number": "123", "name": "Mariposa", "count": 5 }
    ],
    "recentWinners": [
      { "number": "456", "date": "2025-10-01" }
    ]
  }
}
```

---

## APIs PRIVADAS (requieren autenticación)

## 1. Autenticación

### POST `/auth/login`
Iniciar sesión

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token"
  }
}
```

---

### POST `/auth/logout`
Cerrar sesión

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### POST `/auth/refresh`
Renovar token de acceso

**Request:**
```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-token"
  }
}
```

---

### GET `/auth/me`
Obtener usuario actual

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "role": "ADMIN",
    "telegramUserId": "123456789"
  }
}
```

---

## 2. Juegos

### GET `/games`
Listar todos los juegos

**Query params:**
- `isActive` (boolean): Filtrar por estado activo

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Triple A",
      "type": "TRIPLE",
      "slug": "triple-a",
      "totalNumbers": 1000,
      "isActive": true,
      "description": "Juego Triple A",
      "createdAt": "2025-10-01T10:00:00Z"
    }
  ]
}
```

---

### POST `/games`
Crear un juego

**Request:**
```json
{
  "name": "Triple A",
  "type": "TRIPLE",
  "slug": "triple-a",
  "totalNumbers": 1000,
  "description": "Juego Triple A",
  "config": {
    "imageTemplate": "template-triple"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Triple A",
    "type": "TRIPLE",
    "slug": "triple-a",
    "totalNumbers": 1000,
    "isActive": true
  }
}
```

---

### GET `/games/:id`
Obtener un juego específico

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Triple A",
    "type": "TRIPLE",
    "slug": "triple-a",
    "totalNumbers": 1000,
    "isActive": true,
    "config": {},
    "_count": {
      "items": 1000,
      "draws": 156
    }
  }
}
```

---

### PUT `/games/:id`
Actualizar un juego

**Request:**
```json
{
  "name": "Triple A Updated",
  "isActive": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Triple A Updated",
    "isActive": false
  }
}
```

---

### DELETE `/games/:id`
Eliminar un juego (soft delete)

**Response:**
```json
{
  "success": true,
  "message": "Game deleted successfully"
}
```

---

### GET `/games/:id/items`
Listar números de un juego

**Query params:**
- `page` (number): Página (default: 1)
- `pageSize` (number): Tamaño de página (default: 100)
- `search` (string): Buscar por número o nombre

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "number": "000",
        "name": "Ballena",
        "displayOrder": 0,
        "isActive": true
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 100,
      "total": 1000,
      "totalPages": 10
    }
  }
}
```

---

### POST `/games/:id/items`
Agregar número a un juego

**Request:**
```json
{
  "number": "000",
  "name": "Ballena",
  "displayOrder": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "number": "000",
    "name": "Ballena",
    "isActive": true
  }
}
```

---

### PUT `/games/:id/items/:itemId`
Actualizar número de un juego

**Request:**
```json
{
  "name": "Ballena Grande",
  "isActive": false
}
```

---

### DELETE `/games/:id/items/:itemId`
Eliminar número de un juego

---

## 3. Plantillas de Sorteo

### GET `/templates`
Listar plantillas

**Query params:**
- `gameId` (string): Filtrar por juego
- `isActive` (boolean): Filtrar por estado

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Plantilla Lunes-Viernes",
      "gameId": "uuid",
      "game": {
        "name": "Triple A"
      },
      "daysOfWeek": [1, 2, 3, 4, 5],
      "drawTimes": ["08:00", "09:00", "10:00"],
      "isActive": true
    }
  ]
}
```

---

### POST `/templates`
Crear plantilla

**Request:**
```json
{
  "name": "Plantilla Lunes-Viernes",
  "gameId": "uuid",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "drawTimes": ["08:00", "09:00", "10:00"],
  "description": "Sorteos de lunes a viernes"
}
```

---

### GET `/templates/:id`
Obtener plantilla

---

### PUT `/templates/:id`
Actualizar plantilla

---

### DELETE `/templates/:id`
Eliminar plantilla

---

## 4. Sorteos

### GET `/draws`
Listar sorteos

**Query params:**
- `gameId` (string): Filtrar por juego
- `status` (string): Filtrar por estado
- `startDate` (ISO date): Fecha inicio
- `endDate` (ISO date): Fecha fin
- `page` (number): Página
- `pageSize` (number): Tamaño de página

**Response:**
```json
{
  "success": true,
  "data": {
    "draws": [
      {
        "id": "uuid",
        "game": {
          "id": "uuid",
          "name": "Triple A",
          "type": "TRIPLE"
        },
        "scheduledAt": "2025-10-01T08:00:00Z",
        "status": "PUBLISHED",
        "winnerItem": {
          "number": "123",
          "name": "Mariposa"
        },
        "imageUrl": "/storage/images/draws/triple-a/2025/10/uuid.png",
        "publications": [
          {
            "channel": "TELEGRAM",
            "status": "SENT",
            "sentAt": "2025-10-01T08:01:00Z"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### POST `/draws`
Crear sorteo manual

**Request:**
```json
{
  "gameId": "uuid",
  "scheduledAt": "2025-10-01T15:00:00Z",
  "notes": "Sorteo especial"
}
```

---

### GET `/draws/:id`
Obtener sorteo específico

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "game": {
      "id": "uuid",
      "name": "Triple A"
    },
    "scheduledAt": "2025-10-01T08:00:00Z",
    "status": "PUBLISHED",
    "preselectedItem": {
      "number": "123",
      "name": "Mariposa"
    },
    "winnerItem": {
      "number": "123",
      "name": "Mariposa"
    },
    "imageUrl": "/storage/images/draws/uuid.png",
    "closedAt": "2025-10-01T07:55:00Z",
    "drawnAt": "2025-10-01T08:00:00Z",
    "publishedAt": "2025-10-01T08:01:00Z",
    "publications": [
      {
        "id": "uuid",
        "channel": "TELEGRAM",
        "status": "SENT",
        "sentAt": "2025-10-01T08:01:00Z",
        "externalId": "telegram-message-id"
      }
    ]
  }
}
```

---

### PUT `/draws/:id`
Actualizar sorteo

---

### DELETE `/draws/:id`
Cancelar sorteo

---

### POST `/draws/generate-daily`
Generar sorteos del día

**Request:**
```json
{
  "date": "2025-10-01"  // Opcional, default: hoy
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created": 25,
    "draws": [...]
  }
}
```

---

### GET `/draws/today`
Obtener sorteos de hoy

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "game": { "name": "Triple A" },
      "scheduledAt": "2025-10-01T08:00:00Z",
      "status": "PUBLISHED"
    }
  ]
}
```

---

### GET `/draws/upcoming`
Obtener próximos sorteos

**Query params:**
- `limit` (number): Cantidad de sorteos (default: 5)

---

### GET `/draws/history`
Obtener histórico de sorteos

**Query params:**
- `gameId` (string): Filtrar por juego
- `startDate` (ISO date)
- `endDate` (ISO date)
- `page` (number)
- `pageSize` (number)

---

### POST `/draws/:id/preselect`
Preseleccionar ganador (automático o manual)

**Request:**
```json
{
  "itemId": "uuid"  // Opcional, si no se envía se selecciona aleatorio
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CLOSED",
    "preselectedItem": {
      "number": "123",
      "name": "Mariposa"
    },
    "closedAt": "2025-10-01T07:55:00Z"
  }
}
```

---

### POST `/draws/:id/change-winner`
Cambiar número ganador

**Request:**
```json
{
  "itemId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "preselectedItem": {
      "number": "456",
      "name": "Nueva opción"
    },
    "changedBy": "admin",
    "changedAt": "2025-10-01T07:58:00Z"
  }
}
```

---

### POST `/draws/:id/publish`
Forzar publicación manual

**Request:**
```json
{
  "channels": ["TELEGRAM", "WHATSAPP"]  // Opcional, default: todos
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "published": 2,
    "failed": 0
  }
}
```

---

### GET `/draws/:id/publications`
Obtener estado de publicaciones

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "channel": "TELEGRAM",
      "status": "SENT",
      "sentAt": "2025-10-01T08:01:00Z",
      "externalId": "message-123"
    },
    {
      "channel": "WHATSAPP",
      "status": "FAILED",
      "error": "Connection timeout",
      "retries": 2
    }
  ]
}
```

---

## 5. Pausas de Sorteo

### GET `/pauses`
Listar pausas

**Query params:**
- `gameId` (string)
- `active` (boolean): Solo pausas activas

---

### POST `/pauses`
Crear pausa

**Request:**
```json
{
  "gameId": "uuid",
  "startDate": "2025-10-15T00:00:00Z",
  "endDate": "2025-10-17T23:59:59Z",
  "reason": "Feriado nacional"
}
```

---

### PUT `/pauses/:id`
Actualizar pausa

---

### DELETE `/pauses/:id`
Eliminar pausa

---

## 6. Canales

### GET `/channels`
Listar canales configurados

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Canal Telegram Principal",
      "type": "TELEGRAM",
      "isActive": true,
      "lastTestAt": "2025-10-01T10:00:00Z",
      "lastTestStatus": "success"
    }
  ]
}
```

---

### POST `/channels`
Crear canal

**Request:**
```json
{
  "name": "Canal Telegram Principal",
  "type": "TELEGRAM",
  "config": {
    "chatId": "-1001234567890",
    "botToken": "123456:ABC-DEF..."
  }
}
```

---

### PUT `/channels/:id`
Actualizar canal

---

### DELETE `/channels/:id`
Eliminar canal

---

### GET `/channels/:id/test`
Probar conexión de canal

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "connected",
    "message": "Connection successful"
  }
}
```

---

## 7. Estadísticas

### GET `/stats/dashboard`
Dashboard principal

**Response:**
```json
{
  "success": true,
  "data": {
    "today": {
      "totalDraws": 25,
      "completed": 10,
      "pending": 15
    },
    "publications": {
      "sent": 40,
      "failed": 2,
      "pending": 8
    },
    "games": {
      "active": 3,
      "total": 5
    }
  }
}
```

---

### GET `/stats/game/:id`
Estadísticas de un juego

**Query params:**
- `startDate` (ISO date)
- `endDate` (ISO date)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDraws": 156,
    "mostDrawnNumbers": [
      { "number": "123", "name": "Mariposa", "count": 5 },
      { "number": "456", "name": "Gato", "count": 4 }
    ],
    "leastDrawnNumbers": [
      { "number": "999", "name": "Otro", "count": 1 }
    ]
  }
}
```

---

## 8. Usuarios

### GET `/users`
Listar usuarios

---

### POST `/users`
Crear usuario

**Request:**
```json
{
  "username": "operator1",
  "email": "operator@example.com",
  "password": "password123",
  "role": "OPERATOR",
  "telegramUserId": "123456789"
}
```

---

### PUT `/users/:id`
Actualizar usuario

---

### DELETE `/users/:id`
Eliminar usuario

---

## 9. Logs de Auditoría

### GET `/audit-logs`
Listar logs

**Query params:**
- `userId` (string)
- `entity` (string)
- `entityId` (string)
- `action` (string)
- `startDate` (ISO date)
- `endDate` (ISO date)
- `page` (number)
- `pageSize` (number)

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "uuid",
        "user": {
          "username": "admin"
        },
        "action": "WINNER_CHANGED",
        "entity": "Draw",
        "entityId": "uuid",
        "changes": {
          "from": "123",
          "to": "456"
        },
        "createdAt": "2025-10-01T07:58:00Z"
      }
    ],
    "pagination": {...}
  }
}
```

---

## WebSocket Events

### Eventos del Servidor

#### `draw:scheduled`
```json
{
  "drawId": "uuid",
  "gameId": "uuid",
  "scheduledAt": "2025-10-01T15:00:00Z"
}
```

#### `draw:closing`
```json
{
  "drawId": "uuid",
  "gameId": "uuid",
  "scheduledAt": "2025-10-01T15:00:00Z",
  "minutesRemaining": 5
}
```

#### `draw:closed`
```json
{
  "drawId": "uuid",
  "gameId": "uuid",
  "preselectedItem": {
    "number": "123",
    "name": "Mariposa"
  }
}
```

#### `draw:winner-selected`
```json
{
  "drawId": "uuid",
  "gameId": "uuid",
  "winnerItem": {
    "number": "123",
    "name": "Mariposa"
  }
}
```

#### `draw:published`
```json
{
  "drawId": "uuid",
  "imageUrl": "/storage/images/..."
}
```

#### `publication:sent`
```json
{
  "drawId": "uuid",
  "channel": "TELEGRAM",
  "externalId": "message-123"
}
```

#### `publication:failed`
```json
{
  "drawId": "uuid",
  "channel": "WHATSAPP",
  "error": "Connection timeout"
}
```

---

## Códigos de Error

```json
{
  "success": false,
  "error": {
    "code": "DRAW_NOT_FOUND",
    "message": "Draw not found",
    "details": {}
  }
}
```

### Códigos Comunes
- `UNAUTHORIZED` (401): No autenticado
- `FORBIDDEN` (403): Sin permisos
- `NOT_FOUND` (404): Recurso no encontrado
- `VALIDATION_ERROR` (400): Error de validación
- `DRAW_ALREADY_EXECUTED` (400): Sorteo ya ejecutado
- `DRAW_NOT_CLOSED` (400): Sorteo no cerrado aún
- `CHANNEL_CONNECTION_ERROR` (500): Error de conexión con canal
