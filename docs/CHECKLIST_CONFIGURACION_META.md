# ✅ Checklist: Configuración de Facebook e Instagram

## 🎯 Objetivo
Configurar tokens permanentes para publicar en:
- **Canal 1:** Lotoanimalito → Página "Lotoanimalito"
- **Canal 2:** Loto Pantera + Triple Pantera → Página "Lotto pantera"

---

## 📋 Pasos Rápidos

### 1️⃣ Crear App de Facebook (Una sola vez)

- [ ] Ir a https://developers.facebook.com/
- [ ] Click "My Apps" → "Create App" → "Business"
- [ ] Nombre: "Tote Web Publisher"
- [ ] Agregar producto: **Facebook Login**
- [ ] Agregar producto: **Instagram Graph API** (para Instagram)
- [ ] Anotar **App ID**: ___________________
- [ ] Anotar **App Secret**: ___________________

### 2️⃣ Configurar el Script

- [ ] Editar `backend/src/scripts/setup-meta-instances.js`
- [ ] Completar:
  ```javascript
  const META_CONFIG = {
    appId: 'TU_APP_ID_AQUI',
    appSecret: 'TU_APP_SECRET_AQUI',
    graphApiVersion: 'v18.0'
  };
  ```

### 3️⃣ Obtener User Access Token

- [ ] Ir a https://developers.facebook.com/tools/explorer/
- [ ] Seleccionar tu app
- [ ] Click "Generate Access Token"
- [ ] Seleccionar permisos:
  - [ ] `pages_show_list`
  - [ ] `pages_read_engagement`
  - [ ] `pages_manage_posts`
  - [ ] `pages_manage_engagement`
- [ ] Autorizar
- [ ] Copiar el token

### 4️⃣ Ejecutar Script de Configuración

```bash
cd backend
node src/scripts/setup-meta-instances.js
```

**Durante la ejecución:**
- [ ] Pegar el User Access Token cuando lo pida
- [ ] El script mostrará las páginas disponibles
- [ ] Para cada página:
  - [ ] Seleccionar juegos a vincular
  - [ ] Ejemplo: "1" para Lotoanimalito
  - [ ] Ejemplo: "2,3" para Loto Pantera + Triple Pantera

### 5️⃣ Verificar Configuración

```bash
node src/scripts/verify-meta-tokens.js
```

**Debe mostrar:**
- [ ] ✅ Tokens válidos para Facebook
- [ ] ✅ Tokens válidos para Instagram (si está vinculado)
- [ ] ✅ Canales activos por juego

---

## 🔍 Verificación Manual

### Facebook
```bash
# Verificar página
curl "https://graph.facebook.com/v18.0/PAGE_ID?fields=id,name&access_token=TU_TOKEN"
```

### Instagram
```bash
# Verificar cuenta
curl "https://graph.facebook.com/v18.0/INSTAGRAM_ID?fields=username&access_token=TU_TOKEN"
```

---

## 📊 Resultado Esperado

Después de completar estos pasos tendrás:

### Base de Datos
- [ ] 2 instancias de Facebook (Lotoanimalito + Lotto pantera)
- [ ] 2 instancias de Instagram (si están vinculadas)
- [ ] 3-6 canales activos (Facebook + Instagram por juego)

### Canales Configurados
- [ ] **Lotoanimalito** → Facebook "Lotoanimalito"
- [ ] **Lotoanimalito** → Instagram "Lotoanimalito" (si existe)
- [ ] **Loto Pantera** → Facebook "Lotto pantera"
- [ ] **Loto Pantera** → Instagram "Lotto pantera" (si existe)
- [ ] **Triple Pantera** → Facebook "Lotto pantera"
- [ ] **Triple Pantera** → Instagram "Lotto pantera" (si existe)

---

## 🔐 Información Importante

### Tokens Permanentes
✅ Los **Page Access Tokens** de Facebook **NO EXPIRAN**
- Son permanentes mientras la app exista
- No necesitan renovación
- Funcionan para Facebook e Instagram

### Instagram Requiere
⚠️ Para publicar en Instagram necesitas:
- [ ] Cuenta convertida a **Business** o **Creator**
- [ ] Vinculada a una página de Facebook
- [ ] Imagen obligatoria (no acepta solo texto)

---

## 🚨 Troubleshooting

### Error: "Invalid OAuth Access Token"
- Regenera el User Access Token
- Verifica que seleccionaste todos los permisos
- Ejecuta el script nuevamente

### Error: "No se encontraron páginas"
- Verifica que eres **administrador** de las páginas
- Revisa los permisos otorgados en Graph Explorer

### Instagram no aparece
- Verifica que la cuenta esté vinculada a la página de Facebook
- Convierte la cuenta a Business/Creator
- Ve a Configuración → Cuenta → Cambiar a cuenta profesional

---

## 📝 Comandos Útiles

```bash
# Configurar instancias
cd backend
node src/scripts/setup-meta-instances.js

# Verificar tokens
node src/scripts/verify-meta-tokens.js

# Ver instancias en BD
npx prisma studio
# Navega a: FacebookInstance, InstagramInstance, GameChannel
```

---

## ✅ Checklist Final

Antes de publicar el primer sorteo:
- [ ] Tokens verificados (verde en verify script)
- [ ] Canales activos en BD
- [ ] Plantillas de mensaje configuradas
- [ ] Imagen de prueba disponible
- [ ] Ejecutar prueba desde admin

---

**Tiempo estimado:** 15-20 minutos
**Dificultad:** Media
**Requisitos:** Acceso de administrador a las páginas de Facebook

---

**Última actualización:** 2025-12-24
