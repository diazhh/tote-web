# Modelo de Datos - Sistema Totalizador de Loterías

## Entidades Principales

### 1. Game (Juego)
Representa un juego de lotería (Triple, Ruleta, etc.)

```prisma
model Game {
  id            String        @id @default(uuid())
  name          String        // "Triple A", "Ruleta Caracas"
  type          GameType      // "TRIPLE" | "ROULETTE"
  slug          String        @unique
  totalNumbers  Int           // 1000 para triple, variable para ruleta
  isActive      Boolean       @default(true)
  description   String?
  config        Json?         // Configuración adicional
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  
  // Relaciones
  items         GameItem[]
  templates     DrawTemplate[]
  draws         Draw[]
  pauses        DrawPause[]
}

enum GameType {
  TRIPLE
  ROULETTE
}
```

---

### 2. GameItem (Número del Juego)
Representa cada número individual de un juego con su nombre

```prisma
model GameItem {
  id            String    @id @default(uuid())
  gameId        String
  number        String    // "000", "001", "00", "36"
  name          String    // "Ballena", "Mariposa"
  displayOrder  Int       // Para ordenar
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relaciones
  game                Game    @relation(fields: [gameId], references: [id], onDelete: Cascade)
  drawsAsPreselected  Draw[]  @relation("PreselectedItem")
  drawsAsWinner       Draw[]  @relation("WinnerItem")
  
  @@unique([gameId, number])
  @@index([gameId])
}
```

---

### 3. DrawTemplate (Plantilla de Sorteo)
Define cuándo y cómo se generan los sorteos automáticamente

```prisma
model DrawTemplate {
  id          String    @id @default(uuid())
  gameId      String
  name        String    // "Plantilla Lunes-Viernes"
  description String?
  daysOfWeek  Int[]     // [1,2,3,4,5] (1=Lunes, 7=Domingo)
  drawTimes   String[]  // ["08:00", "09:00", "10:00"]
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relaciones
  game        Game      @relation(fields: [gameId], references: [id], onDelete: Cascade)
  draws       Draw[]
  
  @@index([gameId])
}
```

---

### 4. Draw (Sorteo)
Representa un sorteo individual con toda su información

```prisma
model Draw {
  id                  String        @id @default(uuid())
  gameId              String
  templateId          String?
  scheduledAt         DateTime      // Hora programada
  status              DrawStatus    @default(SCHEDULED)
  preselectedItemId   String?
  winnerItemId        String?
  imageUrl            String?
  closedAt            DateTime?
  drawnAt             DateTime?
  publishedAt         DateTime?
  notes               String?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  
  // Relaciones
  game                Game          @relation(fields: [gameId], references: [id], onDelete: Cascade)
  template            DrawTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  preselectedItem     GameItem?     @relation("PreselectedItem", fields: [preselectedItemId], references: [id], onDelete: SetNull)
  winnerItem          GameItem?     @relation("WinnerItem", fields: [winnerItemId], references: [id], onDelete: SetNull)
  publications        DrawPublication[]
  
  @@index([gameId])
  @@index([scheduledAt])
  @@index([status])
}

enum DrawStatus {
  SCHEDULED   // Programado
  CLOSED      // Cerrado (5 min antes)
  DRAWN       // Ejecutado (número seleccionado)
  PUBLISHED   // Publicado en canales
  CANCELLED   // Cancelado
}
```

---

### 5. DrawPublication (Publicación de Sorteo)
Rastrea el estado de publicación en cada canal

```prisma
model DrawPublication {
  id          String            @id @default(uuid())
  drawId      String
  channel     Channel
  status      PublicationStatus @default(PENDING)
  sentAt      DateTime?
  externalId  String?           // ID del mensaje en el canal
  error       String?
  retries     Int               @default(0)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  
  // Relaciones
  draw        Draw              @relation(fields: [drawId], references: [id], onDelete: Cascade)
  
  @@unique([drawId, channel])
  @@index([drawId])
  @@index([status])
}

enum Channel {
  TELEGRAM
  WHATSAPP
  FACEBOOK
  INSTAGRAM
  TIKTOK
}

enum PublicationStatus {
  PENDING   // Pendiente
  SENT      // Enviado
  FAILED    // Fallido
  SKIPPED   // Omitido
}
```

---

### 6. DrawPause (Pausa de Sorteo)
Define períodos donde no se deben generar sorteos

```prisma
model DrawPause {
  id          String    @id @default(uuid())
  gameId      String
  startDate   DateTime  // Fecha de inicio (fecha completa)
  endDate     DateTime  // Fecha de fin (fecha completa)
  reason      String?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relaciones
  game        Game      @relation(fields: [gameId], references: [id], onDelete: Cascade)
  
  @@index([gameId])
  @@index([startDate, endDate])
}
```

---

### 7. ChannelConfig (Configuración de Canal)
Almacena la configuración y credenciales de cada canal

```prisma
model ChannelConfig {
  id          String    @id @default(uuid())
  name        String    // "Canal Telegram Principal"
  type        Channel
  config      Json      // Credenciales y configuración encriptada
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@unique([type, name])
}
```

---

### 8. User (Usuario Administrador)
Usuarios del sistema con diferentes roles

