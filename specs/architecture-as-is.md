# Arquitectura As-Is - lila-app

## Resumen
Sistema API en Node.js/TypeScript que expone endpoints para:
- Gestionar sesiones WhatsApp con Baileys (multi-sesion).
- Enviar mensajes y archivos por WhatsApp.
- Ejecutar cron jobs (API o envio de mensajes).
- Generar PDFs desde templates Handlebars y desde plantillas PDF (vale).
- Publicar un mini "drive" local con exploracion y preview de PDF.
- Integrar un agente de IA con Anthropic (Claude) para respuestas automaticas.

La aplicacion es monolitica, con servicios internos organizados por feature en `src/` y persistencia local en `data/`.

## Contexto y objetivos (as-is)
- WhatsApp como canal principal de mensajeria.
- IA orientada a ventas/operaciones (prompt de asfalto) para conversaciones.
- Automatizacion via cron jobs y generacion de documentos.
- Operacion en un solo proceso Node, con opcion de PM2.

## Componentes principales
- HTTP API (Express) en `src/index.ts`.
- WhatsApp:
  - Conexion y sesiones: `src/whatsapp/baileys/connection.manager.ts`.
  - Agente IA: `src/whatsapp/ai-agent/agent.service.ts`.
  - Conversaciones: `src/whatsapp/ai-agent/conversation.manager.ts`.
  - Listener de mensajes: `src/whatsapp/ai-agent/message.listener.ts`.
- Cron jobs: `src/jobs/scheduler.service.ts`.
- PDFs:
  - HTML/Handlebars + Puppeteer: `src/pdf/generator.service.ts`.
  - Render/preview de PDFs: `src/pdf/render.service.ts`.
  - Vale PDF con coordenadas: `src/api/controllers/pdf-vale.controller.ts`.
- Drive local: `src/api/controllers/drive.controller.ts` + `src/storage/drive.store.ts`.
- Persistencia JSON: `src/storage/json.store.ts`.
- Observabilidad: `src/utils/logger.ts`.

## Diagrama logico (alto nivel)
```
[Clients]
   | HTTP
   v
[Express API]-------------------------------+
   |                                         |
   | uses                                    | serves
   v                                         v
[WhatsApp ConnectionManager]           [Static Files]
   |                                         |
   | events                                  | /files (drive)
   v                                         | /pdf-temp
[Message Listener]                           |
   |                                         v
   | -> AgentService (Claude)           [Local FS]
   v
[ConversationManager -> JsonStore]

[JobScheduler] -> (API call via axios) / (WhatsApp message)
[PDF Generator] -> Puppeteer -> uploads/
[PDF Render] -> pdfjs + canvas -> drive-cache/
```

## Flujos principales

### 1) Inicio del servidor
- `src/index.ts` crea Express, aplica helmet/cors, parsing JSON, logging y rate limit.
- Inicializa servicios:
  - PDF Generator (Puppeteer) y asegura `data/pdf-temp`.
  - Job Scheduler (carga jobs persistidos y programa activos).
  - Reconexion de sesiones WhatsApp guardadas.
- Expone UI de Swagger en `/docs` usando `src/api/docs/openapi.ts`.
- Limpieza semanal del directorio `data/pdf-temp` con `node-cron`.

### 2) Sesiones WhatsApp
- Endpoint `POST /api/sessions` y alias `POST /api/session`.
- `ConnectionManager` crea socket Baileys, guarda credenciales multi-archivo en `data/sessions/{phone}`.
- QR disponible en `GET /api/sessions/:phone/qr` (PNG o JSON).
- Estado en `GET /api/sessions/:phone/status`.
- Reconexion automatica segun `config.whatsapp.autoReconnect`.

### 3) Envio de mensajes
- Endpoints bajo `/api/message` (texto, imagen, video, archivo) usando multer en memoria.
- `message.controller.ts` valida parametros, normaliza destinatario y usa Baileys `sendMessage`.

### 4) Mensajes entrantes y agente IA
- `ConnectionManager` escucha `messages.upsert` y pasa a `MessageListener`.
- **As-is**: `MessageListener.handleIncomingMessage` retorna al inicio (IA deshabilitada temporalmente).
- Si se habilita, flujo esperado:
  - Se crea/recupera conversacion en `ConversationManager`.
  - Se llama a Claude (Anthropic) con prompt y contexto.
  - Se simula escritura humana y se responde por WhatsApp.

