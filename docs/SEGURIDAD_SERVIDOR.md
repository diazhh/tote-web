# Configuración de Seguridad del Servidor

## 📋 Resumen

Este documento detalla todas las medidas de seguridad implementadas en el servidor **144.126.150.120** para proteger la aplicación Tote-Web contra ataques.

**Fecha de implementación**: 24 de diciembre de 2025

---

## 🔥 Firewall UFW

### Estado
✅ **Activo y habilitado en el inicio del sistema**

### Reglas Configuradas
```bash
# Ver estado
sudo ufw status verbose

# Reglas activas:
- Puerto 22/tcp  → SSH (ALLOW)
- Puerto 80/tcp  → HTTP (ALLOW)
- Puerto 443/tcp → HTTPS (ALLOW)

# Política por defecto:
- Incoming: DENY (bloquea todo lo demás)
- Outgoing: ALLOW (permite salida)
```

### Comandos Útiles
```bash
# Ver estado
sudo ufw status

# Agregar regla
sudo ufw allow [puerto]/tcp

# Eliminar regla
sudo ufw delete allow [puerto]/tcp

# Deshabilitar (solo en emergencias)
sudo ufw disable

# Habilitar
sudo ufw enable
```

---

## 🛡️ HAProxy - Rate Limiting

### Protección Implementada

**Rate Limiting**: 100 requests por 10 segundos por IP
- Si una IP excede este límite, recibe HTTP 429 (Too Many Requests)
- Protege contra ataques DDoS y fuerza bruta

**Timeouts de Seguridad**:
- `http-request`: 10 segundos
- `http-keep-alive`: 5 segundos
- Protege contra ataques de conexiones lentas (Slowloris)

**Límites de Conexión**:
- Máximo 1000 conexiones simultáneas por backend
- Previene saturación del servidor

### Configuración
Archivo: `/etc/haproxy/haproxy.cfg`

```bash
# Ver configuración
sudo cat /etc/haproxy/haproxy.cfg

# Verificar configuración
sudo haproxy -c -f /etc/haproxy/haproxy.cfg

# Reiniciar HAProxy
sudo systemctl restart haproxy

# Ver logs
sudo tail -f /var/log/haproxy.log
```

### Backup
Backup de configuración original: `/etc/haproxy/haproxy.cfg.backup`

---

## 🔐 PostgreSQL - Seguridad de Base de Datos

### Configuración Segura
✅ **Solo acepta conexiones locales (localhost)**

**Puerto**: 5433 (no estándar, más seguro)
**Escucha en**: 127.0.0.1 y ::1 (solo localhost)

### Verificación
```bash
# Ver puertos escuchando
sudo ss -tlnp | grep 5433

# Debe mostrar solo 127.0.0.1:5433 y [::1]:5433
```

### Autenticación
- Método: `scram-sha-256` (más seguro que MD5)
- Usuario: `tote_user`
- Base de datos: `tote_db`

---

## 🔄 Actualizaciones Automáticas de Seguridad

### Estado
✅ **Activo y configurado**

### Configuración
- Actualiza paquetes de seguridad automáticamente
- Limpia paquetes antiguos cada 7 días
- **NO reinicia automáticamente** el servidor

### Archivos de Configuración
- `/etc/apt/apt.conf.d/20auto-upgrades`
- `/etc/apt/apt.conf.d/50unattended-upgrades`

### Verificación
```bash
# Ver estado del servicio
sudo systemctl status unattended-upgrades

# Ver logs de actualizaciones
sudo cat /var/log/unattended-upgrades/unattended-upgrades.log
```

---

## ❌ Fail2ban - DESHABILITADO

### Estado
⚠️ **DESHABILITADO INTENCIONALMENTE**

### Razón
- IP dinámica del administrador
- Riesgo de auto-bloqueo
- La protección se logra con UFW + HAProxy rate limiting

### Si necesitas habilitarlo
```bash
# Editar configuración para agregar IP fija en whitelist
sudo nano /etc/fail2ban/jail.local

# Agregar en [DEFAULT]:
ignoreip = 127.0.0.1/8 ::1 TU_IP_FIJA

# Habilitar
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 🔍 Monitoreo y Verificación

### Verificar Estado de Servicios
```bash
# Firewall
sudo ufw status

