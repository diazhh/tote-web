# Estructura del Frontend - Next.js

## Stack Tecnológico

- **Framework**: Next.js 14+ (App Router)
- **UI**: React 18+
- **Styling**: TailwindCSS + shadcn/ui
- **State**: Zustand
- **Forms**: React Hook Form + Zod
- **HTTP**: Axios
- **Real-time**: Socket.io-client
- **Icons**: Lucide React
- **Dates**: date-fns
- **Charts**: Recharts

---

## Estructura de Directorios

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Grupo de autenticación
│   │   │   ├── login/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/       # Grupo principal (requiere auth)
│   │   │   ├── page.tsx       # Dashboard principal
│   │   │   ├── sorteos/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── juegos/
│   │   │   ├── plantillas/
│   │   │   ├── pausas/
│   │   │   ├── canales/
│   │   │   ├── historico/
│   │   │   ├── usuarios/
│   │   │   ├── logs/
│   │   │   └── layout.tsx
│   │   ├── api/               # API routes (opcional)
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── badge.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── MainLayout.tsx
│   │   │   └── AuthLayout.tsx
│   │   ├── draws/
│   │   │   ├── DrawCard.tsx
│   │   │   ├── DrawList.tsx
│   │   │   ├── DrawCountdown.tsx
│   │   │   ├── DrawStatusBadge.tsx
│   │   │   ├── DrawDetailModal.tsx
│   │   │   └── ChangeWinnerModal.tsx
│   │   ├── games/
│   │   │   ├── GameCard.tsx
│   │   │   ├── GameForm.tsx
│   │   │   ├── ItemManager.tsx
│   │   │   └── ItemForm.tsx
│   │   ├── templates/
│   │   │   ├── TemplateForm.tsx
│   │   │   ├── TemplatePreview.tsx
│   │   │   └── TimeSelector.tsx
│   │   ├── publications/
│   │   │   ├── PublicationStatus.tsx
│   │   │   ├── PublicationList.tsx
│   │   │   └── ChannelIcon.tsx
│   │   ├── channels/
│   │   │   ├── ChannelCard.tsx
│   │   │   ├── ChannelForm.tsx
│   │   │   └── ChannelTestButton.tsx
│   │   └── common/
│   │       ├── LoadingSpinner.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── Pagination.tsx
│   │       └── DateRangePicker.tsx
│   ├── lib/
│   │   ├── api/               # API clients
│   │   │   ├── axios.ts
│   │   │   ├── auth.ts
│   │   │   ├── draws.ts
│   │   │   ├── games.ts
│   │   │   └── ...
│   │   ├── socket/            # WebSocket
│   │   │   └── socket.ts
│   │   ├── utils/             # Utilidades
│   │   │   ├── cn.ts
│   │   │   ├── format.ts
│   │   │   └── validators.ts
│   │   └── constants.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useDraws.ts
│   │   ├── useGames.ts
│   │   ├── useWebSocket.ts
│   │   ├── useCountdown.ts
│   │   └── usePagination.ts
│   ├── store/
│   │   ├── authStore.ts
│   │   ├── drawStore.ts
│   │   ├── gameStore.ts
│   │   └── notificationStore.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── api.ts
│   │   └── models.ts
│   └── styles/
│       └── globals.css
├── public/
│   ├── images/
│   ├── icons/
│   └── fonts/
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Páginas Principales

### 1. Dashboard (`/`)

```tsx
// src/app/(dashboard)/page.tsx
'use client';

import { DrawCountdown } from '@/components/draws/DrawCountdown';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { RecentDraws } from '@/components/dashboard/RecentDraws';
import { UpcomingDraws } from '@/components/dashboard/UpcomingDraws';
import { PublicationAlerts } from '@/components/dashboard/PublicationAlerts';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      {/* Próximo sorteo con countdown */}
      <DrawCountdown />
      
      {/* Estadísticas */}
      <DashboardStats />
      
      {/* Grid de información */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentDraws />
        <UpcomingDraws />
      </div>
      
      {/* Alertas de publicaciones */}
      <PublicationAlerts />
    </div>
  );
}
```

