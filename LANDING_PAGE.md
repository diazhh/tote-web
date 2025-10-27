# Landing Page Pública - Sistema de Loterías

## Visión General

La **página principal** del sistema será una **landing page pública** donde los usuarios pueden ver los resultados actuales y el histórico de todos los juegos sin necesidad de autenticación.

---

## Estructura de la Landing Page

### 1. Header

**Contenido:**
- Logo del sistema
- Nombre del sitio
- Navegación principal:
  - Inicio
  - Triple
  - Ruleta
  - Animalitos
  - Histórico
- Botón "Admin" (enlace al dashboard administrativo)

**Diseño:**
- Sticky header
- Responsive
- Iconos de juegos

---

### 2. Hero Section (Página Principal)

**Contenido:**
- Título principal: "Resultados de Lotería en Tiempo Real"
- Subtítulo descriptivo
- Selección rápida de juegos (3 cards grandes)
- Próximo sorteo con countdown

**Elementos visuales:**
- Cards atractivas por cada juego
- Animación de countdown
- Imágenes temáticas

---

### 3. Resultados de Hoy

**Sección organizada por juego:**

```
┌─────────────────────────────────────────┐
│  TRIPLE PANTERA - Resultados de Hoy     │
├─────────────────────────────────────────┤
│  08:00 AM  │  123 - Mariposa  │ [IMG]  │
│  09:00 AM  │  456 - Gato      │ [IMG]  │
│  10:00 AM  │  789 - Perro     │ [IMG]  │
│  ...       │                   │        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  RULETA - Resultados de Hoy             │
├─────────────────────────────────────────┤
│  08:00 AM  │  25 (Rojo)       │ [IMG]  │
│  09:00 AM  │  12 (Rojo)       │ [IMG]  │
│  ...       │                   │        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ANIMALITOS - Resultados de Hoy         │
├─────────────────────────────────────────┤
│  08:00 AM  │  15 - Zorro      │ [IMG]  │
│  09:00 AM  │  23 - Cebra      │ [IMG]  │
│  ...       │                   │        │
└─────────────────────────────────────────┘
```

**Features:**
- Actualización en tiempo real (WebSocket)
- Vista de imágenes generadas
- Modal para ver imagen en grande
- Indicador de "En vivo" para sorteos activos
- Indicador de "Próximo" con countdown

---

### 4. Páginas por Juego

Cada juego tiene su página dedicada:

#### `/triple` - Triple Pantera
```
┌─────────────────────────────────────────────┐
│           TRIPLE PANTERA                    │
│  "Juego de 3 cifras del 000 al 999"        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  RESULTADOS DE HOY                          │
├─────────────────────────────────────────────┤
│  Grid de resultados con imágenes           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  RECOMENDACIONES DEL DÍA                    │
├─────────────────────────────────────────────┤
│  Imagen de recomendaciones                  │
│  - Permuta                                  │
│  - Favoritos                                │
│  - Explosivos                               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  HISTÓRICO                                  │
├─────────────────────────────────────────────┤
│  Tabla con paginación                       │
│  Filtros: Fecha, Número                     │
└─────────────────────────────────────────────┘
```

#### `/ruleta` - Ruleta
```
Similar estructura pero sin recomendaciones
Muestra color del número (rojo/negro/verde)
```

#### `/animalitos` - Animalitos
```
┌─────────────────────────────────────────────┐
│           ANIMALITOS                        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  RESULTADOS DE HOY                          │
│  (con imágenes de animales)                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  PIRÁMIDE NUMEROLÓGICA                      │
│  (imagen de pirámide del día)               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  RESUMEN DIARIO                             │
│  (imagen con todos los resultados)          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  HISTÓRICO                                  │
└─────────────────────────────────────────────┘
```

---

### 5. Página de Histórico General (`/historico`)

**Funcionalidad:**
- Ver histórico de todos los juegos
- Filtros avanzados:
  - Por juego
  - Por rango de fechas
  - Por número ganador
  - Por horario
- Exportar resultados (CSV/PDF)
- Vista de calendario
- Vista de tabla

**Layout:**
```
┌──────────────────────────────────────────────┐
│  FILTROS                                     │
│  [Juego ▼] [Desde] [Hasta] [Número] [Buscar]│
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  RESULTADOS                                  │
├────────┬──────────┬─────────┬────────┬───────┤
│ Fecha  │  Hora    │  Juego  │ Número │ Imagen│
├────────┼──────────┼─────────┼────────┼───────┤
│01/10/25│ 08:00 AM │ Triple  │  123   │ [Ver] │
│01/10/25│ 09:00 AM │ Ruleta  │   25   │ [Ver] │
│...     │          │         │        │       │
└────────┴──────────┴─────────┴────────┴───────┘

[Página anterior] [1] [2] [3] ... [Siguiente]
```

