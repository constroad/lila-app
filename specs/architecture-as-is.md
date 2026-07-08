# Arquitectura As-Is - lila-app

> **Ultima actualizacion:** Junio 2026
> **Documentos relacionados:**
> - `docs/tailscale-funnel.spec.md`
> - `docs/handoff-portal-resiliencia.md`
> - `specs/SCALABILITY-MULTI-SESSION.spec.md` (escalabilidad + RLS + persistencia; reemplaza al viejo `../MULTI-SESSION-WHATSAPP.SPEC.md`)
> - `../STREAMING-THUMBNAILS-LILA-APP.spec.md`
> - `../architecture.AS-IS.spec.md` (vision plataforma Portal + lila-app)

## Resumen
Microservicio Node.js/TypeScript (Express, ESM) que actua como worker multi-tenant del Portal. Funciones principales:
- Sesiones WhatsApp con Baileys (multi-empresa, una sesion por company).
- Envio de mensajes/archivos por WhatsApp y cron jobs.
- Generacion documental (PDF Handlebars/Puppeteer + plantillas PDF con coordenadas) con membrete por empresa.
- Drive local multi-tenant (`/mnt/constroad-storage/companies/{companyId}/`) con thumbnails y preview de PDF.
- Recepcion publica de archivos (inputs, mediciones, movimientos financieros) y callbacks de vuelta al Portal.
- Generacion de informes de servicio (VAL-SRV, ACT-CNF, CONT-SRV, LIQ-SRV, control de pista, imprimacion, IAA, etc.).
- Migracion cross-company de ordenes/servicios.
- Cola persistente de alertas Telegram con flush en background.
- Validacion de quotas leyendo MongoDB del Portal directamente.

El servicio sigue siendo monolitico pero con servicios desacoplados en `src/services/` y controllers por dominio en `src/api/controllers/`.

## Contexto e integracion con Portal
- **Frontend (Portal):** migrando progresivamente de Chakra UI v2 a **shadcn/ui + Tailwind** (publico mobile-first, admin desktop-first; branding de company = acento). Esto es solo capa de UI del Portal; **no afecta a lila-app** (este backend no tiene UI/React/Chakra). Detalle en `../Portal/specs/ARCHITECTURE-Portal.as-is.md` §17 y `../Portal/MIGRATION-SHADCN*.SPEC.md`. Los contratos HTTP/JWT y los callbacks de cliente no cambian con la migracion.
- Comunicacion Portal -> lila-app: HTTP + JWT (`JWT_SECRET` aqui = `LILA_APP_JWT_SECRET` en Portal).
- Comunicacion lila-app -> Portal MongoDB: directa via mongoose (read-only para quotas y catalogos compartidos).
- Comunicacion lila-app -> Portal HTTP: callbacks JWT (5 min de TTL) para acciones de cliente (reportes, dispatch updates).
- API Keys publicas formato `lk_fe_{companyId}_{secret}` (hash SHA-256 en MongoDB), validadas para uploads publicos.

## Componentes principales

### HTTP API (Express, `src/index.ts`)
- helmet/cors dinamico (`LILA_APP_CORS_ORIGINS`), parsing, rate limit, request logger.
- `trust proxy` configurable (`TRUST_PROXY`).
- Swagger en `/docs`.
- Static serving multi-tenant en `/files/companies/{companyId}/...`.

