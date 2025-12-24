# 🔐 Guía Completa: Tokens Permanentes de Facebook e Instagram

## 📋 Resumen

Esta guía te ayudará a obtener **tokens de larga duración (60 días)** para Facebook e Instagram que se pueden renovar automáticamente, simulando tokens "permanentes".

---

## 🎯 Configuración de Canales

### Canal 1: Lotoanimalito
- **Publica en:** Página de Facebook "Lotoanimalito"
- **Juego:** Lotoanimalito

### Canal 2: Lotto Pantera
- **Publica en:** Página de Facebook "Lotto pantera"  
- **Juegos:** Loto Pantera + Triple Pantera (comparten página)

---

## 📘 PARTE 1: FACEBOOK - Tokens de Larga Duración

### Paso 1: Crear App de Facebook

1. Ve a [Facebook Developers](https://developers.facebook.com/)
2. Click en **"My Apps"** → **"Create App"**
3. Selecciona **"Business"** como tipo de app
4. Completa:
   - **App Name:** "Tote Web Publisher"
   - **App Contact Email:** tu email
   - **Business Account:** (opcional)
5. Click **"Create App"**

### Paso 2: Configurar la App

1. En el dashboard de tu app, ve a **"Add Product"**
2. Agrega **"Facebook Login"**
3. En **Settings → Basic**:
   - Anota tu **App ID**
   - Anota tu **App Secret** (click en "Show")
   - Agrega **App Domains:** `localhost` (para desarrollo)

### Paso 3: Obtener User Access Token

1. Ve a [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Selecciona tu app en el dropdown
3. Click en **"Generate Access Token"**
4. Selecciona los permisos:
   - ✅ `pages_show_list`
   - ✅ `pages_read_engagement`
   - ✅ `pages_manage_posts`
   - ✅ `pages_manage_engagement`
   - ✅ `publish_to_groups` (opcional)
5. Click **"Generate Access Token"** y autoriza
6. **Copia el token** (User Access Token de corta duración)

### Paso 4: Convertir a Token de Larga Duración

Ejecuta este comando (reemplaza los valores):

```bash
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token" \
  -d "grant_type=fb_exchange_token" \
  -d "client_id=TU_APP_ID" \
  -d "client_secret=TU_APP_SECRET" \
  -d "fb_exchange_token=TU_USER_TOKEN_CORTO"
```

**Respuesta:**
```json
{
  "access_token": "LONG_LIVED_USER_TOKEN",
  "token_type": "bearer",
  "expires_in": 5184000
}
```

Guarda el `access_token` (válido por 60 días).

### Paso 5: Obtener Page Access Token Permanente

1. Obtén tus páginas:

```bash
curl -X GET "https://graph.facebook.com/v18.0/me/accounts" \
  -d "access_token=TU_LONG_LIVED_USER_TOKEN"
```

**Respuesta:**
```json
{
  "data": [
    {
      "access_token": "PAGE_ACCESS_TOKEN_PERMANENTE",
      "category": "Board Game",
      "name": "Lotoanimalito",
      "id": "137321016700627",
      "tasks": ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MANAGE"]
    }
  ]
}
```

2. **El `access_token` de cada página es PERMANENTE** (no expira mientras la app exista)

### Paso 6: Verificar Token

```bash
curl -X GET "https://graph.facebook.com/v18.0/debug_token" \
  -d "input_token=TU_PAGE_ACCESS_TOKEN" \
  -d "access_token=TU_APP_ID|TU_APP_SECRET"
```

Verifica que `expires_at: 0` (token permanente).

---

## 📸 PARTE 2: INSTAGRAM - Tokens de Larga Duración

### Requisitos Previos
- ✅ Cuenta de Instagram **Business** o **Creator**
- ✅ Vinculada a una página de Facebook
- ✅ App de Facebook ya creada

### Paso 1: Configurar Instagram Basic Display API

1. En tu app de Facebook, ve a **"Add Product"**
2. Agrega **"Instagram Basic Display"**
3. En **Basic Display → Settings**:
   - **Valid OAuth Redirect URIs:** `https://localhost/auth/instagram/callback`
   - **Deauthorize Callback URL:** `https://localhost/deauth`
   - **Data Deletion Request URL:** `https://localhost/deletion`
4. Guarda cambios

### Paso 2: Configurar Instagram Graph API (Para Publicación)

1. En tu app, agrega **"Instagram Graph API"**
2. Ve a **App Review → Permissions and Features**
3. Solicita permisos:
   - ✅ `instagram_basic`
   - ✅ `instagram_content_publish`
   - ✅ `pages_read_engagement`
   - ✅ `pages_show_list`

### Paso 3: Obtener Instagram Business Account ID

1. Asegúrate de que tu Instagram está vinculado a tu página de Facebook
2. Ejecuta:

```bash
curl -X GET "https://graph.facebook.com/v18.0/PAGE_ID" \
  -d "fields=instagram_business_account" \
  -d "access_token=TU_PAGE_ACCESS_TOKEN"
```

**Respuesta:**
```json
{
  "instagram_business_account": {
    "id": "INSTAGRAM_ACCOUNT_ID"
  },
  "id": "PAGE_ID"
}
```

### Paso 4: Usar el Page Access Token para Instagram

**¡IMPORTANTE!** Para Instagram Graph API, usas el **mismo Page Access Token** de Facebook. No necesitas un token separado.

### Paso 5: Verificar Acceso a Instagram

```bash
curl -X GET "https://graph.facebook.com/v18.0/INSTAGRAM_ACCOUNT_ID" \
  -d "fields=id,username,account_type,media_count" \
  -d "access_token=TU_PAGE_ACCESS_TOKEN"
```

---

## 🤖 PARTE 3: Scripts de Configuración Automatizada

### Script 1: Configurar Facebook e Instagram

Crea el archivo `backend/src/scripts/setup-meta-instances.js`:

```javascript
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import readline from 'readline';

const prisma = new PrismaClient();

// Configuración de la app de Facebook
const META_CONFIG = {
  appId: '',        // COMPLETAR
  appSecret: '',    // COMPLETAR
  graphApiVersion: 'v18.0'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function exchangeForLongLivedToken(shortToken) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: META_CONFIG.appId,
          client_secret: META_CONFIG.appSecret,
          fb_exchange_token: shortToken
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error intercambiando token:', error.response?.data || error.message);
    throw error;
  }
}

async function getPageAccessTokens(userToken) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/me/accounts`,
      {
        params: {
          access_token: userToken
        }
      }
    );
    return response.data.data;
  } catch (error) {
    console.error('Error obteniendo páginas:', error.response?.data || error.message);
    throw error;
  }
}