---

### 6. Footer

**Contenido:**
- Información de contacto
- Enlaces a redes sociales (Telegram, Facebook, Instagram, etc.)
- Términos y condiciones
- Política de privacidad
- Copyright
- Horarios de sorteos

---

## Componentes React (Landing Page)

### Estructura de Carpetas

```
frontend/src/
├── app/
│   ├── (public)/              # Grupo público (sin auth)
│   │   ├── page.tsx           # Landing page principal
│   │   ├── triple/
│   │   │   └── page.tsx       # Página Triple
│   │   ├── ruleta/
│   │   │   └── page.tsx       # Página Ruleta
│   │   ├── animalitos/
│   │   │   └── page.tsx       # Página Animalitos
│   │   ├── historico/
│   │   │   └── page.tsx       # Histórico general
│   │   └── layout.tsx         # Layout público
│   └── (admin)/               # Grupo admin (con auth)
│       ├── dashboard/
│       └── layout.tsx
├── components/
│   ├── public/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── HeroSection.tsx
│   │   ├── GameCard.tsx
│   │   ├── DrawResultCard.tsx
│   │   ├── DrawCountdown.tsx
│   │   ├── DrawsGridToday.tsx
│   │   ├── HistoryTable.tsx
│   │   ├── ImageModal.tsx
│   │   └── GameStats.tsx
```

---

## Componentes Principales

### 1. Header Component

```tsx
// components/public/Header.tsx
export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-md">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-xl font-bold">Lotería Premium</span>
          </div>
          
          <div className="hidden md:flex gap-6">
            <NavLink href="/">Inicio</NavLink>
            <NavLink href="/triple">Triple</NavLink>
            <NavLink href="/ruleta">Ruleta</NavLink>
            <NavLink href="/animalitos">Animalitos</NavLink>
            <NavLink href="/historico">Histórico</NavLink>
          </div>
          
          <Button href="/admin" variant="outline">
            Admin
          </Button>
        </div>
      </nav>
    </header>
  );
}
```

### 2. Hero Section

```tsx
// components/public/HeroSection.tsx
export function HeroSection() {
  const { nextDraw } = useNextPublicDraw();
  
  return (
    <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Resultados de Lotería en Tiempo Real
        </h1>
        <p className="text-xl mb-8">
          Consulta los resultados de Triple, Ruleta y Animalitos
        </p>
        
        {nextDraw && (
          <div className="bg-white/10 backdrop-blur rounded-lg p-6 max-w-md mx-auto">
            <p className="text-sm mb-2">Próximo Sorteo</p>
            <h3 className="text-2xl font-bold mb-2">{nextDraw.game.name}</h3>
            <DrawCountdown scheduledAt={nextDraw.scheduledAt} />
          </div>
        )}
      </div>
    </section>
  );
}
```

### 3. Game Selection Cards

```tsx
// components/public/GameCard.tsx
export function GameCard({ game }: { game: Game }) {
  return (
    <Link href={`/${game.slug}`}>
      <Card className="hover:shadow-xl transition-shadow cursor-pointer">
        <CardHeader>
          <GameIcon type={game.type} className="w-16 h-16 mx-auto" />
          <CardTitle className="text-center text-2xl">{game.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            {game.description}
          </p>
          <Button className="w-full mt-4">Ver Resultados</Button>
        </CardContent>
      </Card>
    </Link>
  );
}
```

### 4. Draws Grid Today

```tsx
// components/public/DrawsGridToday.tsx
'use client';

export function DrawsGridToday({ gameSlug }: { gameSlug?: string }) {
  const { draws, isLoading } = usePublicDrawsToday(gameSlug);
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {draws.map((draw) => (
        <DrawResultCard key={draw.id} draw={draw} />
      ))}
    </div>
  );
}
```

### 5. Draw Result Card

```tsx
// components/public/DrawResultCard.tsx
export function DrawResultCard({ draw }: { draw: Draw }) {
  const [showImage, setShowImage] = useState(false);
  
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{draw.game.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(draw.scheduledAt, 'hh:mm A')}
              </p>
            </div>
            <DrawStatusBadge status={draw.status} />
          </div>
        </CardHeader>
        
        <CardContent>
          {draw.imageUrl && (
            <div 
              className="relative aspect-square cursor-pointer rounded-lg overflow-hidden mb-4"
              onClick={() => setShowImage(true)}
            >
              <Image
                src={draw.imageUrl}
                alt={`Resultado ${draw.winnerItem.number}`}
                fill
                className="object-cover hover:scale-105 transition-transform"
              />
            </div>
          )}
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Número Ganador</p>
            <p className="text-4xl font-bold text-primary">
              {draw.winnerItem.number}
            </p>
            <p className="text-lg text-muted-foreground">
              {draw.winnerItem.name}
            </p>
          </div>
        </CardContent>
      </Card>
      
      <ImageModal 
        open={showImage}
        onClose={() => setShowImage(false)}
        imageUrl={draw.imageUrl}
        title={`${draw.game.name} - ${draw.winnerItem.number}`}
      />
    </>
  );
}
```

