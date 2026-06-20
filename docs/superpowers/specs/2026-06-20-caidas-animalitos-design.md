# Caídas de animalitos — diseño

**Fecha:** 2026-06-20
**Autor:** Claude + diazhh
**Estado:** propuesto (pendiente revisión del usuario)
**Alcance:** LOTOANIMALITO (0-36) y LOTTOPANTERA (0-48). Triple/Terminal Pantera quedan fuera (son números, no animales).

---

## 1. Concepto

En el folklore de animalitos, cuando sale un animal X "arrastra" un conjunto de animales relacionados — sus **caídas**. La creencia: tras salir X, en el sorteo siguiente tiende a salir alguna de sus caídas.

Modelamos la **caída de un sorteo N** como las caídas del **ganador del sorteo N-1** (mismo juego, mismo día). El primer sorteo de cada día no tiene caída (no hay ganador previo ese día — decisión del usuario, no se cruza el cambio de día).

La tabla de caídas es **curada** (no estadística): se construye con criterios coherentes de afinidad, no midiendo correlaciones reales. (El análisis empírico sobre el histórico mostró que las caídas no predicen mejor que el azar; esta feature implementa la herramienta de folklore que pide el negocio, no una predicción estadística.)

---

## 2. Decisiones tomadas

| # | Decisión | Valor |
|---|----------|-------|
| 1 | Base de las caídas en Telegram | **Ganador del sorteo anterior** (igual que el monitor); se marca si el preseleccionado coincide |
| 2 | Métricas por caída | Contra la **venta del sorteo ACTUAL** (exposición real ahora) |
| 3 | Definición de "riesgo" | **Exposición financiera**: premio potencial vs máximo a pagar |
| 4 | Almacenamiento de la tabla | **Módulo estático** en el repo |
| 5 | "Sorteo anterior" | **Se reinicia cada día** (primer sorteo del día sin caída) |

---

## 3. Arquitectura

Una sola fuente de verdad alimentando los dos canales:

```
backend/src/data/caidas.js               ← tabla estática (edge list → mapas dirigidos)
backend/src/services/caida.service.js    ← getCaidasForDraw(drawId): resuelve ganador previo,
                                            busca caídas y las enriquece con métricas
   ├─→ admin-notification.service.js      (bloque "Caídas" en el mensaje de Telegram)
   └─→ GET /api/monitor/draws/:id/caidas  (panel "Caída esperada" en el monitor)
```

Alternativa descartada: tabla en el frontend + cálculo en el cliente → duplicaría la tabla, porque Telegram necesita la versión backend de todas formas. Fuente única evita divergencia.

### 3.1 `backend/src/data/caidas.js`

Fuente = **lista de aristas no dirigidas** con un `reason` (criterio). El módulo las simetriza al construir los mapas, garantizando reciprocidad por construcción.

```js
// Aristas base (válidas para pantera; animalito = base filtrada a 0-36)
const EDGES = [ [a, b, reason], ... ];
// Suplementos SOLO-animalito (dentro de 0-36) que rellenan los nodos que
// perdían caídas al quitar los animales 37-48.
const ANIMALITO_EXTRA = [ [a, b, reason], ... ];

// Mapas materializados por juego: Map<number, Array<{number, name, reason}>>
export const CAIDAS = {
  lottopantera: buildAdj(EDGES),
  lotoanimalito: buildAdj([...EDGES.filter(en 0-36), ...ANIMALITO_EXTRA]),
};

export function getCaidas(gameSlug, number) // → Array<{number, name, reason}> | []
export function hasCaidas(gameSlug)          // → boolean
```

`reason` ∈ `espejo` · `familia:{acuáticos|aves|felinos|roedores|reptiles|bichos|ganado|safari|monte|cánidos}` · `depredador` · `recíproco` · `afinidad[:agua|:rastreros]`. Sirve para tooltip en el monitor.

**Reglas de construcción** (validadas: reciprocidad 100%, grado 4-7 por nodo):

