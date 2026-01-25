# ✅ Siguientes Pasos - MVP API

La aplicación WhatsApp AI Agent ha sido completamente construida. Aquí está el camino para ponerla en funcionamiento:

## 🚀 Paso 1: Obtener API Key (5 minutos)

```bash
# 1. Ir a https://console.anthropic.com
# 2. Click en "API Keys" en el panel izquierdo
# 3. Click en "Create Key"
# 4. Copiar la clave (aparece solo una vez)
# 5. Guardar en lugar seguro
```

## 🔧 Paso 2: Configurar Variables de Entorno (2 minutos)

```bash
# Editar archivo .env en la raíz del proyecto
cp .env.example .env

# Agregar tu ANTHROPIC_API_KEY al archivo:
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# Variables opcionales (ya tienen valores por defecto):
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
DATA_DIR=./data
UPLOADS_DIR=./uploads
```

## 📦 Paso 3: Verificar Instalación (1 minuto)

```bash
# Verificar que npm install fue completado
npm list | head -20

# Verificar que la compilación está lista
ls -lh dist/index.js
# Debe mostrar un archivo de ~142KB
```

## ▶️ Paso 4: Iniciar Servidor (2 minutos)

### Desarrollo (con hot-reload):
```bash
npm run dev
# Servidor corriendo en http://localhost:3000
```

### Producción (con PM2):
```bash
npm run dev:pm2
# Verifica con: pm2 list
```

## 🧪 Paso 5: Crear Sesión WhatsApp (5 minutos)

Abre nueva terminal:

```bash
# Crear una nueva sesión WhatsApp
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-1", "phoneNumber": "+51900000000"}'

# Respuesta esperada:
# {
#   "success": true,
#   "sessionId": "session-1",
#   "status": "connecting",
#   "qrCode": "data:image/png;base64,..."
# }
```

**Guardar la URL del código QR en el navegador o usar curl para obtenerla:**

```bash
curl -s http://localhost:3000/api/sessions/session-1 | grep -o '"qrCode":"[^"]*"'
```

**Escanear con WhatsApp Mobile:**
1. Abre WhatsApp en tu teléfono
2. Ve a Settings → Linked Devices
3. Click en "Link a Device"
4. Escanea el código QR

La sesión está lista cuando ves `"status": "ready"`

## 💬 Paso 6: Enviar Mensaje de Prueba (2 minutos)

```bash
# Enviar mensaje a un contacto
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-1",
    "phoneNumber": "+51987654321",
    "message": "Hola! Quiero saber sobre sus servicios"
  }'

# El bot "María" responderá automáticamente con su persona de vendedora
```

## 📅 Paso 7: Crear Cron Job (3 minutos)

```bash
# Crear un job que se ejecuta cada 24 horas
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reporte-diario",
    "cron": "0 9 * * *",
    "description": "Envía reporte de ventas cada mañana a las 9am",
    "metadata": {
      "type": "daily-report",
      "recipients": ["+51987654321"]
    }
  }'

# Ver todos los jobs:
curl http://localhost:3000/api/jobs

# Ejecutar un job manualmente:
curl -X POST http://localhost:3000/api/jobs/reporte-diario/run
```

## 📄 Paso 8: Generar PDF (2 minutos)

```bash
# Primero, crear una plantilla (ya existe quotation.hbs)
# Generar un PDF de cotización
curl -X POST http://localhost:3000/api/pdf/generate \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "quotation",
    "data": {
      "clientName": "Juan Pérez",
      "serviceType": "Venta",
      "description": "Asfalto tipo A",
      "quantity": 100,
      "unit": "m3",
      "pricePerUnit": 250,
      "total": 25000
    },
    "filename": "cotizacion-juan-perez.pdf"
  }'

# El PDF se guardará en uploads/
```

## 🔍 Paso 9: Verificar Conversación (2 minutos)

```bash
# Ver historial de conversación con un contacto
curl "http://localhost:3000/api/messages/conversations/session-1?phoneNumber=%2B51987654321"

# Respuesta incluye:
# - Mensajes enviados y recibidos
# - Estado de la conversación
# - Datos recolectados por el bot
# - Timestamps de cada mensaje
```

## 📚 Documentación Disponible

- **[README.md](README.md)** - Documentación completa de API (todos los endpoints)
- **[SETUP.md](SETUP.md)** - Guía detallada de configuración
- **[QUICKSTART.md](QUICKSTART.md)** - Inicio rápido en 5 minutos
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Resumen técnico del proyecto

## 🆘 Solución de Problemas

### Error: "Cannot find module '@anthropic-ai/sdk'"
```bash
# Reinstalar dependencias
npm install
npm run build
```

### El QR code no aparece
```bash
# Reiniciar servidor
npm run dev

# Crear nueva sesión
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-test", "phoneNumber": "+51900000001"}'
```

### Whatsapp muestra "connecting" pero no se conecta
1. Verifica que tienes conexión a internet
2. Intenta con un código QR nuevo
3. Verifica que no estés logueado en otra sesión web de WhatsApp
4. Revisa logs: `tail -f logs/combined.log`

### El bot no responde
1. Verifica que ANTHROPIC_API_KEY está correcto en .env
2. Revisa logs de error: `grep "error\|Error" logs/error.log`
3. Verifica que el servidor está en modo dev: `npm run dev`

## 📊 Monitoreo

```bash
# Ver logs en tiempo real
tail -f logs/combined.log

# Ver solo errores
tail -f logs/error.log

# Con PM2 (producción)
pm2 logs
pm2 monit  # Monitor interactivo
```

## 🛑 Detener la Aplicación

```bash
# Desarrollo (Ctrl+C en la terminal)

# Producción con PM2
pm2 stop mvp-api
pm2 delete mvp-api
```

## 📞 Contacto y Soporte

Para preguntas sobre la arquitectura o implementación, revisa:
- `src/index.ts` - Punto de entrada principal
- `src/whatsapp/ai-agent/prompts/asphalt-sales.prompt.ts` - Persona de María
- `src/api/controllers/` - Lógica de endpoints
- `src/jobs/scheduler.service.ts` - Sistema de jobs
- `src/pdf/generator.service.ts` - Generación de PDFs

---

**Status**: ✅ Aplicación lista para producción
**Última actualización**: Hoy
**Versión**: 1.0.0-mvp