### WhatsApp (Baileys)
- Sesiones "simple" basadas en diccionario en memoria: `src/whatsapp/baileys/sessions.simple.ts` (modelo final tras refactors; no usa el `ConnectionManager` original).
- Controller: `src/api/controllers/session.controller.simple.ts`.
- Envio de mensajes: `src/api/controllers/message.controller.simple.ts`.
- Servicio directo: `src/services/whatsapp-direct.service.ts`.
- **Send-proxy dev (julio 2026):** con `WHATSAPP_PROXY_TARGET_URL` seteada (base URL de prod con `/api`, ej. Tailscale) y `nodeEnv !== 'production'`, los 4 métodos de envío de `whatsapp-direct.service.ts` hacen early-return a `src/services/whatsapp-proxy.service.ts`, que reenvía a `/message/:sender/{text|image|video|file}` de PROD con un JWT de tenant corto (5 min) firmado con el `JWT_SECRET` compartido — el payload lleva el CAMPO `companyId` del schema Company (NO el `_id`), que es lo que compara `requireSenderOwnership`. Así lila local prueba flujos e2e con mensajes reales sin abrir sockets (evita guerra 440); prod aplica su pipeline completo (ownership, routing, outbox 202→`{queued:true}`, conteo de quota — sin doble conteo porque el early-return salta el conteo local). Buffers locales viajan como multipart (límite multer prod: 10 MB); `filePath`/`fileUrl` se reenvían tal cual. `createSession` lanza error con proxy activo (no abrir sockets locales). Las LECTURAS de sesión (`/groups`, `/contacts`, `/syncGroups`) también se proxean (pass-through de `proxySessionRead`, espejando el status de prod): el store local solo se puebla con socket, así que sin proxy devolvían 503. Las alertas Telegram llevan prefijo `[DEV] ` cuando `nodeEnv !== 'production'` (mismo bot/canal que prod; el prefijo se aplica en `sendOnce`, cubre directas y cola). En producción la env se ignora con warning. Alternativa full-fidelity (socket local, entrantes): `specs/SESSION-LEASE.spec.md` (propuesto, no implementado).
- Listener IA de Anthropic existe (`src/whatsapp/ai-agent/*`) pero esta deshabilitado en produccion (early return en `message.listener.ts`, flag `WHATSAPP_AI_ENABLED`).
- Una sesion por empresa, credenciales en `data/sessions/{companyPhone}` (volumen montado).
- **Auth de rutas de sesion (`/api/sessions/*` state-changing):** middleware `requireTenantOrApiKey` (junio 2026) acepta JWT de tenant (Portal), API key `lk_fe_...` o, por compatibilidad, la API key global `x-api-key`. Antes exigian solo `x-api-key === API_SECRET_KEY`, lo que rompia el boton "Desconectar" de Portal (que firma JWT). Plan de deprecar el secreto global en `specs/SCALABILITY-MULTI-SESSION.spec.md` §4.4/§4.5.
- **Multi-sesion (junio 2026):** `startSession` tiene guard anti-duplicado (mapa `startingPromises` + chequeo `isSessionReady`) que reutiliza la inicializacion en curso / el socket vivo sin bloquear la reconexion automatica; el cuerpo real se movio a `initSession`. Los `setInterval` de persistencia del store se trackean en `storeTimers` y se cancelan con `clearStoreTimer` (en `startSession`, `createPairingSession`, `disconnectSession`, `endSession`, `clearSession`) para no fugar timers en reconexiones.
- **Conteo de mensajes (fuente unica):** lila-app es el UNICO punto de conteo de mensajes WhatsApp (Portal ya no cuenta envios, solo el patron de storage). `whatsapp-direct.service.ts` cuenta una vez por envio via `quotaValidatorService.incrementWhatsAppUsage`, resolviendo la company por el sender (`getCompanyByWhatsappSender`) cuando el caller no pasa `companyId` (caso de envios disparados por Portal, que llegan a `/message/:sender/*` sin tenant). El cron (`jobs/executor.service.ts`) ya pasa `companyId`.
- **Store liviano (junio 2026):** el `InMemoryStore` ya NO almacena ni persiste mensajes (solo chats/contactos/grupos). `writeToFile` es async + atomico (tmp+rename) + dirty-flag, sin pretty-print. Antes el store crecia sin limite (medido 84 MB) y se escribia con `writeFileSync` bloqueante cada 10s. Grupos/contactos se sirven desde el store (lectura en memoria). Ver `specs/SCALABILITY-MULTI-SESSION.spec`.
- **Rate-limit / lecturas:** `apiLimiter` (por IP) ahora exime el trafico autenticado por tenant (JWT/`lk_fe_`), para que las lecturas server-to-server de Portal (grupos/contactos) no agoten el bucket. Portal ademas cachea esas lecturas 60s (`server/whatsapp/whatsappReadCache.ts`) y los selectores exponen `refresh()` que invalida esa cache (`?refresh=1`). `mongoSanitize` global limpia `$`/`.` de body/query/params.
- **Vinculación alternativa por número:** `POST /api/sessions/:phoneNumber/request-pairing-code`
  genera el código Baileys con espera acotada y autenticación de tenant. Portal lo
  expone en Empresa → WhatsApp como alternativa al QR.
