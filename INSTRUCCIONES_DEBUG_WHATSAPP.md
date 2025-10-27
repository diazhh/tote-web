# 🔍 Instrucciones para Debug de WhatsApp

## Sistema de Logging Implementado

He configurado un sistema de logging detallado específico para WhatsApp que registra **TODO** lo que sucede durante el proceso de conexión.

## 📁 Ubicación del Log

El archivo de log está en:
```
/home/diazhh/tote/backend/logs/whatsapp.log
```

## 🚀 Cómo Hacer las Pruebas

### Opción 1: Ver el Log en Tiempo Real (Recomendado)

Abre una terminal y ejecuta:

```bash
cd /home/diazhh/tote/backend
./watch-whatsapp-log.sh
```

Esto mostrará el log en tiempo real con colores:
- 🔴 **Rojo**: Errores
- 🟡 **Amarillo**: Advertencias  
- 🟢 **Verde**: Info
- 🔵 **Cyan**: Debug

Deja esta terminal abierta y en otra terminal/navegador haz las pruebas.

### Opción 2: Ver el Log Después

Si prefieres hacer las pruebas primero y luego ver el log:

```bash
cd /home/diazhh/tote/backend

# Ver todo el log
cat logs/whatsapp.log

# Ver solo las últimas líneas
tail -100 logs/whatsapp.log

# Buscar algo específico
grep "CONECTADO" logs/whatsapp.log
```

## 📝 Pasos para la Prueba

1. **Limpiar sesiones anteriores** (opcional):
   ```bash
   cd /home/diazhh/tote/backend
   node src/scripts/clean-whatsapp-sessions.js
   ```

2. **Verificar que el backend esté corriendo**:
   ```bash
   curl http://localhost:3001/health
   ```
   Deberías ver: `{"status":"ok",...}`

3. **Abrir el monitor de logs** (en una terminal separada):
   ```bash
   cd /home/diazhh/tote/backend
   ./watch-whatsapp-log.sh
   ```

4. **Ir a la aplicación web**:
   - Abre el navegador
   - Ve a: `http://localhost:3000/admin/whatsapp`
   - Haz login si es necesario

5. **Crear nueva instancia**:
   - Clic en "Nueva Instancia"
   - Nombre: `Test WhatsApp`
   - ID: `test-wa-1`
   - Clic en "Crear"

6. **Escanear el QR**:
   - Se debe generar un QR
   - Abre WhatsApp en tu teléfono
   - Ve a: Menú → Dispositivos vinculados → Vincular dispositivo
   - Escanea el QR

7. **Observar el log**:
   - En la terminal con el monitor deberías ver mensajes como:
     - `✅ QR generado para instancia test-wa-1`
     - `[test-wa-1] Connection update: { connection: 'open' }`
     - `✅✅✅ WhatsApp CONECTADO para test-wa-1: 584121234567`
     - `[SERVICE] onConnectionUpdate callback ejecutado`
     - `[SERVICE] ✅ BD actualizada para test-wa-1`

## 🔍 Qué Buscar en el Log

### Si TODO funciona bien, verás:

```json
{"level":"info","message":"✅ QR generado para instancia test-wa-1",...}
{"level":"info","message":"[test-wa-1] Connection update:","connection":"open",...}
{"level":"info","message":"✅✅✅ WhatsApp CONECTADO para test-wa-1: 584121234567",...}
{"level":"info","message":"[test-wa-1] Callback de conexión EXISTE ✅",...}
{"level":"info","message":"[SERVICE] onConnectionUpdate callback ejecutado",...}
{"level":"info","message":"[SERVICE] ✅ BD actualizada para test-wa-1",...}
```

### Si hay un problema, verás:

```json
{"level":"warn","message":"[test-wa-1] ⚠️ No hay callback de conexión registrado",...}
```
o
```json
{"level":"error","message":"[SERVICE] Error al actualizar BD...",...}
```

## 📊 Información que se Registra

El log incluye:
- ✅ Cada actualización de conexión con detalles completos
- ✅ Generación de QR
- ✅ Escaneo exitoso del QR
- ✅ Conexión establecida
- ✅ Número de teléfono conectado
- ✅ Si los callbacks existen y se ejecutan
- ✅ Actualizaciones a la base de datos
- ✅ Cualquier error con stack trace completo

## 🐛 Después de las Pruebas

Una vez que hayas hecho las pruebas:

1. **Detén el monitor** (Ctrl+C en la terminal del monitor)

2. **Copia el log completo**:
   ```bash
   cat /home/diazhh/tote/backend/logs/whatsapp.log
   ```

3. **Compártelo conmigo** para que pueda analizarlo

## 🔧 Comandos Útiles

```bash
# Ver si el backend está corriendo
ps aux | grep node | grep backend

# Reiniciar el backend
cd /home/diazhh/tote/backend
pkill -f "node.*backend"
npm run dev

# Limpiar log y empezar de nuevo
rm logs/whatsapp.log
touch logs/whatsapp.log

# Ver estado en la base de datos
cd /home/diazhh/tote/backend
npx prisma studio
# Luego ve a la tabla WhatsAppInstance
```

## 📌 Notas Importantes

- El log se guarda automáticamente, no necesitas hacer nada especial
- El archivo de log tiene un máximo de 10MB y mantiene 5 archivos de respaldo
- Los logs también aparecen en la consola del backend con colores
- Cada evento tiene timestamp con milisegundos para precisión

## ❓ Si Algo Sale Mal

Si el backend no inicia o hay errores:

```bash
# Ver errores del backend
cd /home/diazhh/tote/backend
cat logs/error.log

# Ver log combinado
cat logs/combined.log | tail -50
```

---

**¡Listo!** Ahora puedes hacer las pruebas y tendremos un log detallado de todo lo que sucede. 🚀