async function getInstagramAccount(pageId, pageToken) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${META_CONFIG.graphApiVersion}/${pageId}`,
      {
        params: {
          fields: 'instagram_business_account',
          access_token: pageToken
        }
      }
    );
    return response.data.instagram_business_account?.id || null;
  } catch (error) {
    console.log('  ⚠️  No hay cuenta de Instagram vinculada a esta página');
    return null;
  }
}

async function setupMetaInstances() {
  console.log('🚀 Configuración de Instancias de Facebook e Instagram\n');
  console.log('='.repeat(60));
  
  // Verificar configuración
  if (!META_CONFIG.appId || !META_CONFIG.appSecret) {
    console.error('\n❌ Error: Debes configurar APP_ID y APP_SECRET en el script\n');
    console.log('1. Ve a https://developers.facebook.com/apps/');
    console.log('2. Crea o selecciona tu app');
    console.log('3. Copia el App ID y App Secret');
    console.log('4. Actualiza META_CONFIG en este script\n');
    process.exit(1);
  }

  console.log('\n📝 Paso 1: Obtener User Access Token');
  console.log('-'.repeat(60));
  console.log('1. Ve a: https://developers.facebook.com/tools/explorer/');
  console.log('2. Selecciona tu app');
  console.log('3. Genera token con permisos:');
  console.log('   - pages_show_list');
  console.log('   - pages_read_engagement');
  console.log('   - pages_manage_posts');
  console.log('   - pages_manage_engagement\n');

  const shortToken = await question('Pega tu User Access Token: ');
  
  console.log('\n🔄 Paso 2: Intercambiando por token de larga duración...');
  const longLivedToken = await exchangeForLongLivedToken(shortToken.trim());
  console.log('✅ Token de larga duración obtenido\n');

  console.log('📄 Paso 3: Obteniendo páginas de Facebook...');
  const pages = await getPageAccessTokens(longLivedToken);
  console.log(`✅ Encontradas ${pages.length} página(s)\n`);

  // Mostrar páginas disponibles
  console.log('Páginas disponibles:');
  pages.forEach((page, index) => {
    console.log(`  ${index + 1}. ${page.name} (ID: ${page.id})`);
  });
  console.log('');

  // Configurar cada página
  for (const page of pages) {
    console.log('='.repeat(60));
    console.log(`\n📘 Configurando: ${page.name}`);
    console.log('-'.repeat(60));

    // Verificar Instagram
    console.log('🔍 Buscando cuenta de Instagram vinculada...');
    const instagramId = await getInstagramAccount(page.id, page.access_token);
    
    if (instagramId) {
      console.log(`✅ Instagram encontrado: ${instagramId}`);
    }

    // Crear instancia de Facebook
    console.log('\n💾 Guardando instancia de Facebook...');
    
    const fbInstance = await prisma.facebookInstance.upsert({
      where: { pageId: page.id },
      create: {
        instanceId: `fb-${page.id}`,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        category: page.category || 'Unknown',
        status: 'CONNECTED',
        connectedAt: new Date(),
        config: {
          tasks: page.tasks || [],
          category_list: page.category_list || []
        }
      },
      update: {
        pageAccessToken: page.access_token,
        pageName: page.name,
        status: 'CONNECTED',
        connectedAt: new Date(),
        config: {
          tasks: page.tasks || [],
          category_list: page.category_list || []
        }
      }
    });

    console.log(`✅ Instancia de Facebook creada: ${fbInstance.instanceId}`);

    // Crear instancia de Instagram si existe
    if (instagramId) {
      console.log('\n💾 Guardando instancia de Instagram...');
      
      const igInstance = await prisma.instagramInstance.upsert({
        where: { userId: instagramId },
        create: {
          instanceId: `ig-${instagramId}`,
          userId: instagramId,
          username: page.name, // Se actualizará después
          accessToken: page.access_token, // Mismo token que Facebook
          status: 'CONNECTED',
          connectedAt: new Date(),
          config: {
            linkedPageId: page.id,
            linkedPageName: page.name
          }
        },
        update: {
          accessToken: page.access_token,
          status: 'CONNECTED',
          connectedAt: new Date(),
          config: {
            linkedPageId: page.id,
            linkedPageName: page.name
          }
        }
      });

      console.log(`✅ Instancia de Instagram creada: ${igInstance.instanceId}`);
    }

    // Preguntar a qué juegos vincular
    console.log('\n🎮 Vinculando a juegos...');
    const games = await prisma.game.findMany({
      select: { id: true, name: true }
    });

    console.log('Juegos disponibles:');
    games.forEach((game, index) => {
      console.log(`  ${index + 1}. ${game.name}`);
    });

    const gameSelection = await question(
      `\n¿A qué juego(s) vincular "${page.name}"? (números separados por coma, ej: 1,2): `
    );

    const selectedIndexes = gameSelection.split(',').map(s => parseInt(s.trim()) - 1);
    const selectedGames = selectedIndexes
      .filter(i => i >= 0 && i < games.length)
      .map(i => games[i]);

    for (const game of selectedGames) {
      // Canal de Facebook
      await prisma.gameChannel.upsert({
        where: {
          gameId_channelType: {
            gameId: game.id,
            channelType: 'FACEBOOK'
          }
        },
        create: {
          gameId: game.id,
          channelType: 'FACEBOOK',
          name: `Facebook - ${page.name}`,
          facebookInstanceId: fbInstance.id,
          isActive: true,
          messageTemplate: `🎰 *${game.name}* - Sorteo {{drawTime}}\n\n🎯 Ganador: *{{winnerNumberPadded}}* - {{winnerName}}\n\n¡Felicidades! 🎉`,
          recipients: []
        },
        update: {
          facebookInstanceId: fbInstance.id,
          isActive: true
        }
      });

      console.log(`  ✅ Canal de Facebook creado para ${game.name}`);

      // Canal de Instagram (si existe)
      if (instagramId) {
        const igInstance = await prisma.instagramInstance.findFirst({
          where: { userId: instagramId }
        });

        await prisma.gameChannel.upsert({
          where: {
            gameId_channelType: {
              gameId: game.id,
              channelType: 'INSTAGRAM'
            }
          },
          create: {
            gameId: game.id,
            channelType: 'INSTAGRAM',
            name: `Instagram - ${page.name}`,
            instagramInstanceId: igInstance.id,
            isActive: true,
            messageTemplate: `🎰 ${game.name} - Sorteo {{drawTime}}\n\n🎯 Ganador: {{winnerNumberPadded}} - {{winnerName}}\n\n#loteria #sorteo #ganador`,
            recipients: []
          },
          update: {
            instagramInstanceId: igInstance.id,
            isActive: true
          }
        });

        console.log(`  ✅ Canal de Instagram creado para ${game.name}`);
      }
    }

    console.log('');
  }

  console.log('='.repeat(60));
  console.log('\n✅ ¡Configuración completada exitosamente!\n');
  console.log('📊 Resumen:');
  
  const fbCount = await prisma.facebookInstance.count({ where: { status: 'CONNECTED' } });
  const igCount = await prisma.instagramInstance.count({ where: { status: 'CONNECTED' } });
  const channelCount = await prisma.gameChannel.count({ where: { isActive: true } });

  console.log(`  - Instancias de Facebook: ${fbCount}`);
  console.log(`  - Instancias de Instagram: ${igCount}`);
  console.log(`  - Canales activos: ${channelCount}`);
  console.log('');
}