```prisma
model User {
  id              String    @id @default(uuid())
  username        String    @unique
  email           String    @unique
  password        String    // Hash bcrypt
  role            UserRole  @default(OPERATOR)
  telegramUserId  String?   @unique // Para bot de Telegram
  isActive        Boolean   @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relaciones
  auditLogs       AuditLog[]
}

enum UserRole {
  ADMIN     // Acceso completo
  OPERATOR  // Gestión de sorteos
  VIEWER    // Solo lectura
}
```

---

### 9. AuditLog (Registro de Auditoría)
Registra todas las acciones importantes del sistema

```prisma
model AuditLog {
  id          String    @id @default(uuid())
  userId      String?
  action      String    // "DRAW_CREATED", "WINNER_CHANGED", etc.
  entity      String    // "Draw", "Game", etc.
  entityId    String
  changes     Json?     // Cambios realizados
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime  @default(now())
  
  // Relaciones
  user        User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
  
  @@index([userId])
  @@index([entity, entityId])
  @@index([createdAt])
}
```

---

## Diagrama de Relaciones

```
Game (1) ──→ (N) GameItem
Game (1) ──→ (N) DrawTemplate
Game (1) ──→ (N) Draw
Game (1) ──→ (N) DrawPause

DrawTemplate (1) ──→ (N) Draw

GameItem (1) ──→ (N) Draw (as preselectedItem)
GameItem (1) ──→ (N) Draw (as winnerItem)

Draw (1) ──→ (N) DrawPublication

User (1) ──→ (N) AuditLog
```

---

## Índices para Optimización

```prisma
// Ya incluidos en los modelos arriba:

// GameItem
@@index([gameId])
@@unique([gameId, number])

// DrawTemplate
@@index([gameId])

// Draw
@@index([gameId])
@@index([scheduledAt])
@@index([status])

// DrawPublication
@@index([drawId])
@@index([status])
@@unique([drawId, channel])

// DrawPause
@@index([gameId])
@@index([startDate, endDate])

// AuditLog
@@index([userId])
@@index([entity, entityId])
@@index([createdAt])
```

---

## Queries Comunes Optimizadas

### 1. Obtener sorteos de hoy
```typescript
const todayDraws = await prisma.draw.findMany({
  where: {
    scheduledAt: {
      gte: new Date(new Date().setHours(0, 0, 0, 0)),
      lt: new Date(new Date().setHours(23, 59, 59, 999))
    }
  },
  include: {
    game: true,
    winnerItem: true,
    publications: true
  },
  orderBy: {
    scheduledAt: 'asc'
  }
});
```

### 2. Próximo sorteo
```typescript
const nextDraw = await prisma.draw.findFirst({
  where: {
    scheduledAt: {
      gte: new Date()
    },
    status: {
      in: ['SCHEDULED', 'CLOSED']
    }
  },
  include: {
    game: true,
    preselectedItem: true
  },
  orderBy: {
    scheduledAt: 'asc'
  }
});
```

### 3. Sorteos que deben cerrarse (5 min antes)
```typescript
const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
const drawsToClose = await prisma.draw.findMany({
  where: {
    status: 'SCHEDULED',
    scheduledAt: {
      lte: fiveMinutesFromNow,
      gte: new Date()
    }
  },
  include: {
    game: {
      include: {
        items: {
          where: {
            isActive: true
          }
        }
      }
    }
  }
});
```

### 4. Publicaciones pendientes
```typescript
const pendingPublications = await prisma.drawPublication.findMany({
  where: {
    status: 'PENDING'
  },
  include: {
    draw: {
      include: {
        game: true,
        winnerItem: true
      }
    }
  },
  orderBy: {
    createdAt: 'asc'
  },
  take: 10
});
```

### 5. Histórico de sorteos con filtros
```typescript
const history = await prisma.draw.findMany({
  where: {
    gameId: gameId,
    status: 'PUBLISHED',
    scheduledAt: {
      gte: startDate,
      lte: endDate
    }
  },
  include: {
    game: true,
    winnerItem: true
  },
  orderBy: {
    scheduledAt: 'desc'
  },
  skip: (page - 1) * pageSize,
  take: pageSize
});
```

---

## Consideraciones de Diseño

### 1. Soft Delete vs Hard Delete
- Se usa **isActive** en lugar de soft delete para entidades principales
- Los sorteos cancelados usan status **CANCELLED** en lugar de eliminarse

### 2. Timestamps
- Todos los modelos tienen `createdAt` y `updatedAt`
- Sorteos tienen timestamps específicos: `closedAt`, `drawnAt`, `publishedAt`

### 3. Cascada
- Al eliminar un Game, se eliminan todos sus items, templates, draws y pauses
- Al eliminar un Draw, se eliminan todas sus publications
- Al eliminar un User, se preservan los audit logs pero se marca como null

### 4. JSON Fields
- `Game.config`: Configuración flexible por juego (ej: config de imagen)
- `ChannelConfig.config`: Credenciales y settings de canal
- `AuditLog.changes`: Registro detallado de cambios

### 5. Unicidad
- `Game.slug`: Para URLs amigables
- `User.username` y `User.email`: Para autenticación
- `GameItem.gameId + number`: Un número por juego
- `DrawPublication.drawId + channel`: Una publicación por canal por sorteo
