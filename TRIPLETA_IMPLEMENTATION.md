# Implementación de Modalidad Tripleta

## Descripción General

La modalidad **Tripleta** es un sistema de apuestas especial que permite a los jugadores seleccionar 3 números diferentes. Si los 3 números salen en los próximos sorteos configurados (dentro de la cantidad de sorteos especificada), el jugador gana el monto apostado multiplicado por un multiplicador configurable.

## Características Principales

### Configuración por Juego
- **Habilitación**: Cada juego puede tener la modalidad Tripleta habilitada o deshabilitada
- **Multiplicador**: Factor por el cual se multiplica el monto apostado (ej: 50x)
- **Cantidad de Sorteos**: Número de sorteos consecutivos en los que la apuesta estará activa (ej: 10 sorteos)

### Funcionamiento
1. El jugador selecciona 3 números diferentes del juego
2. Realiza una apuesta con un monto específico
3. La apuesta es válida por los próximos N sorteos (configurado en el juego)
4. Si los 3 números salen en cualquiera de esos sorteos, gana
5. El premio es: `monto_apostado × multiplicador`
6. Si los sorteos expiran sin que salgan los 3 números, la apuesta se marca como expirada

## Implementación Técnica

### 1. Base de Datos

#### Nuevo Modelo: `TripleBet`
```prisma
model TripleBet {
  id              String          @id @default(uuid())
  userId          String
  gameId          String
  item1Id         String          // Primer número
  item2Id         String          // Segundo número
  item3Id         String          // Tercer número
  amount          Decimal         @db.Decimal(12, 2)
  multiplier      Decimal         @db.Decimal(10, 2)
  drawsCount      Int             // Cantidad de sorteos
  startDrawId     String          // Sorteo inicial
  endDrawId       String?         // Sorteo final
  winnerDrawId    String?         // Sorteo ganador (si aplica)
  prize           Decimal         @default(0) @db.Decimal(12, 2)
  status          TripletaStatus  @default(ACTIVE)
  expiresAt       DateTime
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

enum TripletaStatus {
  ACTIVE      // Activa, esperando resultados
  WON         // Ganadora
  LOST        // Perdedora
  EXPIRED     // Expirada sin ganar
}
```

#### Configuración en Game.config
```json
{
  "tripleta": {
    "enabled": true,
    "multiplier": 50,
    "drawsCount": 10
  }
}
```

### 2. Backend

#### Archivos Creados/Modificados

**Nuevos Archivos:**
- `backend/src/services/tripleta.service.js` - Lógica de negocio para Tripletas
- `backend/src/controllers/tripleta.controller.js` - Controladores de API
- `backend/src/routes/tripleta.routes.js` - Rutas de API

**Modificados:**
- `backend/prisma/schema.prisma` - Agregado modelo TripleBet
- `backend/src/services/draw.service.js` - Integración de verificación automática
- `backend/src/index.js` - Registro de rutas Tripleta

#### API Endpoints

**POST** `/api/tripleta/bet`
- Crear una apuesta tripleta
- Requiere: `gameId`, `item1Id`, `item2Id`, `item3Id`, `amount`
- Rol: `PLAYER`

**GET** `/api/tripleta/my-bets`
- Obtener apuestas del usuario autenticado
- Query params: `status`, `gameId`, `limit`, `offset`
- Rol: `PLAYER`

**GET** `/api/tripleta/:id`
- Obtener una apuesta específica
- Rol: `PLAYER` (solo propias) o `ADMIN`

**GET** `/api/tripleta/game/:gameId/stats`
- Estadísticas de tripletas de un juego
- Rol: `ADMIN`, `TAQUILLA_ADMIN`

**POST** `/api/tripleta/check-draw/:drawId`
- Verificar apuestas para un sorteo (manual)
- Rol: `ADMIN`, `TAQUILLA_ADMIN`

#### Lógica de Verificación Automática

Cuando un sorteo se ejecuta (`executeDraw`), automáticamente:
1. Se obtienen todas las apuestas tripleta activas para ese juego
2. Para cada apuesta, se verifica si los 3 números han salido en los sorteos ejecutados dentro del rango
3. Si los 3 números salieron: marca como `WON` y acredita el premio
4. Si se completaron todos los sorteos sin ganar: marca como `EXPIRED`

### 3. Frontend

#### Archivos Creados/Modificados

**Nuevos Archivos:**
- `frontend/lib/api/tripleta.js` - Cliente API para Tripletas
- `frontend/components/admin/config/TripletaTab.js` - Configuración admin
- `frontend/components/player/TripletaBetModal.js` - Modal de apuesta
- `frontend/app/tripletas/page.js` - Historial de apuestas

