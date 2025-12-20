# Migración Base de Datos - Taquilla Online

## Fecha de Migración
**Fecha:** 2024-12-20  
**Fase:** Fase 1 y Fase 2 (Fundamentos + Sistema de Tickets)

## Resumen de Cambios

Esta migración agrega el sistema completo de taquilla online al proyecto, incluyendo:

### Fase 1: Fundamentos
- ✅ Extensión del modelo `User` con campos para jugadores
- ✅ Nuevo rol `PLAYER` en el enum `UserRole`
- ✅ Modelo `SystemPagoMovil` (cuentas del sistema para recibir depósitos)
- ✅ Modelo `PagoMovilAccount` (cuentas de usuarios para retiros)
- ✅ Modelo `Deposit` con estados PENDING/APPROVED/REJECTED
- ✅ Modelo `Withdrawal` con estados PENDING/PROCESSING/COMPLETED/REJECTED/CANCELLED

### Fase 2: Sistema de Tickets
- ✅ Modelo `Ticket` (tickets de jugadas)
- ✅ Modelo `TicketDetail` (detalles de cada jugada en un ticket)
- ✅ Relación `tickets` en modelo `Draw`
- ✅ Relación `ticketDetails` en modelo `GameItem`

## Cambios en el Schema

### 1. Enum UserRole
```prisma
enum UserRole {
  ADMIN
  OPERATOR
  VIEWER
  PLAYER      // NUEVO
}
```

### 2. Modelo User - Campos Agregados
```prisma
// Campos para jugadores (PLAYER role)
phone           String?   @unique
phoneVerified   Boolean   @default(false)
balance         Decimal   @default(0) @db.Decimal(12, 2)
blockedBalance  Decimal   @default(0) @db.Decimal(12, 2)

// Relaciones nuevas
tickets         Ticket[]
deposits        Deposit[]
withdrawals     Withdrawal[]
pagoMovilAccounts PagoMovilAccount[]
```

### 3. Nuevos Modelos

#### SystemPagoMovil
Cuentas Pago Móvil del sistema para recibir depósitos de usuarios.

#### PagoMovilAccount
Cuentas Pago Móvil de usuarios para recibir retiros.

#### Deposit
Registro de depósitos con estados: PENDING → APPROVED/REJECTED

#### Withdrawal
Registro de retiros con estados: PENDING → PROCESSING → COMPLETED/REJECTED/CANCELLED

#### Ticket
Tickets de jugadas de usuarios con estados: ACTIVE → WON/LOST/CANCELLED

#### TicketDetail
Detalles individuales de cada jugada dentro de un ticket.

## Comandos de Migración

### Para Desarrollo (ya ejecutado)
```bash
cd backend
npx prisma db push --accept-data-loss
```

### Para Producción

#### Opción 1: Usando Prisma Migrate (Recomendado)
```bash
# 1. Crear la migración inicial desde el schema actual
cd backend
npx prisma migrate dev --name init_taquilla_online_phase1_and_phase2

# 2. En producción, aplicar la migración
npx prisma migrate deploy
```

#### Opción 2: Usando SQL Directo
Si prefieres revisar el SQL antes de aplicarlo:

```bash
# 1. Generar el SQL de migración
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > migration_taquilla_online.sql

# 2. Revisar el archivo migration_taquilla_online.sql

# 3. Aplicar manualmente en producción
psql $DATABASE_URL < migration_taquilla_online.sql
```

## Verificación Post-Migración

### 1. Verificar que las tablas se crearon correctamente
```sql
-- Verificar nuevas tablas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'SystemPagoMovil', 
  'PagoMovilAccount', 
  'Deposit', 
  'Withdrawal',
  'Ticket',
  'TicketDetail'
);

-- Verificar nuevos campos en User
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'User' 
AND column_name IN ('phone', 'phoneVerified', 'balance', 'blockedBalance');
```