- **RLS de `/message`:** exige `requireTenantOrApiKey`. JWT y API keys
  `lk_fe_` quedan bloqueados cuando el sender no pertenece a su company.
  El secreto global conserva acceso administrativo legacy. El lookup de propiedad
  falla cerrado para evitar envíos cross-company.
- **Aislamiento también en envíos internos:** `whatsapp-direct.service.ts`
  valida la propiedad sender/company antes de enviar o encolar texto y media.
  Cronjobs, avisos diferidos y reintentos no pueden reutilizar una sesión de otra
  empresa como fallback.

### Documentos / Reportes

- `POST /api/pdf/plant-dispatch-settlement` genera el reporte de producción por planta.
  Requiere JWT tenant, carga branding empresarial y entrega PDF con código, periodo,
  obras y totales acumulados.
- Registry de schemas: `src/schemas/documents/registry.ts` (20+ codigos: VAL-SRV, ACT-CNF, CONT-SRV, LIQ-SRV, control-imprimacion, control-pista, informe-area-adicional, medidas IAA, etc.).
- El schema `INF-ACT` (Informe de Actividades Realizadas) usa `actividades` como tabla editable y `registroFotografico.fotos[]` como panel fotografico. Portal puede enviar cada foto/PDF con metadata `activityId`, `activityLabel`, `activityIndex` y `activitySourceId`; `report-html-renderer.service.ts` agrupa esa seccion por actividad y omite actividades sin fotos. Los PDFs/documentos del panel se renderizan como tiles enlazados dentro de la tabla fotografica. Las fechas `date` recibidas como `YYYY-MM-DD` se formatean preservando el dia de calendario, sin parsearlas como UTC para evitar desfases por timezone.
- Controllers:
  - `documents.controller.ts` - generador generico de informes con membrete (REPORT_LETTERHEAD_CODES) y schema customization por empresa.
  - `service-management-report.controller.ts` - CRUD/lock de informes de servicio.
  - `dispatch-note-documents.controller.ts`, `purchase-order-documents.controller.ts`, `quote-documents.controller.ts`.
  - `quote-documents.controller.ts` acepta `payload.html` (canvas serializado de Portal): `inlineCanvasHtmlImages` + salto del renderer Handlebars, margen Puppeteer 14mm (`quote-documents.helpers.ts`). Sin `html`, comportamiento intacto. Base del editor canvas de cotizaciones (`Portal/specs/QUOTES-CANVAS-EDITOR.spec.md`).
  - Schemas `COT-ASF` y `COT-SER` llevan `computedFields` (totals.subtotal/igv/total con `totals.igvRate` como palanca IGV) y columnas computed (`itemCode` autonumerado, `lineTotal = quantity*unitPrice`). Es metadata para el MOTOR del editor canvas de Portal; los renderers Handlebars la ignoran (leen valores ya calculados).
  - Schemas COT-ASF/COT-SER v1.1.0 rearmados FIELES al PDF Handlebars legacy (que sigue siendo el criterio visual del canvas): tipos de seccion nuevos `totalsPanel` (monto en letras + caja de totales a la derecha), `signatureClosing` (ATENTAMENTE + firma + panel de cuentas bancarias; reemplaza a la seccion "Asesor Comercial" y a la tabla de cuentas — la seccion `issuerBankAccounts` desaparece, la DATA key se mantiene), `footerNote` (pie compacto sin labels) y `noteSections` (alcance COT-SER por bloques {title, lines[]}), mas `fieldsVariant: 'inlineRows'`, `showTitle`, `headerConfig.variant: 'quoteIssuer'` (emisor izq + caja de folio), `dataTable.tableStyle: 'columns'` + `column.decimals` + `minVisibleRows` (relleno) + `groupBy` (fase 1/1.1/1.2) y `compactPrint` en `types.ts`. Solo el canvas de Portal los renderiza; los renderers Handlebars no los usan (el PDF canvas llega por passthrough `payload.html`). Cambios de schema requieren REINICIO de lila local.
  - `renderAsphaltQuoteHtml`/`renderServiceQuoteHtml` ahora EXPORTADOS: los usa `scripts/design-refs/render-legacy-quotes.ts` como renderer de REFERENCIA (genera HTML+schema con fixtures compartidas de `Portal/specs/design-references/`); `screenshot-refs.mjs` (Puppeteer, Chrome del sistema) saca PNG/PDF de legacy y canvas para compararlos. Herramienta de la migracion "canvas = unica fuente de diseño" sin tocar la intranet. El script es generico por target: INFORMES renderizan con `new ReportHtmlRenderer(schema, data, {companyId, baseUrl}).render()` y escriben a `Portal/specs/design-references/reports/` (INF-ACT ya emulado en el canvas de Portal, 2026-07-07).
  - Canvas = UNICA fuente de diseño de cotizaciones E informes (F10): Portal persiste el HTML del canvas (`printHtml` en el draft de quote/service-quote y de service-management-report) y lo manda como `payload.html`. En cotizaciones hub/WhatsApp lo usan; en informes el PDF ya se genera desde el editor con `canvasHtml`. Los renderers Handlebars (`renderAsphaltQuoteHtml`/`renderServiceQuoteHtml` de cotizaciones; `report-html-renderer` de informes) quedan SOLO como fallback y se retiraran por tipo cuando el canvas emule fiel su diseño. lila = motor tonto (Puppeteer + storage + WhatsApp). Los docs headless de lila (vale de despacho del bot) conservan su template propio.
  - Membrete en el path canvas (F5): cuando el HTML del canvas trae membrete (`getDocumentLetterhead(schemaData)`), el margen Puppeteer baja a 0 en `documents.controller` y `quote-documents.controller` — el fondo va a sangre completa y los margenes los aporta el padding del propio HTML serializado por Portal.
  - `purchase-order-documents.controller.ts` conserva el schema `ORD-COM`, pero acepta `schemaData.header.orderType` / `meta.orderType` para renderizar `ORDEN DE COMPRA` (`oc-...`) u `ORDEN DE SERVICIO` (`oser-...`). Los PDFs de servicio se guardan bajo `ordenes-servicio`; los de compra mantienen `ordenes-compra`.
