# Prompt: Sistema de Gestion de Apuestas - Taquillas Fisicas y Online

## Descripcion General

Construir desde cero una aplicacion web completa (frontend + backend) para la gestion de apuestas de animalitos a traves de taquillas fisicas y jugadores en linea. El sistema maneja una jerarquia de 6 niveles de entidades, cada una con administradores, comisiones configurables, cupos/limites, contabilidad automatica y reportes detallados.

Este sistema NO totaliza sorteos. Se conecta a un sistema de totalizacion externo existente (tote-web) via API como si fuese un proveedor externo. El sistema envia las ventas/jugadas al totalizador y recibe los resultados de los sorteos.

## Stack Tecnologico

- **Frontend**: Next.js (App Router) + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express (API REST)
- **ORM**: Prisma
- **Base de datos**: PostgreSQL
- **Cache y colas**: Redis + BullMQ
- **WhatsApp**: Baileys (libreria de WhatsApp Web)
- **Reportes**: Generacion de PDF y Excel
- **Autenticacion**: JWT con refresh tokens

---

## Integracion con Sistema de Totalizacion (tote-web)

El sistema externo (tote-web) ya tiene una API de proveedores. Actualmente un proveedor llamado SRQ se integra asi:

- **Planificacion**: tote-web expone los sorteos del dia. Nuestro sistema consulta los sorteos disponibles y los mapea internamente.
- **Envio de ventas**: Nuestro sistema expone una API que tote-web consulta periodicamente para obtener los tickets vendidos. El formato incluye: ticketID, numero, monto, taquillaID, grupoID, bancaID, comercialID.
- **Resultados**: Despues de cada sorteo, tote-web publica los resultados (numero ganador). Nuestro sistema recibe los resultados via webhook o consulta periodica para determinar premios.
- **Autenticacion**: API Key en header personalizado.

Se necesita un modulo de integracion que:
1. Sincronice los sorteos disponibles del totalizador
2. Envie las ventas en el formato esperado
3. Reciba resultados de sorteos
4. Maneje reconexion y reintentos

---

## Jerarquia de Entidades (6 niveles)

```
Comercializador -> Banca -> Grupo -> Agencia -> Taquilla -> Jugador en Linea
```

### Nivel 1: Comercializador
- Entidad comercial de nivel superior (empresa)
- Creada unicamente por el administrador del sistema
- Tiene un usuario administrador asignado
- Puede tener multiples bancas

### Nivel 2: Banca
- Sucursal o division dentro de un comercializador
- Creada por el admin del comercializador o admin del sistema
- Tiene su propio usuario administrador
- Puede tener multiples grupos

### Nivel 3: Grupo
- Agrupacion logica de agencias dentro de una banca
- Creado por el admin de la banca, del comercializador o admin del sistema
- Tiene su propio usuario administrador
- Puede tener multiples agencias

### Nivel 4: Agencia
- Establecimiento fisico o virtual que contiene taquillas
- Creada por el admin del grupo, de la banca, del comercializador o admin del sistema
- Tiene su propio usuario administrador
- Puede tener multiples taquillas
- Los jugadores en linea que se auto-registran se asocian a una agencia especifica (configurable)
- Tiene direccion fisica, telefono

### Nivel 5: Taquilla
- Punto de venta individual (fisico)
- Creada por el admin de la agencia o cualquier admin superior
- Operada por un usuario "taquillero"
- Puede asociar una instancia de Baileys (WhatsApp) para enviar tickets y reportes a clientes
- Maneja una lista de contactos de clientes (nombre + telefono) por taquilla
- Las ventas son de personas que llegan fisicamente, pagan en efectivo/transferencia y reciben un ticket

### Nivel 6: Jugador en Linea
- Usuario que se auto-registra en la plataforma
- Queda asociado a una agencia especifica automaticamente
- Puede cargar saldo (depositos) y/o recibir bonos
- Juega con su saldo
- Los premios se acreditan a su balance
- Puede solicitar retiros
- Recibe notificaciones de tickets y premios

