# Guía de Generación de Imágenes por Juego

Documento complementario a IMAGE_GENERATION.md con especificaciones detalladas de cada juego.

---

## JUEGO: RULETA

### Números y Colores
- **ROJOS**: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36
- **NEGROS**: 2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35
- **VERDES**: 0, 00

### Fondos según Color
- `fondo_rojo.png` - Para números rojos
- `fondo_negro.png` - Para números negros
- `fondo_verde.png` - Para 0 y 00

### Capas Especiales por Fecha
- **Diciembre completo**: `capa_navidad.png`
- **25-31 Octubre**: `capa_halloween.png`
- **Semana Santa** (calculada): `capa_semanasanta.png`
- **Carnaval** (calculado): `capa_carnaval.png`
- **Efemérides** (01-01, 07-05, 24-12, 31-12): `capa_efemerides.png`

### Texto
- **Fecha**: (910, 110) - DD/MM/YY - Panda 40px - Negro
- **Hora**: (930, 235) - hh A - Panda 45px - Negro

### Orden de Capas
1. Fondo (color)
2. Capa especial (si aplica)
3. Número (`{numero}.png`)
4. Capa final
5. Texto SVG

### Recursos
```
storage/bases/ruleta/
├── fondo_rojo.png
├── fondo_negro.png
├── fondo_verde.png
├── 0.png ... 36.png, 00.png
├── capa_navidad.png
├── capa_halloween.png
├── capa_semanasanta.png
├── capa_carnaval.png
├── capa_efemerides.png
└── final.png
```

---

## JUEGO: ANIMALITOS

### A) Sorteos Regulares

#### Números
- 00 al 36 (cada uno es un animal)

#### Composición
1. `base.png` (fondo)
2. `{numero}.png` (animal, con cero inicial: 05.png, 23.png)
3. Texto SVG

#### Texto
- **Fecha**: (93, 110) - DD/MM/YY - Alphakind 40px
- **Hora**: (155, 213) - hh A - Alphakind 40px

### B) Pirámide Numerológica

#### Concepto
Pirámide de sumas de dígitos basada en la fecha (DDMMYYYY).

#### Ejemplo para 01102025:
```
0 1 1 0 2 0 2 5
 1 2 1 2 2 2 7
  3 3 3 4 4 9
   6 6 7 8 4
    3 4 6 3
     7 1 9
      8 1
       9
```

#### Base según Día
- `piramide1.png` (Lunes)
- `piramide2.png` (Martes)
- ... hasta `piramide7.png` (Domingo)

#### Números de Pirámide
- Posición X: Entre 210 y 870
- Posición Y: Entre 275 y 970
- Fuente: Alphakind 45px bold
- Centrados por fila

#### Números Más Repetidos (4 animales mini)
Posiciones de imágenes mini (300x300px):
1. (-25, 400)
2. (790, 400)
3. (50, 710)
4. (700, 680)

Usa: `min/{numero}.png`

#### Fecha
- (615, 105) - DD/MM/YY - Alphakind 40px bold

### C) Resumen Diario

#### Concepto
Todos los resultados del día en una imagen.

#### Base
- `resumen_base.png`

#### Posiciones por Hora
```
08 AM: (200, 200)    02 PM: (600, 200)
09 AM: (200, 300)    03 PM: (600, 300)
10 AM: (200, 400)    04 PM: (600, 400)
11 AM: (200, 500)    05 PM: (600, 500)
12 PM: (200, 600)    06 PM: (600, 600)
01 PM: (200, 700)    07 PM: (600, 700)
```

#### Texto
- **Números**: Alphakind 30px - Con cero inicial
- **Fecha**: (200, 110) - DD/MM/YY - Alphakind 35px

### Recursos
```
storage/bases/animalitos/
├── base.png
├── 00.png ... 36.png (animales)
├── piramide1.png ... piramide7.png
├── min/
│   └── 00.png ... 36.png (mini)
└── resumen_base.png
```

---

## JUEGO: TRIPLE

### A) Sorteos Regulares

#### Números
- 000 a 999 (mil opciones)

#### Fondos
- **Números X00** (excepto 000): `fondo1.png` (especial)
- **Otros**: `fondo.png` (normal)

#### Composición de Número

**Caso X00 (excepto 000)**:
- Una imagen: `{primer_digito}.png`
- Ejemplo: 300 → `3.png`, 700 → `7.png`

**Caso Normal**:
- Tres imágenes separadas:
  - `{d1}.A.png` (centenas)
  - `{d2}.B.png` (decenas)
  - `{d3}.C.png` (unidades)
- Ejemplo: 347 → `3.A.png`, `4.B.png`, `7.C.png`

#### Fecha (con imágenes)
- Día: `{DD}.png` (01.png ... 31.png)
- Mes: `{MES}.png` (ENE.png, FEB.png, MAR.png, ABR.png, MAY.png, JUN.png, JUL.png, AGO.png, SEP.png, OCT.png, NOV.png, DIC.png)

