# 🚀 QUICK START - WhatsApp Reconnect Fix

## ✅ Lo que se Solucionó

**Problema:** lila-app borraba credenciales de WhatsApp en timeouts → Requería escanear QR repetidamente

**Solución:** Ahora preserva credenciales + crea backups automáticos + reconecta sin intervención

---

## 🧪 Testing Rápido (1 minuto)

```bash
cd /Users/josezamora/projects/lila-app

# Ejecutar script de tests
./scripts/test-reconnect.sh 51902049935
```

---

## 📊 Verificar que Funciona

### Ver Estado Actual

```bash
# Estado de sesión
curl http://localhost:3001/api/sessions/51902049935/status | jq

# Listar todas las sesiones
curl http://localhost:3001/api/sessions | jq
```

### Ver Logs en Tiempo Real

```bash
tail -f logs/combined.log | grep --color -E "preserving|backup|Reconnectable"
```

### Verificar Credenciales y Backups

```bash
# Credenciales activas
ls -lah data/sessions/51902049935/creds.json

# Backups (últimos 5 se mantienen)
ls -lah data/sessions/backups/51902049935/
```

---

## 🔄 Si Necesitas Restaurar

```bash
# Restaurar desde backup más reciente
curl -X POST http://localhost:3001/api/sessions/51902049935/restore

# Verificar que reconectó
curl http://localhost:3001/api/sessions/51902049935/status | jq
```

---

## 📖 Documentación Completa

- **[IMPLEMENTACIÓN-COMPLETADA.md](./IMPLEMENTACIÓN-COMPLETADA.md)** → Resumen visual
- **[SOLUCIÓN-WHATSAPP-RECONNECT.md](./SOLUCIÓN-WHATSAPP-RECONNECT.md)** → Documentación técnica completa

---

## 🎯 Comportamiento Esperado

| Evento | Antes (❌) | Ahora (✅) |
|--------|-----------|-----------|
| **Timeout de red** | Borra creds → Nuevo QR | Preserva creds → Auto-reconecta |
| **Logout manual** | Borra creds sin backup | Backup + Borra (recuperable) |
| **Reconexión** | Manual (escanear QR) | Automática (sin intervención) |

---

## 🚨 Si Algo Sale Mal

```bash
# 1. Revisar logs
tail -100 logs/combined.log

# 2. Restaurar desde backup
curl -X POST http://localhost:3001/api/sessions/51902049935/restore

# 3. Si no funciona, crear nueva sesión
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "51902049935"}'
```

---

**✅ Todo listo! El sistema ahora es robusto y auto-recuperable.**
