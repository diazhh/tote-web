# Dashboard de Administración - Documentación Completa

## Resumen

Se ha implementado un dashboard de administración completo con todas las funcionalidades requeridas para gestionar juegos, sorteos, items y canales de publicación.

## Estructura del Dashboard

### 1. Sección de Configuración (`/admin/configuracion`)

La sección de configuración está organizada en **5 pestañas principales**:

#### 📱 **Pestaña: Juegos**
- **CRUD completo** de juegos (Crear, Leer, Actualizar, Eliminar)
- Campos configurables:
  - Nombre del juego
  - Tipo (ANIMALITOS, TRIPLE, ROULETTE)
  - Slug (URL única)
  - Total de números
  - Descripción
  - Estado (Activo/Inactivo)
- Vista en tarjetas con información resumida
- Enlace directo para ver el juego en el sitio público
- Modal para crear/editar juegos

#### ⏰ **Pestaña: Plantillas**
- **Gestión de plantillas de sorteos** por juego
- Configuración de horarios automáticos:
  - Días de la semana (Lunes-Domingo)
  - Múltiples horarios por día
  - Nombre y descripción de la plantilla
- Filtro por juego
- Estado activo/inactivo
- Modal para crear/editar plantillas

#### 🔢 **Pestaña: Items**
- **Gestión de items** (números/animales) por juego
- Selector de juego para ver items específicos
- Tabla con información completa:
  - Número
  - Nombre
  - Orden de visualización
  - Multiplicador de pago
  - Estado (Activo/Inactivo)
- CRUD completo de items
- Modal para crear/editar items

#### 📢 **Pestaña: Canales**
- **Configuración de canales de publicación**
- Soporte para múltiples plataformas:
  
  **Telegram:**
  - Bot Token
  - Chat ID
  
  **WhatsApp (API Propia):**
  - URL de API
  - ID
  - Token
  
  **Facebook:**
  - Page ID
  - Page Access Token
  
  **Instagram:**
  - Instagram Business Account ID
  - Access Token

- Características:
  - Vista en tarjetas por canal
  - Estado activo/inactivo
  - Botón de prueba de conexión
  - Campos de credenciales con opción de mostrar/ocultar
  - Modal para crear/editar canales

#### 👤 **Pestaña: Cuenta**
- Información del usuario actual
- Cambio de contraseña
- Información del sistema

### 2. Sección de Sorteos (`/admin/sorteos`)

#### Funcionalidades Principales:
- **Lista de sorteos** con paginación
- **Filtros:**
  - Por juego
  - Por estado (SCHEDULED, PENDING, CLOSED, DRAWN, PUBLISHED)
  - Paginación configurable

- **Acciones por sorteo:**
  - 👁️ **Ver Detalles:** Abre modal con información completa
  - ✏️ **Cambiar Ganador:** Para sorteos cerrados o sorteados
  - ➕ **Generar Sorteos del Día:** Crea sorteos automáticamente

#### Modal de Detalles del Sorteo:
Muestra información completa del sorteo:

**Estado del Sorteo:**
- Estado actual
- Hora de cierre
- Hora de sorteo
- Hora de publicación

**Resultado:**
- Número ganador
- Nombre del item
- Indicador si fue preseleccionado

**Imagen Generada:**
- Visualización de la imagen del resultado (si existe)

**Estado de Publicaciones:**
- Lista de todos los canales configurados
- Estado por canal:
  - ✅ SENT (Enviado)
  - ❌ FAILED (Fallido)
  - ⏳ PENDING (Pendiente)
- Botón de **Reenviar** para publicaciones fallidas o pendientes
- Fecha/hora de envío
- Mensajes de error (si aplica)

**Notas:**
- Notas adicionales del sorteo

### 3. Sección de Juegos (`/admin/juegos`)

- Vista de todos los juegos del sistema
- Tarjetas con información resumida
- Enlace para ver el juego en el sitio público
- Indicador de estado (Activo/Inactivo)

### 4. Dashboard Principal (`/admin`)

Muestra resumen general:
- **Estadísticas:**
  - Sorteos de hoy
  - Sorteos completados
  - Sorteos pendientes
  - Juegos activos

- **Próximos Sorteos:**
  - Lista de sorteos próximos
  - Estado de cada sorteo
  - Resultado (si ya se sorteó)

- **Juegos:**
  - Grid con todos los juegos
  - Acceso rápido a detalles

## Archivos Creados

### API Clients (`/frontend/lib/api/`)
1. `games.js` - Cliente API para juegos
2. `items.js` - Cliente API para items
3. `templates.js` - Cliente API para plantillas
4. `channels.js` - Cliente API para canales

### Componentes de Configuración (`/frontend/components/admin/config/`)
1. `GamesTab.js` - Pestaña de juegos
2. `GameModal.js` - Modal para crear/editar juegos
3. `TemplatesTab.js` - Pestaña de plantillas
4. `TemplateModal.js` - Modal para crear/editar plantillas
5. `ItemsTab.js` - Pestaña de items
6. `ItemModal.js` - Modal para crear/editar items
7. `ChannelsTab.js` - Pestaña de canales
8. `ChannelModal.js` - Modal para crear/editar canales
9. `AccountTab.js` - Pestaña de cuenta de usuario