1. **Reciprocidad por construcción** — aristas no dirigidas → si A↔B, ambos se ven (p. ej. PERRO↔GATO).
2. **Espejo numérico** siempre que exista en rango: 01↔10, 02↔20, 03↔30, 04↔40, 12↔21, 13↔31, 14↔41, 23↔32, 24↔42, 34↔43.
3. **Familia/biología**: acuáticos · aves · felinos · roedores/pequeños · reptiles/bichos · ganado/corral · safari/monte.
4. **Depredador–presa / afinidad**: gato→ratón, culebra→rana, león→presas, perro→conejo/gallina, zorro→aves.
5. **Volumen** 5-7 (pantera) / 4-7 (animalito) caídas por animal.

### 3.2 `caida.service.js` — contrato

```js
getCaidasForDraw(drawId) → {
  game: 'lottopantera' | 'lotoanimalito',
  previousDraw: { id, drawTime, winner: { number, name } } | null,
  caidas: [{
    number, name, reason,
    sorteosSinSalir, diasSinSalir,   // desde el histórico de Draw del mismo juego
    ventaActual,                     // jugado en ESTE sorteo en ese animal
    premioPotencial,                 // ventaActual × multiplier
    utilidadSobreVenta,              // (ventasTotales − premioPotencial) / ventasTotales (%)
    riesgo: 'ALTO' | 'MEDIO' | 'BAJO'
  }, ...],
  preselectedEnCaidas: boolean       // ¿el preseleccionado/ganador coincide con una caída?
} | null
```

Devuelve `null` si: el juego no tiene tabla (triple/terminal), o no hay sorteo previo ese día. En ese caso ni Telegram ni el monitor pintan el bloque.

**Umbrales de riesgo** (sobre `maxPayout` del sorteo): `ALTO` ≥ maxPayout · `MEDIO` ≥ 50% · `BAJO` < 50%.

**Tiempo sin salir**: `sorteosSinSalir` = nº de sorteos del juego con `drawDateTime < actual` desde la última victoria del animal; `diasSinSalir` = días entre esa última victoria y el sorteo actual. Se calcula del histórico de `Draw` (más preciso que `GameItem.lastWin`, que es global).

### 3.3 Telegram (`admin-notification.service.js`)

Nuevo bloque en `formatPrewinnerMessage`, tras el riesgo de tripletas:

```
━━━━━━━━━━━━━━━━━━━━
🔮 Caídas del anterior — MONO (13):
   ✅ El preseleccionado LAPA (31) SÍ está entre las caídas
▫️ 31 LAPA   · 4 sorteos / 1 día sin salir · jugado $120 · premio $3.600 · util −12% · 🔴 ALTO
▫️ 08 RATÓN  · 9 sorteos / 2 días sin salir · jugado $15  · premio $450   · util 88%  · 🟢 BAJO
...
```

Si `getCaidasForDraw` devuelve `null`, el bloque se omite (mensaje idéntico al actual). `formatPrewinnerMessage` recibe el objeto de caídas como parámetro adicional opcional; el dato se calcula en `prewinner-selection.service.js` junto al resto y se pasa a `notifyPrewinnerSelected`.

### 3.4 Monitor (`frontend/app/admin/monitor/page.js`)

**Sin panel aparte**: se resaltan las filas de la **tabla de números existente** que son caída del ganador del sorteo anterior, alimentado por `GET /api/monitor/draws/:id/caidas`. Aplica a **ambas vistas** del monitor: móvil (lista de tarjetas `md:hidden`) y desktop (`<ResponsiveTable>`, `hidden md:block`). La leyenda se pinta una sola vez en el contenedor común (sobre las dos vistas).

