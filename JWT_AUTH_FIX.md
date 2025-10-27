# Fix de Autenticación JWT y Configuración de Juegos

**Fecha:** 2025-10-02 13:52:00  
**Estado:** ✅ Completado

## Problema Principal

Las peticiones API no enviaban el token JWT, causando errores 401:
```
{"success":false,"error":"Token de autenticación no proporcionado"}
```

## Causa Raíz

Los archivos API usaban `fetch()` con `credentials: 'include'` pero el backend espera el token en el header `Authorization: Bearer <token>`.

Solo `auth.js` usaba axios correctamente con interceptores que agregan el token automáticamente.

---

## Solución Implementada

### ✅ 1. Migración de fetch() a axios

Todos los archivos API ahora usan la instancia de axios configurada que automáticamente:
- Agrega el token JWT desde localStorage a cada petición
- Maneja errores 401 redirigiendo al login
- Simplifica el código eliminando boilerplate

### Archivos Actualizados:

#### **games.js**
```javascript
// ANTES
const response = await fetch(`${API_URL}/api/games`, {
  credentials: 'include',
});
if (!response.ok) throw new Error('Error al obtener juegos');
return response.json();

// DESPUÉS
import api from './axios';
const response = await api.get('/api/games');
return response.data;
```

#### **templates.js**
```javascript
// ANTES
const response = await fetch(`${API_URL}/api/templates`, {
  credentials: 'include',
});

// DESPUÉS
import api from './axios';
const response = await api.get('/api/templates', { params: filters });
return response.data;
```

#### **items.js**
```javascript
// ANTES
const response = await fetch(`${API_URL}/api/items/${id}`, {
  credentials: 'include',
});

// DESPUÉS
import api from './axios';
const response = await api.get(`/api/items/${id}`);
return response.data;
```

#### **channels.js**
```javascript
// ANTES
const response = await fetch(`${API_URL}/api/channels`, {
  credentials: 'include',
});

// DESPUÉS
import api from './axios';
const response = await api.get('/api/channels', { params: filters });
return response.data;
```

---

## ✅ 2. Mejora de UX - Configuración de Juegos

### Problema
Al hacer clic en "Ver" en un juego, no mostraba los detalles de configuración (items, plantillas).

### Solución

#### **ConfiguracionPage** (`/app/admin/configuracion/page.js`)
- Ahora acepta parámetros URL: `?gameId=xxx&tab=items`
- Auto-selecciona el juego y cambia a la pestaña correspondiente
- Pasa el `selectedGameId` a los componentes hijos

```javascript
const searchParams = useSearchParams();
const [selectedGameId, setSelectedGameId] = useState(null);

useEffect(() => {
  const gameId = searchParams.get('gameId');
  const tab = searchParams.get('tab');
  
  if (gameId) {
    setSelectedGameId(gameId);
    setActiveTab(tab || 'items');
  }
}, [searchParams]);
```

#### **GamesTab** (`/components/admin/config/GamesTab.js`)
- Botón "Ver" cambiado a "Configurar"
- Ahora redirige a `/admin/configuracion?gameId=${game.id}&tab=items`
- Botón "Editar" se mantiene para editar propiedades del juego

```javascript
<Link
  href={`/admin/configuracion?gameId=${game.id}&tab=items`}
  className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
>
  <Eye className="w-4 h-4 mr-2" />
  Configurar
</Link>
```

#### **ItemsTab** (`/components/admin/config/ItemsTab.js`)
- Acepta prop `selectedGameId`
- Pre-selecciona el juego cuando viene de la URL
- Mantiene sincronización con el parámetro inicial

```javascript
export default function ItemsTab({ selectedGameId: initialGameId }) {
  const [selectedGameId, setSelectedGameId] = useState(initialGameId || '');
  
  useEffect(() => {
    if (initialGameId && initialGameId !== selectedGameId) {
      setSelectedGameId(initialGameId);
    }
  }, [initialGameId]);
}
```

#### **TemplatesTab** (`/components/admin/config/TemplatesTab.js`)
- Misma lógica que ItemsTab
- Pre-filtra plantillas por juego seleccionado

---

## Beneficios