- Services:
  - `report-data-aggregator.service.ts` (agrega data desde Portal Mongo).
  - `report-html-renderer.service.ts` (Handlebars + branding empresa).
  - `pdf-merger.service.ts`, `pdf-to-docx.service.ts`.
  - `folio-generator.service.ts` (folios secuenciales).
  - `document-letterhead.service.ts` (inyeccion de membrete configurado por empresa).
  - `schema-customization.service.ts` (overrides de campos por empresa).

### Dispatch
- `dispatch.controller.ts` y `dispatch-post-process.controller.ts` (workflow asincrono).
- Servicios:
  - `dispatch-post-process.service.ts` - procesamiento background con alertas Telegram en fallo.
  - `dispatch-vale.service.ts` + `dispatch-vale-payload.service.ts` - construye payload y genera vale PDF (plantilla `templates/pdf/plantilla_dispatch_note.pdf`).
  - `dispatch-notifications.service.ts` - notificacion multi-canal (WhatsApp + Telegram).
  - `dispatch-note-document.service.ts` - PDF de nota de despacho.

### Public Reception (Fase 9)
- `public.controller.ts` (>1200 lineas) expone endpoints sin login pero con companyId resuelto via JWT firmado por Portal:
  - Recepcion de inputs (INPUT_PICTURES via Drive de lila-app desde mayo 2026).
  - Recepcion de mediciones y movimientos financieros.
  - Subida via TUS (`tus-upload.service.ts`) para archivos grandes.
- Callbacks a Portal: `portal-actions.service.ts` (POST JWT-signed a `/api/internal/*`).

### Storage Multi-Tenant
- Raiz: `FILE_STORAGE_ROOT` (default `/mnt/constroad-storage`) en produccion, `./data/` en dev.
- Path resolution: `storage-path.service.ts` -> `companies/{companyId}/{section}/...`.
- Naming seguro: `storage-file-name.service.ts`.
- Thumbnails on-demand: `thumbnail.service.ts`, `thumbnail-request.service.ts`.
- Compresion de imagenes: `image-compression.service.ts`.
- Streaming de video: `video-stream.service.ts` (FFmpeg via `ffmpeg.service.ts`).