### Diferencia clave entre Taquilla Fisica y Jugador en Linea

| Aspecto | Taquilla Fisica | Jugador en Linea |
|---------|----------------|------------------|
| Quien opera | Un taquillero (empleado) | El jugador mismo |
| Pago | Efectivo, transferencia, pago movil al momento | Saldo precargado |
| Saldo | No hay saldo, paga por jugada | Tiene balance digital |
| Ticket | Se imprime o se envia por WhatsApp | Se muestra en pantalla |
| Premios | El taquillero paga al cliente | Se acredita al balance |
| Registro | El taquillero ingresa las jugadas | El jugador las hace el mismo |
| Contactos | Lista de clientes guardada por taquilla | Perfil del usuario |

---

## Roles de Usuario

### Roles administrativos (uno por nivel de entidad)
- **ADMIN**: Administrador del sistema completo. Crea comercializadores y tiene acceso total.
- **COMERCIALIZADOR_ADMIN**: Administra su comercializadora y todo lo que hay debajo.
- **BANCA_ADMIN**: Administra su banca y todo lo que hay debajo.
- **GRUPO_ADMIN**: Administra su grupo y todo lo que hay debajo.
- **AGENCIA_ADMIN**: Administra su agencia, sus taquillas y sus jugadores en linea.
- **TAQUILLERO**: Opera una taquilla fisica. Solo puede vender, anular y ver sus reportes.
- **JUGADOR**: Jugador en linea. Se registra, carga saldo, juega, cobra premios.

### Capacidades de cada admin de entidad

Cada administrador de entidad puede:

1. **Gestionar su entidad**: Editar nombre, configuracion, estado
2. **Crear sub-entidades**: Crear entidades del nivel inmediatamente inferior
3. **Crear usuarios**: Crear usuarios y asignarles roles dentro de su scope
   - Crear admins para sub-entidades
   - Crear operadores (taquilleros) para taquillas
   - Crear usuarios de solo lectura (viewers)
4. **Configurar comisiones**: Establecer el tipo y porcentaje de comision de sus sub-entidades
5. **Configurar cupos**: Establecer limites de venta para sus sub-entidades
6. **Ver reportes**: Ver reportes contables de su entidad y todo lo que hay debajo, en cascada
7. **Liquidar**: Marcar comisiones como pagadas/liquidadas (solo comercializador y banca)

---

## Modulos del Sistema

### Modulo 1: Autenticacion y Usuarios
- Registro de jugadores en linea (auto-registro con asignacion automatica a agencia)
- Login con JWT + refresh tokens
- Recuperacion de contrasena
- Verificacion de email y telefono
- Gestion de usuarios por entidad (crear, editar, desactivar)
- Permisos heredados: un admin tiene acceso a su entidad y TODAS las sub-entidades

### Modulo 2: Gestion de Entidades
- CRUD completo para cada uno de los 6 niveles
- Vista de arbol navegable (tipo explorador de archivos)
- Detalle de entidad con tabs: Info, Usuarios, Comisiones, Cupos, Contabilidad, Sub-entidades
- Breadcrumbs de navegacion en la jerarquia
- Contadores de sub-entidades en tiempo real
- Buscador de entidades
- Desactivacion con validacion (no permitir si tiene sub-entidades activas)

### Modulo 3: Sistema de Comisiones
- Configurable por entidad, por juego o global
- Tres tipos de comision:
  - **VENTAS**: Porcentaje de las ventas brutas. Siempre positiva, no importa si hay perdida.
  - **GANANCIA**: Porcentaje de la ganancia neta. Si hay perdida, la comision es cero (no pierde).
  - **COMPARTIDA**: Porcentaje de la ganancia neta compartida. Si hay perdida, la entidad tambien pierde proporcionalmente.