### 🔒 Seguridad
- ✅ Todas las peticiones ahora incluyen el token JWT
- ✅ Manejo automático de sesiones expiradas
- ✅ Redirección automática al login en caso de 401

### 🎯 Experiencia de Usuario
- ✅ Flujo intuitivo: Juegos → Configurar → Items/Plantillas
- ✅ Contexto preservado al navegar entre pestañas
- ✅ Menos clics para gestionar configuración de juegos

### 🧹 Código
- ✅ Eliminado código duplicado (fetch boilerplate)
- ✅ Manejo consistente de errores
- ✅ Más fácil de mantener y extender

---

## Archivos Modificados

### Frontend - API Clients
- ✏️ `/frontend/lib/api/games.js` - Migrado a axios
- ✏️ `/frontend/lib/api/templates.js` - Migrado a axios
- ✏️ `/frontend/lib/api/items.js` - Migrado a axios
- ✏️ `/frontend/lib/api/channels.js` - Migrado a axios

### Frontend - Componentes
- ✏️ `/frontend/app/admin/configuracion/page.js` - URL params support
- ✏️ `/frontend/components/admin/config/GamesTab.js` - Botón "Configurar"
- ✏️ `/frontend/components/admin/config/ItemsTab.js` - Pre-selección de juego
- ✏️ `/frontend/components/admin/config/TemplatesTab.js` - Pre-filtrado por juego

---

## Flujo de Trabajo Mejorado

### Antes
1. Admin → Configuración → Juegos
2. Click "Ver" → Abre página pública (no útil para admin)
3. Volver → Configuración → Items
4. Seleccionar juego manualmente
5. Gestionar items

### Ahora
1. Admin → Configuración → Juegos
2. Click "Configurar" → **Automáticamente va a Items con el juego seleccionado**
3. Gestionar items directamente
4. Cambiar a pestaña "Plantillas" si es necesario (juego ya seleccionado)

---

## Testing

### Verificar Autenticación
```bash
# 1. Login en la aplicación
# 2. Abrir DevTools → Network
# 3. Navegar a Configuración → Items
# 4. Verificar que las peticiones incluyen:
#    Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Verificar Flujo de Configuración
```bash
# 1. Admin → Configuración → Juegos
# 2. Click "Configurar" en cualquier juego
# 3. Verificar:
#    - URL: /admin/configuracion?gameId=xxx&tab=items
#    - Pestaña "Items" activa
#    - Juego pre-seleccionado en dropdown
#    - Items del juego cargados
```

### Verificar Navegación entre Pestañas
```bash
# 1. Desde Items con juego seleccionado
# 2. Click en pestaña "Plantillas"
# 3. Verificar:
#    - Juego sigue seleccionado
#    - Plantillas filtradas por ese juego
```

---

## Axios Interceptor (Referencia)

El archivo `/frontend/lib/api/axios.js` ya tenía configurado:

```javascript
// Request interceptor - Agrega token automáticamente
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  }
);

// Response interceptor - Maneja 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## Próximos Pasos (Opcional)

### Mejoras Adicionales
- [ ] Agregar breadcrumbs mostrando: Configuración > Juego X > Items
- [ ] Botón "Volver a Juegos" en las pestañas cuando hay juego seleccionado
- [ ] Mostrar nombre del juego seleccionado en el header de las pestañas
- [ ] Agregar animaciones de transición entre pestañas

### Seguridad
- [ ] Implementar refresh token automático
- [ ] Agregar rate limiting en el frontend
- [ ] Encriptar datos sensibles en localStorage

---

## Comandos Útiles

```bash
# Verificar que no haya más fetch() en archivos API
grep -r "fetch(" frontend/lib/api/*.js

# Verificar imports de axios
grep -r "import api from './axios'" frontend/lib/api/*.js

# Reiniciar frontend
cd frontend && npm run dev

# Ver logs del backend
cd backend && tail -f logs/combined.log
```

---

**Estado Final:** ✅ Todas las peticiones API ahora incluyen JWT automáticamente  
**UX:** ✅ Flujo de configuración de juegos mejorado significativamente  
**Código:** ✅ Más limpio, consistente y mantenible