### Drive local + PDF preview
- `drive.controller.ts` + `drive.store.ts` (data/drive en dev, multi-tenant en prod).
- `drive-pdf.controller.ts` renderiza paginas PDF a PNG (pdfjs-dist + canvas) y cachea en `data/drive-cache` o `{storage}/temp/drive-cache`.

### Service Migrations
- `service-migration.controller.ts` + `service-migration.service.ts` + `service-migration.helpers.ts`.
- Migracion cross-company de ordenes, servicios, despachos, medias, folders, clientes, transportes.

### Cron Jobs
- `jobs.controller.v2.ts` + `scheduler.service.ts`.
- Persistencia migrada a MongoDB Portal (ver `scripts/migrate-cronjobs-to-mongo.ts`); fallback a JSON.
- Tipos: `api` (axios GET) y `message` (WhatsApp).
- La programación automática está habilitada por defecto únicamente con
  `NODE_ENV=production`. Development/test persisten y permiten ejecutar jobs
  manualmente, pero no registran tareas `node-cron`. `CRONJOBS_ENABLED=true`
  habilita deliberadamente la programación fuera de producción.

### MongoDB Portal (Fase 10 - Quotas)
- Conexion compartida con pool y circuit breaker: `src/database/sharedConnection.ts`.
- Modelos del Portal: `src/database/models.ts` (Company, CronJob, Config) y `src/models/usage-metric.model.ts`.
- `scripts/migrate-managed-cronjobs.ts` adopta jobs legacy al registro self-service.
  Es dry-run por defecto; `--apply --prune` aplica y desactiva duplicados.
- `quota-validator.service.ts` (singleton) - valida quotas WhatsApp/storage/usuarios antes de operaciones costosas y registra consumo WhatsApp mensual en `usage_metrics`.
- Middleware `requireTenant` valida JWT y carga `req.companyId`.

### Telegram (Alertas + Cola)
- `telegram-alert.service.ts` - alertas de errores con deduplicacion.
- `telegram-queue.ts` - cola persistente en `data/telegram-alerts/queue.json` con retry (max 5 intentos, TTL 24h).
- Flusher background arrancado en `src/index.ts:362` via `startTelegramQueueFlusher()`.
- Usado por: dispatch-post-process, public reception, quota violations, tailscale watchdog.

### Tailscale (resiliencia red)
- Scripts: `scripts/tailscale-funnel-watchdog.sh`, `scripts/tailscale-external-probe.sh`.
- Notifica via Telegram cuando el funnel cae (commits "tailscale funnel" mayo 2026).

## Rutas montadas (src/index.ts:197-207)

```
/api/sessions                     sesiones WhatsApp (alias /api/session)
/api/jobs                         cron jobs
/api/message                      envio WhatsApp
/api/pdf                          generacion PDF generica + vale
/api/drive                        drive local
/api/documents                    informes con schemas
/api/dispatch                     dispatch + post-process + vale
/api/public                       recepcion publica (JWT firma Portal)
/api/service-management-report    CRUD informes de servicio (con edit-lock)
/api/service-migrations           migraciones cross-company
/files/companies/{companyId}/...  static multi-tenant
```

## Flujos clave

### 1) Generacion de vale (dispatch)
1. Portal llama `POST /api/dispatch/generate-vale` con JWT.
2. `dispatch-vale.service` arma payload (`dispatch-vale-payload.service`).
3. Rellena plantilla PDF con coordenadas + membrete empresa (`document-letterhead.service`).
4. `dispatch-notifications.service` opcionalmente envia por WhatsApp/Telegram.
5. Callback opcional a Portal con `portal-actions.service`.

### 2) Recepcion publica (input migration to Drive)
1. Portal genera enlace publico + JWT corto.
2. Usuario sube archivo a `/api/public/inputs/...` (TUS para grandes).
3. lila-app valida JWT, quota (`quota-validator`), guarda en `companies/{companyId}/inputs/`.
4. Genera thumbnail on-demand, callback a Portal MongoDB para sincronizar Media.

### 3) Generacion de informe de servicio (VAL-SRV, etc.)
1. Portal solicita `POST /api/documents/generate?code=VAL-SRV`.
2. `report-data-aggregator` lee data desde Portal Mongo (read-only).
3. `report-html-renderer` aplica template Handlebars + branding empresa.
4. `document-letterhead.service` inyecta membrete configurado (por tipo de reporte).
5. Folio sequencial via `folio-generator`.
6. PDF generado en `uploads/` (o `storage-path` multi-tenant).