# HAProxy
sudo systemctl status haproxy

# PostgreSQL
sudo systemctl status postgresql

# Aplicaciones
pm2 status

# Puertos abiertos
sudo ss -tlnp | grep -E ':(22|80|443|3000|3001|5433)'
```

### Verificar Logs
```bash
# Logs de autenticación SSH
sudo tail -f /var/log/auth.log

# Logs de HAProxy
sudo tail -f /var/log/haproxy.log

# Logs del sistema
sudo journalctl -f
```

### Verificar Conexiones Activas
```bash
# Ver conexiones por IP
sudo netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -n

# Ver conexiones a aplicaciones
sudo ss -tnp | grep -E ':(3000|3001)'
```

---

## 🚨 Qué Hacer en Caso de Ataque

### 1. Identificar el Ataque
```bash
# Ver IPs con más conexiones
sudo netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20

# Ver logs de HAProxy para rate limiting
sudo grep "429" /var/log/haproxy.log | tail -20
```

### 2. Bloquear IP Específica
```bash
# Bloquear IP con UFW
sudo ufw deny from [IP_ATACANTE]

# Ver IPs bloqueadas
sudo ufw status numbered
```

### 3. Desbloquear IP
```bash
# Ver reglas numeradas
sudo ufw status numbered

# Eliminar regla por número
sudo ufw delete [NÚMERO]
```

### 4. Reiniciar Servicios si es Necesario
```bash
# Reiniciar HAProxy
sudo systemctl restart haproxy

# Reiniciar aplicaciones
pm2 restart all
```

---

## 📊 Puertos y Servicios

| Puerto | Servicio | Acceso | Protección |
|--------|----------|--------|------------|
| 22 | SSH | Público | UFW |
| 80 | HTTP (HAProxy) | Público | UFW + Rate Limiting |
| 443 | HTTPS (HAProxy) | Público | UFW + Rate Limiting |
| 3000 | Frontend (Next.js) | Solo localhost | No expuesto |
| 3001 | Backend (Node.js) | Solo localhost | No expuesto |
| 5433 | PostgreSQL | Solo localhost | No expuesto |

---

## ✅ Checklist de Seguridad

- [x] Firewall UFW activo con reglas restrictivas
- [x] HAProxy con rate limiting (100 req/10s)
- [x] PostgreSQL solo en localhost
- [x] Actualizaciones automáticas de seguridad
- [x] Puertos de aplicación no expuestos públicamente
- [x] Timeouts configurados contra ataques lentos
- [x] Límites de conexiones por backend
- [ ] Fail2ban (deshabilitado por IP dinámica)
- [ ] Certificados SSL renovación automática (pendiente)
- [ ] Backups automáticos (pendiente)

---

## 🔧 Mantenimiento Regular

### Semanal
```bash
# Verificar logs de seguridad
sudo tail -100 /var/log/auth.log | grep -i "failed\|invalid"

# Verificar actualizaciones pendientes
sudo apt update && sudo apt list --upgradable
```

### Mensual
```bash
# Revisar reglas de firewall
sudo ufw status numbered

# Verificar usuarios del sistema
sudo cat /etc/passwd | grep -v nologin

# Revisar procesos sospechosos
ps aux | grep -v "\[" | sort -k3 -rn | head -10
```

---

## 📞 Contacto y Soporte

**Servidor**: 144.126.150.120
**Dominios**: 
- Frontend: tote.atilax.io
- Backend: toteback.atilax.io

**Acceso SSH**: `ssh root@144.126.150.120`

---

## 📝 Notas Importantes

1. **IP Dinámica**: Si tu IP cambia frecuentemente, NO uses Fail2ban o agrégala a whitelist
2. **Backups**: Realiza backups regulares de la base de datos
3. **Monitoreo**: Revisa logs regularmente para detectar patrones de ataque
4. **Actualizaciones**: El sistema se actualiza automáticamente, pero revisa logs
5. **Certificados SSL**: Cloudflare maneja SSL, pero verifica renovación de certificados locales

---

**Última actualización**: 24 de diciembre de 2025
**Versión**: 1.0
