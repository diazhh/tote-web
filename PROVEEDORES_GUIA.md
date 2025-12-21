# Guía de Gestión de Proveedores Externos

## 📋 Resumen

El sistema de proveedores externos permite gestionar integraciones con APIs de terceros (como SRQ) para importar planificación de sorteos y tickets vendidos.

## 🎯 ¿Qué se implementó?

### Backend
- **Controlador**: `backend/src/controllers/provider.controller.js`
- **Rutas**: `backend/src/routes/provider.routes.js` → `/api/providers`
- **Modelos de BD**: `ApiSystem`, `ApiConfiguration`, `ApiDrawMapping`, `ExternalTicket`

### Frontend
- **Página Admin**: `/admin/proveedores`
- **Navegación**: Agregado en el menú lateral del admin

### Datos Iniciales
- **Sistema SRQ** creado con 6 configuraciones (2 por cada juego)
- **Token**: Configurado según documentación existente
- **URLs**: 
  - PLANNING: `https://api2.sistemasrq.com/externalapi/operator/loteries?date=`
  - SALES: `https://api2.sistemasrq.com/externalapi/operator/tickets/`

## 🚀 Cómo Usar

### 1. Acceder a la Página de Proveedores

```
http://localhost:3000/admin/proveedores
```

### 2. Ver Configuraciones Existentes

La página tiene 2 pestañas:
- **Configuraciones**: Lista todas las configuraciones de API (6 para SRQ)
- **Sistemas**: Lista los sistemas de proveedores (SRQ)

### 3. Gestionar Configuraciones

Cada configuración muestra:
- **Nombre**: Ej: "SRQ Planificación LOTOANIMALITO"
- **Tipo**: PLANNING (planificación) o SALES (ventas)
- **Estado**: Activa/Inactiva
- **Sistema**: SRQ
- **Juego**: Asociado a un juego específico
- **URL Base**: Endpoint de la API
- **Token**: Token de autenticación (parcialmente oculto)

#### Acciones Disponibles:
- **🧪 Probar Conexión**: Verifica que la API responda correctamente
- **⚡ Activar/Desactivar**: Habilita o deshabilita la configuración
- **✏️ Editar**: Modifica los datos de la configuración
- **🗑️ Eliminar**: Borra la configuración

### 4. Crear Nueva Configuración

1. Click en "Nueva Configuración"
2. Llenar el formulario:
   - **Nombre**: Descriptivo (ej: "SRQ Ventas Juego X")
   - **Sistema**: Seleccionar SRQ (u otro)
   - **Juego**: Seleccionar el juego
   - **Tipo**: PLANNING o SALES
   - **URL Base**: Endpoint completo
   - **Token**: Token de autenticación
   - **Activa**: Checkbox para activar inmediatamente
3. Click en "Guardar"

### 5. Crear Nuevo Sistema de Proveedor

1. Ir a la pestaña "Sistemas"
2. Click en "Nuevo Sistema"
3. Llenar:
   - **Nombre**: Ej: "OtroProveedor"
   - **Descripción**: Descripción del sistema
4. Click en "Guardar"

## 🔧 Cómo Funciona la Integración

### Flujo de Planificación (PLANNING)

1. **Job Diario** (`sync-api-planning.job.js`) se ejecuta a las 6:00 AM
2. Busca todas las configuraciones de tipo `PLANNING` activas
3. Para cada configuración:
   - Llama a la API: `{baseUrl}{fecha}` con header `APIKEY: {token}`
   - Recibe lista de sorteos externos del día
   - Mapea cada sorteo externo con un sorteo local por orden
   - Guarda el mapeo en `ApiDrawMapping`

### Flujo de Ventas (SALES)

1. **Al cerrar sorteo** (`close-draw.job.js`) 5 minutos antes
2. Busca el mapping del sorteo en `ApiDrawMapping`
3. Obtiene la configuración de tipo `SALES` para ese juego
4. Llama a la API: `{baseUrl}{externalDrawId}` con header `APIKEY: {token}`
5. Recibe lista de tickets vendidos
6. Guarda cada ticket en `ExternalTicket`
7. Totaliza ventas y premios

## 📊 Configuraciones Actuales (SRQ)

### LOTOANIMALITO
- **PLANNING**: Sincroniza sorteos del día
- **SALES**: Importa tickets vendidos

### LOTTOPANTERA
- **PLANNING**: Sincroniza sorteos del día
- **SALES**: Importa tickets vendidos

### TRIPLE PANTERA
- **PLANNING**: Sincroniza sorteos del día
- **SALES**: Importa tickets vendidos

## 🔐 Seguridad