- **Leyenda/encabezado mínimo** sobre la tabla: `🔮 Caídas de <ANIMAL ANTERIOR (nº)> — marcadas abajo`. Da contexto al ícono. Si la respuesta es `null` (sin sorteo previo del día / juego sin tabla), no se muestra leyenda ni marcas.
- **Marca por fila**: ícono 🔮 + punto de riesgo (🔴/🟡/🟢) en las filas cuyos números están en el set de caídas. La columna de "jugado" ya existe en la tabla.
- **Tooltip / fila expandida** de una caída: `reason` (criterio) · `sorteosSinSalir`/`diasSinSalir` · `premioPotencial` · `utilidadSobreVenta` · `riesgo`. Reutiliza `formatCurrency` y los badges de riesgo existentes.
- El ganador/preseleccionado del sorteo actual, si coincide con una caída, lleva además su marca de ganador habitual + 🔮.

El endpoint y el contrato de `caida.service.js` son idénticos a Telegram; solo cambia el render (set de números → marca de fila, en vez de un panel).

---

## 4. Bordes

- **Sin sorteo previo del día** (primer sorteo): bloque Telegram omitido / monitor sin leyenda ni marcas 🔮.
- **Triple/Terminal Pantera**: `hasCaidas` → false; service devuelve `null`; nada se rompe.
- **Animal previo sin ventas en sus caídas en el sorteo actual**: `ventaActual=0`, `premio=0`, `util=100%`, `riesgo=BAJO`.
- **No tocar producción**: todo local; sin push hasta autorización.

## 5. Pruebas (Jest, local)

- `data/__tests__/caidas.test.js`: reciprocidad 100% en ambos juegos; espejos presentes; grado dentro de rango; animalito no referencia 37-48.
- `services/__tests__/caida.service.test.js`: con fixtures — resuelve ganador previo del día; caídas correctas; `sorteosSinSalir`/`diasSinSalir`; umbrales de riesgo; `preselectedEnCaidas`; `null` cuando no hay previo o juego sin tabla.

---

## 6. Tabla de caídas — LOTTOPANTERA (0-48)

> Recíproca 100%, grado 5-7. `(criterio dominante por arista en el código)`

