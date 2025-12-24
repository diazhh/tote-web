# Algoritmo de Pre-Selección de Ganadores

## Descripción General

El sistema utiliza un algoritmo multi-criterio sofisticado para seleccionar automáticamente el número pre-ganador de cada sorteo. El objetivo es **maximizar la cantidad de personas ganadoras** mientras se mantienen los pagos dentro de los límites establecidos.

## Archivos Principales

- **`/backend/src/services/prewinner-optimizer.service.js`** - Algoritmo principal de optimización
- **`/backend/src/services/prewinner-selection.service.js`** - Orquestador que usa el optimizador y genera reportes/notificaciones

## Configuración del Juego

En el campo `config` (JSON) del juego se pueden configurar:

```json
{
  "percentageToDistribute": 70,    // Porcentaje de ventas a repartir (default: 70)
  "maxPayoutFixed": 500,           // Monto fijo máximo a repartir (prioridad sobre porcentaje)
  "tripleta": {
    "enabled": true,
    "multiplier": 500
  }
}
```

**Prioridad del monto máximo:**
1. Si `maxPayoutFixed` está definido y > 0, usa ese monto fijo
2. Si no, calcula `(ventas_totales * percentageToDistribute) / 100`
3. Nunca paga más de lo vendido

## Criterios de Selección

### 1. Restricciones Duras (Eliminatorias)

Un item es **descartado** si:

- ❌ El pago total (directo + tripletas) > monto máximo configurado
- ❌ Ya fue usado hoy (preseleccionado o ganador)
- ❌ Para TRIPLE: su centena ya fue usada hoy
- ❌ Causaría pérdidas (pago total > ventas totales)

### 2. Criterios de Scoring (Optimización)

| Criterio | Peso | Descripción |
|----------|------|-------------|
| **Tickets Ganadores** | 35% | Maximizar cantidad de tickets (más personas ganan) |
| **Días sin Ganar** | 25% | Preferir items que llevan más tiempo sin salir |
| **Patrones Sucesivos** | 15% | Penalizar números consecutivos (01, 02, 03) |
| **Riesgo Tripletas** | 15% | Minimizar impacto de tripletas que se completarían |
| **Eficiencia de Pago** | 10% | Preferir pagos cercanos al máximo (pero debajo) |

## Fórmulas de Scoring

### Tickets Ganadores (35%)
```javascript
score = ticketsDelItem / maxTicketsDeCualquierItem
```
Normalizado 0-1. Más tickets = mejor score.

### Días sin Ganar (25%)
```javascript
score = Math.min(diasSinGanar / 30, 1)
```
Normalizado a 30 días. Items que nunca han ganado reciben score = 1.

### Patrones Sucesivos (15%)
```javascript
penalidad = 0
// Por cada ganador de hoy:
if (diferencia == 1) penalidad += 0.4  // Consecutivo directo
if (diferencia == 2) penalidad += 0.2  // Casi consecutivo
// Detección de patrones aritméticos en últimos 5 sorteos
score = 1 - penalidad
```

### Riesgo Tripletas (15%)
```javascript
if (completariaTripletas) {
  tripletaRatio = premioTripletas / maxPayout
  score = Math.max(0, 1 - tripletaRatio * 2)
} else {
  score = 1  // Sin riesgo
}
```

### Eficiencia de Pago (10%)
```javascript
payoutRatio = pagoTotal / maxPayout
if (payoutRatio <= 0.9) {
  score = payoutRatio / 0.9  // Óptimo entre 50-90%
} else {
  score = Math.max(0, 1 - (payoutRatio - 0.9) * 5)  // Penaliza >90%
}
```

## Flujo del Algoritmo

```
1. Cargar contexto del sorteo (juego, tickets, ventas, tripletas)
   ↓
2. Si admin ya preseleccionó → retornar ese item
   ↓
3. Si no hay ventas → selección aleatoria inteligente
   ↓
4. Calcular restricciones (maxPayout)
   ↓
5. Obtener historial (ganadores recientes, patrones)
   ↓
6. Para cada item:
   a. Aplicar restricciones duras (descartar si no cumple)
   b. Calcular impacto de tripletas
   c. Calcular scores individuales
   d. Calcular score final ponderado
   ↓
7. Ordenar por score descendente
   ↓
8. Seleccionar el mejor candidato
   ↓
9. Actualizar sorteo, generar PDF, notificar admins
```

## API Endpoints

### Analizar Pre-Ganador (sin ejecutar)
```
GET /api/draws/:id/analyze-prewinner
```
Retorna el análisis completo sin guardar cambios. Útil para debugging.

**Response:**
```json
{
  "success": true,
  "data": {
    "method": "optimized",
    "selectedItem": { "number": "05", "name": "LEON" },
    "analysis": {
      "totalCandidates": 38,
      "validCandidates": 25,
      "selected": {
        "ticketCount": 15,
        "daysSinceWin": 12,
        "finalScore": 0.8234
      },
      "topAlternatives": [...]
    }
  }
}
```

### Ejecutar Selección
```
POST /api/draws/:id/select-prewinner
```
Ejecuta la selección y actualiza el sorteo.

## Casos Especiales

### Sin Ventas
Cuando no hay tickets vendidos, se usa **selección aleatoria inteligente**:
1. Filtrar items no usados hoy
2. Para TRIPLE, filtrar centenas no usadas
3. Ordenar por días sin ganar (descendente)
4. Tomar top 20% de los que más tiempo llevan sin ganar
5. Filtrar los que serían sucesivos
6. Seleccionar aleatoriamente del pool resultante

### Sin Candidatos Válidos
Si todas las restricciones duras eliminan todos los items:
1. Relajar restricciones (solo mantener "no usado hoy")
2. Preferir items con menos ventas (menor pago potencial)
3. Seleccionar el primero de la lista

### Fallback
Si algo falla, el sistema recurre a selección aleatoria básica respetando restricciones mínimas.

## Logging

El algoritmo genera logs detallados:
```
🎯 [OPTIMIZER] Iniciando selección óptima para sorteo abc123...
  💰 Ventas: $500.00, Máx pago: $350.00
  ✅ Seleccionado: 05 (LEON)
     Score: 0.8234
     Tickets ganadores: 15
     Días sin ganar: 12
     Pago total: $300.00
  ⏱️ Tiempo de cálculo: 45ms
```

## Ajuste de Pesos

Los pesos pueden ajustarse en `PrewinnerOptimizerService.WEIGHTS`:

```javascript
static WEIGHTS = {
  TICKET_COUNT: 0.35,        // Maximizar tickets ganadores
  DAYS_SINCE_WIN: 0.25,      // Items sin salir hace más tiempo
  SEQUENTIAL_PENALTY: 0.15,  // Evitar números sucesivos
  TRIPLETA_RISK: 0.15,       // Minimizar riesgo de tripletas
  PAYOUT_EFFICIENCY: 0.10    // Eficiencia del pago
};
```

## Consideraciones de Rendimiento

- El algoritmo se ejecuta 5 minutos antes del sorteo
- Tiempo típico: 30-100ms dependiendo de la cantidad de tripletas activas
- Las consultas a la base de datos están optimizadas con índices

## Integración con Jobs

El job `close-draw.job.js` llama automáticamente al servicio cuando:
1. Es hora de cerrar el sorteo (5 min antes)
2. El sorteo tiene tickets importados de APIs externas
3. No hay pre-ganador seleccionado por admin

```javascript
// En close-draw.job.js
selectedItem = await prewinnerSelectionService.selectPrewinner(draw.id);
```