- Vista en cascada: ver la configuracion de comision de toda la cadena (desde comercializador hasta taquilla)
- Simulador: ingresar montos hipoteticos de venta y premio para ver cuanto seria la comision
- Validacion: la suma de comisiones de toda la cadena no debe exceder umbrales logicos

### Modulo 4: Sistema de Cupos/Limites
- Cupos configurables por entidad, por juego, por numero, o global
- Los cupos son heredados: un cupo en un grupo limita a TODAS sus agencias y taquillas combinadas
- Al verificar si una venta cabe, se revisa toda la cadena hacia arriba
- El cupo efectivo es el MINIMO disponible en toda la cadena
- Vista de cupos en cascada con uso en tiempo real
- Matriz de uso: tabla con numeros en filas y sub-entidades en columnas, mostrando uso vs limite
- Barras de color: verde (< 50%), amarillo (50-80%), rojo (> 80%)
- Cache con Redis para performance (operaciones atomicas, TTL por sorteo)
- Fallback a base de datos si Redis no esta disponible

### Modulo 5: Punto de Venta (POS) - Taquilla Fisica
- Interfaz fullscreen optimizada para velocidad
- Diseno de 3 columnas: entrada de datos | lista de jugadas | info lateral
- Numpad para ingresar numeros (2 o 3 digitos segun el juego)
- Botones de montos rapidos ($1, $2, $5, $10, $20, $50, $100)
- Lista de jugadas del ticket actual con total
- Indicador de cupo disponible en tiempo real
- Ultimos resultados visibles
- Selector de sorteo y juego
- Atajos de teclado completos:
  - 0-9: Ingresar numero
  - Backspace: Borrar
  - Enter: Agregar jugada
  - Tab: Cambiar entre numero y monto
  - F1: Cambiar juego
  - F2: Confirmar y vender
  - F3: Anular ultimo ticket
  - F4: Corte de caja / reportes
  - F5: Ultimos resultados
  - F6: Cambiar sorteo
  - Escape: Limpiar ticket
  - +/-: Subir/bajar monto
  - Ctrl+Z: Quitar ultima jugada
- Al vender, opcion de:
  - Imprimir ticket (enviar a impresora)
  - Enviar por WhatsApp (seleccionar contacto de la lista o ingresar numero)
- Responsive para tablet y telefono
- Corte de caja diario: total vendido, total premios, total por metodo de pago, detalle de ventas

### Modulo 6: Plataforma del Jugador en Linea
- Dashboard con balance, ultimas jugadas, ultimos resultados
- Interfaz de juego similar al POS pero adaptada para jugador individual
- Seleccion de juego y sorteo
- Numpad para ingresar numeros
- Monto de apuesta (se descuenta del saldo)
- Historial de tickets
- Depositos (metodos de pago configurables)
- Retiros (solicitud con aprobacion)
- Historial de movimientos financieros
- Notificaciones de premios

### Modulo 7: Gestion de Contactos por Taquilla
- Cada taquilla tiene su propia lista de contactos (nombre + telefono)
- CRUD de contactos
- Busqueda rapida al momento de enviar ticket
- Autocompletado al escribir nombre o numero
- Historial de tickets enviados por contacto
- Importacion masiva (CSV)

### Modulo 8: Integracion WhatsApp (Baileys)
- Cada taquilla puede asociar una instancia de WhatsApp
- Escaneo de QR para vincular
- Estado de conexion visible en tiempo real
- Envio automatico de tickets al vender (si el taquillero elige WhatsApp)
- Envio de notificaciones de premios a clientes
- Envio de reportes diarios a administradores de entidades
- Reconexion automatica
- Cada agencia o nivel superior puede tener su propia instancia para enviar reportes consolidados

### Modulo 9: Contabilidad y Reportes

Este es un modulo critico. Despues de que el sistema de totalizacion ejecuta cada sorteo y envia los resultados:

1. Se procesan los premios (marcar tickets ganadores/perdedores)
2. Se genera la contabilidad por CADA entidad en CADA nivel:
   - Ventas totales
   - Premios totales
   - Ganancia bruta
   - Comision de ventas
   - Comision de ganancias
   - Comision total
   - Resultado neto
3. Se calcula en cadena de abajo hacia arriba (Taquilla -> Agencia -> Grupo -> Banca -> Comercializador)

**Como este proceso es pesado (puede haber miles de taquillas), se debe usar un sistema de colas:**
- Redis + BullMQ para encolar el procesamiento
- Workers que procesan la contabilidad en background
- Notificacion cuando el proceso termina

#### Reportes por nivel de entidad

Cada nivel ve un reporte diferente adaptado a su necesidad:

**Taquillero ve:**
- Lo que vendio hoy (detalle de cada ticket)
- Lo que repartio en premios
- Cuanta plata debe tener (ventas - premios)
- Corte de caja por metodo de pago
- Estado de cada ticket (activo, ganador, perdedor, anulado)

**Admin de Agencia ve:**
- Todas sus taquillas con sus ventas y premios
- Comision que le corresponde a la agencia
- Desglose por taquilla
- Desglose por juego
- Desglose por sorteo
- Comparativa entre taquillas (ranking)

**Admin de Grupo ve:**
- Todas sus agencias con sus numeros
- Comision del grupo
- Desglose por agencia
- Vista en cascada (grupo -> agencias -> taquillas)
- Cupos y su utilizacion

**Admin de Banca ve:**
- Todos sus grupos con sus numeros
- Comision de la banca
- Desglose por grupo
- Vista en cascada completa
- Liquidaciones pendientes y realizadas
- Historico con graficas de tendencias

**Admin de Comercializador ve:**
- Todas sus bancas con sus numeros
- Comision del comercializador
- Desglose por banca
- Vista en cascada completa
- Liquidaciones pendientes y realizadas
- Historico con graficas de tendencias
- Top performers (mejores bancas, agencias, taquillas)

**Admin del Sistema ve:**
- Todo el sistema consolidado
- Todos los comercializadores
- Ventas globales, premios globales
- Margenes y tendencias
- Alertas de riesgo (cupos altos, perdidas)

#### Envio de reportes

- Despues de cada sorteo (procesado via cola), se genera el reporte
- Se puede enviar automaticamente:
  - Por WhatsApp a los admins de entidad (usando la instancia de Baileys)
  - Por correo electronico
- El formato del reporte puede ser:
  - Mensaje de texto formateado (WhatsApp)
  - PDF adjunto
  - Excel adjunto
- Cada entidad puede configurar si quiere recibir reportes automaticos y por que medio

### Modulo 10: Sistema de Liquidaciones
- Cada sorteo genera registros de comision por entidad
- Los administradores de nivel superior pueden marcar comisiones como "liquidadas" (pagadas)
- Vista de liquidaciones pendientes con filtros
- Liquidacion masiva (seleccionar multiples y liquidar)
- Historico de liquidaciones con quien liquido, cuando y notas
- Alertas de liquidaciones pendientes por mas de X dias

### Modulo 11: Dashboard Administrativo
- Dashboard adaptativo segun el rol del usuario
- Paneles con metricas clave:
  - Ventas del dia
  - Premios del dia
  - Ganancia del dia
  - Comisiones del dia
  - Cantidad de taquillas activas
  - Cantidad de tickets vendidos
- Alertas activas:
  - Cupos al limite
  - Taquillas inactivas
  - Liquidaciones pendientes antiguas
  - WhatsApp desconectado
- Graficas de tendencias (ventas, premios, ganancias por dia/semana/mes)
- Top performers (mejores taquillas, agencias, etc.)
- Accesos rapidos a las funciones mas usadas

### Modulo 12: Configuracion General
- Configuracion de la agencia predeterminada para auto-registro de jugadores
- Configuracion de juegos disponibles
- Configuracion de sorteos (sincronizados del totalizador)
- Configuracion de metodos de pago
- Configuracion de montos minimos/maximos de apuesta
- Configuracion de notificaciones automaticas
- Configuracion de impresoras (para tickets fisicos)