| Nº | Animal | Caídas |
|----|--------|--------|
| 0 | DELFÍN | 33 PESCADO · 43 TORTUGA · 46 TIBURÓN · 47 CANGREJO · 00 BALLENA |
| 00 | BALLENA | 0 DELFÍN · 33 PESCADO · 43 TORTUGA · 46 TIBURÓN · 47 CANGREJO |
| 01 | CARNERO | 10 TIGRE · 18 BURRO · 19 CHIVO · 20 COCHINO · 26 VACA · 02 TORO |
| 02 | TORO | 12 CABALLO · 18 BURRO · 20 COCHINO · 26 VACA · 01 CARNERO |
| 03 | CIEMPIÉS | 24 IGUANA · 30 CAIMÁN · 36 CULEBRA · 39 ARAÑA · 04 ALACRÁN |
| 04 | ALACRÁN | 24 IGUANA · 36 CULEBRA · 39 ARAÑA · 40 PANTERA · 03 CIEMPIÉS |
| 05 | LEÓN | 10 TIGRE · 11 GATO · 23 CEBRA · 34 VENADO · 40 PANTERA |
| 06 | RANA | 24 IGUANA · 30 CAIMÁN · 33 PESCADO · 36 CULEBRA · 45 PATO |
| 07 | PERICO | 17 PAVO · 21 GALLO · 38 TURPIAL · 42 GUACAMAYA · 48 TUCÁN · 09 ÁGUILA |
| 08 | RATÓN | 11 GATO · 27 PERRO · 32 ARDILLA · 36 CULEBRA · 37 CHIGÜIRE · 41 CONEJO · 44 BÚHO |
| 09 | ÁGUILA | 14 PALOMA · 28 ZAMURO · 42 GUACAMAYA · 44 BÚHO · 48 TUCÁN · 07 PERICO |
| 10 | TIGRE | 11 GATO · 23 CEBRA · 34 VENADO · 40 PANTERA · 01 CARNERO · 05 LEÓN |
| 11 | GATO | 10 TIGRE · 14 PALOMA · 27 PERRO · 40 PANTERA · 05 LEÓN · 08 RATÓN |
| 12 | CABALLO | 18 BURRO · 21 GALLO · 23 CEBRA · 26 VACA · 02 TORO |
| 13 | MONO | 16 OSO · 29 ELEFANTE · 31 LAPA · 32 ARDILLA · 35 JIRAFA |
| 14 | PALOMA | 11 GATO · 25 GALLINA · 28 ZAMURO · 38 TURPIAL · 41 CONEJO · 09 ÁGUILA |
| 15 | ZORRO | 21 GALLO · 25 GALLINA · 27 PERRO · 41 CONEJO · 45 PATO |
| 16 | OSO | 13 MONO · 19 CHIVO · 29 ELEFANTE · 31 LAPA · 33 PESCADO |
| 17 | PAVO | 25 GALLINA · 28 ZAMURO · 42 GUACAMAYA · 48 TUCÁN · 07 PERICO |
| 18 | BURRO | 12 CABALLO · 22 CAMELLO · 26 VACA · 01 CARNERO · 02 TORO |
| 19 | CHIVO | 16 OSO · 22 CAMELLO · 26 VACA · 34 VENADO · 01 CARNERO |
| 20 | COCHINO | 22 CAMELLO · 26 VACA · 37 CHIGÜIRE · 01 CARNERO · 02 TORO |
| 21 | GALLO | 12 CABALLO · 15 ZORRO · 25 GALLINA · 45 PATO · 07 PERICO |
| 22 | CAMELLO | 18 BURRO · 19 CHIVO · 20 COCHINO · 23 CEBRA · 29 ELEFANTE · 35 JIRAFA |
| 23 | CEBRA | 10 TIGRE · 12 CABALLO · 22 CAMELLO · 29 ELEFANTE · 32 ARDILLA · 35 JIRAFA · 05 LEÓN |
| 24 | IGUANA | 30 CAIMÁN · 36 CULEBRA · 42 GUACAMAYA · 43 TORTUGA · 03 CIEMPIÉS · 04 ALACRÁN · 06 RANA |
| 25 | GALLINA | 14 PALOMA · 15 ZORRO · 17 PAVO · 21 GALLO · 27 PERRO · 45 PATO |
| 26 | VACA | 12 CABALLO · 18 BURRO · 19 CHIVO · 20 COCHINO · 01 CARNERO · 02 TORO |
| 27 | PERRO | 11 GATO · 15 ZORRO · 25 GALLINA · 41 CONEJO · 08 RATÓN |
| 28 | ZAMURO | 14 PALOMA · 17 PAVO · 38 TURPIAL · 44 BÚHO · 09 ÁGUILA |
| 29 | ELEFANTE | 13 MONO · 16 OSO · 22 CAMELLO · 23 CEBRA · 35 JIRAFA |
| 30 | CAIMÁN | 24 IGUANA · 36 CULEBRA · 37 CHIGÜIRE · 43 TORTUGA · 46 TIBURÓN · 03 CIEMPIÉS · 06 RANA |
| 31 | LAPA | 13 MONO · 16 OSO · 34 VENADO · 37 CHIGÜIRE · 41 CONEJO |
| 32 | ARDILLA | 13 MONO · 23 CEBRA · 37 CHIGÜIRE · 39 ARAÑA · 41 CONEJO · 08 RATÓN |
| 33 | PESCADO | 0 DELFÍN · 16 OSO · 45 PATO · 46 TIBURÓN · 47 CANGREJO · 00 BALLENA · 06 RANA |
| 34 | VENADO | 10 TIGRE · 19 CHIVO · 31 LAPA · 35 JIRAFA · 40 PANTERA · 43 TORTUGA · 05 LEÓN |
| 35 | JIRAFA | 13 MONO · 22 CAMELLO · 23 CEBRA · 29 ELEFANTE · 34 VENADO |
| 36 | CULEBRA | 24 IGUANA · 30 CAIMÁN · 39 ARAÑA · 03 CIEMPIÉS · 04 ALACRÁN · 06 RANA · 08 RATÓN |
| 37 | CHIGÜIRE | 20 COCHINO · 30 CAIMÁN · 31 LAPA · 32 ARDILLA · 41 CONEJO · 08 RATÓN |
| 38 | TURPIAL | 14 PALOMA · 28 ZAMURO · 42 GUACAMAYA · 48 TUCÁN · 07 PERICO |
| 39 | ARAÑA | 32 ARDILLA · 36 CULEBRA · 44 BÚHO · 03 CIEMPIÉS · 04 ALACRÁN |
| 40 | PANTERA | 10 TIGRE · 11 GATO · 34 VENADO · 04 ALACRÁN · 05 LEÓN |
| 41 | CONEJO | 14 PALOMA · 15 ZORRO · 27 PERRO · 31 LAPA · 32 ARDILLA · 37 CHIGÜIRE · 08 RATÓN |
| 42 | GUACAMAYA | 17 PAVO · 24 IGUANA · 38 TURPIAL · 48 TUCÁN · 07 PERICO · 09 ÁGUILA |
| 43 | TORTUGA | 0 DELFÍN · 24 IGUANA · 30 CAIMÁN · 34 VENADO · 47 CANGREJO · 00 BALLENA |
| 44 | BÚHO | 28 ZAMURO · 39 ARAÑA · 48 TUCÁN · 08 RATÓN · 09 ÁGUILA |
| 45 | PATO | 15 ZORRO · 21 GALLO · 25 GALLINA · 33 PESCADO · 48 TUCÁN · 06 RANA |
| 46 | TIBURÓN | 0 DELFÍN · 30 CAIMÁN · 33 PESCADO · 47 CANGREJO · 00 BALLENA |
| 47 | CANGREJO | 0 DELFÍN · 33 PESCADO · 43 TORTUGA · 46 TIBURÓN · 00 BALLENA |
| 48 | TUCÁN | 17 PAVO · 38 TURPIAL · 42 GUACAMAYA · 44 BÚHO · 45 PATO · 07 PERICO · 09 ÁGUILA |

