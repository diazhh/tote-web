# Inicio Rápido - Frontend

## 🚀 Puesta en Marcha

### 1. Instalar Dependencias

```bash
cd frontend
npm install
```

### 2. Configurar Variables de Entorno

El archivo `.env.local` ya está creado con la configuración por defecto:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000
```

### 3. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

El frontend estará disponible en: **http://localhost:3000**

---

## 📄 Páginas Disponibles

### Landing Page Pública
**URL**: `http://localhost:3000`

Muestra:
- Countdown del próximo sorteo
- Resultados del día de todos los juegos
- Grid con todos los juegos disponibles
- Actualizaciones en tiempo real vía WebSocket

### Detalle de Juego
**URL**: `http://localhost:3000/juego/[slug]`

Ejemplos:
- `http://localhost:3000/juego/lotoanimalito`
- `http://localhost:3000/juego/lottopantera`
- `http://localhost:3000/juego/triple-pantera`

Muestra:
- Resultados del día del juego específico
- Histórico de sorteos con paginación
- Estadísticas de los últimos 30 días
- Números más y menos frecuentes

---

## 🔌 Conexión con el Backend

El frontend se conecta automáticamente al backend en `http://localhost:3001`.

**Asegúrate de que el backend esté corriendo antes de iniciar el frontend.**

### Verificar Conexión

1. **API REST**: El frontend hace peticiones a `/api/public/*`
2. **WebSocket**: Se conecta automáticamente al iniciar la aplicación

### Eventos WebSocket en Tiempo Real

El frontend escucha los siguientes eventos:

- `draw:closed` - Cuando un sorteo se cierra (5 min antes)
- `draw:winner-selected` - Cuando se selecciona el ganador
- `draw:published` - Cuando se publica el sorteo
- `publication:success` - Publicación exitosa en un canal
- `publication:failed` - Error en publicación

---

## 🎨 Componentes Principales

### Stores (Zustand)

```javascript
import useAuthStore from '@/store/authStore';
import useDrawStore from '@/store/drawStore';
import useGameStore from '@/store/gameStore';
```

### Hooks Personalizados

```javascript
import { useGames } from '@/hooks/useGames';
import { useTodayDraws, useNextDraws } from '@/hooks/useDraws';
import { useCountdown } from '@/hooks/useCountdown';
```

### API Client

```javascript
import api from '@/lib/api/axios';
import { getGames, getTodayDraws, getNextDraws } from '@/lib/api/public';
```

### WebSocket Service

```javascript
import socketService from '@/lib/socket/socket';

// Conectar
socketService.connect();

// Unirse a sala de juego
socketService.joinGameRoom('lotoanimalito');

// Desconectar
socketService.disconnect();
```

---

## 🧪 Probar la Aplicación

### Escenario 1: Ver Landing Page

1. Abre `http://localhost:3000`
2. Deberías ver:
   - El próximo sorteo con countdown
   - Resultados del día (si hay sorteos ejecutados)
   - Grid de juegos disponibles

### Escenario 2: Ver Detalle de Juego

1. Haz clic en cualquier juego del grid
2. O navega directamente a `/juego/[slug]`
3. Deberías ver:
   - Resultados del día de ese juego
   - Histórico de sorteos
   - Estadísticas

### Escenario 3: Actualizaciones en Tiempo Real

1. Abre la landing page
2. Espera a que un sorteo se cierre (5 min antes de la hora)
3. Verás una notificación toast con el número preseleccionado
4. Cuando se ejecute el sorteo, verás otra notificación con el ganador

---

## 🐛 Solución de Problemas

### El frontend no se conecta al backend

**Problema**: Error de conexión o CORS

**Solución**:
1. Verifica que el backend esté corriendo en `http://localhost:3001`
2. Verifica las variables de entorno en `.env.local`
3. Revisa la consola del navegador para errores

### No se muestran los juegos

**Problema**: No hay juegos en la base de datos

**Solución**:
1. Asegúrate de haber ejecutado las migraciones del backend
2. Ejecuta el script de migración legacy: `npm run migrate:legacy`
3. Verifica que hay juegos activos en la base de datos

### WebSocket no se conecta

**Problema**: No hay actualizaciones en tiempo real

**Solución**:
1. Abre la consola del navegador
2. Busca el mensaje "✅ WebSocket connected"
3. Si no aparece, verifica que el backend tenga Socket.io configurado
4. Revisa que el puerto 3001 esté abierto

### Errores de compilación

**Problema**: Errores al ejecutar `npm run dev`

**Solución**:
1. Borra `node_modules` y `.next`
2. Ejecuta `npm install` nuevamente
3. Verifica que estás usando Node.js 18+

---

## 📝 Próximos Pasos

1. **Dashboard Administrativo**: Crear interfaz de administración
2. **Autenticación**: Implementar login y protección de rutas
3. **Gestión de Sorteos**: Permitir crear/editar sorteos desde UI
4. **Configuración**: Gestionar plantillas, pausas y canales

---

## 🔗 Enlaces Útiles

- [Documentación del Backend](./backend/README.md)
- [API Endpoints](./API_ENDPOINTS.md)
- [Planificación](./PLANIFICACION.md)
- [Progreso](./PROGRESO.md)
