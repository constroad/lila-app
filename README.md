# MVP API - WhatsApp AI Agent System

Sistema completo de gestión de WhatsApp multi-sesión con agente conversacional de IA, cron jobs, generación de PDFs y más.

## 🚀 Características

- ✅ **Multi-sesión WhatsApp**: Gestión concurrente de múltiples cuentas usando Baileys
- ✅ **Agente IA Conversacional**: Bot inteligente con respuestas naturales (Claude Sonnet)
- ✅ **Cron Jobs**: Sistema de automatización programable
- ✅ **Generación de PDFs**: Templates dinámicos con Handlebars
- ✅ **API REST**: Endpoints completos para todas las operaciones
- ✅ **Logging Estructurado**: Winston para monitoreo en tiempo real
- ✅ **Rate Limiting**: Protección contra abuso de API
- ✅ **TypeScript**: Código tipado y seguro

## 📋 Requisitos

- Node.js 20+ (LTS)
- npm o yarn
- Clave API de Anthropic (Claude)

## 🔧 Instalación

1. **Clonar repositorio**
```bash
cd /Users/josezamora/projects/lila-app
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```

Editar `.env` con:
```
PORT=3000
NODE_ENV=development
ANTHROPIC_API_KEY=sk-xxxxxxxxxxxx
WHATSAPP_SESSION_DIR=./data/sessions
API_SECRET_KEY=your-secret-key
```

4. **Compilar TypeScript**
```bash
npm run build
```

## 🚀 Uso

### Desarrollo
```bash
# Resilient dev (auto-restart on crash)
npm run dev

# Direct dev (no watchdog)
npm run dev:local
```

### Producción
```bash
npm run build
npm run start
```

## 📚 Estructura del Proyecto

```
src/
├── api/
│   ├── routes/          # Definición de rutas
│   ├── controllers/     # Lógica de controladores
│   └── middlewares/     # Middlewares (auth, error, etc)
├── whatsapp/
│   ├── baileys/         # Gestión de conexiones WhatsApp
│   ├── ai-agent/        # Lógica del agente conversacional
│   │   ├── prompts/     # Templates de prompts
│   │   ├── agent.service.ts
│   │   ├── conversation.manager.ts
│   │   └── message.listener.ts
│   └── queue/           # Cola de mensajes (futuro)
├── jobs/                # Sistema de cron jobs
├── pdf/                 # Generador de PDFs
├── storage/             # Persistencia de datos
├── utils/               # Utilidades
├── config/              # Configuración
├── types/               # Tipos TypeScript
└── index.ts             # Punto de entrada
```

## 🔌 API Endpoints

### Sesiones WhatsApp

- `POST /api/sessions` - Crear nueva sesión
- `GET /api/sessions/:phoneNumber/status` - Estado de sesión
- `DELETE /api/sessions/:phoneNumber` - Desconectar sesión
- `GET /api/sessions` - Listar todas las sesiones

### Mensajes y Conversaciones

- `POST /api/messages` - Enviar mensaje
- `GET /api/messages/:sessionPhone/:chatId` - Obtener conversación
- `GET /api/messages/:sessionPhone` - Listar conversaciones
- `DELETE /api/messages/:sessionPhone/:chatId` - Cerrar conversación

### Cron Jobs

- `POST /api/jobs` - Crear job
- `GET /api/jobs` - Listar jobs
- `GET /api/jobs/:id` - Obtener job
- `PATCH /api/jobs/:id` - Actualizar job
- `DELETE /api/jobs/:id` - Eliminar job
- `POST /api/jobs/:id/run` - Ejecutar job ahora

### PDFs

- `POST /api/pdf/generate` - Generar PDF
- `POST /api/pdf/templates` - Crear template
- `GET /api/pdf/templates` - Listar templates
- `DELETE /api/pdf/templates/:templateId` - Eliminar template

## 📝 Ejemplos de Uso