---

### 2. Sorteos (`/sorteos`)

```tsx
// src/app/(dashboard)/sorteos/page.tsx
'use client';

import { useState } from 'react';
import { DrawList } from '@/components/draws/DrawList';
import { DrawFilters } from '@/components/draws/DrawFilters';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function SorteosPage() {
  const [filters, setFilters] = useState({});
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sorteos</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Crear Sorteo
        </Button>
      </div>
      
      <DrawFilters onFiltersChange={setFilters} />
      <DrawList filters={filters} />
    </div>
  );
}
```

---

### 3. Detalle de Sorteo (`/sorteos/[id]`)

```tsx
// src/app/(dashboard)/sorteos/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useDraw } from '@/hooks/useDraw';
import { DrawInfo } from '@/components/draws/DrawInfo';
import { ImagePreview } from '@/components/draws/ImagePreview';
import { PublicationStatus } from '@/components/publications/PublicationStatus';
import { DrawActions } from '@/components/draws/DrawActions';

export default function DrawDetailPage() {
  const { id } = useParams();
  const { draw, isLoading } = useDraw(id as string);
  
  if (isLoading) return <LoadingSpinner />;
  if (!draw) return <EmptyState />;
  
  return (
    <div className="space-y-6">
      <DrawInfo draw={draw} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ImagePreview imageUrl={draw.imageUrl} />
        <PublicationStatus publications={draw.publications} />
      </div>
      
      <DrawActions draw={draw} />
    </div>
  );
}
```

---

## Componentes Clave

### DrawCard

```tsx
// src/components/draws/DrawCard.tsx
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DrawStatusBadge } from './DrawStatusBadge';
import { format } from 'date-fns';
import { Clock, Trophy } from 'lucide-react';

interface DrawCardProps {
  draw: Draw;
  onClick?: () => void;
}

export function DrawCard({ draw, onClick }: DrawCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">{draw.game.name}</h3>
          <div className="flex items-center text-sm text-muted-foreground mt-1">
            <Clock className="mr-1 h-4 w-4" />
            {format(new Date(draw.scheduledAt), 'dd/MM/yyyy HH:mm')}
          </div>
        </div>
        <DrawStatusBadge status={draw.status} />
      </CardHeader>
      
      {draw.winnerItem && (
        <CardContent>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="font-bold text-2xl">{draw.winnerItem.number}</div>
              <div className="text-sm text-muted-foreground">
                {draw.winnerItem.name}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
```

---

### DrawCountdown

```tsx
// src/components/draws/DrawCountdown.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useNextDraw } from '@/hooks/useNextDraw';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function DrawCountdown() {
  const { nextDraw } = useNextDraw();
  const [timeLeft, setTimeLeft] = useState('');
  
  useEffect(() => {
    if (!nextDraw) return;
    
    const interval = setInterval(() => {
      const distance = formatDistanceToNow(
        new Date(nextDraw.scheduledAt),
        { locale: es, addSuffix: true }
      );
      setTimeLeft(distance);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [nextDraw]);
  
  if (!nextDraw) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">No hay sorteos próximos</p>
      </Card>
    );
  }
  
  return (
    <Card className="p-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
      <div className="text-center">
        <p className="text-sm opacity-90 mb-2">PRÓXIMO SORTEO</p>
        <h2 className="text-3xl font-bold mb-2">{nextDraw.game.name}</h2>
        <div className="text-5xl font-bold mb-2">{timeLeft}</div>
        {nextDraw.preselectedItem && (
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-sm opacity-90 mb-1">Preselección</p>
            <p className="text-2xl font-bold">
              {nextDraw.preselectedItem.number} - {nextDraw.preselectedItem.name}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
```

