# Guía de Pruebas - Sistema Completo

Esta guía te ayudará a probar todas las funcionalidades implementadas del sistema.

---

## 🚀 Preparación

### 1. Iniciar Backend

```bash
cd backend
npm run dev
```

Verifica que veas:
```
✅ Database connected
✅ Server running on port 3001
✅ WebSocket server initialized
✅ Jobs scheduled successfully
```

### 2. Iniciar Frontend

```bash
cd frontend
npm run dev
```

Verifica que veas:
```
✓ Ready in 2.5s
○ Local: http://localhost:3000
```

---

## 🧪 Pruebas del Backend

### Prueba 1: Health Check

```bash
curl http://localhost:3001/health
```

**Resultado esperado**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-01T20:00:00.000Z",
  "uptime": 123.456
}
```

### Prueba 2: Obtener Juegos

```bash
curl http://localhost:3001/api/public/games
```

**Resultado esperado**: Array con 3 juegos (LOTOANIMALITO, LOTTOPANTERA, TRIPLE PANTERA)

### Prueba 3: Obtener Sorteos de Hoy

```bash
curl http://localhost:3001/api/public/draws/today
```

**Resultado esperado**: Array con los sorteos generados para hoy

### Prueba 4: Próximos Sorteos

```bash
curl http://localhost:3001/api/public/draws/next?limit=5
```

**Resultado esperado**: Array con los próximos 5 sorteos

### Prueba 5: Autenticación

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tote.com",
    "password": "admin123"
  }'
```

**Resultado esperado**: Token JWT y datos del usuario

### Prueba 6: Histórico de un Juego

```bash
curl "http://localhost:3001/api/public/draws/game/lotoanimalito/history?page=1&limit=10"
```

**Resultado esperado**: Objeto con draws y pagination

### Prueba 7: Estadísticas

```bash
curl "http://localhost:3001/api/public/stats/game/lotoanimalito?days=30"
```

**Resultado esperado**: Objeto con totalDraws, mostFrequent, leastFrequent

---

## 🌐 Pruebas del Frontend

### Prueba 1: Landing Page

1. Abre http://localhost:3000
2. Verifica que veas:
   - ✅ Header con logo y navegación
   - ✅ Countdown del próximo sorteo (si hay)
   - ✅ Sección "Resultados de Hoy"
   - ✅ Sección "Nuestros Juegos" con 3 juegos
   - ✅ Footer

### Prueba 2: Detalle de Juego

1. Haz clic en cualquier juego del grid
2. Verifica que veas:
   - ✅ Botón "Volver al inicio"
   - ✅ Header del juego con icono y descripción
   - ✅ Sección "Resultados de Hoy"
   - ✅ Sección "Estadísticas"
   - ✅ Sección "Histórico de Resultados" con tabla

### Prueba 3: Navegación

1. Desde el detalle de juego, haz clic en "Volver al inicio"
2. Verifica que regreses a la landing page
3. Navega manualmente a `/juego/lotoanimalito`
4. Verifica que cargue correctamente

### Prueba 4: Paginación del Histórico

1. En la página de detalle de juego
2. Baja hasta la tabla de histórico
3. Haz clic en el botón de siguiente página (→)
4. Verifica que cargue la página 2
5. Haz clic en el botón de página anterior (←)
6. Verifica que regrese a la página 1

### Prueba 5: Responsive Design

1. Abre las DevTools del navegador (F12)
2. Activa el modo responsive
3. Prueba diferentes tamaños:
   - 📱 Mobile (375px)
   - 📱 Tablet (768px)
   - 💻 Desktop (1920px)
4. Verifica que todo se vea bien en todos los tamaños

---

## ⚡ Pruebas de WebSocket (Tiempo Real)

### Preparación

1. Abre la consola del navegador (F12 → Console)
2. Busca el mensaje: `✅ WebSocket connected`

### Prueba 1: Cierre de Sorteo

**Escenario**: Esperar a que un sorteo se cierre (5 min antes)

1. Verifica la hora del próximo sorteo en el countdown
2. Espera hasta 5 minutos antes
3. Deberías ver:
   - 🔔 Notificación toast: "Sorteo cerrado: XX - Nombre"
   - 📝 Mensaje en consola: `🔒 Draw closed:`
   - 🔄 Actualización automática del UI

### Prueba 2: Selección de Ganador

**Escenario**: Esperar a que se ejecute un sorteo

1. Espera hasta la hora exacta del sorteo
2. Deberías ver:
   - 🔔 Notificación toast: "¡Ganador! XX - Nombre"
   - 📝 Mensaje en consola: `🏆 Winner selected:`
   - 🔄 Actualización automática del UI

### Prueba 3: Múltiples Pestañas

1. Abre la landing page en 2 pestañas diferentes
2. Espera a que ocurra un evento (cierre o sorteo)
3. Verifica que ambas pestañas se actualicen simultáneamente

---

## 🔄 Pruebas del Sistema de Jobs

### Job 1: Generación Diaria de Sorteos

**Horario**: 00:05 AM todos los días