### 4) Migracion cross-company
1. Portal solicita `POST /api/service-migrations` (source + target companyId).
2. Validacion preflight (`service-migration.helpers`).
3. Copia ordenes, despachos, medias, folders, clientes, transportes con normalizacion (placas, etc.).

### 5) Cron de alertas
- Tailscale watchdog (script externo) detecta caida -> notifica Telegram.
- Quota validator -> excede 95% -> encola alerta Telegram para admin.

## Persistencia y artefactos
- `data/sessions/`: credenciales Baileys por sesion.
- `data/conversations/`: historial IA (no usado en prod actualmente).
- `data/cronjobs.json`: fallback si no hay MongoDB.
- `data/drive/`, `data/drive-cache/`: drive local en dev.
- `data/pdf-temp/`: PDF temporales (limpieza programada).
- `data/telegram-alerts/queue.json`: cola persistente de alertas.
- `{FILE_STORAGE_ROOT}/companies/{companyId}/`: archivos multi-tenant en prod.
- `uploads/`: PDFs generados (legacy/non-tenant).
- `logs/`: Winston (error.log, combined.log).
- `dist/`: build esbuild.

## Configuracion (src/config/environment.ts)

| Variable | Default | Uso |
|----------|---------|-----|
| `PORT` | 3001 | HTTP port |
| `NODE_ENV` | development | |
| `WHATSAPP_SESSION_DIR` | `./data/sessions` | Baileys creds |
| `WHATSAPP_AUTO_RECONNECT` | true | |
| `WHATSAPP_RESTORE_SESSIONS` | true solo en production | Restaura sesiones Mongo al arrancar |
| `WHATSAPP_MAX_RECONNECT_ATTEMPTS` | 0 | 0 = unlimited |
| `WHATSAPP_AI_ENABLED` | false | Listener Claude (deshabilitado) |
| `WHATSAPP_AI_TEST_NUMBER` | 51949376824 | Solo whitelist en test |
| `WHATSAPP_BAILEYS_LOG_LEVEL` | fatal | |
| `ANTHROPIC_API_KEY` | - | Claude API |
| `TELEGRAM_BOT_TOKEN` | - | Bot Telegram para alertas |
| `TELEGRAM_ALERTS_CHAT_ID` | - | Chat destino (fallback `TELEGRAM_ERRORS_CHAT_ID`) |
| `PORTAL_MONGO_URI` | mongodb://localhost:27017 | Mongo Portal (mismo cluster) |
| `PORTAL_SHARED_DB` | constroad_db | DB unificada multi-tenant |
| `PORTAL_BASE_URL` | http://localhost:3000 | Callbacks HTTP a Portal |
| `CRONJOBS_ENABLED` | true solo en production | Override explícito de programación automática |
| `CRONJOBS_STORAGE` | `./data/cronjobs.json` | Fallback storage |
| `PDF_TEMPLATES_DIR` | `./templates/pdf` | Handlebars + PDF base |
| `PDF_UPLOADS_DIR` | `./uploads` | |
| `PDF_TEMP_DIR` | `./data/pdf-temp` o `{STORAGE_ROOT}/temp/pdf-preview` | |
| `PDF_TEMP_PUBLIC_BASE_URL` | `/pdf-temp` | |
| `FILE_STORAGE_ROOT` | `/mnt/constroad-storage` | Raiz multi-tenant |
| `DRIVE_MAX_FILE_SIZE_MB` | 25 | |
| `DRIVE_CACHE_DIR` | derivado | |
| `API_SECRET_KEY` | dev-secret-key | API key legacy |
| `JWT_SECRET` | dev-jwt-secret | **Debe igualar `LILA_APP_JWT_SECRET` del Portal** |
| `RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX` | 5m / 200 | Por IP |
| `LILA_APP_CORS_ORIGINS` | - | CSV de origenes permitidos |
| `TRUST_PROXY` | 1 en prod | Header X-Forwarded-* |
| `LOG_LEVEL` / `LOG_DIR` | info / `./logs` | Winston |

