# Configuración de Proveedor SRQ con Soporte de Tripleta

## Resumen de Cambios

Se ha implementado soporte completo para configuración de tripleta en el proveedor SRQ. Cada juego puede tener su propia URL y token específicos para obtener tickets de tripleta.

## Cambios en Base de Datos

### Tabla `ApiConfiguration`
Se agregaron dos nuevos campos opcionales:
- `tripletaUrl` (TEXT, nullable): URL específica para obtener tickets de tripleta
- `tripletaToken` (TEXT, nullable): Token de autenticación para la API de tripleta

**Migración aplicada**: `20251223162328_add_tripleta_config`

## Estructura Actual en DB

### Proveedor SRQ
- **ID**: `022b1d7b-9e2f-4eaa-ab22-669976090fc2`
- **Nombre**: SRQ
- **Descripción**: Sistema RQ - Proveedor de ventas externas

### Configuraciones Existentes
1. **LOTOANIMALITO**
   - Planificación: `https://api2.sistemasrq.com/externalapi/operator/loteries?date=`
   - Ventas: `https://api2.sistemasrq.com/externalapi/operator/tickets/`
   
2. **LOTTOPANTERA**
   - Planificación: `https://api2.sistemasrq.com/externalapi/operator/loteries?date=`
   - Ventas: `https://api2.sistemasrq.com/externalapi/operator/tickets/`
   
3. **TRIPLE PANTERA**
   - Planificación: `https://api2.sistemasrq.com/externalapi/operator/loteries?date=`
   - Ventas: `https://api2.sistemasrq.com/externalapi/operator/tickets/`

## Backend

### Archivos Modificados

#### 1. Schema Prisma (`/backend/prisma/schema.prisma`)
```prisma
model ApiConfiguration {
  // ... campos existentes
  tripletaUrl   String?  // URL para tripleta (opcional)
  tripletaToken String?  // Token para tripleta (opcional)
  // ...
}
```

#### 2. Controller (`/backend/src/controllers/provider.controller.js`)
- `createConfiguration`: Ahora acepta `tripletaUrl` y `tripletaToken`
- `updateConfiguration`: Permite actualizar campos de tripleta

#### 3. Nuevo Servicio (`/backend/src/services/srq-tripleta.service.js`)
Servicio dedicado para manejar tickets de tripleta:

**Métodos principales**:
- `callAPI(url, token)`: Llamada a la API de tripleta
- `syncTripletaTickets(drawId)`: Sincronizar tickets de tripleta de un sorteo
- `syncUpcomingTripletaTickets(minutesBefore)`: Sincronizar tickets próximos a cerrar
- `processTripletaTickets(tickets, drawId)`: Procesar tickets (pendiente de estructura)

**Estado actual**: El servicio está listo pero el método `processTripletaTickets` está pendiente de implementación hasta conocer la estructura exacta del ticket de tripleta.

## Frontend

### Interfaz de Proveedores (`/frontend/app/admin/proveedores/page.js`)

#### Vista de Configuraciones
- Muestra URL y token de tripleta con fondo morado cuando están configurados
- Se visualizan debajo de la configuración principal

#### Modal de Edición
Nueva sección "TRIPLETA - Configuración Opcional":
- Campo: **URL Tripleta** (opcional)
  - Placeholder: `https://api.ejemplo.com/tripleta/`
  - Descripción: URL específica para obtener tickets de tripleta
  
- Campo: **Token Tripleta** (opcional)
  - Placeholder: Token de autenticación para tripleta
  - Descripción: Token específico para la API de tripleta

## Cómo Configurar Tripleta

### Desde la Interfaz Web

1. Ir a `http://localhost:3000/admin/proveedores`
2. Hacer clic en el botón de editar (✏️) de la configuración del juego
3. Desplazarse a la sección "TRIPLETA - Configuración Opcional"
4. Ingresar:
   - **URL Tripleta**: La URL del endpoint de tripleta del proveedor
   - **Token Tripleta**: El token de autenticación para ese endpoint
5. Guardar cambios

### Ejemplo de Configuración

Para un juego con tripleta en SRQ:
```json
{
  "name": "SRQ Ventas LOTOANIMALITO",
  "type": "SALES",
  "baseUrl": "https://api2.sistemasrq.com/externalapi/operator/tickets/",
  "token": "883124a2d52127a67e29...",
  "tripletaUrl": "https://api2.sistemasrq.com/externalapi/operator/tripleta/",
  "tripletaToken": "token_especifico_tripleta..."
}
```

## Próximos Pasos

### 1. Configurar URLs y Tokens de Tripleta
Una vez que tengas las URLs y tokens específicos para tripleta de cada juego:
- Editar cada configuración de tipo SALES
- Agregar `tripletaUrl` y `tripletaToken` correspondientes

### 2. Definir Estructura de Ticket de Tripleta
Cuando recibas un ejemplo de ticket de tripleta, actualizar el método `processTripletaTickets` en `/backend/src/services/srq-tripleta.service.js`:

```javascript
// Estructura esperada (ejemplo):
{
  ticketID: string,
  numero1: string,
  numero2: string,
  numero3: string,
  monto: number,
  taquillaID: number,
  grupoID: number,
  bancaID: number,
  comercialID: number,
  anulado: boolean
}
```

### 3. Integrar Servicio de Tripleta
Una vez implementado el procesamiento:
- Importar `srqTripletaService` en los jobs de sincronización
- Llamar `syncTripletaTickets(drawId)` después de sincronizar tickets normales
- O usar `syncUpcomingTripletaTickets()` en el job de cierre de sorteos

## API Endpoints

Todos los endpoints existentes de proveedores ahora soportan tripleta:

- `GET /api/providers/configurations` - Lista todas las configuraciones (incluye campos de tripleta)
- `GET /api/providers/configurations/:id` - Obtiene una configuración específica
- `POST /api/providers/configurations` - Crea nueva configuración (acepta tripletaUrl/Token)
- `PUT /api/providers/configurations/:id` - Actualiza configuración (acepta tripletaUrl/Token)
- `DELETE /api/providers/configurations/:id` - Elimina configuración

## Notas Importantes

1. **No se borró nada de la DB**: Todos los datos existentes se mantienen intactos
2. **Campos opcionales**: `tripletaUrl` y `tripletaToken` son opcionales, no afectan configuraciones existentes
3. **Específico por juego**: Cada juego puede tener su propia configuración de tripleta
4. **Servicio listo**: El servicio de tripleta está preparado, solo falta la estructura del ticket
5. **Interfaz completa**: La UI permite ver y editar toda la configuración desde el navegador

## Verificación

Para verificar que todo funciona:

```bash
# Ver configuraciones actuales
docker exec -i erp_postgres psql -U erp_user -d tote_db -c "SELECT id, name, type, \"tripletaUrl\", \"tripletaToken\" FROM \"ApiConfiguration\" WHERE \"apiSystemId\" = (SELECT id FROM \"ApiSystem\" WHERE name = 'SRQ');"

# Ver el proveedor SRQ
docker exec -i erp_postgres psql -U erp_user -d tote_db -c "SELECT * FROM \"ApiSystem\" WHERE name = 'SRQ';"
```

## Contacto para Siguiente Fase

Cuando tengas:
1. ✅ URLs de tripleta para cada juego
2. ✅ Tokens de tripleta para cada juego
3. ✅ Ejemplo de estructura de ticket de tripleta

Podrás:
- Configurar las URLs y tokens desde la interfaz
- Actualizar el método `processTripletaTickets`
- Activar la sincronización automática de tripleta