### Componentes de Sorteos (`/frontend/components/admin/`)
1. `DrawDetailModal.js` - Modal de detalles del sorteo

### Páginas Modificadas
1. `/frontend/app/admin/configuracion/page.js` - Página de configuración con tabs
2. `/frontend/app/admin/sorteos/page.js` - Página de sorteos mejorada

## Flujo de Trabajo

### Configuración Inicial:

1. **Crear Juegos** (Pestaña Juegos)
   - Definir tipo, nombre, total de números
   - Activar el juego

2. **Crear Items** (Pestaña Items)
   - Seleccionar juego
   - Agregar todos los números/animales del juego
   - Configurar multiplicadores

3. **Crear Plantillas** (Pestaña Plantillas)
   - Seleccionar juego
   - Definir días de la semana
   - Configurar horarios de sorteos

4. **Configurar Canales** (Pestaña Canales)
   - Agregar credenciales de Telegram
   - Agregar credenciales de Instagram
   - Agregar credenciales de Facebook
   - Agregar credenciales de WhatsApp
   - Probar conexiones

### Gestión de Sorteos:

1. **Generar Sorteos**
   - Usar botón "Generar Sorteos del Día"
   - Los sorteos se crean automáticamente según las plantillas

2. **Monitorear Sorteos**
   - Ver lista de sorteos filtrados
   - Revisar estado de cada sorteo

3. **Ver Detalles**
   - Click en ícono de ojo
   - Ver resultado, imagen, y estado de publicaciones
   - Reenviar a canales si es necesario

4. **Cambiar Ganador** (si es necesario)
   - Click en ícono de editar
   - Seleccionar nuevo ganador

## Información Técnica

### Endpoints Backend Requeridos (Algunos pendientes)

**Canales (Pendientes de implementar):**
- `GET /api/channels` - Listar canales
- `GET /api/channels/:id` - Obtener canal
- `POST /api/channels` - Crear canal
- `PUT /api/channels/:id` - Actualizar canal
- `DELETE /api/channels/:id` - Eliminar canal
- `POST /api/channels/:id/test` - Probar conexión

**Sorteos:**
- `POST /api/draws/:id/republish/:channel` - Reenviar a canal específico (Pendiente)

### Tecnologías Utilizadas

- **Frontend:** Next.js 14 (App Router)
- **UI:** TailwindCSS
- **Iconos:** Lucide React
- **Notificaciones:** Sonner (toast)
- **Estado:** Zustand (auth store)

### Características de UI/UX

- ✅ Diseño moderno y limpio
- ✅ Responsive (móvil, tablet, desktop)
- ✅ Modales para formularios
- ✅ Confirmaciones antes de eliminar
- ✅ Estados de carga
- ✅ Mensajes de error/éxito
- ✅ Validación de formularios
- ✅ Campos de contraseña con mostrar/ocultar
- ✅ Filtros y búsqueda
- ✅ Paginación

## Próximos Pasos Recomendados

### Backend:
1. Implementar endpoints de canales (`/api/channels`)
2. Implementar endpoint de republicación (`/api/draws/:id/republish/:channel`)
3. Implementar lógica de publicación automática a canales
4. Crear servicio de integración con Telegram Bot API
5. Crear servicio de integración con Facebook Graph API
6. Crear servicio de integración con Instagram Graph API
7. Integrar API de WhatsApp personalizada

### Frontend:
1. Agregar búsqueda de sorteos por fecha
2. Implementar exportación de reportes
3. Agregar gráficos de estadísticas
4. Implementar vista de calendario para sorteos
5. Agregar bulk operations (operaciones masivas)

### Funcionalidades Adicionales:
1. Sistema de notificaciones en tiempo real
2. Historial de cambios (audit log)
3. Permisos granulares por usuario
4. Dashboard de analytics
5. Configuración de templates de imágenes
6. Preview de imágenes antes de publicar

## Notas Importantes

- **Seguridad:** Las credenciales de canales deben ser encriptadas en el backend
- **Validación:** Todos los formularios tienen validación del lado del cliente y deben tenerla también en el backend
- **Permisos:** Algunas operaciones requieren rol ADMIN
- **Testing:** Se recomienda probar las conexiones de canales antes de activarlos
- **Backup:** Hacer backup de la configuración de canales regularmente

## Soporte de Canales

### Telegram
- Documentación: https://core.telegram.org/bots/api
- Requiere crear bot con @BotFather
- Necesita agregar bot al canal/grupo

### Instagram
- Documentación: https://developers.facebook.com/docs/instagram-api
- Requiere cuenta de Instagram Business
- Debe estar vinculada a página de Facebook

### Facebook
- Documentación: https://developers.facebook.com/docs/graph-api
- Requiere página de Facebook
- Necesita permisos de publicación

### WhatsApp
- API personalizada
- Configuración específica del cliente
- URL, ID y Token proporcionados por el sistema
