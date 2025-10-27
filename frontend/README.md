# Frontend - Totalizador de Loterías

Frontend web desarrollado con Next.js 14 para el sistema de gestión de loterías.

## 🚀 Stack Tecnológico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: JavaScript (ES6+)
- **Styling**: TailwindCSS 4
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Real-time**: Socket.io-client
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **Dates**: date-fns
- **Notifications**: Sonner

## 🛠️ Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.local.example .env.local
```

## 🔧 Variables de Entorno

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000
```

## 🚀 Desarrollo

```bash
# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Iniciar en producción
npm start
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000)

## 📄 Páginas Implementadas

### Landing Page Pública (`/`)
- Countdown del próximo sorteo
- Resultados del día
- Grid de juegos disponibles
- Actualizaciones en tiempo real vía WebSocket

### Detalle de Juego (`/juego/[slug]`)
- Resultados del día del juego
- Histórico de sorteos con paginación
- Estadísticas (últimos 30 días)

## 🔌 Integración con Backend

El frontend se conecta al backend en `http://localhost:3001` y utiliza:

- **API REST**: Para obtener datos de juegos y sorteos
- **WebSocket**: Para actualizaciones en tiempo real
