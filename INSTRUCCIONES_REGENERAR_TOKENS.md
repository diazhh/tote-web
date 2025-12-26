# 🔐 Instrucciones para Regenerar Tokens de Facebook e Instagram

## ✅ Estado Actual

- ✅ Backend actualizado para usar tokens en **texto plano** (sin encriptación corrupta)
- ✅ Script de regeneración creado y listo
- ✅ Servicios de Facebook e Instagram modificados
- ⏳ **Esperando que generes un nuevo token de Facebook**

## 📋 Pasos a Seguir

### 1. Generar Token de Acceso en Facebook

1. **Abre el Graph API Explorer:**
   - Ve a: https://developers.facebook.com/tools/explorer/

2. **Selecciona tu aplicación:**
   - En el dropdown superior, selecciona: **"Tote"** (App ID: 711190627206229)

3. **Genera el Access Token:**
   - Haz clic en **"Generate Access Token"**
   - Se abrirá una ventana pidiendo permisos
   - **Acepta todos los permisos solicitados**

4. **Permisos necesarios** (asegúrate de tenerlos):
   - `pages_show_list` - Ver lista de páginas
   - `pages_read_engagement` - Leer interacciones
   - `pages_manage_posts` - Publicar contenido
   - `instagram_basic` - Acceso básico a Instagram
   - `instagram_content_publish` - Publicar en Instagram

5. **Copia el token generado:**
   - Aparecerá un token largo (empieza con "EAAKG...")
   - **Cópialo completo**

### 2. Ejecutar el Script

El script ya está corriendo y esperando tu input. Simplemente:

1. **Pega el token** en la terminal donde está corriendo el script
2. Presiona **Enter**
3. El script automáticamente:
   - Intercambiará el token corto por uno de larga duración
   - Obtendrá los Page Access Tokens **permanentes**
   - Guardará los tokens en la base de datos en **texto plano**
   - Actualizará tanto Facebook como Instagram

### 3. Verificar Resultados

Después de que el script termine, verás un resumen como:

```
✅ PROCESO COMPLETADO
📊 Resumen:
   Facebook:
     - Actualizadas: 2
     - Creadas: 0
     - Errores: 0
   Instagram:
     - Actualizadas: 2
     - Creadas: 0
     - Errores: 0
```

## 🧪 Probar la Publicación

Una vez que los tokens estén actualizados, ejecuta:

```bash
cd /var/proyectos/tote-web/backend
node test-game-channel-publish.js
```

Esto generará una imagen negra de prueba y la publicará en Facebook e Instagram.

## 📝 Notas Importantes

### Sobre los Tokens Permanentes

Los **Page Access Tokens** generados por este método son **PERMANENTES**:
- ✅ No expiran mientras la app de Facebook exista
- ✅ No necesitan renovación periódica
- ✅ Funcionan para Facebook e Instagram (si están vinculados)

### Cambios Realizados en el Código

1. **Servicios actualizados** para NO encriptar tokens:
   - `/backend/src/services/facebook.service.js`
   - `/backend/src/services/instagram.service.js`

2. **Tokens ahora se guardan en texto plano** en la base de datos:
   - Campo `pageAccessToken` en `FacebookInstance`
   - Campo `accessToken` en `InstagramInstance`

3. **Backend reiniciado** con los cambios aplicados

## ⚠️ Seguridad

Los tokens están en texto plano en la base de datos. Asegúrate de:
- ✅ Tener acceso restringido a la base de datos
- ✅ No exponer los tokens en logs o respuestas de API
- ✅ Usar HTTPS en producción
- ✅ Considerar encriptación AES en el futuro (no base64)

## 🔧 Si Algo Sale Mal

### Token Expirado
Si el token corto ya expiró (expiran en 1-2 horas):
- Genera uno nuevo en Facebook Developers
- Vuelve a ejecutar el script

### Error de Permisos
Si falta algún permiso:
- Ve a Facebook Developers → Tu App → Permissions
- Solicita los permisos faltantes
- Genera un nuevo token con todos los permisos

### Error de Base de Datos
Si hay error al guardar:
- Verifica que el backend esté corriendo
- Verifica la conexión a PostgreSQL
- Revisa los logs: `pm2 logs tote-backend`

## 📞 Comandos Útiles

```bash
# Ver estado de instancias
node check-instances.js

# Verificar tokens de Facebook
node check-facebook-token.js

# Probar publicación
node test-game-channel-publish.js

# Ver logs del backend
pm2 logs tote-backend

# Reiniciar backend
pm2 restart tote-backend
```

## ✨ Resultado Esperado

Después de completar estos pasos:
- ✅ Facebook e Instagram tendrán tokens válidos y permanentes
- ✅ Podrás publicar imágenes automáticamente
- ✅ Los botones "Probar" en el frontend funcionarán correctamente
- ✅ El sistema estará listo para publicar sorteos

---

**Estado del script:** ⏳ Esperando que pegues el token en la terminal

**Próximo paso:** Genera el token en Facebook Developers y pégalo en el script
