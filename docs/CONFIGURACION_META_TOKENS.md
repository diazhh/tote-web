# 🔑 Configuración de Tokens de Meta (Facebook/Instagram)

## 📋 Información General

Este documento contiene los tokens de acceso de Meta (Facebook) para los 3 juegos del sistema. Estos tokens permiten publicar resultados de sorteos en las páginas de Facebook e Instagram asociadas.

**Fecha de configuración:** 2025-12-24
**Tipo de tokens:** Page Access Tokens (Long-lived)

---

## 🎮 Juego 1: Lotoanimalito

### Información de la Página de Facebook
- **Nombre:** Lotoanimalito
- **Page ID:** `137321016700627`
- **Categoría:** Board Game (2303)

### Access Token
```
EAAKG0vizxFUBOZCH3XQYBWyEw5DgxPncUZBdVJRKEKcYrxPqcVoJJAObUVloStmgNDLXedV8n46kNYZCzzZAKb6tdhfmhctB3FxCSiViHCeCa0jhior4r0Uo4cRl8BXxfzgNHAfRi9ByMdQs4ZBSmDopxUVwL6LmalYhoaWnXyRfrWRZCNV1kF7O4ydl0xhlRZAMZCNeXZCDRJ1DyzVd9sqh5OgZDZD
```

### Permisos (Tasks)
- ✅ ADVERTISE
- ✅ ANALYZE
- ✅ CREATE_CONTENT
- ✅ MESSAGING
- ✅ MODERATE
- ✅ MANAGE

### Configuración en BD
```sql
INSERT INTO "FacebookInstance" (
  id,
  "pageId",
  "pageName",
  "pageAccessToken",
  category,
  status,
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  '137321016700627',
  'Lotoanimalito',
  'EAAKG0vizxFUBOZCH3XQYBWyEw5DgxPncUZBdVJRKEKcYrxPqcVoJJAObUVloStmgNDLXedV8n46kNYZCzzZAKb6tdhfmhctB3FxCSiViHCeCa0jhior4r0Uo4cRl8BXxfzgNHAfRi9ByMdQs4ZBSmDopxUVwL6LmalYhoaWnXyRfrWRZCNV1kF7O4ydl0xhlRZAMZCNeXZCDRJ1DyzVd9sqh5OgZDZD',
  'Board Game',
  'CONNECTED',
  NOW(),
  NOW()
);
```

---

## 🎮 Juego 2: Lotto Pantera (Loto Pantera)

### Información de la Página de Facebook
- **Nombre:** Lotto pantera
- **Page ID:** `116187448076947`
- **Categoría:** Gamer (471120789926333)

### Access Token
```
EAAKG0vizxFUBO2KvgjI3TAaXrOYky7IVIOSMkgB9aZAnlrFrAPRbK9s1NOuOgqCVAYxs52BVR6CQmVSaGnYOgf2v5PC9xgTZBCnp92uzFdFr3gOi95XchopqUeGEkb0ZB9BWLceHGIgpGQ5KZAaJayZCZCdvn1qqOeaJG4baTjgJ4HigyNJjcaFSy3YztNU7gv068PXwnPXYxr93ZCeGZCSNugZDZD
```

### Permisos (Tasks)
- ✅ ADVERTISE
- ✅ ANALYZE
- ✅ CREATE_CONTENT
- ✅ MESSAGING
- ✅ MODERATE
- ✅ MANAGE

### Configuración en BD
```sql
INSERT INTO "FacebookInstance" (
  id,
  "pageId",
  "pageName",
  "pageAccessToken",
  category,
  status,
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid(),
  '116187448076947',
  'Lotto pantera',
  'EAAKG0vizxFUBO2KvgjI3TAaXrOYky7IVIOSMkgB9aZAnlrFrAPRbK9s1NOuOgqCVAYxs52BVR6CQmVSaGnYOgf2v5PC9xgTZBCnp92uzFdFr3gOi95XchopqUeGEkb0ZB9BWLceHGIgpGQ5KZAaJayZCZCdvn1qqOeaJG4baTjgJ4HigyNJjcaFSy3YztNU7gv068PXwnPXYxr93ZCeGZCSNugZDZD',
  'Gamer',
  'CONNECTED',
  NOW(),
  NOW()
);
```

---

## 🎮 Juego 3: Triple Pantera

### Información de la Página de Facebook
- **Nombre:** Lotto pantera (misma página que Loto Pantera)
- **Page ID:** `116187448076947`
- **Categoría:** Gamer (471120789926333)

### Access Token
```
EAAKG0vizxFUBO2KvgjI3TAaXrOYky7IVIOSMkgB9aZAnlrFrAPRbK9s1NOuOgqCVAYxs52BVR6CQmVSaGnYOgf2v5PC9xgTZBCnp92uzFdFr3gOi95XchopqUeGEkb0ZB9BWLceHGIgpGQ5KZAaJayZCZCdvn1qqOeaJG4baTjgJ4HigyNJjcaFSy3YztNU7gv068PXwnPXYxr93ZCeGZCSNugZDZD
```

