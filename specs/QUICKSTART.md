# 🚀 QUICKSTART - Inicio Rápido

## 5 Minutos para tener todo corriendo

### 1. Clonar y Preparar

```bash
cd /Users/josezamora/projects/mvp-api
npm install
cp .env.example .env
```

### 2. Configurar API Key

Editar `.env` y añadir tu clave de Anthropic:

```bash
# Obtenible en: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

### 3. Compilar y Ejecutar

```bash
npm run build
npm run dev
```

Verás:
```
✅ Server running on port 3000
📊 Environment: development
```

### 4. Crear Sesión WhatsApp

En otra terminal:

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "51987654321"}'
```

Escanea el QR con tu teléfono.

### 5. Verificar Estado

```bash
curl http://localhost:3000/api/sessions/51987654321/status
```

---

## Estructura del Proyecto

```
mvp-api/
├── src/
│   ├── api/             # Rutas y controladores
│   ├── whatsapp/        # Lógica de WhatsApp e IA
│   ├── jobs/            # Cron jobs
│   ├── pdf/             # Generación de PDFs
│   ├── storage/         # Persistencia de datos
│   ├── utils/           # Funciones auxiliares
│   ├── config/          # Configuración
│   └── index.ts         # Entrada principal
├── data/                # Almacenamiento local
│   ├── sessions/        # Sesiones de WhatsApp
│   ├── conversations/   # Conversaciones guardadas
│   ├── backups/         # Backups automáticos
│   └── cronjobs.json    # Configuración de jobs
├── templates/           # Templates (HTML, etc)
│   └── pdf/            # Templates Handlebars para PDFs
├── dist/                # Código compilado (generado)
├── logs/                # Archivos de log
└── uploads/             # PDFs y files generados
```

---

## Endpoints Principales

### Sesiones
- `POST /api/sessions` - Crear sesión
- `GET /api/sessions/:phone/status` - Estado
- `DELETE /api/sessions/:phone` - Desconectar

### Mensajes
- `POST /api/messages` - Enviar mensaje
- `GET /api/messages/:phone/:chatId` - Ver conversación
- `GET /api/messages/:phone` - Listar conversaciones

### Cron Jobs
- `POST /api/jobs` - Crear job
- `GET /api/jobs` - Listar jobs
- `POST /api/jobs/:id/run` - Ejecutar ahora

### PDFs
- `POST /api/pdf/generate` - Generar PDF
- `POST /api/pdf/templates` - Crear template
- `GET /api/pdf/templates` - Listar templates

---

## Agente IA (María)

El bot está configurado como "María", una asesora de CONSTROAD que:

✅ Identifica servicios (venta, colocación, transporte, fabricación)
✅ Recopila información de forma natural
✅ Simula escritura humana
✅ Mantiene contexto de conversaciones
✅ Deriva a humano cuando es necesario

### Prompts

Se pueden personalizar en:
`src/whatsapp/ai-agent/prompts/asphalt-sales.prompt.ts`

---

## Comando Rápidos

```bash
# Desarrollo
npm run dev

# Build
npm run build

# Producción con PM2
npm run dev:pm2

# Ver logs
npm run logs

# Limpiar node_modules
rm -rf node_modules && npm install

# Verificar compilación
ls -lah dist/index.js
```

---

## Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| "Cannot find module" | `npm install` |
| Puerto en uso | Cambiar PORT en .env |
| API Key no funciona | Verificar en https://console.anthropic.com/ |
| QR no aparece | Revisar `npm run logs` |
| PDF error | `mkdir -p templates/pdf uploads/` |
| Sesión no conecta | Escanear QR nuevamente |

---

## Siguientes Pasos

1. **Leer las especificaciones:**
   - [SETUP.md](SETUP.md) - Configuración detallada
   - [ESPECIFICACIONES_MVP.md](ESPECIFICACIONES_MVP.md) - Arquitectura
   - [ESPECIFICACIONES_IA_BOT.md](ESPECIFICACIONES_IA_BOT.md) - IA

2. **Crear un Cron Job ejemplo**

3. **Generar un PDF desde template**

4. **Personalizar el agente IA**

---

**¡Todo listo! 🎉**

Cualquier duda, revisar los logs:
```bash
tail -50 logs/error.log
```
