# 🎲 Cómo Usar el Simulador de Jugadas

## ✅ Estado: IMPLEMENTADO Y FUNCIONANDO

El sistema **YA TIENE** un servicio completo de simulación de jugadas que genera tickets y tripletas automáticamente.

---

## 📍 Componentes del Sistema

### 1. Servicio Principal
**Archivo:** `backend/src/services/bet-simulator.service.js`

Genera jugadas aleatorias con:
- **20-40 tickets** por sorteo
- **1-10 detalles** por ticket
- **Montos:** Entre $1 y $25 por detalle
- **5-15 tripletas** por juego (si está habilitado)
- **Usuario de prueba:** `jugador_test` con saldo de $10,000,000

### 2. Script Manual
**Archivo:** `backend/src/scripts/run-bet-simulation.js`

### 3. Job Automático
**Archivo:** `backend/src/jobs/simulate-bets.job.js`
- Se ejecuta **cada 30 minutos** automáticamente
- Timezone: America/Caracas
- Respeta parada de emergencia del sistema

---

## 🚀 Cómo Ejecutar Manualmente

### Opción 1: Con yarn (Recomendado)
```bash
cd backend
yarn simulate:bets
```

### Opción 2: Con node directamente
```bash
cd backend
node src/scripts/run-bet-simulation.js
```

### Opción 3: Sin tripletas
```bash
cd backend
yarn simulate:bets --no-tripletas
# o
node src/scripts/run-bet-simulation.js --no-tripletas
```

### Opción 4: Con delay personalizado
```bash
cd backend
yarn simulate:bets --delay=50
# o
node src/scripts/run-bet-simulation.js --delay=200
```

---

## ⚙️ Funcionamiento Automático

El job **YA ESTÁ ACTIVO** y se ejecuta cada 30 minutos si:
- ✅ El backend está corriendo
- ✅ No hay parada de emergencia activada
- ✅ Hay sorteos disponibles (SCHEDULED y no cerrados)

### Verificar si está activo

Revisa los logs del backend:
```bash
cd backend
pm2 logs backend
# o si usas yarn dev:
# Verás en consola: "✅ Job SimulateBets iniciado (cada 30 minutos)"
```

---

## 📊 Qué Genera

### Por cada sorteo disponible:
- **20-40 tickets** con jugadas aleatorias
- **1-10 números** por ticket
- **Montos:** $1 a $25 por número

### Tripletas (si el juego las tiene habilitadas):
- **5-15 tripletas** por juego
- **3 números** aleatorios diferentes
- **Monto:** $1 a $25

### Usuario de prueba:
- **Username:** `jugador_test`
- **Password:** `test123456`
- **Saldo inicial:** $10,000,000
- **Recarga automática** si baja de $100,000

---

## 🎯 Ejemplo de Salida

```
╔════════════════════════════════════════════════════════════╗
║         SIMULADOR DE JUGADAS - TOTE WEB                    ║
╚════════════════════════════════════════════════════════════╝

Opciones:
  - Incluir tripletas: Sí
  - Delay entre jugadas: 100ms

Usuario de prueba: jugador_test (ID: abc123)
Saldo inicial: 10000000

Próximos sorteos (1 por juego): 3

Sorteo: Animalitos - 17:00 (35 jugadas)
  Jugada 1/35 - Ticket xyz (5 detalles, $45)
  Jugada 11/35 - Ticket abc (3 detalles, $22)
  ...

=== Creando apuestas Tripleta ===
  Tripleta 1/10 - ID: def ($15)
  ...

╔════════════════════════════════════════════════════════════╗
║                    RESULTADO FINAL                         ║
╚════════════════════════════════════════════════════════════╝

✅ Simulación completada exitosamente

📊 Estadísticas:
   - Tickets creados: 105
   - Detalles de tickets: 523
   - Tripletas creadas: 30
   - Monto total apostado: $8,450.00
   - Errores: 0

👤 Usuario de prueba:
   - Username: jugador_test
   - ID: abc123
   - Saldo inicial: $10,000,000.00
   - Saldo final: $9,991,550.00
```