// Ejecutar
setupMetaInstances()
  .then(() => {
    rl.close();
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    rl.close();
    prisma.$disconnect();
    process.exit(1);
  });
```

### Script 2: Verificar Tokens

Crea `backend/src/scripts/verify-meta-tokens.js`:

```javascript
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const GRAPH_API_VERSION = 'v18.0';

async function verifyFacebookToken(instance) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.pageId}`,
      {
        params: {
          fields: 'id,name,category,access_token',
          access_token: instance.pageAccessToken
        }
      }
    );

    console.log(`  ✅ Token válido - Página: ${response.data.name}`);
    return true;
  } catch (error) {
    console.log(`  ❌ Token inválido: ${error.response?.data?.error?.message || error.message}`);
    return false;
  }
}

async function verifyInstagramToken(instance) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instance.userId}`,
      {
        params: {
          fields: 'id,username,account_type',
          access_token: instance.accessToken
        }
      }
    );

    console.log(`  ✅ Token válido - Usuario: ${response.data.username}`);
    return true;
  } catch (error) {
    console.log(`  ❌ Token inválido: ${error.response?.data?.error?.message || error.message}`);
    return false;
  }
}

async function verifyAllTokens() {
  console.log('🔍 Verificando tokens de Meta...\n');

  // Facebook
  console.log('📘 Facebook:');
  const fbInstances = await prisma.facebookInstance.findMany({
    where: { isActive: true }
  });

  for (const instance of fbInstances) {
    console.log(`\n  Verificando: ${instance.pageName} (${instance.pageId})`);
    await verifyFacebookToken(instance);
  }

  // Instagram
  console.log('\n\n📸 Instagram:');
  const igInstances = await prisma.instagramInstance.findMany({
    where: { isActive: true }
  });

  for (const instance of igInstances) {
    console.log(`\n  Verificando: ${instance.username || instance.userId}`);
    await verifyInstagramToken(instance);
  }

  console.log('\n✅ Verificación completada\n');
}