#### Hora (con imágenes)
- Hora: `{h}.png` (1.png ... 12.png)
- Horas 10, 11, 12: Buscar `{h}_1.png` primero, si no existe usar `{h}.png`
- AM/PM: `am.png` o `pm.png`

### B) Recomendaciones

#### Concepto
5 números recomendados basados en análisis de últimos 50 sorteos.

#### Algoritmo
1. Analizar frecuencia de dígitos por posición (centenas, decenas, unidades)
2. Asignar pesos: 1/(índice+1)
3. Selección aleatoria ponderada

#### Números Generados
1. **PERMUTA** (centro): Combinación principal
2. **FAVORITO 1**: Segunda mejor
3. **FAVORITO 2**: Tercera mejor
4. **EXPLOSIVO 1**: Variante
5. **EXPLOSIVO 2**: Alternativa

#### Base
- `recomendaciones/base.png`

#### Composición Visual

**Fecha** (superior):
- (centro, 250) - DD/MM/YY - Alphakind 50px bold - Blanco

**Permuta** (centro):
- Usa imágenes: `{d1}.A.png`, `{d2}.B.png`, `{d3}.C.png`
- Posición: (0, 0) - Pre-posicionadas

**Favoritos** (inferior izquierda):
- Texto negro - Alphakind 65px bold
- Favorito 1: (140, 785)
- Favorito 2: (375, 785)
- Formato: 025, 789, etc.

**Explosivos** (inferior derecha):
- Texto rojo (#FF0000) - Alphakind 65px bold
- Explosivo 1: (650, 915)
- Explosivo 2: (910, 915)
- Formato: 025, 789, etc.

### Recursos
```
storage/bases/triple/
├── numeros/
│   ├── fondo.png
│   ├── fondo1.png
│   ├── 0.A.png ... 9.A.png
│   ├── 0.B.png ... 9.B.png
│   ├── 0.C.png ... 9.C.png
│   └── 1.png ... 9.png (para X00)
├── fechas/
│   ├── 01.png ... 31.png (días)
│   ├── ENE.png ... DIC.png (meses)
│   ├── 1.png ... 12.png (horas)
│   ├── 10_1.png, 11_1.png, 12_1.png
│   ├── am.png
│   └── pm.png
└── recomendaciones/
    ├── base.png
    ├── 0.A.png ... 9.A.png
    ├── 0.B.png ... 9.B.png
    └── 0.C.png ... 9.C.png
```

---

## Fuentes Tipográficas

### Panda (Ruleta)
- Archivo: `storage/fonts/panda.otf.ttf`
- Uso: Fecha y hora en Ruleta
- Tamaños: 40px, 45px

### Alphakind (Animalitos y Triple)
- Archivo: `storage/fonts/Alphakind.otf.ttf`
- Uso: Todo texto en Animalitos y Triple
- Tamaños: 30px, 35px, 40px, 45px, 50px, 65px

---

## Formatos de Archivo de Salida

```
ruleta_YYYYMMDD_HHMM.png
animalitos_YYYYMMDD_HHMM.png
animalitos_pyramid_YYYYMMDD.png
animalitos_summary_YYYYMMDD.png
triple_YYYYMMDD_HHMM.png
triple_recommendations_YYYYMMDD.png
```

Ejemplo: `ruleta_20251001_1500.png`

---

## Checklist de Recursos por Juego

### Ruleta
- [ ] 3 fondos (rojo, negro, verde)
- [ ] 38 números (0-36 + 00)
- [ ] 5 capas especiales
- [ ] 1 capa final
- [ ] 1 fuente Panda

### Animalitos
- [ ] 1 base sorteos
- [ ] 37 animales (00-36)
- [ ] 7 bases pirámide
- [ ] 37 animales mini
- [ ] 1 base resumen
- [ ] 1 fuente Alphakind

### Triple
- [ ] 2 fondos
- [ ] 30 dígitos (0-9 x A,B,C)
- [ ] 9 números especiales (1-9)
- [ ] 31 días
- [ ] 12 meses
- [ ] 15 horas (1-12 + 3 especiales)
- [ ] 2 AM/PM
- [ ] 1 base recomendaciones
- [ ] 30 dígitos recomendaciones
- [ ] 1 fuente Alphakind

---

## Notas Técnicas

### Composición con Sharp
```javascript
await sharp(baseImage)
  .composite([
    { input: layer1, top: 0, left: 0 },
    { input: textSVG, top: 0, left: 0 }
  ])
  .toFile(output);
```

### Texto SVG
```javascript
Buffer.from(`
  <svg width="${w}" height="${h}">
    <style>
      @font-face {
        font-family: '${font}';
        src: url('${path}');
      }
    </style>
    <text x="${x}" y="${y}" 
      font-family="${font}" 
      font-size="${size}" 
      fill="${color}">
      ${text}
    </text>
  </svg>
`)
```

### Cálculo de Semana Santa
- Usa algoritmo de Meeus/Jones/Butcher
- Desde Domingo de Ramos hasta Domingo de Pascua

### Cálculo de Carnaval
- 47 días antes de Pascua
- Duración de 5 días