### 5) Cron jobs
- CRUD en `/api/jobs`.
- `JobScheduler` persiste en `data/cronjobs.json` via `JsonStore`.
- Dos tipos de job:
  - `api`: request GET via axios con timeout.
  - `message`: envio WhatsApp usando `ConnectionManager`.
- Historial basico en el mismo JSON (max 10 entradas).

### 6) PDFs
- `POST /api/pdf/generate`: usa Handlebars + Puppeteer y guarda en `uploads/`.
- `POST /api/pdf/templates`: crea template `.hbs` en `templates/pdf/`.
- `POST /api/pdf/generate-vale`: llena una plantilla PDF (por defecto `templates/pdf/plantilla_dispatch_note.pdf`) con coordenadas y opcionalmente notifica por WhatsApp/Telegram.
- `GET /api/pdf/templates/preview-grid`: genera preview con grilla para ubicar coordenadas.

### 7) Drive local y preview PDF
- `GET /api/drive/list`, `POST /api/drive/files`, etc. manejan archivos en `data/drive`.
- Se publica contenido en `config.drive.publicBaseUrl` (default `/files`).
- `drive-pdf.controller.ts` renderiza paginas PDF a PNG y guarda cache en `data/drive-cache`.

## Persistencia y artefactos
- `data/sessions/`: credenciales y estado de Baileys por sesion.
- `data/conversations/`: conversaciones por chat via `JsonStore`.
- `data/cronjobs.json`: definicion e historial de cron jobs.
- `data/drive/`: almacenamiento de archivos.
- `data/drive-cache/`: cache de previews PDF.
- `data/pdf-temp/`: temporales PDF (limpieza semanal).
- `uploads/`: PDFs generados.
- `logs/`: logs de Winston (error.log, combined.log).
- `dist/`: salida compilada (generada).

## Configuracion
Definida en `src/config/environment.ts` y alimentada por `.env` / `.env.development`.
Principales claves:
- `PORT`, `NODE_ENV`.
- `ANTHROPIC_API_KEY`.
- `WHATSAPP_SESSION_DIR`, `WHATSAPP_AUTO_RECONNECT`, `WHATSAPP_AI_ENABLED`, `WHATSAPP_AI_TEST_NUMBER`.
- `CRONJOBS_STORAGE`.
- `PDF_TEMPLATES_DIR`, `PDF_UPLOADS_DIR`, `PDF_TEMP_DIR`, `PDF_TEMP_PUBLIC_BASE_URL`.
- `DRIVE_ROOT_DIR`, `DRIVE_PUBLIC_BASE_URL`, `DRIVE_CACHE_DIR`, `DRIVE_MAX_FILE_SIZE_MB`.
- `API_SECRET_KEY`, `RATE_LIMIT_MAX`, `LOG_LEVEL`, `LOG_DIR`.

## Seguridad y observabilidad
- `helmet` y `cors` habilitados globalmente.
- Rate limiting por IP en `apiLimiter` con excepciones por host/origin.
- `validateApiKey` existe pero no esta aplicado en rutas (as-is).
- Winston escribe logs estructurados en `logs/`.

## Ejecucion y build
- `npm run dev`: `tsx src/index.ts`.
- `npm run build`: bundle con esbuild a `dist/`.
- `npm start`: ejecuta `dist/index.js`.

## Dependencias externas
- WhatsApp: `@whiskeysockets/baileys`.
- IA: `@anthropic-ai/sdk`.
- Cron: `node-cron`.
- HTTP jobs: `axios`.
- PDF: `puppeteer`, `handlebars`, `pdf-lib`, `pdfjs-dist`, `@napi-rs/canvas`.
- API: `express`, `helmet`, `cors`, `express-rate-limit`, `multer`.

## Observaciones as-is
- Listener de IA esta deshabilitado por un `return` temprano en `message.listener.ts`.
- Endpoints de mensajes se montan bajo `/api/message` (singular), mientras que la documentacion menciona `/api/messages`.
- Seguridad por API key no esta aplicada en las rutas (solo existe helper y excepciones en rate limiter).
- PDFs generados con Puppeteer requieren entorno con Chromium y permisos adecuados.