---

### ChangeWinnerModal

```tsx
// src/components/draws/ChangeWinnerModal.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChangeWinner } from '@/hooks/useChangeWinner';

interface ChangeWinnerModalProps {
  draw: Draw;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeWinnerModal({
  draw,
  open,
  onOpenChange
}: ChangeWinnerModalProps) {
  const [number, setNumber] = useState('');
  const { changeWinner, isLoading } = useChangeWinner();
  
  const handleSubmit = async () => {
    await changeWinner(draw.id, number);
    onOpenChange(false);
    setNumber('');
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar Número Ganador</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Sorteo: {draw.game.name} - {format(draw.scheduledAt, 'HH:mm')}
            </p>
            <p className="font-medium">
              Actual: {draw.preselectedItem?.number} - {draw.preselectedItem?.name}
            </p>
          </div>
          
          <div>
            <label className="text-sm font-medium">Nuevo Número</label>
            <Input
              type="text"
              placeholder="Ingrese el número"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !number}>
            Confirmar Cambio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Stores (Zustand)

### Auth Store

```tsx
// src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      
      login: (user, token) => set({
        user,
        accessToken: token,
        isAuthenticated: true
      }),
      
      logout: () => set({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })
    }),
    {
      name: 'auth-storage'
    }
  )
);
```

---

### Draw Store

```tsx
// src/store/drawStore.ts
import { create } from 'zustand';

interface DrawState {
  draws: Draw[];
  nextDraw: Draw | null;
  setDraws: (draws: Draw[]) => void;
  setNextDraw: (draw: Draw | null) => void;
  updateDraw: (id: string, data: Partial<Draw>) => void;
}

export const useDrawStore = create<DrawState>((set) => ({
  draws: [],
  nextDraw: null,
  
  setDraws: (draws) => set({ draws }),
  setNextDraw: (nextDraw) => set({ nextDraw }),
  
  updateDraw: (id, data) => set((state) => ({
    draws: state.draws.map(draw =>
      draw.id === id ? { ...draw, ...data } : draw
    ),
    nextDraw: state.nextDraw?.id === id
      ? { ...state.nextDraw, ...data }
      : state.nextDraw
  }))
}));
```

---

## WebSocket Integration

```tsx
// src/lib/socket/socket.ts
import { io, Socket } from 'socket.io-client';
import { useDrawStore } from '@/store/drawStore';
import { toast } from 'sonner';

class SocketService {
  private socket: Socket | null = null;
  
  connect() {
    this.socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      auth: {
        token: localStorage.getItem('accessToken')
      }
    });
    
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });
    
    this.socket.on('draw:closed', (data) => {
      useDrawStore.getState().updateDraw(data.drawId, {
        status: 'CLOSED',
        preselectedItem: data.preselectedItem,
        closedAt: data.closedAt
      });
      
      toast.info(`Sorteo cerrado: ${data.preselectedItem.number}`);
    });
    
    this.socket.on('draw:winner-selected', (data) => {
      useDrawStore.getState().updateDraw(data.drawId, {
        status: 'DRAWN',
        winnerItem: data.winnerItem,
        drawnAt: data.drawnAt
      });
      
      toast.success(`Ganador: ${data.winnerItem.number} - ${data.winnerItem.name}`);
    });
    
    this.socket.on('draw:published', (data) => {
      useDrawStore.getState().updateDraw(data.drawId, {
        status: 'PUBLISHED',
        imageUrl: data.imageUrl,
        publishedAt: data.publishedAt
      });
    });
    
    this.socket.on('publication:failed', (data) => {
      toast.error(`Publicación fallida en ${data.channel}: ${data.error}`);
    });
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
```

---

## API Client

```tsx
// src/lib/api/axios.ts
import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## Tailwind Config

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // ... shadcn/ui colors
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;
```

---

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_WEBSITE_URL=https://loteria.com
```