---

## 🛑 Cómo Detener el Job Automático

### Opción 1: Parada de emergencia (Recomendado)
Activa la parada de emergencia del sistema y el job se detendrá automáticamente.

### Opción 2: Reiniciar backend sin el job
Edita `backend/src/jobs/index.js` y comenta la línea que inicia `simulate-bets.job.js`.

---

## 🔍 Verificar Jugadas Generadas

### En la base de datos:
```sql
-- Ver tickets del usuario de prueba
SELECT * FROM "Ticket" 
WHERE "userId" = (SELECT id FROM "User" WHERE username = 'jugador_test')
ORDER BY "createdAt" DESC
LIMIT 20;

-- Ver tripletas del usuario de prueba
SELECT * FROM "TripleBet" 
WHERE "userId" = (SELECT id FROM "User" WHERE username = 'jugador_test')
ORDER BY "createdAt" DESC
LIMIT 20;
```

### En el admin:
1. Ve a `http://localhost:3000/admin/tickets`
2. Busca tickets del usuario `jugador_test`
3. Verás todas las jugadas generadas automáticamente

---

## 🎮 Configuración Avanzada

### Modificar frecuencia del job automático

Edita `backend/src/jobs/simulate-bets.job.js`:
```javascript
// Línea 12
this.cronExpression = '*/30 * * * *'; // Cada 30 minutos

// Cambiar a:
this.cronExpression = '*/15 * * * *'; // Cada 15 minutos
this.cronExpression = '0 * * * *';    // Cada hora
this.cronExpression = '0 */2 * * *';  // Cada 2 horas
```

### Modificar cantidad de jugadas

Edita `backend/src/services/bet-simulator.service.js`:
```javascript
// Línea 126 - Detalles por ticket
const detailsCount = this.randomInt(1, 10); // Cambiar rango

// Línea 131 - Monto por detalle
amount: this.randomInt(1, 25) // Cambiar rango

// Línea 343 - Jugadas por sorteo
const numBets = this.randomInt(20, 40); // Cambiar rango

// Línea 378 - Tripletas por juego
const numTripletas = this.randomInt(5, 15); // Cambiar rango
```

---

## ⚠️ Notas Importantes

1. **Usuario de prueba:** Las jugadas se crean con el usuario `jugador_test`, NO afectan usuarios reales.

2. **Saldo ilimitado:** El usuario de prueba tiene saldo de $10M y se recarga automáticamente.

3. **Solo sorteos disponibles:** Solo genera jugadas para sorteos SCHEDULED que no han cerrado (5 min antes).

4. **Un sorteo por juego:** Genera jugadas solo para el próximo sorteo de cada juego, no para todos.

5. **Respeta parada de emergencia:** Si el sistema está en parada de emergencia, el job automático NO se ejecuta.

---

## 🐛 Troubleshooting

### El job no genera jugadas
**Causa:** No hay sorteos disponibles
**Solución:** Verifica que haya sorteos SCHEDULED en el futuro

### Error "Saldo insuficiente"
**Causa:** El usuario de prueba se quedó sin saldo
**Solución:** El sistema recarga automáticamente, pero puedes hacerlo manual:
```sql
UPDATE "User" 
SET balance = 10000000 
WHERE username = 'jugador_test';
```

### No veo el usuario jugador_test
**Causa:** No se ha ejecutado el simulador nunca
**Solución:** Ejecuta manualmente una vez: `yarn simulate:bets`

---

## 📞 Resumen Rápido

```bash
# Ejecutar manualmente
cd backend
yarn simulate:bets

# Ver logs del job automático
pm2 logs backend | grep SimulateBets

# Verificar usuario de prueba
psql -d tote_db -c "SELECT username, balance FROM \"User\" WHERE username = 'jugador_test';"
```

---

**Última actualización:** 2025-12-24  
**Estado:** ✅ Implementado y funcionando  
**Frecuencia automática:** Cada 30 minutos