### 1. Crear una sesión WhatsApp

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "51987654321"}'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "phoneNumber": "51987654321",
    "status": "waiting_qr",
    "qr": "data:image/png;base64,..."
  }
}
```

### 2. Crear un Cron Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sync daily contacts",
    "url": "http://localhost:3000/api/webhook/sync",
    "cronExpression": "0 2 * * *",
    "company": "constroad",
    "isActive": true,
    "timeout": 30000,
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMultiplier": 2
    }
  }'
```

### 3. Generar un PDF

```bash
curl -X POST http://localhost:3000/api/pdf/generate \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "quotation",
    "filename": "cotizacion-cliente.pdf",
    "data": {
      "clientName": "Juan García",
      "clientPhone": "+51 987 654 321",
      "location": "Lima, Perú",
      "date": "2025-12-28",
      "serviceType": "Colocación de Asfalto",
      "area": "500",
      "asphaltType": "Asfalto en Caliente",
      "thickness": "2 pulgadas",
      "description": "Colocación de asfalto en estacionamiento corporativo",
      "items": [
        {
          "name": "Material de asfalto",
          "quantity": "150",
          "unitPrice": "450.00",
          "total": "67500.00"
        }
      ],
      "subtotal": "67500.00",
      "tax": "12150.00",
      "total": "79650.00"
    }
  }'
```

### 4. Enviar mensaje manualmente

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "sessionPhone": "51987654321",
    "chatId": "51987654322@s.whatsapp.net",
    "message": "Hola, ¿cómo estás?"
  }'
```

## 🤖 Agente IA (María)

El agente está configurado como "María", una asesora comercial experta de CONSTROAD que:

- ✅ Identifica el tipo de servicio (venta, colocación, transporte, fabricación)
- ✅ Recopila información necesaria de forma natural
- ✅ Simula tiempo de escritura humano
- ✅ Mantiene contexto de conversaciones previas
- ✅ Deriva a humano cuando es necesario
- ✅ Respeta horarios de atención

### Prompts Disponibles

- Sistema: `src/whatsapp/ai-agent/prompts/asphalt-sales.prompt.ts`
- Totalmente personalizable y extensible

## 📊 Monitoreo

### Health Check
```bash
curl http://localhost:3000/health
```

### Estado del Sistema
```bash
curl http://localhost:3000/api/status
```

### Logs en tiempo real
Ver en la consola donde corre `npm run dev` o `npm run start`.

## 🔐 Seguridad

- Variables de entorno para secrets
- Rate limiting por IP y usuario
- API Key authentication
- Helmet para headers HTTP
- CORS configurado
- Validación de entrada con Joi

## 🚀 Deployment

```bash
npm run build
npm run start
```

## 📈 Escalabilidad

La arquitectura está diseñada para escalar:

- **Multi-sesión**: Múltiples cuentas WhatsApp en paralelo
- **Load balancing**: Compatible con reverse proxies
- **Horizontal scaling**: Uso de environment variables
- **Cache**: Conversaciones en memoria con persistencia en JSON
- **Async/Await**: Operaciones no bloqueantes

## 🐛 Troubleshooting

### Conexión WhatsApp fallida
1. Verificar API de Baileys
2. Revisar logs: `npm run logs`
3. Asegurar QR escaneado correctamente

### PDF Generator error
1. Verificar Puppeteer instalado
2. Permisos de carpeta `templates/pdf/`
3. Revisar sintaxis Handlebars

### Rate limiting
1. Usar API Key en headers
2. Ajustar límites en `.env`
3. Implementar caché

## 📝 Logs

Los logs se guardan en:
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores

## 🤝 Contribuir

1. Crear rama: `git checkout -b feature/mi-feature`
2. Commit: `git commit -m "Agregar mi feature"`
3. Push: `git push origin feature/mi-feature`
4. Pull Request

## 📄 Licencia

MIT

## 📞 Soporte

Para soporte, contactar a: info@constroad.com

---

**Made with ❤️ for CONSTROAD**
