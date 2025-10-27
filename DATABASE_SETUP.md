# Configuración de Base de Datos - Sistema Totalizador

## ✅ Estado: COMPLETADO

Fecha: 2025-10-01

---

## 📊 Resumen de Migración

### Base de Datos PostgreSQL

**Contenedor Docker:**
- Nombre: `tote_postgres`
- Imagen: `postgres:15-alpine`
- Puerto: `5432`
- Estado: ✅ Activo y saludable

**Credenciales:**
- Usuario: `tote_user`
- Contraseña: `tote_password_2025`
- Base de datos: `tote_db`
- URL de conexión: `postgresql://tote_user:tote_password_2025@localhost:5432/tote_db`

---

## 📦 Datos Migrados desde MySQL Legacy

### Origen (MySQL)
- Host: `144.126.150.120:3706`
- Base de datos: `bot`
- Usuario: `diazhh`

### Resumen de Migración

| Entidad | Cantidad | Estado |
|---------|----------|--------|
| **Juegos** | 3 | ✅ Migrados |
| **Items de Juegos** | 1,088 | ✅ Migrados |
| **Plantillas de Sorteos** | 6 | ✅ Creadas |
| **Sorteos Históricos** | 9,737 | ✅ Migrados |
| **Usuarios** | 2 | ✅ Creados |

---

## 🎮 Juegos Migrados

### 1. LOTOANIMALITO
- **Tipo:** ANIMALITOS
- **Total de números:** 38
- **Slug:** `lotoanimalito`
- **Estado:** Activo
- **Plantillas:** 2 (Lun-Vie: 13 horarios, Fin de semana: 13 horarios)

### 2. LOTTOPANTERA
- **Tipo:** ROULETTE
- **Total de números:** 50
- **Slug:** `lottopantera`
- **Estado:** Activo
- **Plantillas:** 2 (Lun-Vie: 12 horarios, Fin de semana: 12 horarios)

### 3. TRIPLE PANTERA
- **Tipo:** TRIPLE
- **Total de números:** 1000
- **Slug:** `triple-pantera`
- **Estado:** Activo
- **Plantillas:** 2 (Lun-Vie: 12 horarios, Fin de semana: 12 horarios)

---

## 👥 Usuarios Iniciales

### Usuario Administrador
- **Username:** `admin`
- **Email:** `admin@tote.com`
- **Password:** `admin123`
- **Rol:** ADMIN
- ⚠️ **IMPORTANTE:** Cambiar contraseña en producción

### Usuario Operador
- **Username:** `operator`
- **Email:** `operator@tote.com`
- **Password:** `operator123`
- **Rol:** OPERATOR
- ⚠️ **IMPORTANTE:** Cambiar contraseña en producción

---

## 🚀 Comandos Útiles

### Docker

```bash
# Ver estado del contenedor
sudo docker ps

# Ver logs de PostgreSQL
sudo docker compose logs -f postgres

# Detener PostgreSQL
sudo docker compose down

# Iniciar PostgreSQL
sudo docker compose up -d postgres

# Reiniciar PostgreSQL
sudo docker compose restart postgres
```

### Prisma

```bash
# Abrir Prisma Studio (GUI para ver/editar datos)
cd backend
npx prisma studio

# Generar cliente Prisma
npx prisma generate

# Sincronizar schema con DB
npx prisma db push

# Ver migraciones
npx prisma migrate status
```

### Backend

```bash
# Iniciar servidor en desarrollo
cd backend
npm run dev

# Ejecutar migración legacy nuevamente (si es necesario)
node src/scripts/migrate-legacy.js

# Crear usuarios iniciales
node src/scripts/seed.js
```

---

## 🔍 Verificación de Datos

### Conectar a PostgreSQL

```bash
# Desde el contenedor Docker
sudo docker exec -it tote_postgres psql -U tote_user -d tote_db

# Consultas útiles
\dt                          # Listar tablas
SELECT COUNT(*) FROM "Game"; # Contar juegos
SELECT COUNT(*) FROM "Draw"; # Contar sorteos
\q                           # Salir
```

### Consultas SQL de Verificación

```sql
-- Ver todos los juegos
SELECT name, type, "totalNumbers", "isActive" FROM "Game";

-- Ver plantillas de sorteos
SELECT g.name, dt.name, dt."daysOfWeek", array_length(dt."drawTimes", 1) as num_times
FROM "DrawTemplate" dt
JOIN "Game" g ON dt."gameId" = g.id;

-- Ver últimos sorteos migrados
SELECT g.name, d.status, d."scheduledAt", d."drawnAt"
FROM "Draw" d
JOIN "Game" g ON d."gameId" = g.id
ORDER BY d."scheduledAt" DESC
LIMIT 10;

-- Ver usuarios
SELECT username, email, role, "isActive" FROM "User";
```

---

## 📁 Archivos Creados/Modificados

### Nuevos Archivos
- ✅ `/docker-compose.yml` - Configuración de Docker
- ✅ `/backend/.env` - Variables de entorno
- ✅ `/setup-database.sh` - Script automatizado de setup
- ✅ `/DATABASE_SETUP.md` - Este documento

### Archivos Modificados
- ✅ `/backend/src/scripts/migrate-legacy.js` - Correcciones en consultas SQL

---

## 🎯 Próximos Pasos

1. **Iniciar el backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Verificar API:**
   - Health check: http://localhost:3001/health
   - API pública: http://localhost:3001/api/public/games

3. **Iniciar el frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   - Landing page: http://localhost:3000

4. **Configurar canales de publicación:**
   - Telegram Bot
   - WhatsApp
   - Facebook/Instagram
   - TikTok

5. **Configurar jobs automáticos:**
   - Los jobs ya están configurados en el backend
   - Se ejecutarán automáticamente cuando el servidor esté corriendo

---

## ⚠️ Notas Importantes

1. **Seguridad:**
   - Cambiar contraseñas de usuarios en producción
   - Cambiar `JWT_SECRET` en `.env`
   - No exponer puerto 5432 en producción (usar red interna de Docker)

2. **Backup:**
   - Configurar backups automáticos de PostgreSQL
   - Los datos están en el volumen Docker `tote_postgres_data`

3. **Monitoreo:**
   - Revisar logs del backend regularmente
   - Monitorear uso de recursos del contenedor PostgreSQL

4. **Desarrollo:**
   - Usar Prisma Studio para visualizar/editar datos
   - Los jobs se ejecutan automáticamente (desactivar con `ENABLE_JOBS=false` si es necesario)

---

## 📞 Soporte

Para problemas con la base de datos:
1. Verificar que el contenedor Docker esté corriendo
2. Verificar logs: `sudo docker compose logs postgres`
3. Verificar conectividad: `sudo docker exec tote_postgres pg_isready -U tote_user`
4. Reiniciar contenedor si es necesario

---

**✅ Base de datos configurada y lista para usar!**