### 6. History Table

```tsx
// components/public/HistoryTable.tsx
'use client';

export function HistoryTable({ gameSlug }: { gameSlug?: string }) {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    number: '',
    page: 1
  });
  
  const { draws, pagination, isLoading } = usePublicHistory(gameSlug, filters);
  
  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <DatePicker
              label="Desde"
              value={filters.startDate}
              onChange={(date) => setFilters({ ...filters, startDate: date })}
            />
            <DatePicker
              label="Hasta"
              value={filters.endDate}
              onChange={(date) => setFilters({ ...filters, endDate: date })}
            />
            <Input
              placeholder="Número"
              value={filters.number}
              onChange={(e) => setFilters({ ...filters, number: e.target.value })}
            />
            <Button onClick={() => setFilters({ ...filters, page: 1 })}>
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Tabla */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              {!gameSlug && <TableHead>Juego</TableHead>}
              <TableHead>Número</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Imagen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draws.map((draw) => (
              <TableRow key={draw.id}>
                <TableCell>
                  {format(draw.scheduledAt, 'dd/MM/yyyy')}
                </TableCell>
                <TableCell>
                  {format(draw.scheduledAt, 'hh:mm A')}
                </TableCell>
                {!gameSlug && <TableCell>{draw.game.name}</TableCell>}
                <TableCell className="font-bold text-xl">
                  {draw.winnerItem.number}
                </TableCell>
                <TableCell>{draw.winnerItem.name}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">Ver</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        <div className="p-4">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(page) => setFilters({ ...filters, page })}
          />
        </div>
      </Card>
    </div>
  );
}
```

---

## Hooks Personalizados

```tsx
// hooks/usePublicDrawsToday.ts
export function usePublicDrawsToday(gameSlug?: string) {
  return useQuery({
    queryKey: ['public-draws-today', gameSlug],
    queryFn: () => {
      const endpoint = gameSlug 
        ? `/api/public/draws/game/${gameSlug}/today`
        : '/api/public/draws/today';
      return api.get(endpoint);
    },
    refetchInterval: 30000 // Actualizar cada 30 segundos
  });
}

// hooks/usePublicHistory.ts
export function usePublicHistory(gameSlug: string, filters: Filters) {
  return useQuery({
    queryKey: ['public-history', gameSlug, filters],
    queryFn: () => 
      api.get(`/api/public/draws/game/${gameSlug}/history`, { params: filters })
  });
}

// hooks/useNextPublicDraw.ts
export function useNextPublicDraw() {
  return useQuery({
    queryKey: ['next-draw'],
    queryFn: () => api.get('/api/public/draws/next'),
    refetchInterval: 10000 // Actualizar cada 10 segundos
  });
}
```

---

## Actualización en Tiempo Real

```tsx
// lib/socket/publicSocket.ts
export function usePublicSocket() {
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL);
    
    // Escuchar eventos públicos
    socket.on('draw:published', (data) => {
      queryClient.invalidateQueries(['public-draws-today']);
      toast.success(`Nuevo resultado: ${data.winnerItem.number}`);
    });
    
    return () => socket.disconnect();
  }, []);
}
```

---

## SEO y Meta Tags

```tsx
// app/(public)/page.tsx
export const metadata: Metadata = {
  title: 'Resultados de Lotería en Tiempo Real | Lotería Premium',
  description: 'Consulta los resultados de Triple, Ruleta y Animalitos en tiempo real',
  keywords: 'lotería, resultados, triple, ruleta, animalitos',
  openGraph: {
    title: 'Lotería Premium - Resultados en Tiempo Real',
    description: 'Los mejores resultados de lotería',
    images: ['/og-image.png']
  }
};
```

---

## Responsive Design

- **Mobile First**: Diseño optimizado para móviles
- **Breakpoints**: sm, md, lg, xl
- **Grid flexible**: 1 columna en móvil, 2-3 en desktop
- **Navegación hamburguesa** en móvil
- **Imágenes optimizadas**: Next/Image con lazy loading

---

## Performance

- **Static Generation**: Páginas estáticas cuando sea posible
- **ISR (Incremental Static Regeneration)**: Revalidar cada 60 segundos
- **Client-side fetching**: Para datos en tiempo real
- **Image optimization**: Formato WebP, dimensiones apropiadas
- **Caching**: SWR o React Query con tiempos apropiados