## 7. Tabla de caídas — LOTOANIMALITO (0-36)

> Base 0-36 filtrada + suplementos. Recíproca 100%, grado 4-7.

| Nº | Animal | Caídas |
|----|--------|--------|
| 0 | DELFÍN | 24 IGUANA · 30 CAIMÁN · 33 PESCADO · 00 BALLENA · 06 RANA |
| 00 | BALLENA | 0 DELFÍN · 30 CAIMÁN · 33 PESCADO · 06 RANA |
| 01 | CARNERO | 10 TIGRE · 18 BURRO · 19 CHIVO · 20 COCHINO · 26 VACA · 02 TORO |
| 02 | TORO | 12 CABALLO · 18 BURRO · 20 COCHINO · 26 VACA · 01 CARNERO |
| 03 | CIEMPIÉS | 24 IGUANA · 30 CAIMÁN · 36 CULEBRA · 04 ALACRÁN |
| 04 | ALACRÁN | 24 IGUANA · 30 CAIMÁN · 36 CULEBRA · 03 CIEMPIÉS |
| 05 | LEÓN | 10 TIGRE · 11 GATO · 23 CEBRA · 34 VENADO |
| 06 | RANA | 0 DELFÍN · 24 IGUANA · 30 CAIMÁN · 33 PESCADO · 36 CULEBRA · 00 BALLENA |
| 07 | PERICO | 14 PALOMA · 17 PAVO · 21 GALLO · 09 ÁGUILA |
| 08 | RATÓN | 11 GATO · 15 ZORRO · 27 PERRO · 31 LAPA · 32 ARDILLA · 36 CULEBRA |
| 09 | ÁGUILA | 14 PALOMA · 21 GALLO · 25 GALLINA · 28 ZAMURO · 07 PERICO |
| 10 | TIGRE | 11 GATO · 23 CEBRA · 34 VENADO · 01 CARNERO · 05 LEÓN |
| 11 | GATO | 10 TIGRE · 14 PALOMA · 27 PERRO · 05 LEÓN · 08 RATÓN |
| 12 | CABALLO | 18 BURRO · 21 GALLO · 23 CEBRA · 26 VACA · 02 TORO |
| 13 | MONO | 16 OSO · 29 ELEFANTE · 31 LAPA · 32 ARDILLA · 35 JIRAFA |
| 14 | PALOMA | 11 GATO · 25 GALLINA · 28 ZAMURO · 07 PERICO · 09 ÁGUILA |
| 15 | ZORRO | 17 PAVO · 21 GALLO · 25 GALLINA · 27 PERRO · 08 RATÓN |
| 16 | OSO | 13 MONO · 19 CHIVO · 29 ELEFANTE · 31 LAPA · 32 ARDILLA · 33 PESCADO |
| 17 | PAVO | 15 ZORRO · 21 GALLO · 25 GALLINA · 28 ZAMURO · 07 PERICO |
| 18 | BURRO | 12 CABALLO · 22 CAMELLO · 26 VACA · 01 CARNERO · 02 TORO |
| 19 | CHIVO | 16 OSO · 22 CAMELLO · 26 VACA · 34 VENADO · 01 CARNERO |
| 20 | COCHINO | 22 CAMELLO · 26 VACA · 01 CARNERO · 02 TORO |
| 21 | GALLO | 12 CABALLO · 15 ZORRO · 17 PAVO · 25 GALLINA · 28 ZAMURO · 07 PERICO · 09 ÁGUILA |
| 22 | CAMELLO | 18 BURRO · 19 CHIVO · 20 COCHINO · 23 CEBRA · 29 ELEFANTE · 35 JIRAFA |
| 23 | CEBRA | 10 TIGRE · 12 CABALLO · 22 CAMELLO · 29 ELEFANTE · 32 ARDILLA · 35 JIRAFA · 05 LEÓN |
| 24 | IGUANA | 0 DELFÍN · 30 CAIMÁN · 36 CULEBRA · 03 CIEMPIÉS · 04 ALACRÁN · 06 RANA |
| 25 | GALLINA | 14 PALOMA · 15 ZORRO · 17 PAVO · 21 GALLO · 27 PERRO · 28 ZAMURO · 09 ÁGUILA |
| 26 | VACA | 12 CABALLO · 18 BURRO · 19 CHIVO · 20 COCHINO · 01 CARNERO · 02 TORO |
| 27 | PERRO | 11 GATO · 15 ZORRO · 25 GALLINA · 08 RATÓN |
| 28 | ZAMURO | 14 PALOMA · 17 PAVO · 21 GALLO · 25 GALLINA · 09 ÁGUILA |
| 29 | ELEFANTE | 13 MONO · 16 OSO · 22 CAMELLO · 23 CEBRA · 35 JIRAFA |
| 30 | CAIMÁN | 0 DELFÍN · 24 IGUANA · 36 CULEBRA · 00 BALLENA · 03 CIEMPIÉS · 04 ALACRÁN · 06 RANA |
| 31 | LAPA | 13 MONO · 16 OSO · 32 ARDILLA · 34 VENADO · 08 RATÓN |
| 32 | ARDILLA | 13 MONO · 16 OSO · 23 CEBRA · 31 LAPA · 08 RATÓN |
| 33 | PESCADO | 0 DELFÍN · 16 OSO · 00 BALLENA · 06 RANA |
| 34 | VENADO | 10 TIGRE · 19 CHIVO · 31 LAPA · 35 JIRAFA · 05 LEÓN |
| 35 | JIRAFA | 13 MONO · 22 CAMELLO · 23 CEBRA · 29 ELEFANTE · 34 VENADO |
| 36 | CULEBRA | 24 IGUANA · 30 CAIMÁN · 03 CIEMPIÉS · 04 ALACRÁN · 06 RANA · 08 RATÓN |

---

## 8. Fuera de alcance

- Tabla editable desde admin (se eligió módulo estático).
- Bandera "REPITE" del folklore (el mismo número repite) — no incluida en v1; se puede añadir como flag por animal si se pide.
- Predicción estadística real (esto es folklore curado, no un modelo).
- Cualquier deploy a producción hasta autorización explícita.