- Los tokens están almacenados en la base de datos
- Solo usuarios ADMIN y OPERATOR pueden acceder a `/admin/proveedores`
- Los tokens se muestran parcialmente en la UI (primeros 20 caracteres)
- Las configuraciones pueden desactivarse sin eliminarlas

## 🧪 Probar Conexión

El botón "Probar Conexión" hace lo siguiente:

**Para PLANNING:**
```
GET {baseUrl}{fecha_hoy}
Header: APIKEY: {token}
```

**Para SALES:**
```
GET {baseUrl}test
Header: APIKEY: {token}
```

El resultado muestra:
- ✅ Éxito o ❌ Error
- Código de estado HTTP
- URL probada
- Respuesta completa de la API

## 📝 Endpoints de API

### Sistemas
```
GET    /api/providers/systems          # Listar todos
GET    /api/providers/systems/:id      # Ver uno
POST   /api/providers/systems          # Crear
PUT    /api/providers/systems/:id      # Actualizar
DELETE /api/providers/systems/:id      # Eliminar
```

### Configuraciones
```
GET    /api/providers/configurations           # Listar todas
GET    /api/providers/configurations/:id       # Ver una
POST   /api/providers/configurations           # Crear
PUT    /api/providers/configurations/:id       # Actualizar
DELETE /api/providers/configurations/:id       # Eliminar
POST   /api/providers/configurations/:id/test  # Probar conexión
GET    /api/providers/configurations/:id/stats # Estadísticas
```

### Filtros en GET /api/providers/configurations
```
?apiSystemId={id}  # Filtrar por sistema
?gameId={id}       # Filtrar por juego
?type=PLANNING     # Filtrar por tipo
```

## 🔄 Re-ejecutar Seed

Si necesitas recrear o actualizar las configuraciones:

```bash
cd backend
./seed-providers.sh
```

Esto:
- Actualiza el sistema SRQ si existe, o lo crea
- Para cada juego, actualiza o crea las configuraciones PLANNING y SALES
- Es seguro ejecutarlo múltiples veces (no duplica datos)

## 🎓 Ejemplos de Uso

### Agregar un Nuevo Proveedor

1. Crear el sistema:
   ```
   POST /api/providers/systems
   {
     "name": "NuevoProveedor",
     "description": "Descripción del proveedor"
   }
   ```

2. Crear configuración de planificación:
   ```
   POST /api/providers/configurations
   {
     "name": "NuevoProveedor Planificación Juego1",
     "apiSystemId": "{id_del_sistema}",
     "gameId": "{id_del_juego}",
     "type": "PLANNING",
     "baseUrl": "https://api.ejemplo.com/planning?date=",
     "token": "tu_token_aqui",
     "isActive": true
   }
   ```

3. Crear configuración de ventas:
   ```
   POST /api/providers/configurations
   {
     "name": "NuevoProveedor Ventas Juego1",
     "apiSystemId": "{id_del_sistema}",
     "gameId": "{id_del_juego}",
     "type": "SALES",
     "baseUrl": "https://api.ejemplo.com/tickets/",
     "token": "tu_token_aqui",
     "isActive": true
   }
   ```

### Desactivar Temporalmente un Proveedor

```
PUT /api/providers/configurations/{id}
{
  "isActive": false
}
```

### Actualizar Token Expirado

1. Ir a `/admin/proveedores`
2. Click en ✏️ Editar en la configuración
3. Actualizar el campo "Token"
4. Guardar
5. Probar conexión con 🧪

## ⚠️ Notas Importantes

1. **Token de SRQ**: El token actual en la documentación puede estar expirado. Verifica con el proveedor.

2. **Jobs Automáticos**: Los jobs de sincronización usan estas configuraciones automáticamente. No requieren configuración adicional.

3. **Mapeo 1:1**: El sistema mapea sorteos externos con locales por orden de hora. Asegúrate de que coincidan.

4. **Eliminación**: No puedes eliminar un sistema que tenga configuraciones asociadas. Primero elimina las configuraciones.

5. **Activación**: Solo las configuraciones activas (`isActive: true`) son usadas por los jobs.

## 🐛 Troubleshooting

### "Error en la conexión" al probar
- Verifica que el token sea válido
- Verifica que la URL sea correcta
- Verifica que el proveedor esté disponible

### "No se importan tickets"
- Verifica que la configuración SALES esté activa
- Verifica que exista un mapping en `ApiDrawMapping`
- Revisa los logs del backend

### "No se sincronizan sorteos"
- Verifica que la configuración PLANNING esté activa
- Verifica que el job `sync-api-planning` esté corriendo
- Revisa los logs del backend a las 6:00 AM

---

**Última actualización**: 2024-12-21