### 2. Verificar índices
```sql
-- Verificar índices en nuevas tablas
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN (
  'SystemPagoMovil', 
  'PagoMovilAccount', 
  'Deposit', 
  'Withdrawal',
  'Ticket',
  'TicketDetail'
);
```

### 3. Verificar enum UserRole
```sql
-- Verificar que el enum UserRole incluye PLAYER
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (
  SELECT oid FROM pg_type WHERE typname = 'UserRole'
);
```

## Rollback (En caso de problemas)

### Si usaste Prisma Migrate
```bash
# Ver historial de migraciones
npx prisma migrate status

# Hacer rollback (requiere intervención manual)
# Prisma no soporta rollback automático, debes:
# 1. Restaurar backup de la base de datos
# 2. O ejecutar SQL de rollback manualmente
```

### SQL de Rollback Manual
```sql
-- ADVERTENCIA: Esto eliminará TODOS los datos de taquilla online

-- Eliminar tablas en orden (respetando foreign keys)
DROP TABLE IF EXISTS "TicketDetail" CASCADE;
DROP TABLE IF EXISTS "Ticket" CASCADE;
DROP TABLE IF EXISTS "Withdrawal" CASCADE;
DROP TABLE IF EXISTS "Deposit" CASCADE;
DROP TABLE IF EXISTS "PagoMovilAccount" CASCADE;
DROP TABLE IF EXISTS "SystemPagoMovil" CASCADE;

-- Eliminar enums
DROP TYPE IF EXISTS "TicketDetailStatus";
DROP TYPE IF EXISTS "TicketStatus";
DROP TYPE IF EXISTS "WithdrawalStatus";
DROP TYPE IF EXISTS "DepositStatus";

-- Remover campos de User (si es necesario)
ALTER TABLE "User" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phoneVerified";
ALTER TABLE "User" DROP COLUMN IF EXISTS "balance";
ALTER TABLE "User" DROP COLUMN IF EXISTS "blockedBalance";

-- Remover valor PLAYER del enum UserRole
-- NOTA: Esto es complejo en PostgreSQL, mejor restaurar desde backup
```

## Datos Iniciales Recomendados

### 1. Crear cuenta Pago Móvil del sistema
```sql
INSERT INTO "SystemPagoMovil" (
  id, 
  "bankCode", 
  "bankName", 
  phone, 
  cedula, 
  "holderName", 
  "isActive", 
  priority,
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  '0102',
  'Banco de Venezuela',
  '04241234567',
  'V12345678',
  'NOMBRE DEL TITULAR',
  true,
  1,
  NOW(),
  NOW()
);
```

## Notas Importantes

1. **Backup Obligatorio**: Antes de ejecutar en producción, hacer backup completo de la base de datos.

2. **Downtime**: Esta migración puede requerir downtime mínimo (1-2 minutos) para aplicar los cambios.

3. **Validación**: Después de la migración, validar que:
   - Los usuarios existentes no se vieron afectados
   - Las nuevas tablas están vacías
   - Los índices se crearon correctamente

4. **Prisma Client**: Después de la migración, regenerar el Prisma Client:
   ```bash
   npx prisma generate
   ```

5. **Restart**: Reiniciar la aplicación backend después de la migración.

## Checklist de Producción

- [ ] Backup de base de datos realizado
- [ ] Migración probada en ambiente de staging
- [ ] Downtime comunicado a usuarios (si aplica)
- [ ] Migración ejecutada
- [ ] Verificaciones post-migración completadas
- [ ] Prisma Client regenerado
- [ ] Aplicación backend reiniciada
- [ ] Endpoints de taquilla online funcionando
- [ ] Datos iniciales (SystemPagoMovil) creados
- [ ] Monitoreo de errores activo

## Contacto
Para dudas sobre esta migración, contactar al equipo de desarrollo.

---
**Versión:** 1.0  
**Última actualización:** 2024-12-20