**Modificados:**
- `frontend/app/admin/juegos/[gameId]/page.js` - Agregada pestaña Tripleta
- `frontend/app/jugar/page.js` - Agregado botón y modal Tripleta

#### Interfaz de Administración

**Ubicación:** `/admin/juegos/[gameId]` → Pestaña "Tripleta"

**Funcionalidades:**
- Habilitar/deshabilitar modalidad Tripleta
- Configurar multiplicador de premio
- Configurar cantidad de sorteos válidos
- Vista del estado actual de configuración

#### Interfaz de Jugador

**Ubicación:** `/jugar` → Botón "Jugar Tripleta"

**Funcionalidades:**
- Selección de 3 números diferentes
- Visualización de multiplicador y sorteos
- Cálculo de premio potencial en tiempo real
- Confirmación de apuesta con validación de saldo

**Historial:** `/tripletas`
- Lista de todas las apuestas tripleta
- Filtros por estado (Todas, Activas, Ganadoras, Expiradas)
- Detalles de cada apuesta (números, monto, premio, fechas)

## Flujo de Uso

### Para Administradores

1. Ir a **Admin → Juegos → [Seleccionar Juego] → Tripleta**
2. Activar la modalidad Tripleta
3. Configurar el multiplicador (ej: 50)
4. Configurar la cantidad de sorteos (ej: 10)
5. Guardar cambios

### Para Jugadores

1. Ir a **Jugar**
2. Seleccionar un juego con Tripleta habilitada
3. Hacer clic en el botón **"Jugar Tripleta"** (amarillo con ícono de trofeo)
4. Seleccionar 3 números diferentes
5. Ingresar el monto a apostar
6. Ver el premio potencial calculado
7. Confirmar la apuesta
8. Ver historial en **Tripletas**

## Validaciones

### Backend
- ✅ Juego debe existir y estar activo
- ✅ Tripleta debe estar habilitada para el juego
- ✅ Los 3 números deben ser diferentes
- ✅ Los números deben pertenecer al juego y estar activos
- ✅ Usuario debe tener saldo suficiente
- ✅ Debe haber suficientes sorteos programados
- ✅ Monto debe ser mayor a 0

### Frontend
- ✅ Solo mostrar botón si Tripleta está habilitada
- ✅ Validar selección de exactamente 3 números
- ✅ Validar monto ingresado
- ✅ Mostrar premio potencial en tiempo real
- ✅ Deshabilitar números después de seleccionar 3

## Ejemplo de Uso

**Configuración del Juego:**
- Multiplicador: 50x
- Sorteos: 10

**Apuesta del Jugador:**
- Números seleccionados: 12, 25, 19
- Monto apostado: $10
- Premio potencial: $500 (10 × 50)

**Escenarios:**

1. **Ganador:** Si en los próximos 10 sorteos salen los números 12, 25 y 19 (en cualquier orden y sorteo), el jugador gana $500

2. **Expirado:** Si pasan los 10 sorteos y no salieron los 3 números, la apuesta expira y el jugador pierde los $10

## Migración

Para aplicar los cambios en la base de datos:

```bash
cd backend
npx prisma migrate dev --name add_tripleta_system
```

Esto creará:
- Tabla `TripleBet`
- Enum `TripletaStatus`
- Índices necesarios

## Notas Técnicas

- Las apuestas se verifican automáticamente al ejecutar cada sorteo
- El sistema calcula el rango de sorteos válidos al crear la apuesta
- Los premios se acreditan automáticamente al balance del usuario
- Las transacciones son atómicas (saldo y apuesta se actualizan juntos)
- El sistema maneja correctamente la zona horaria para expiración

## Testing

### Casos de Prueba Recomendados

1. **Crear apuesta con juego sin Tripleta habilitada** → Debe fallar
2. **Crear apuesta con números duplicados** → Debe fallar
3. **Crear apuesta sin saldo suficiente** → Debe fallar
4. **Crear apuesta válida** → Debe descontar saldo y crear apuesta
5. **Ejecutar sorteo con número ganador** → Debe verificar tripletas
6. **Completar 3 números en sorteos** → Debe marcar como ganadora y acreditar premio
7. **Expirar sorteos sin ganar** → Debe marcar como expirada

## Mantenimiento

- Revisar periódicamente apuestas activas muy antiguas
- Monitorear premios pagados vs apuestas recibidas
- Ajustar multiplicadores según análisis de rentabilidad
- Considerar límites de apuesta máxima si es necesario