### Nota Importante
⚠️ **Triple Pantera y Loto Pantera comparten la misma página de Facebook**, por lo que usan el mismo Page Access Token.

---

## 🔧 Configuración Técnica

### 1. Script de Importación de Tokens

**Archivo:** `backend/src/scripts/import-facebook-tokens.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FACEBOOK_PAGES = [
  {
    pageId: '137321016700627',
    pageName: 'Lotoanimalito',
    accessToken: 'EAAKG0vizxFUBOZCH3XQYBWyEw5DgxPncUZBdVJRKEKcYrxPqcVoJJAObUVloStmgNDLXedV8n46kNYZCzzZAKb6tdhfmhctB3FxCSiViHCeCa0jhior4r0Uo4cRl8BXxfzgNHAfRi9ByMdQs4ZBSmDopxUVwL6LmalYhoaWnXyRfrWRZCNV1kF7O4ydl0xhlRZAMZCNeXZCDRJ1DyzVd9sqh5OgZDZD',
    category: 'Board Game',
    gameName: 'LOTOANIMALITO'
  },
  {
    pageId: '116187448076947',
    pageName: 'Lotto pantera',
    accessToken: 'EAAKG0vizxFUBO2KvgjI3TAaXrOYky7IVIOSMkgB9aZAnlrFrAPRbK9s1NOuOgqCVAYxs52BVR6CQmVSaGnYOgf2v5PC9xgTZBCnp92uzFdFr3gOi95XchopqUeGEkb0ZB9BWLceHGIgpGQ5KZAaJayZCZCdvn1qqOeaJG4baTjgJ4HigyNJjcaFSy3YztNU7gv068PXwnPXYxr93ZCeGZCSNugZDZD',
    category: 'Gamer',
    gameName: 'LOTOPANTERA' // También para TRIPLE PANTERA
  }
];

async function importFacebookTokens() {
  console.log('Iniciando importación de tokens de Facebook...\n');

  for (const page of FACEBOOK_PAGES) {
    console.log(`Procesando página: ${page.pageName} (${page.pageId})`);

    try {
      // Verificar si ya existe
      const existing = await prisma.facebookInstance.findFirst({
        where: { pageId: page.pageId }
      });

      if (existing) {
        console.log(`  ⚠️  Ya existe, actualizando token...`);
        await prisma.facebookInstance.update({
          where: { id: existing.id },
          data: {
            pageAccessToken: page.accessToken,
            pageName: page.pageName,
            category: page.category,
            status: 'CONNECTED',
            updatedAt: new Date()
          }
        });
      } else {
        console.log(`  ✅ Creando nueva instancia...`);
        await prisma.facebookInstance.create({
          data: {
            pageId: page.pageId,
            pageName: page.pageName,
            pageAccessToken: page.accessToken,
            category: page.category,
            status: 'CONNECTED'
          }
        });
      }

      // Obtener juegos
      const games = await prisma.game.findMany({
        where: {
          name: {
            contains: page.gameName,
            mode: 'insensitive'
          }
        }
      });

      console.log(`  📌 Encontrados ${games.length} juego(s) para vincular`);

      // Para cada juego, crear o actualizar GameChannel
      for (const game of games) {
        const fbInstance = await prisma.facebookInstance.findFirst({
          where: { pageId: page.pageId }
        });

        // Verificar si ya existe un canal de Facebook para este juego
        const existingChannel = await prisma.gameChannel.findFirst({
          where: {
            gameId: game.id,
            channelType: 'FACEBOOK'
          }
        });

        if (existingChannel) {
          console.log(`  ⚠️  Canal ya existe para juego ${game.name}, actualizando...`);
          await prisma.gameChannel.update({
            where: { id: existingChannel.id },
            data: {
              facebookInstanceId: fbInstance.id,
              isActive: true,
              messageTemplate: 'Resultado del sorteo {{gameName}} - {{drawTime}}\n\n🎯 Ganador: {{winnerNumber}} - {{winnerName}}\n\n¡Felicidades a los ganadores!',
              updatedAt: new Date()
            }
          });
        } else {
          console.log(`  ✅ Creando canal para juego ${game.name}`);
          await prisma.gameChannel.create({
            data: {
              gameId: game.id,
              channelType: 'FACEBOOK',
              facebookInstanceId: fbInstance.id,
              isActive: true,
              messageTemplate: 'Resultado del sorteo {{gameName}} - {{drawTime}}\n\n🎯 Ganador: {{winnerNumber}} - {{winnerName}}\n\n¡Felicidades a los ganadores!'
            }
          });
        }
      }

      console.log('');
    } catch (error) {
      console.error(`  ❌ Error procesando ${page.pageName}:`, error.message);
    }
  }

  console.log('✅ Importación completada!\n');
}

// Ejecutar
importFacebookTokens()
  .then(() => {
    console.log('Script finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en el script:', error);
    process.exit(1);
  });
```

### 2. Comando para ejecutar el script

```bash
cd backend
node src/scripts/import-facebook-tokens.js
```

---

## 🔐 Seguridad de Tokens

### Almacenamiento Seguro