## Seguridad
- `helmet` + `cors` (origenes via env).
- Rate limiting por IP (`apiLimiter`) con excepciones por host/origin de Portal.
- JWT por request via middleware `requireTenant`; companyId nunca proviene del cliente.
- API keys publicas hasheadas SHA-256 en Mongo Portal.
- Path traversal blocks en `storage-path.service`.
- File name sanitization en `storage-file-name.service`.

## Observabilidad
- Winston logs estructurados en `logs/`.
- Request logger middleware.
- Tailscale watchdog notifica Telegram en caidas de red.
- Quota validator emite alertas a 80%, 95%, 100%.

## Ejecucion
- `npm run dev`: `tsx src/index.ts` con hot reload.
- `npm run dev:resilient`: `resilient-dev.cjs` con auto-restart.
- `npm run build`: bundle esbuild a `dist/`.
- `npm start`: ejecuta `dist/index.js`.
- PM2 opcional (ver `nodemon.json` legacy).

## Dependencias externas
- WhatsApp: `@whiskeysockets/baileys`.
- IA: `@anthropic-ai/sdk` (instalado, no usado en runtime).
- DB: `mongoose` (Portal MongoDB).
- Cron: `node-cron`.
- HTTP: `axios`.
- PDF: `puppeteer`, `handlebars`, `pdf-lib`, `pdfjs-dist`, `@napi-rs/canvas`.
- Imagenes/video: `sharp`, `ffmpeg-static`, `fluent-ffmpeg`.
- API: `express`, `helmet`, `cors`, `express-rate-limit`, `multer`, `formidable`.
- TUS: `@tus/server` para uploads resumibles.
- Logs: `winston`.

## Tests
- Jest configurado (`jest.config.cjs`).
- Tests existentes: `telegram-queue`, `telegram-alert`, `service-migration.helpers`, `dispatch-post-process`, `dispatch-vale`, `dispatch-notifications`, `storage-file-name`, `thumbnail-request`, `whatsapp-media-source.util`.
- Cobertura: parcial, foco en services criticos.

## Observaciones as-is / deuda
- Listener IA permanece en repo pero deshabilitado (early return + flag).
- `/api/message` (singular) ya no es `messages.controller.ts` original sino la version `.simple.ts`.
- `data/cronjobs.json` aun se lee como fallback; migracion completa a Mongo en `scripts/migrate-cronjobs-to-mongo.ts`.
- Validacion API key legacy (`validateApiKey`) coexiste con JWT multi-tenant.
- PDFs requieren Chromium para Puppeteer (verificar imagen Docker / runtime PM2).
- Algunos tests dependen de fixtures locales sin mocking del Mongo Portal.

## Cambios recientes (Mayo - Junio 2026)
- **Julio 2026**: las alertas Telegram de progreso y fin de producción ya no
  dependen de un sender WhatsApp. El postproceso conserva WhatsApp como canal
  opcional, mantiene deduplicación por despacho y cierre diario, y encola fallos
  transitorios de Telegram. El cierre diferido queda persistido con `availableAt`,
  evitando perderlo durante reinicios de lila-app.
- **Julio 2026**: IPP y fin de producción consultan nuevamente el sender y grupo
  activos al cumplirse su demora; un sender desconectado o reasignado deja de ser
  utilizable. El reporte climático diferencia riesgo de producción en la planta
  (distrito de Lurigancho-Chosica) de distritos no aptos para asfaltar.
- **Julio 2026**: el vale de despacho usa exclusivamente el sender configurado
  por su empresa. Ya no reutiliza sesiones ajenas en `test` o desarrollo. La
  restauración automática permite únicamente senders asignados a empresas activas.
  Los mensajes identifican el documento como vale y usan el bot empresarial.
- **Julio 2026**: recepciones públicas usan `arriveDate` ISO. Portal muestra
  documentos lila-app mediante su proxy PDF autenticado.
- **Junio 2026**: enhancements de red (`network enhancements`), control tanks integrados con Portal, alertas Telegram cuando Tailscale cae.
- **Mayo 2026**: cola Telegram persistente, multiples mejoras de informe IAA y dispatch, refactor dispatch IPP, migracion de inputs Telegram -> Drive lila-app (paths `companies/{id}/inputs/`), migracion de ordenes y servicios cross-company, informe liquidacion (LIQ-SRV), control de pista, imprimacion reportes.
- **Abril 2026**: dispatch post-process workflow, expense public + duplicate WhatsApp message fix, service migration v2.

