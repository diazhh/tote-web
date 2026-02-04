# Fix: Número 0 (DELFÍN) vs 00 (BALLENA)

## Problema Identificado

Cuando salía el número **0** (DELFÍN) en LotoAnimalito o LottoPantera, el sistema lo mostraba incorrectamente como **00** (BALLENA) en el texto de publicación, aunque la imagen mostraba correctamente el DELFÍN.

## Causa Raíz

El problema estaba en el uso de `.padStart(2, '0')` para formatear números antes de buscar el `GameItem` en la base de datos:

```javascript
// ❌ INCORRECTO - Convierte '0' en '00'
const numero = '0';
const paddedNumber = numero.padStart(2, '0'); // Resultado: '00'
```

Esto causaba que cuando el resultado era `0`, se buscara el GameItem con número `'00'` (BALLENA) en lugar de `'0'` (DELFÍN).

## Estructura de la Base de Datos

La base de datos tiene **dos entradas separadas** para cada juego:

### LotoAnimalito
- `'0'` = DELFÍN (número 37 en la lista)
- `'00'` = BALLENA (número 0 en la lista)

### LottoPantera  
- `'0'` = DELFIN
- `'00'` = BALLENA

## Archivos Modificados

### 1. `/backend/src/services/api-integration.service.js`

**Línea 324-325:** Sincronización de tickets
```javascript
// Special case: '0' should stay '0', not become '00' (0=DELFIN, 00=BALLENA)
const paddedNumber = numero === '0' ? '0' : numero.padStart(2, '0');
```

**Línea 453-454:** Sincronización de ganadores
```javascript
// Special case: '0' should stay '0', not become '00' (0=DELFIN, 00=BALLENA)
const winnerNumber = match[1] === '0' ? '0' : match[1].padStart(2, '0');
```

### 2. `/backend/src/services/srq.service.js`

**Línea 495-501:** Método `extractWinnerNumber`
```javascript
extractWinnerNumber(ganador) {
  if (!ganador) return null;
  const match = ganador.match(/^(\d+)/);
  if (!match) return null;
  // Special case: '0' should stay '0', not become '00' (0=DELFIN, 00=BALLENA)
  return match[1] === '0' ? '0' : match[1].padStart(2, '0');
}
```

### 3. `/backend/src/services/srq-tripleta.service.js`

**Línea 257-261:** Parseo de números de tripleta
```javascript
// Special case: '0' should stay '0', not become '00' (0=DELFIN, 00=BALLENA)
const numbers = ticket.numerosTexto.split(',').map(num => {
  const trimmed = num.trim();
  return trimmed === '0' ? '0' : trimmed.padStart(2, '0');
});
```

## Solución Implementada

Se agregó una validación especial antes de aplicar `padStart()`:

```javascript
// ✅ CORRECTO
const paddedNumber = numero === '0' ? '0' : numero.padStart(2, '0');
```

Esto asegura que:
- `'0'` permanece como `'0'` → busca DELFÍN
- `'1'` se convierte en `'01'` → busca CARNERO
- `'00'` permanece como `'00'` → busca BALLENA

## Impacto

- ✅ **Nuevos sorteos**: Todos los sorteos futuros con resultado 0 mostrarán correctamente DELFÍN
- ✅ **Sincronización API**: Los resultados sincronizados desde APIs externas (SRQ) ahora mapean correctamente el número 0
- ✅ **Tripletas**: Las apuestas de tripleta que incluyan el número 0 ahora se procesan correctamente
- ⚠️ **Sorteos históricos**: Los sorteos anteriores con el mapeo incorrecto permanecen en la base de datos

## Verificación

Ejecutar consulta para verificar sorteos recientes con número 0:

```sql
SELECT d.id, d."drawDate", d."drawTime", gi.number, gi.name, g.name as game_name 
FROM "Draw" d 
JOIN "GameItem" gi ON d."winnerItemId" = gi.id 
JOIN "Game" g ON d."gameId" = g.id 
WHERE gi.number IN ('0', '00') 
AND d.status IN ('DRAWN', 'PUBLISHED') 
ORDER BY d."drawDate" DESC, d."drawTime" DESC 
LIMIT 10;
```

## Fecha de Implementación

**20 de enero de 2026**

Backend reiniciado con `pm2 restart tote-backend` para aplicar los cambios.
