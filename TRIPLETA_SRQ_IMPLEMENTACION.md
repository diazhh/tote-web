# Implementación de Tripleta SRQ

## Cambios Realizados

### 1. Job de Planificación - Sincronización de 2 Días

**Archivo**: `/backend/src/jobs/sync-api-planning.job.js`

El job ahora sincroniza sorteos para **HOY y MAÑANA** (necesario para tripletas que requieren al menos 2 días de planificación):

```javascript
// Sincronizar con SRQ para HOY
const resultToday = await apiIntegrationService.syncSRQPlanning(today);

// Sincronizar con SRQ para MAÑANA (necesario para tripletas)
const resultTomorrow = await apiIntegrationService.syncSRQPlanning(tomorrow);
```

**Ejecución**: Todos los días a las 6:00 AM (hora de Caracas)

### 2. Servicio de Tripleta SRQ

**Archivo**: `/backend/src/services/srq-tripleta.service.js`

#### Estructura de Ticket de Tripleta SRQ

```json
{
  "ticketID": 12345678,
  "numero1": "05",
  "numero2": "12",
  "numero3": "28",
  "monto": 100,
  "taquillaID": 28412,
  "grupoID": 2618,
  "bancaID": 538,
  "comercialID": 361,
  "anulado": 0
}
```

#### Método `processTripletaTickets`

Procesa tickets de tripleta y los guarda en la tabla `Ticket` con:
- 3 `TicketDetail` (uno por cada número)
- `providerData` con tipo 'TRIPLETA' y los 3 números
- Monto dividido entre los 3 números
- Multiplicador según configuración del juego

**Validaciones**:
- Ignora tickets anulados
- Verifica que existan los 3 números en `GameItem`
- Valida que haya al menos 2 sorteos futuros programados
- Evita duplicados por `externalTicketId`

#### Método `syncTripletaTickets`

Sincroniza tickets de tripleta para un sorteo específico:
1. Busca configuración de tripleta (requiere `tripletaUrl` y `tripletaToken`)
2. Obtiene el `externalDrawId` del mapping
3. Llama a la API: `{tripletaUrl}{externalDrawId}`
4. Procesa y guarda los tickets

## Configuración Requerida

### 1. Base de Datos

Ya están creados los campos en `ApiConfiguration`:
- `tripletaUrl` (TEXT, nullable)
- `tripletaToken` (TEXT, nullable)

### 2. Configurar en la Interfaz

1. Ir a `http://localhost:3000/admin/proveedores`
2. Editar la configuración de **VENTAS** de LOTOANIMALITO
3. En la sección "TRIPLETA - Configuración Opcional":
   - **URL Tripleta**: La URL del endpoint de tripleta de SRQ
   - **Token Tripleta**: El token proporcionado (ya tienes uno válido)

### 3. Configuración del Juego

Verificar que LOTOANIMALITO tenga tripleta habilitada en su `config`:

```json
{
  "tripleta": {
    "enabled": true,
    "drawsCount": 10,
    "multiplier": 50
  }
}
```

## Flujo de Trabajo

### Planificación Diaria (6:00 AM)

```
Job sync-api-planning.job.js
  ↓
Sincroniza sorteos de HOY
  ↓
Sincroniza sorteos de MAÑANA
  ↓
Mapea sorteos locales ↔ sorteos SRQ
```

### Sincronización de Tripletas

```
Antes del cierre del sorteo
  ↓
Llamar: srqTripletaService.syncTripletaTickets(drawId)
  ↓
Obtiene tickets de: {tripletaUrl}{externalDrawId}
  ↓
Procesa cada ticket:
  - Busca los 3 GameItems
  - Crea Ticket con 3 TicketDetail
  - Guarda en BD
```

## Próximos Pasos

### 1. Ejecutar Planificación Manual

```bash
cd backend
node -e "import('./src/jobs/sync-api-planning.job.js').then(m => m.default.execute())"
```

Esto creará sorteos para hoy y mañana, necesarios para las tripletas.

### 2. Configurar URL y Token de Tripleta

En la interfaz de proveedores, agregar:
- **URL Tripleta**: `https://api2.sistemasrq.com/externalapi/operator/tripleta/` (o la URL correcta)
- **Token Tripleta**: El token que ya tienes válido para LOTOANIMALITO

### 3. Probar Sincronización de Tripleta

Una vez configurado, probar manualmente:

```javascript
import srqTripletaService from './src/services/srq-tripleta.service.js';

// Obtener un sorteo de LOTOANIMALITO
const draw = await prisma.draw.findFirst({
  where: {
    game: { name: 'LOTOANIMALITO' },
    status: 'SCHEDULED'
  }
});

// Sincronizar tripletas
const result = await srqTripletaService.syncTripletaTickets(draw.id);
console.log(result);
```

### 4. Integrar en el Job de Cierre

Agregar llamada a `syncTripletaTickets` en el job de cierre de sorteos, después de sincronizar tickets regulares.

## Estructura de Datos

### Ticket de Tripleta en BD

```javascript
{
  drawId: "uuid",
  source: "EXTERNAL_API",
  externalTicketId: "12345678",
  totalAmount: 100,
  totalPrize: 0,
  status: "ACTIVE",
  providerData: {
    ticketID: 12345678,
    taquillaID: 28412,
    grupoID: 2618,
    bancaID: 538,
    comercialID: 361,
    type: "TRIPLETA",
    numbers: ["05", "12", "28"]
  },
  details: [
    {
      gameItemId: "uuid-item-05",
      amount: 33.33,
      multiplier: 50,
      prize: 0,
      status: "ACTIVE"
    },
    {
      gameItemId: "uuid-item-12",
      amount: 33.33,
      multiplier: 50,
      prize: 0,
      status: "ACTIVE"
    },
    {
      gameItemId: "uuid-item-28",
      amount: 33.34,
      multiplier: 50,
      prize: 0,
      status: "ACTIVE"
    }
  ]
}
```

## Notas Importantes

1. **Requisito de 2 días**: Las tripletas necesitan al menos 2 días de sorteos programados. Por eso el job de planificación ahora crea sorteos para hoy Y mañana.

2. **No se borran datos**: Todos los cambios son aditivos. No se eliminó ninguna tabla ni dato existente.

3. **Token válido**: El token que mencionaste es válido para tripleta de LOTOANIMALITO.

4. **Estructura flexible**: El servicio guarda los tickets de tripleta en la tabla `Ticket` existente, usando el campo `providerData` para identificarlos como tipo 'TRIPLETA'.

## Verificación

Para verificar que todo está funcionando:

```bash
# Ver configuraciones con tripleta
docker exec -i erp_postgres psql -U erp_user -d tote_db -c "
SELECT 
  name, 
  type, 
  \"tripletaUrl\" IS NOT NULL as has_tripleta_url,
  \"tripletaToken\" IS NOT NULL as has_tripleta_token
FROM \"ApiConfiguration\" 
WHERE \"gameId\" = (SELECT id FROM \"Game\" WHERE name = 'LOTOANIMALITO');
"

# Ver tickets de tripleta
docker exec -i erp_postgres psql -U erp_user -d tote_db -c "
SELECT 
  t.id,
  t.\"externalTicketId\",
  t.\"totalAmount\",
  t.\"providerData\"->>'type' as type,
  COUNT(td.id) as detail_count
FROM \"Ticket\" t
LEFT JOIN \"TicketDetail\" td ON td.\"ticketId\" = t.id
WHERE t.\"providerData\"->>'type' = 'TRIPLETA'
GROUP BY t.id
LIMIT 10;
"
```