Los tokens deben almacenarse de forma segura en la base de datos. El servicio de Facebook ya implementa encriptación básica (base64), pero se recomienda mejorar:

**Recomendaciones:**
1. ✅ Usar encriptación AES-256 para tokens en BD
2. ✅ Almacenar clave de encriptación en variable de entorno
3. ✅ Rotar tokens cada 60 días (antes de expiración)
4. ✅ Implementar renovación automática de tokens
5. ✅ Alertar a administradores 7 días antes de expiración

### Variables de Entorno Recomendadas

```bash
# .env
FACEBOOK_APP_ID=tu_app_id
FACEBOOK_APP_SECRET=tu_app_secret
FACEBOOK_ENCRYPTION_KEY=clave_secreta_32_caracteres_minimo
```

---

## 🔄 Renovación de Tokens

### Tokens de Larga Duración

Los Page Access Tokens de Facebook tienen una duración de **60 días** por defecto. Es necesario renovarlos periódicamente.

### Script de Renovación Automática

**Archivo:** `backend/src/jobs/refresh-facebook-tokens.job.js`

```javascript
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const facebookService = require('../services/facebook.service');

// Ejecutar todos los días a las 3:00 AM
cron.schedule('0 3 * * *', async () => {
  console.log('[CRON] Verificando tokens de Facebook...');

  try {
    const instances = await prisma.facebookInstance.findMany({
      where: { status: 'CONNECTED' }
    });

    for (const instance of instances) {
      // Verificar si el token está próximo a expirar (< 7 días)
      if (instance.tokenExpiresAt) {
        const daysUntilExpiry = Math.floor(
          (new Date(instance.tokenExpiresAt) - new Date()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry < 7) {
          console.log(`⚠️  Token de ${instance.pageName} expira en ${daysUntilExpiry} días`);

          // Intentar renovar (requiere implementación en facebook.service.js)
          try {
            await facebookService.refreshPageToken(instance.id);
            console.log(`✅ Token renovado para ${instance.pageName}`);
          } catch (error) {
            console.error(`❌ Error renovando token de ${instance.pageName}:`, error.message);

            // Enviar alerta a administradores
            // await notifyAdmins(`Token de Facebook ${instance.pageName} no pudo renovarse`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en job de renovación de tokens:', error);
  }
});

console.log('✅ Job de renovación de tokens de Facebook iniciado');
```

---

## ✅ Verificación de Configuración

### Test de Publicación

Para verificar que los tokens funcionan correctamente:

```bash
# 1. Autenticarse
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# 2. Listar instancias de Facebook
curl -s -X GET http://localhost:5000/api/facebook/instances \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Probar envío a una instancia
INSTANCE_ID="uuid-de-la-instancia"
curl -s -X POST http://localhost:5000/api/channels/$INSTANCE_ID/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test de publicación"
  }' | jq
```

---

## 📊 Mapeo de Juegos a Páginas

| Juego | Página de Facebook | Page ID | Token Compartido |
|-------|-------------------|---------|------------------|
| **Lotoanimalito** | Lotoanimalito | 137321016700627 | Único |
| **Loto Pantera** | Lotto pantera | 116187448076947 | Compartido |
| **Triple Pantera** | Lotto pantera | 116187448076947 | Compartido |

### Nota Importante
⚠️ Loto Pantera y Triple Pantera comparten la misma página de Facebook, por lo que las publicaciones de ambos juegos aparecerán en la misma página. Se recomienda diferenciarlas mediante el mensaje del template.

### Templates Recomendados

**Para Loto Pantera:**
```
🎰 LOTO PANTERA - Sorteo de las {{drawTime}}

🎯 Número Ganador: {{winnerNumber}} - {{winnerName}}

📅 Fecha: {{drawDate}}

¡Felicidades a todos los ganadores! 🎉
```

**Para Triple Pantera:**
```
🐆 TRIPLE PANTERA - Sorteo de las {{drawTime}}

🎯 Número Ganador: {{winnerNumber}} - {{winnerName}}

📅 Fecha: {{drawDate}}

¡Suerte en los próximos sorteos! 🍀
```

---

## 🔍 Troubleshooting

### Error: Invalid OAuth Access Token
**Causa:** Token expirado o inválido
**Solución:** Renovar el token desde Facebook Developer Console

### Error: (#200) Permissions Error
**Causa:** Falta de permisos en la página
**Solución:** Verificar que el usuario tenga rol de administrador en la página

### Error: (#100) Missing parameter
**Causa:** Falta el Page Access Token
**Solución:** Verificar que el token esté correctamente guardado en la BD

---

## 📝 Actualización del Roadmap

Esta información debe integrarse en el **ROADMAP_MEJORAS_CANALES_SORTEOS.md** en la sección de:
- **FASE 1.4: Backend - Configuración de Facebook**
- **FASE 1.8: Frontend - Página de Configuración de Facebook**

Los tokens ya están disponibles y solo requieren ser importados a la base de datos usando el script proporcionado.

---

**Última actualización:** 2025-12-24
**Estado:** ✅ Tokens Disponibles - Listos para Importar