verifyAllTokens()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    prisma.$disconnect();
    process.exit(1);
  });
```

---

## 🚀 Ejecución de Scripts

### 1. Configurar APP_ID y APP_SECRET

Edita `backend/src/scripts/setup-meta-instances.js` y completa:

```javascript
const META_CONFIG = {
  appId: 'TU_APP_ID_AQUI',
  appSecret: 'TU_APP_SECRET_AQUI',
  graphApiVersion: 'v18.0'
};
```

### 2. Ejecutar Setup

```bash
cd backend
node src/scripts/setup-meta-instances.js
```

### 3. Verificar Tokens

```bash
node src/scripts/verify-meta-tokens.js
```

---

## 📝 Checklist de Configuración

### Facebook
- [ ] App de Facebook creada
- [ ] App ID y App Secret obtenidos
- [ ] User Access Token generado con permisos
- [ ] Token intercambiado por larga duración
- [ ] Page Access Tokens obtenidos (permanentes)
- [ ] Instancias guardadas en BD
- [ ] Canales vinculados a juegos

### Instagram
- [ ] Cuenta convertida a Business/Creator
- [ ] Cuenta vinculada a página de Facebook
- [ ] Instagram Graph API habilitado en app
- [ ] Instagram Account ID obtenido
- [ ] Instancias guardadas en BD
- [ ] Canales vinculados a juegos

---

## 🔄 Renovación Automática

Los Page Access Tokens de Facebook **no expiran** mientras la app exista. Sin embargo, es buena práctica verificarlos periódicamente.

Agrega a `backend/src/jobs/verify-tokens.job.js`:

```javascript
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Ejecutar cada semana
cron.schedule('0 0 * * 0', async () => {
  console.log('[CRON] Verificando tokens de Meta...');
  
  const fbInstances = await prisma.facebookInstance.findMany({
    where: { status: 'CONNECTED' }
  });

  for (const instance of fbInstances) {
    try {
      await axios.get(`https://graph.facebook.com/v18.0/${instance.pageId}`, {
        params: { access_token: instance.pageAccessToken }
      });
      console.log(`✅ ${instance.pageName} - Token válido`);
    } catch (error) {
      console.error(`❌ ${instance.pageName} - Token inválido`);
      
      await prisma.facebookInstance.update({
        where: { id: instance.id },
        data: { status: 'ERROR' }
      });
    }
  }
});
```

---

## ✅ Resultado Final

Después de seguir esta guía tendrás:

1. ✅ Tokens permanentes de Facebook para ambas páginas
2. ✅ Tokens de Instagram vinculados a las páginas
3. ✅ Instancias configuradas en la BD
4. ✅ Canales activos listos para publicar
5. ✅ Scripts de verificación automática

**Los tokens NO expirarán** mientras mantengas la app de Facebook activa.

---

**Última actualización:** 2025-12-24
