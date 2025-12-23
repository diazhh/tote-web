# Script de Sincronización Completa

## 📋 Descripción

`sync-from-mysql-and-srq.js` - Sincroniza **TODO** desde MySQL remoto y SRQ:

1. **Limpia PostgreSQL local**: Borra Draw, Ticket, ApiDrawMapping
2. **Importa desde MySQL**: Sorteos con ganadores + IDs de SRQ
3. **Sincroniza desde SRQ**: Importa tickets usando los IDs externos

## 🚀 Uso

```bash
cd backend

# Últimos 30 días (por defecto)
node sync-from-mysql-and-srq.js

# Rango específico
node sync-from-mysql-and-srq.js 2025-01-01 2025-12-22

# Solo un mes
node sync-from-mysql-and-srq.js 2025-12-01 2025-12-31
```

## 📊 Ejemplo de Salida

```
🚀 SINCRONIZACIÓN COMPLETA: MySQL → PostgreSQL + SRQ

📅 Rango de fechas: 2025-12-20 a 2025-12-22

🗑️  PASO 1: LIMPIANDO DATOS LOCALES
   ✅ 315 tickets eliminados
   ✅ 108 mappings eliminados
   ✅ 111 sorteos eliminados

📥 PASO 2: IMPORTANDO SORTEOS DESDE MYSQL
   📊 111 sorteos encontrados en MySQL
   ✅ 111 creados
   ✅ 90 con ganador
   ✅ 108 con mapping SRQ

🎫 PASO 3: SINCRONIZANDO TICKETS DESDE SRQ
   Sorteos con mapping: 108
   ✅ 315 tickets importados

============================================================
📊 RESUMEN FINAL
============================================================

📅 Rango: 2025-12-20 a 2025-12-22

📥 Sorteos importados:
   Total: 111
   Con ganador: 90
   Con mapping SRQ: 108

🎫 Tickets importados:
   Sorteos procesados: 108
   Total tickets: 315
```

## ⚠️ Importante

### Destructivo
Este script **BORRA TODO** en PostgreSQL local antes de importar. Asegúrate de ejecutarlo en el ambiente correcto.

### Tickets Solo para Juegos con Mapping
Los tickets **solo se importan** para sorteos que tienen `external_draw_id` en MySQL (`api_draw_mappings`).

**Actualmente en MySQL**:
- ✅ LOTOANIMALITO: 11,412 mappings → **sí importa tickets**
- ❌ LOTTOPANTERA: 0 mappings → **no importa tickets**
- ❌ TRIPLE PANTERA: 0 mappings → **no importa tickets**

Si necesitas tickets de LOTTOPANTERA o TRIPLE PANTERA, primero debes crear los mappings en MySQL remoto.

## 🔧 Configuración

### Variables de Entorno (.env)

```bash
# MySQL Remoto
LEGACY_DB_HOST=144.126.150.120
LEGACY_DB_PORT=3706
LEGACY_DB_USER=diazhh
LEGACY_DB_PASSWORD=Telecom2025*
LEGACY_DB_NAME=bot

# PostgreSQL Local
DATABASE_URL=postgresql://...
```

## 🔍 Verificación

### Verificar sorteos importados
```sql
SELECT COUNT(*) FROM "Draw";
```

### Verificar tickets importados
```sql
SELECT 
  g.name,
  COUNT(t.id) as tickets,
  SUM(t."totalAmount") as ventas
FROM "Game" g
LEFT JOIN "Draw" d ON d."gameId" = g.id
LEFT JOIN "Ticket" t ON t."drawId" = d.id AND t.source = 'EXTERNAL_API'
GROUP BY g.name;
```

### Ver sorteos con/sin mapping
```sql
SELECT 
  g.name,
  COUNT(d.id) as sorteos,
  COUNT(m.id) as con_mapping
FROM "Draw" d
JOIN "Game" g ON d."gameId" = g.id
LEFT JOIN "ApiDrawMapping" m ON m."drawId" = d.id
GROUP BY g.name;
```

## 🎯 Casos de Uso

### Sincronización Inicial
```bash
# Importar todo el historial
node sync-from-mysql-and-srq.js 2024-01-01 2025-12-22
```

### Re-sincronización
```bash
# Re-sincronizar un mes específico
node sync-from-mysql-and-srq.js 2025-12-01 2025-12-31
```

### Actualización Diaria
```bash
# Sincronizar solo hoy
node sync-from-mysql-and-srq.js $(date +%Y-%m-%d) $(date +%Y-%m-%d)
```