---

## Interfaces del Sistema

### Interface 1: Login / Registro
- Login para todos los roles
- Registro para jugadores en linea (con asignacion automatica a agencia)
- Recuperacion de contrasena
- Verificacion de email/telefono

### Interface 2: Panel de Administracion
- Sidebar adaptativo segun rol
- Cada rol ve solo las opciones a las que tiene acceso
- Breadcrumbs de navegacion
- Responsive
- Temas claro/oscuro

### Interface 3: POS de Taquilla
- Fullscreen, sin sidebar
- Optimizado para teclado
- 3 columnas en desktop, stacked en mobile
- Barra inferior con atajos de teclado

### Interface 4: Plataforma del Jugador
- Dashboard con balance
- Interfaz de juego
- Historial
- Depositos / Retiros
- Mi cuenta

### Interface 5: Reportes
- Tablas con filtros avanzados
- Graficas interactivas
- Exportacion a PDF y Excel
- Desglose en cascada (expandible)
- Comparativas y rankings

---

## Skills Recomendados de skills.sh

Instalar estos skills para mejorar la calidad de la implementacion:

### Skills oficiales (Vercel / Anthropic)
```bash
# Next.js best practices (57 reglas optimizadas para Core Web Vitals)
npx skills add vercel-labs/next-skills --skill next-best-practices

# React best practices
npx skills add vercel-labs/react-best-practices

# Web design guidelines
npx skills add vercel-labs/web-design-guidelines

# Skill para testing de webapps con Playwright
npx skills add anthropics/skills --skill webapp-testing

# Creacion de PDFs
npx skills add anthropics/skills --skill pdf

# Creacion de Excel
npx skills add anthropics/skills --skill xlsx

# Frontend design
npx skills add anthropics/skills --skill frontend-design
```

### Skills de la comunidad
```bash
# Prisma expert (ORM, migraciones, tipos)
npx skills add 0xfurai/claude-code-subagents --skill prisma-expert

# Redis expert (cache, pub/sub, estructuras)
npx skills add 0xfurai/claude-code-subagents --skill redis-expert

# BullMQ expert (colas de trabajo, workers)
npx skills add 0xfurai/claude-code-subagents --skill bullmq-expert

# Tailwind CSS expert
npx skills add 0xfurai/claude-code-subagents --skill tailwind-expert

# Next.js developer
npx skills add Jeffallan/claude-skills --skill nextjs-developer

# DevOps (CI/CD, deployment)
npx skills add Jeffallan/claude-skills --skill devops-engineer

# WhatsApp integration
npx skills add gokapso/integrate-whatsapp
npx skills add gokapso/automate-whatsapp
```

### Skills de Anthropic integrados
```bash
# Simplificar y mejorar codigo escrito
/simplify

# Cambios masivos en paralelo
/batch <instruccion>
```

---

## Notas de Arquitectura

- **Escalabilidad**: El sistema debe soportar miles de taquillas simultaneas. Usar Redis para todo lo que sea tiempo real (cupos, sesiones, cache). BullMQ para procesos pesados (reportes, contabilidad, envio de notificaciones).
- **Multi-tenancy**: Cada entidad ve solo sus datos. Los permisos se filtran en cada query. Usar middleware de autorizacion que resuelve el scope del usuario.
- **Tiempo real**: Considerar WebSockets (Socket.io) para actualizar cupos y resultados en tiempo real en el POS.
- **Resiliencia**: Si Redis no esta disponible, fallback a PostgreSQL. Si WhatsApp se desconecta, encolar mensajes para reenvio. Si el totalizador no responde, reintentos con backoff exponencial.
- **Seguridad**: Rate limiting en endpoints publicos. Validacion estricta de inputs. Sanitizacion contra XSS/SQL injection. Tokens con expiracion corta + refresh tokens.
