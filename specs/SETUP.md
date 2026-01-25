# 🚀 Guía de Configuración Inicial - MVP WhatsApp AI Agent

## Requisitos Previos

- ✅ Node.js 20+ (LTS) instalado
- ✅ npm o yarn
- ✅ Clave API de Anthropic Claude (obtenible en https://console.anthropic.com)
- ✅ Dispositivo móvil con WhatsApp activo

## 1️⃣ Instalación de Dependencias

```bash
cd /Users/josezamora/projects/mvp-api

# Instalar todas las dependencias
npm install

# El proceso puede tardar 2-3 minutos
```

**Esperado**: Ver mensaje "audited X packages in Y seconds"

---

## 2️⃣ Configuración de Variables de Entorno

```bash
# Crear archivo .env desde el ejemplo
cp .env.example .env

# Editar .env con tus valores
nano .env
```

**Valores importantes a configurar**:

```env
# ⭐ CRÍTICO - Obtenido de https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-v01-xxxxxxxxxxxxxxxxxxxxx

# Puerto donde correrá la aplicación
PORT=3000

# Ambiente de desarrollo/producción
NODE_ENV=development

# Clave secreta para API (cualquier string seguro)
API_SECRET_KEY=tu-clave-super-secreta-aqui

# Directorios de almacenamiento
WHATSAPP_SESSION_DIR=./data/sessions
PDF_TEMPLATES_DIR=./templates/pdf
PDF_UPLOADS_DIR=./uploads
CRONJOBS_STORAGE=./data/cronjobs.json

# Auto-reconexión de WhatsApp
WHATSAPP_AUTO_RECONNECT=true
WHATSAPP_MAX_RECONNECT_ATTEMPTS=5
```

---

## 3️⃣ Compilación de TypeScript

```bash
# Compilar el código
npm run build

# Esperado: Ver "✅ Build completed successfully"
```

El código compilado estará en la carpeta `dist/`.

---

## 4️⃣ Iniciar el Servidor

### Opción A: Desarrollo (recomendado para testeo)

```bash
npm run dev

# Esperado:
# ✅ Server running on port 3000
# 📊 Environment: development
```

### Opción B: Producción con PM2

```bash
npm run dev:pm2

# Ver estado
npm run logs

# Detener
npm run stop:pm2
```

---

## 5️⃣ Crear una Sesión de WhatsApp

Cuando el servidor esté corriendo, crear una nueva sesión:

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "51987654321"
  }'
```

**Respuesta esperada**:
```json
{
  "success": true,
  "data": {
    "phoneNumber": "51987654321",
    "status": "connecting",
    "message": "Session creation in progress"
  }
}
```

### Verificar Estado y Obtener QR

```bash
curl http://localhost:3000/api/sessions/51987654321/status
```

Si no está conectado, verá un QR code en la respuesta que deberá escanear con WhatsApp.

---

## 6️⃣ Enviar Primer Mensaje

Una vez la sesión esté conectada, probar enviando un mensaje:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "sessionPhone": "51987654321",
    "chatId": "51987654322@s.whatsapp.net",
    "message": "¡Hola! Bienvenido a CONSTROAD"
  }'
```

---

## ✅ Verificaciones de Salud

### Health Check del Servidor

```bash
curl http://localhost:3000/health
```

### Estado Actual del Sistema

```bash
curl http://localhost:3000/api/status
```

---

## 📊 Estructura de Datos

### Sesiones de WhatsApp

```
data/sessions/
├── 51987654321/          # Una sesión por número de teléfono
│   ├── creds.json        # Credenciales encriptadas
│   ├── auth-state.json   # Estado de autenticación
│   └── keys.json         # Claves de sesión
```

### Conversaciones

```
data/conversations/
├── 51987654321:51987654322@s.whatsapp.net.json
├── 51987654321:g.us-xxxxx.json
└── ...
```

### Archivos de Backup

```
data/backups/
├── cronjobs/
│   ├── cronjobs.json.backup-2025-12-28
│   └── ...
```

---

## 🔧 Configuración Avanzada

### Cambiar Puerto

```env
PORT=3001
```

### Cambiar Nivel de Logging

```env
LOG_LEVEL=debug    # debug, info, warn, error
```

### Ajustar Rate Limiting

```env
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100
```

### Habilitar/Deshabilitar Features

En `src/config/environment.ts`:
```typescript
features: {
  enablePDF: true,
  enableCron: true,
  enableHotReload: true,
},
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module '@anthropic-ai/sdk'"

**Solución:**
```bash
npm install @anthropic-ai/sdk
```

### Error: "ANTHROPIC_API_KEY not found"

**Solución:**
```bash
# Verificar que .env existe
cat .env | grep ANTHROPIC

# Si no está, agregarlo
echo "ANTHROPIC_API_KEY=sk-ant-xxxxxx" >> .env
```

### WhatsApp Connection Timeout

**Solución:**
```
1. Verificar que el teléfono tiene WhatsApp activo
2. Intentar de nuevo: POST /api/sessions
3. Revisar logs: npm run logs
```

### Puerto ya en uso

**Solución:**
```bash
# Cambiar puerto en .env
PORT=3001

# O matar proceso
lsof -i :3000 | grep node | awk '{print $2}' | xargs kill -9
```

### PDFs no se generan

**Solución:**
```bash
# Verificar permisos
chmod -R 755 templates/pdf uploads/

# Verificar carpetas existen
mkdir -p templates/pdf uploads/
```

---

## 📈 Monitoreo

### Ver logs en tiempo real

```bash
npm run logs

# O con tail
tail -f logs/combined.log
```

### Verificar memoria usada

```bash
# Con PM2
pm2 monit

# O ps
ps aux | grep node
```

---

## 🔐 Seguridad

### Cambiar API Key

Editar `.env`:
```env
API_SECRET_KEY=nueva-clave-super-segura
```

### Cambiar Clave Anthropic

```bash
# En console.anthropic.com, regenerar y actualizar
echo "ANTHROPIC_API_KEY=sk-ant-nueva-clave" > .env.local
source .env.local
```

### Limpiar Datos Sensibles

```bash
# Backup de sesiones
tar -czf backup-sessions-$(date +%Y%m%d).tar.gz data/sessions/

# Eliminar sesiones antiguas
rm -rf data/sessions/numero-viejo/
```

---

## 📚 Próximos Pasos

1. **Leer las especificaciones:**
   - [ESPECIFICACIONES_MVP.md](ESPECIFICACIONES_MVP.md) - Arquitectura técnica
   - [ESPECIFICACIONES_IA_BOT.md](ESPECIFICACIONES_IA_BOT.md) - Comportamiento del agente

2. **Crear primer Cron Job:**
   ```bash
   curl -X POST http://localhost:3000/api/jobs \
     -H "Content-Type: application/json" \
     -d '{...}' # Ver README.md para ejemplo completo
   ```

3. **Crear template PDF:**
   ```bash
   curl -X POST http://localhost:3000/api/pdf/templates \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```

4. **Implementar webhooks:**
   - Para cron jobs callback
   - Para notificaciones de eventos

---

## 🆘 Soporte

- **Documentación API:** Ver `README.md`
- **Arquitectura:** Ver `ESPECIFICACIONES_MVP.md`
- **Comportamiento IA:** Ver `ESPECIFICACIONES_IA_BOT.md`
- **Logs:** `logs/combined.log` y `logs/error.log`

---

**¡Listo para comenzar! 🚀**

Para cualquier problema, revisar los logs:
```bash
tail -100 logs/error.log
```

