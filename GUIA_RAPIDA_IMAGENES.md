# 🎨 Guía Rápida - Sistema de Imágenes

## Para Administradores

### Ver/Generar Imagen de un Sorteo

1. **Acceder al Dashboard Admin**
   - Ir a `/admin/sorteos`

2. **Seleccionar un Sorteo**
   - Click en cualquier sorteo que tenga resultado

3. **En el Modal de Detalles:**
   
   **Si NO hay imagen:**
   - Verás el mensaje "La imagen aún no ha sido generada"
   - Click en botón verde "Generar Imagen"
   - Espera unos segundos
   - La imagen aparecerá automáticamente
   
   **Si YA hay imagen:**
   - La imagen se muestra automáticamente
   - Click en botón azul "Regenerar" para recrearla
   - Útil si cambias el resultado o necesitas actualizar

## Para Desarrolladores

### Generar Imagen Programáticamente

```javascript
import { generateDrawImage } from './services/imageService.js';

// Generar imagen para un sorteo
const result = await generateDrawImage(drawId);
console.log('Imagen generada:', result.filename);
```

### Verificar si Existe Imagen

```javascript
import { checkDrawImage } from './services/imageService.js';

const check = await checkDrawImage(drawId);
if (check.exists) {
  console.log('Imagen existe en:', check.url);
}
```

### Generar Imágenes de un Día Completo

```javascript
import { generateDailyImages } from './services/imageService.js';

const date = new Date('2025-10-02');
const result = await generateDailyImages(date);
console.log(`Generadas: ${result.successful}/${result.total}`);
```

## Estructura de Carpetas

```
backend/storage/
├── bases/          # ⚠️ NO MODIFICAR - Imágenes base
│   ├── 1/         # Animalitos/Ruleta
│   ├── 2/         # Pantera
│   └── 3/         # Triple Pantera
├── fonts/         # ⚠️ NO MODIFICAR - Fuentes
└── results/       # ✅ Imágenes generadas (puedes borrar)
```

## Comandos Útiles

```bash
# Probar generación de imágenes
cd backend
npm run test:images

# Ver imágenes generadas
ls -lh backend/storage/results/

# Limpiar imágenes antiguas (opcional)
rm backend/storage/results/*.png
```

## Solución de Problemas

### "Draw has no result yet"
- El sorteo no tiene resultado asignado
- Asegúrate que el sorteo esté en estado DRAWN o PUBLISHED

### "Input file is missing"
- Falta una imagen base
- Verifica que existan los archivos en `/backend/storage/bases/`

### "Image not found" al servir
- La imagen fue borrada del disco
- Regenera la imagen desde el admin

### La imagen no se muestra en el frontend
- Verifica que el backend esté corriendo
- Revisa la consola del navegador para errores
- Asegúrate que `NEXT_PUBLIC_API_URL` esté configurado

## Tips

✅ **Genera imágenes después de publicar resultados**
- Las imágenes se pueden usar en Telegram, WhatsApp, etc.

✅ **Regenera si cambias un resultado**
- El sistema no regenera automáticamente (por ahora)

✅ **Las imágenes son grandes (1-2 MB)**
- Considera optimización si tienes muchos sorteos

✅ **Nombres de archivo son únicos por fecha/hora**
- Puedes tener múltiples versiones del mismo sorteo

## Próximamente

🔜 Auto-generación al publicar resultado
🔜 Envío automático a canales
🔜 Compresión de imágenes
🔜 Pirámide numerológica
🔜 Resumen diario
