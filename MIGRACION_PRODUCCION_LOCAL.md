# Migración de Producción a Local - Completada

**Fecha:** 21 de Diciembre 2025  
**Estado:** ✅ Exitosa

## Resumen

Se migró exitosamente la base de datos de producción a local, preservando los cambios locales de la modalidad Tripleta.

## Datos Verificados

### Base de Datos de Producción (Remota)
- **Host:** 144.126.150.120:5433
- **Database:** tote_db
- **Estado:** ✅ **NO MODIFICADA** (solo lectura)
- **Usuarios:** 5
- **Juegos:** 3

### Base de Datos Local (Después de Migración)
- **Host:** localhost:5433
- **Database:** tote_db
- **Estado:** ✅ Actualizada con datos de producción + Tripleta
- **Usuarios:** 5 (migrados de producción)
- **Juegos:** 3 (migrados de producción)
- **Configuraciones API:** 5+ (SRQ - migradas de producción)

## Tablas Verificadas

### ✅ Tablas de Producción (Migradas)
- `User` - 5 usuarios
- `Game` - 3 juegos
- `ApiSystem` - Sistemas de proveedores externos
- `ApiConfiguration` - Configuraciones de SRQ
- `ApiDrawMapping` - Mapeos de sorteos
- `Draw` - Sorteos
- `Ticket` - Tickets de apuestas
- `GameItem` - Números de juegos
- Y todas las demás tablas del sistema...

### ✅ Tablas Nuevas (Tripleta - Agregadas Post-Migración)
- `TripleBet` - Sistema de apuestas Tripleta
  - Columnas: id, userId, gameId, item1Id, item2Id, item3Id, amount, multiplier, drawsCount, startDrawId, endDrawId, winnerDrawId, prize, status, expiresAt, createdAt, updatedAt
  - Índices: userId, gameId, status, userId+status, expiresAt, startDrawId
  - Foreign Keys: userId → User (CASCADE)
  - Enum: TripletaStatus (ACTIVE, WON, LOST, EXPIRED)

## Proceso Ejecutado

1. **Backup de Seguridad Local**
   - Archivo: `./backups/local_backup_20251221_162526.sql`
   - Estado: ✅ Guardado

2. **Backup de Producción**
   - Archivo: `./backups/prod_backup_20251221_162526.sql`
   - Estado: ✅ Guardado (solo lectura, NO se modificó producción)

3. **Limpieza de Base Local**
   - Eliminadas 47 tablas y tipos
   - Estado: ✅ Completado

4. **Restauración de Datos de Producción**
   - Datos restaurados en local
   - Estado: ✅ Completado

5. **Aplicación de Migración Tripleta**
   - Tabla `TripleBet` creada
   - Enum `TripletaStatus` creado
   - Índices creados
   - Foreign keys configuradas
   - Estado: ✅ Completado

## Configuraciones de Proveedores Migradas

Las configuraciones de SRQ fueron migradas correctamente:

```
SRQ Planificación Juego 1 - https://api2.sistemasrq.com/externalapi/operator/loteries?date= - ACTIVA
SRQ Ventas Juego 1        - https://api2.sistemasrq.com/externalapi/operator/tickets/       - ACTIVA
SRQ Planificación Juego 2 - https://api2.sistemasrq.com/externalapi/operator/loteries?date= - ACTIVA
SRQ Ventas Juego 2        - https://api2.sistemasrq.com/externalapi/operator/tickets/       - ACTIVA
SRQ Planificación Juego 3 - https://api2.sistemasrq.com/externalapi/operator/loteries?date= - ACTIVA
SRQ Ventas Juego 3        - https://api2.sistemasrq.com/externalapi/operator/tickets/       - ACTIVA
```

## Archivos Creados

- `scripts/migrate-production-to-local.sh` - Script de migración automatizado
- `/tmp/apply-tripleta.sql` - SQL para crear tablas de Tripleta
- `backups/local_backup_20251221_162526.sql` - Backup de seguridad local
- `backups/prod_backup_20251221_162526.sql` - Backup de producción

## Recuperación en Caso de Problemas

Si necesitas revertir los cambios locales:

```bash
cd /home/diazhh/dev/tote-web/scripts
PGPASSWORD="erp_password_dev_2024" pg_restore \
  -h localhost \
  -p 5433 \
  -U erp_user \
  -d tote_db \
  --clean \
  ./backups/local_backup_20251221_162526.sql
```

## Próximos Pasos

1. Reiniciar el backend para que reconozca los nuevos datos
2. Verificar que las configuraciones de proveedores funcionan
3. Probar la funcionalidad de Tripleta con los datos migrados
4. Verificar que los juegos y usuarios migrados funcionan correctamente

## Importante

- ✅ **La base de datos de producción NO fue modificada en ningún momento**
- ✅ **Todos los datos de producción están ahora en local**
- ✅ **Las tablas de Tripleta fueron agregadas exitosamente**
- ✅ **Tienes backups de seguridad de ambas bases de datos**