**Prueba manual**:
```bash
# Desde el backend, ejecutar directamente
node -e "
const { generateDailyDraws } = require('./src/jobs/generate-daily-draws.job.js');
generateDailyDraws();
"
```

**Verificar**:
```bash
curl http://localhost:3001/api/public/draws/today
```

Deberías ver sorteos para hoy.

### Job 2: Cierre de Sorteos

**Horario**: Cada minuto, cierra sorteos que están a 5 min de su hora

**Verificar en logs**:
```
[CRON] Checking for draws to close...
[CRON] Closed draw: [ID] - Game: [GAME] - Time: [TIME]
```

### Job 3: Ejecución de Sorteos

**Horario**: Cada minuto, ejecuta sorteos que llegaron a su hora

**Verificar en logs**:
```
[CRON] Checking for draws to execute...
[CRON] Executed draw: [ID] - Winner: [NUMBER] - [NAME]
```

---

## 🎯 Escenarios de Prueba Completos

### Escenario 1: Flujo Completo de un Sorteo

**Objetivo**: Probar todo el ciclo de vida de un sorteo

1. **00:05 AM** - Job genera sorteos del día
2. **Verificar**: `curl http://localhost:3001/api/public/draws/today`
3. **5 min antes** - Job cierra el sorteo y preselecciona ganador
4. **Verificar**: Frontend muestra notificación y número preseleccionado
5. **Hora exacta** - Job ejecuta sorteo y confirma ganador
6. **Verificar**: Frontend muestra notificación y ganador final
7. **Verificar**: Sorteo aparece en histórico

### Escenario 2: Cambio Manual de Ganador

**Objetivo**: Cambiar el número ganador antes de que se ejecute

1. Espera a que un sorteo se cierre (5 min antes)
2. Anota el número preseleccionado
3. Usa la API para cambiar el ganador:

```bash
# Obtener token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tote.com","password":"admin123"}' \
  | jq -r '.accessToken')

# Cambiar ganador
curl -X PATCH http://localhost:3001/api/draws/[DRAW_ID]/winner \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"number":"05"}'
```

4. Verifica que el frontend se actualice con el nuevo número
5. Espera a que se ejecute el sorteo
6. Verifica que el ganador final sea el número que cambiaste

### Escenario 3: Consulta de Histórico

**Objetivo**: Verificar que el histórico funciona correctamente

1. Abre `/juego/lotoanimalito`
2. Baja hasta la tabla de histórico
3. Verifica que muestre sorteos anteriores
4. Prueba la paginación
5. Verifica que cada sorteo muestre:
   - Fecha y hora
   - Número ganador
   - Nombre del número
   - Estado (Publicado, Sorteado, etc.)

### Escenario 4: Estadísticas

**Objetivo**: Verificar cálculo de estadísticas

1. Abre `/juego/lotoanimalito`
2. Verifica la sección de estadísticas
3. Deberías ver:
   - Total de sorteos (últimos 30 días)
   - 3 números más frecuentes
   - 3 números menos frecuentes
4. Los números deben coincidir con los datos del histórico

---

## 🐛 Problemas Comunes

### Backend no inicia

**Error**: `Error: connect ECONNREFUSED`

**Solución**:
1. Verifica que PostgreSQL esté corriendo
2. Verifica las credenciales en `.env`
3. Ejecuta las migraciones: `npm run db:migrate`

### Frontend no muestra datos

**Error**: Pantalla en blanco o spinner infinito

**Solución**:
1. Abre la consola del navegador (F12)
2. Busca errores de red
3. Verifica que el backend esté corriendo
4. Verifica las variables de entorno en `.env.local`

### WebSocket no conecta

**Error**: No hay actualizaciones en tiempo real

**Solución**:
1. Verifica en consola: `✅ WebSocket connected`
2. Si no aparece, revisa que el backend tenga Socket.io
3. Verifica que el puerto 3001 esté abierto
4. Intenta refrescar la página

### No hay sorteos

**Error**: "No hay sorteos hoy"

**Solución**:
1. Ejecuta el job de generación manualmente
2. O espera hasta las 00:05 AM
3. Verifica que haya plantillas en la base de datos
4. Verifica que no haya pausas para hoy

---

## ✅ Checklist de Pruebas

### Backend
- [ ] Health check responde
- [ ] API pública retorna juegos
- [ ] API pública retorna sorteos de hoy
- [ ] API pública retorna próximos sorteos
- [ ] Autenticación funciona
- [ ] WebSocket conecta
- [ ] Jobs se ejecutan correctamente

### Frontend
- [ ] Landing page carga correctamente
- [ ] Countdown se muestra y actualiza
- [ ] Resultados del día se muestran
- [ ] Grid de juegos se muestra
- [ ] Navegación a detalle de juego funciona
- [ ] Histórico con paginación funciona
- [ ] Estadísticas se muestran
- [ ] Diseño responsive funciona
- [ ] WebSocket actualiza UI en tiempo real

### Integración
- [ ] Frontend se conecta al backend
- [ ] WebSocket funciona entre frontend y backend
- [ ] Notificaciones toast aparecen
- [ ] Datos se actualizan automáticamente
- [ ] Paginación funciona correctamente

---

**Última actualización**: 2025-10-01