## Pendiente — consolidación de uso para billing (ver Portal spec)
Para el modelo de suscripciones de Portal (`/projects/SUBSCRIPTION-BILLING-MULTITENANT.spec.md`), lila-app debe exponer un endpoint **tenant-scoped** de uso que Portal consolide periódicamente:
- `GET /api/tenant/usage` (JWT/api-key) → `{ storageBytes, whatsappMessagesThisMonth, apiCallsThisMonth }`.
- **storage**: suma real del tenant en `/mnt/constroad-storage/companies/{companyId}` (absoluto, no mensual).
- **whatsappMessages / apiCalls**: contadores mensuales (reset por período en Portal).
Portal lo ingiere vía cron (`UsageTracker.updateStorage` + `usage_metrics`) para que `/admin/suscripcion/uso` muestre números reales independientes del plan.

## F8-C — Link del chofer automático + recordatorio ETA+10% (2026-07-07)

- **Envío automático (sin humano)**: al despachar, el flujo del vale
  (`dispatch-vale.service`) además del PDF + ubicación ahora manda al chofer su
  **link personal** (`{PORTAL_BASE_URL}/public/driver/{jwt}`) para compartir GPS
  en ruta y **marcar su llegada** (F8-A en Portal). El token lo firma lila con
  `config.security.jwtSecret` (= `LILA_APP_JWT_SECRET` de Portal), scope
  `driver-location`, TTL 12 h (`src/utils/driver-link.ts`). Best-effort con
  `queueOnFail`: nunca rompe el vale. El botón manual del admin en Portal sigue
  existiendo como respaldo.
- **Recordatorio "¿ya llegaste?"**: `driver-arrival-reminder.service.ts` —
  cola persistida en JsonStore (patrón telegram-queue, sobrevive reinicios) +
  flusher cada 60 s (arrancado/detenido en `index.ts`). Delay = **ETA + 10%**
  (clamp 15 min–6 h; sin ETA → 90 min). El ETA se consulta a Portal
  `GET /api/dispatch-tracking?dispatchId=` con header `x-company-id` (Portal lo
  abrió a `withCompanyOrInternal`, mismo gate `internalPublicAccess` del IPP
  sync). Al vencer: si el tracking dice `stage: delivered` (chofer u operador
  ya marcaron) se descarta sin enviar; si no, WhatsApp al chofer. Dedupe por
  dispatch, 3 intentos máx, expira a las 12 h.

## Exports de pedidos — `/api/exports/orders/:orderId` (2026-07-07)

- **Por qué en lila**: el "Panel de exportación" del reporte público del Portal
  (`ScOrderExportPanel`) siempre llamó a `{LILA}/api/exports/orders/:id/…`,
  rutas que venían del backend viejo y NO existían en este repo (404). Los
  archivos viven en el disco de lila → zipping local (sin límite de 8 s de
  Vercel ni re-descargas HTTP).
- **Rutas** (`api/routes/exports.routes.ts`): `POST …/request` (genera el ZIP
  síncrono, 201; 404/409 busy/422 sin archivos), `GET …/download`
  (`res.download`, navegación del browser), `DELETE …/:orderId` (borra zip +
  limpia job). **Públicas por orderId** (paridad con el contrato viejo — la
  descarga no puede mandar headers); rate limit global.
- **Servicio** (`services/order-export.service.ts`): order/media/folder como
  **loose models** de la DB compartida (`database/models.ts` — OJO: la
  colección de medias es **`media`**, mongoose la trata como incontable; existe
  una `medias` legacy vacía). Medias `{companyId, resourceId: orderId,
  status: ACTIVE}` → URL → path local validado (`storagePathService.resolvePath`
  + `validateAccess`, sin traversal ni cross-company) → **archiver** (dep nueva,
  v7 — la v8 cambió a API de clases ESM) streaming a
  `<companyRoot>/temp/order-exports/pedido-<orderId>.zip`. Carpetas del zip =
  cadena de folders del Portal o `media.type`. Estado en **`order.exportJob`**
  (`running|done|error`, fileName/sizeBytes/expiresAt 24 h) — el Portal lo lee
  por su propio `GET /api/order/:id` (el panel hace polling cada 3 s).
