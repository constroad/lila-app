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
- **Send-proxy dev (julio 2026):** con `WHATSAPP_PROXY_TARGET_URL` seteada (base URL de prod con `/api`, ej. Tailscale) y `nodeEnv !== 'production'`, los 4 métodos de envío de `whatsapp-direct.service.ts` hacen early-return a `src/services/whatsapp-proxy.service.ts`, que reenvía a `/message/:sender/{text|image|video|file}` de PROD con un JWT de tenant corto (5 min) firmado con el `JWT_SECRET` compartido — el payload lleva el CAMPO `companyId` del schema Company (NO el `_id`), que es lo que compara `requireSenderOwnership`. Así lila local prueba flujos e2e con mensajes reales sin abrir sockets (evita guerra 440); prod aplica su pipeline completo (ownership, routing, outbox 202→`{queued:true}`, conteo de quota — sin doble conteo porque el early-return salta el conteo local). Buffers locales viajan como multipart (límite multer prod: 10 MB); `filePath`/`fileUrl` se reenvían tal cual. **Guard anti-440 (puerta única):** `startSession` Y `createPairingSession` lanzan error si el proxy está activo — así NINGÚN camino abre un socket local (creación manual, endpoint de QR, `restartSession`, reconnect, restore, pairing). Sin esto, los endpoints `/qr` y crear-sesión llamaban a `startSession` directo (saltándose el guard del wrapper `WhatsAppDirectService.createSession`) y abrían un socket local con las creds de prod → guerra 440 que mató la sesión productiva (jul 2026). Los handlers de QR/create/pairing responden 409 legible en modo proxy. Re-emparejar SIEMPRE contra prod. Las LECTURAS de sesión (`/groups`, `/contacts`, `/syncGroups`) también se proxean (pass-through de `proxySessionRead`, espejando el status de prod): el store local solo se puebla con socket, así que sin proxy devolvían 503. Las alertas Telegram llevan prefijo `[DEV] ` cuando `nodeEnv !== 'production'` (mismo bot/canal que prod; el prefijo se aplica en `sendOnce`, cubre directas y cola). En producción la env se ignora con warning. Alternativa full-fidelity (socket local, entrantes): `specs/SESSION-LEASE.spec.md` (propuesto, no implementado).
- **Sesiones LOCAL-ONLY (`WHATSAPP_LOCAL_SESSIONS`, julio 2026):** lista CSV de números cuyo socket vive en la máquina DEV que los declara (caso: número de pruebas de la company test, para cerrar E2E local con QR real). En dev esos números quedan exentos del guard de proxy y del socket lease (`local-sessions.ts`); envíos y lecturas van por el pipeline local (`isProxiedSender(sender)` reemplaza al check global en direct.service y session.controller). En PROD la MISMA variable significa lo inverso: `startSession`/`createPairingSession` los rechazan y `restoreAllSessions` los omite (sin esto, un restart de prod restauraría las creds compartidas de Mongo → guerra 440 contra dev). **La variable debe estar en AMBOS env** (dev `.env` y launchd de la Mac mini). Dev sin lease restaura solo las local-only al boot (con `WHATSAPP_RESTORE_SESSIONS=true`).
- **Primer login post-pairing (julio 2026):** el pair-success (QR escaneado → creds.me seteado → cierre 515) abre una ventana `recentlyPairedAt` de 15 min: el siguiente socket recibe watchdog extendido (5 min, no 90s — en cuentas pesadas el teléfono tarda registrando el companion y matar el socket reinicia ese proceso: nunca converge y quema device index) y los endpoints `/qr` y `/status` reportan `status:'linking'`, que Portal usa para ocultar el QR muerto, mostrar "vinculando…" y bloquear Regenerar QR (un restart mataría el login en vuelo). Además cada `connection.update` se loggea compacto (🧭, sin el string del QR) para ubicar la fase del cuelgue. **Primer QR en ~2s (fix medido, julio 2026):** Baileys emite el primer QR ~200ms tras el registro y ese ref vivía 60s; lila registraba el listener de `connection.update` DESPUÉS de `await store.load()` (1-2s contra Atlas en cuentas pesadas) → el primer ref se PERDÍA y el usuario veía el segundo a los ~63s medidos. Fix: listeners de `creds.update` y `connection.update` ANTES de cualquier await (el store se carga en paralelo y se espera después); `qrTimeout: 20_000` uniforma la vida de cada QR con el countdown de 20s de Portal. El ciclo de QR además se DETIENE solo si nadie lo pollea por HTTP en 90s (`markQRRequested`/`stopIdlePairingCycle`) — antes un QR pedido una vez dejaba un loop infinito rotando QRs en prod. También, y `syncFullHistory` se gatea por `!creds.me` (el flag `registered` NUNCA flipa a true en flujo QR — solo pairing-code — y en Baileys 6.7.18 syncFullHistory solo pesa en el nodo de REGISTRO del pairing; en el login de reconexiones es inerte).
- **Hardening sesiones (2026-07-13, post-incidente reconexión):**
  (a) TODAS las rutas `/api/sessions/*` exigen auth (`requireTenantOrApiKey`); las que
  operan un número concreto exigen además `requireSessionOwnership` (dueño o co-dueño;
  números sin dueño pasan para 1er emparejamiento; fail-closed 503). Antes `/groups`,
  `/contacts`, `/status` y `/list` estaban SIN auth (fuga de PII vía HTTPS público) y
  `/qr`/`/restart`/pairing no validaban dueño (QR ajeno = account takeover). Portal
  `api/super/whatsapp-sessions` firma JWT `portal-super` para `/list`.
  (b) `/clear` y `/disconnect` tienen guard de modo proxy (un `/clear` local borraba
  creds de PROD en el Mongo compartido).
  (c) Reconexión con **backoff exponencial** (`reconnectDelayMs`: base 3s, cap 10 min,
  jitter ±20%) — el lineal 60s martillaba el login y sostenía el throttle de WhatsApp.
  (d) `makeCacheableSignalKeyStore` sobre el auth-state Mongo + `msgRetryCounterCache`
  + versión WA cacheada (`baileys-version.ts`, TTL 6h, stale-on-error) + logger Baileys
  configurable (`WHATSAPP_BAILEYS_LOG_LEVEL`, ya no hardcode silent).
  (e) **Lease process-level de sockets** (`instance-lease.ts`, colección
  `whatsapp_instance_lease`, TTL 90s + heartbeat 30s): solo el holder abre sockets;
  segundo proceso queda pasivo con alerta y failover automático. Guard en
  `startSession`/pairing/restore; release en shutdown. `WHATSAPP_SOCKET_LEASE=false`
  lo desactiva. (El handoff prod↔dev por sesión de `SESSION-LEASE.spec.md` sigue propuesto.)
  (f) Outbox: `OUTBOX_MAX_ATTEMPTS=5` + TTL 24h + skip de items envenenados (ya no
  break-on-first-error), cap `OUTBOX_MAX_ITEMS=50` con drop-oldest + alerta, lock
  anti-flush concurrente, y media del flush con `queueOnFail:false` (sin duplicados).
  (g) Timeout defensivo 120s en los 4 `sock.sendMessage` (cae al queueOnFail) y
  rate limiter sin bypass accidental cuando falta `API_SECRET_KEY`.
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
- **Pipeline de imágenes/PDF (hardening 2026-07-14, post-incidente IPP 180s):**
  el HTML de TODO documento llega a Puppeteer **autocontenido** — `inlineCanvasHtmlImages`
  corre para canvas, printUrl **y también para el renderer Handlebars** (antes el
  renderer dejaba URLs http y `networkidle0` colgaba esperándolas). El inliner es
  **disco-primero**: storage local → thumb faltante cae al ORIGINAL local vía
  `resolveThumbnailRequestTarget` (antes se auto-descargaba por HTTP/Tailscale
  disparando generación on-demand) → HTTP solo para URLs externas (timeout 30s).
  Toda imagen se re-encoda a tamaño PDF (máx 1600px, JPEG q72; PNG solo con alfa;
  SVG rasterizado) — antes cualquier foto ≤1MB entraba a resolución completa.
  Pool acotado (4) vía `utils/concurrency.ts`. `generator.service`: `setContent`
  con `load` + `waitForImagesReady` acotado (15s) en vez de `networkidle0`
  (Puppeteer moderno lo eliminó de setContent), **límite de renders concurrentes**
  (`PDF_MAX_CONCURRENT_RENDERS`, default 2, cola FIFO — incluye `fetchPrintedHtml`)
  y `page.close()` en `finally` (antes fugaba pages ante error).
- Controllers:
  - `documents.controller.ts` - generador generico de informes con membrete (REPORT_LETTERHEAD_CODES) y schema customization por empresa.
  - `service-management-report.controller.ts` - CRUD/lock de informes de servicio.
  - `dispatch-note-documents.controller.ts`, `purchase-order-documents.controller.ts`, `quote-documents.controller.ts`.
  - `quote-documents.controller.ts` acepta `payload.html` (canvas serializado de Portal): `inlineCanvasHtmlImages` + salto del renderer Handlebars, margen Puppeteer 14mm (`quote-documents.helpers.ts`). Sin `html`, comportamiento intacto. Base del editor canvas de cotizaciones (`Portal/specs/QUOTES-CANVAS-EDITOR.spec.md`).
  - Schemas `COT-ASF` y `COT-SER` llevan `computedFields` (totals.subtotal/igv/total con `totals.igvRate` como palanca IGV) y columnas computed (`itemCode` autonumerado, `lineTotal = quantity*unitPrice`). Es metadata para el MOTOR del editor canvas de Portal; los renderers Handlebars la ignoran (leen valores ya calculados).
  - Schemas COT-ASF/COT-SER v1.1.0 rearmados FIELES al PDF Handlebars legacy (que sigue siendo el criterio visual del canvas): tipos de seccion nuevos `totalsPanel` (monto en letras + caja de totales a la derecha), `signatureClosing` (ATENTAMENTE + firma + panel de cuentas bancarias; reemplaza a la seccion "Asesor Comercial" y a la tabla de cuentas — la seccion `issuerBankAccounts` desaparece, la DATA key se mantiene), `footerNote` (pie compacto sin labels) y `noteSections` (alcance COT-SER por bloques {title, lines[]}), mas `fieldsVariant: 'inlineRows'`, `showTitle`, `headerConfig.variant: 'quoteIssuer'` (emisor izq + caja de folio), `dataTable.tableStyle: 'columns'` + `column.decimals` + `minVisibleRows` (relleno) + `groupBy` (fase 1/1.1/1.2) y `compactPrint` en `types.ts`. Solo el canvas de Portal los renderiza; los renderers Handlebars no los usan (el PDF canvas llega por passthrough `payload.html`). Cambios de schema requieren REINICIO de lila local.
  - `renderAsphaltQuoteHtml`/`renderServiceQuoteHtml` ahora EXPORTADOS: los usa `scripts/design-refs/render-legacy-quotes.ts` como renderer de REFERENCIA (genera HTML+schema con fixtures compartidas de `Portal/specs/design-references/`); `screenshot-refs.mjs` (Puppeteer, Chrome del sistema) saca PNG/PDF de legacy y canvas para compararlos. Herramienta de la migracion "canvas = unica fuente de diseño" sin tocar la intranet. El script es generico por target: INFORMES renderizan con `new ReportHtmlRenderer(schema, data, {companyId, baseUrl}).render()` y escriben a `Portal/specs/design-references/reports/` (emulados en el canvas de Portal: INF-ACT y VAL-SRV 2026-07-07, ACT-CNF y CONT-SRV 2026-07-08). ACT-CNF tiene handling propio en `renderSignatures` (labels de firma por `acta.tipo`: VENTA ENTREGUE/RECIBI CONFORME, SERVICIO SUBCONTRATISTA/CLIENTE; DNI vs CIP) y `computeActaTitulo` — el canvas replica los labels de firma; el título ya llega por `centerLinesKeys:['acta.titulo']`. CONT-SRV usa un renderer CUSTOM (`renderContractDocument`) que ignora el layout genérico de secciones y arma un documento legal en prosa (partes, cláusulas, tabla de precios, tablas por sector con subtotal/IGV/total, bancos, cierre, firmas duales desde cliente/proveedor); el canvas lo emula con un dispatcher propio (`CanvasContractSections`). LIQ-SRV tiene el otro renderer custom (`renderLiquidacionDocument`): documento financiero con secciones numeradas (1 cotización, 2 pagos+TOTAL, 3 ejecutado, 4 saldo, 5 vouchers), datosGenerales como PROYECTO+meta-grid, tablas con "S/" y SUB TOTAL/IGV/TOTAL, firmas `signatureStyle:'line'`; el canvas lo emula con `CanvasLiquidacionSections` (header/firmas reusan el genérico). Ambos renderers custom (CONT-SRV + LIQ-SRV) ya están emulados en el canvas. También el batch de informes GENÉRICOS canvas-edited (MET-RES, CAL-PROT, LEV-OBS, REC-EXC, PNL-FOT, TOP-PROT, TOP-CMP, DOS-OBR) — usan el renderer genérico, sin handling especial; el canvas los cubre solo con fixtures (único fix: columnas select en print → etiqueta, no valor). Los 4 de LABORATORIO (CTL-IMP, CTL-PIS, IAA, IPP) también emulados (2026-07-08): NO eran form-rewrite — `ServiceReportsTab` de Portal YA los edita en el canvas (CTL-IMP con `ImprimacionFormShadcn` como customEditor, el resto inline; `field-reports/ReportEditor.tsx` Chakra es el path público legacy). CTL-IMP tiene renderer CUSTOM `renderControlImprimacionDocument` (hoja por control: metadata + materiales + tabla TASA DE RIEGO) → emulado con `CanvasControlImprimacionSection`. CTL-PIS: el canvas oculta la sección config `controlPistaColumns` (que el renderer legacy hace `return ''`) y filtra columnas por esa config. IAA: numeración romana (`buildSectionTitleMap`) + tabla especial `renderLevantamientoTopografico` + fila TOTAL ADICIONAL (`renderIaaTotalAreaRow`), replicados en el canvas. IPP: fila TOTALES en registroDespachos (suma cubos + PROMEDIO T° salida, `renderProduccionTotalRow`) replicada con un nuevo `averageColumns`. Con esto el canvas de Portal emula el 100% de los informes canvas-edited; el renderer legacy de lila queda como referencia del pipeline, no como fuente del PDF.
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

### Pipeline de medios (imágenes/video) — estado 2026-07-14

Flujo estándar de renditions (post-auditoría):
1. **Cliente (Portal)** optimiza imágenes antes de subir (`optimizeBrowserImageFile`:
   umbral/target ~1MB vía canvas) y captura video con bitrate acotado. Es optimización
   de UX/ancho de banda, NO la garantía.
2. **Ingest (lila, `drive.controller` POST /files)**: red de seguridad server-side —
   `media-ingest.service.normalizeImageInPlace` acota imágenes al techo
   `MEDIA_INGEST_MAX_PX` (default 2560px, q82, PNG si alfa, escritura atómica,
   0 = deshabilitado; no-op para archivos ya dentro del techo → sin doble pérdida).
   Ajusta el contador de storage por delta (mismo patrón que el path de video).
   Videos: `optimizeVideoForProgressiveStreaming` (existente). Thumbnail generado
   al ingerir (existente) — imagen/video ahora a **640px** (`THUMBNAIL_MAX_PX`;
   antes 1200px = tamaño display, no thumb), PDF conserva 1200px.
3. **Serving (`/files/companies` + `.thumbs`)**: `resolveThumbnailRequestTarget`
   resuelve exacto → **thumb HERMANO vigente** (el nombre lleva sha1(path:size:mtime);
   un move/re-subida invalida el nombre guardado — antes caía al original multi-MB) →
   original como último recurso, disparando **materialización lazy en background**
   (`materializeThumbnailInBackground`, dedup + pool 2) para que los siguientes
   requests sirvan el liviano. Self-healing para media legacy.
4. **PDFs** consumen el mismo storage vía el inliner disco-primero (ver sección
   Documentos). Video playback: range requests sobre el original (sin transcode).

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
- **Contrato de headers para jobs `api`** (`executor.service.ts:324-341`): el executor
  inyecta campos del job como headers hacia el endpoint destino (contrato que Portal
  consume en sus crons `/api/cron/*`): `x-company-id` (job.companyId), `x-cronjob-chat-id`
  (message.chatId), **`x-cronjob-message-template`** (URL-encoded `message.body` — plantilla
  editable del aviso; el endpoint la decodifica/renderiza; usado por las alertas
  self-service de Portal, ej. stock-alert con grupo + mensaje por rubro/company) y
  `x-cronjob-return-message='1'` (cuando hay chatId sin flag explícito). Ref:
  `WHATSAPP-GROUP-ALERTS-SELFSERVICE`.
- **Auth de crons Portal (2026-07):** el executor inyecta `x-cron-secret` (= `CRON_SECRET`)
  **solo** a rutas `/api/cron` de Portal (`isPortalCronUrl`, nunca a APIs de terceros → no
  filtra el secreto; auto-redactado en logs). El middleware Edge de Portal lo exige
  (fail-closed). `CRON_SECRET` debe ser idéntico en lila `.env` y en Vercel (Portal).
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
2. `resolveReportHtml` decide el motor por prioridad: (a) `html` en el body (canvas
   serializado EN VIVO por el editor de Portal) → `inlineCanvasHtmlImages` y se rinde
   tal cual (`source:'canvas'`); (b) `printUrl` en el body (PDF opción 2, 2026-07-09):
   `PDFGenerator.fetchPrintedHtml` navega con Puppeteer a la vista de impresión
   firmada de Portal (`/print/service-report/[id]?token=`), espera
   `window.__PRINT_READY__` y extrae `__CANVAS_PRINT_HTML__` — el mismo canvas con
   diseño persistido y datos frescos de DB; guard SSRF opcional `PORTAL_PRINT_HOSTS`
   (hosts por coma); si falla, cae a (c) sin romper; (c) pasos 3-4
   (`source:'renderer'`, comportamiento histórico). El margen Puppeteer para fuente
   canvas es `buildCanvasPdfMargin` (14mm, o 0 con membrete) también en preview.
3. `report-data-aggregator` lee data desde Portal Mongo (read-only).
4. `report-html-renderer` aplica template Handlebars + branding empresa.
5. `document-letterhead.service` inyecta membrete configurado (por tipo de reporte).
   En el path canvas el margen Puppeteer baja a 0 si el HTML trae membrete propio.
6. Folio sequencial via `folio-generator`.
7. PDF generado en `uploads/` (o `storage-path` multi-tenant).

Nota (2026-07-09, redesign del módulo público de servicios en Portal): el contrato de
`schemaData` NO cambió — los schemas del registry y los renderers leen las mismas
claves. Portal ahora persiste ADEMÁS `schemaData.__clocks` (side-map de relojes HLC
del merge colaborativo por campo del PATCH público); es aditivo y los renderers lo
ignoran (iteran por secciones del schema). El PDF público de field-reports sigue
llegando SIN `html` → siempre `source:'renderer'` con datos frescos; el `printHtml`
del canvas admin puede quedar stale respecto a ediciones públicas (divergencia
documentada en `Portal/specs/ARCHITECTURE-Portal.as-is.md` §7-bis).

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
  `requireTenant` acepta **ambos**: `Authorization: Bearer <jwt>` (Portal server-to-server
  y, desde 2026-07, el flujo público-link que ahora recibe un JWT corto en vez de la
  API key maestra) **y** `x-api-key: lk_fe_…`.
- API keys publicas hasheadas SHA-256 en Mongo Portal.
- Path traversal blocks en `storage-path.service`.
- File name sanitization en `storage-file-name.service`.
- **Guard SSRF de generación de PDF (2026-07):** `documents.controller.ts` `isAllowedPrintUrl`
  solo deja que Puppeteer navegue a hosts de `PORTAL_PRINT_HOSTS` (dev=`localhost:3000`,
  prod=`www.constroad.com,constroad.com`). Sin la env, el guard era un no-op (cualquier URL
  http[s] pasaba) → SSRF con credencial de tenant filtrada. **Obligatorio setear la env.**
- **`requireAdmin` (2026-07):** confía en el `role` del JWT verificado. Portal dejó de
  reenviar `x-user-role` del cliente (era escalable). Ver auditoría integral en Portal:
  `Portal/specs/SECURITY-AUDIT-2026-07.spec.md`.

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

## Rol de lila-app en suscripciones/catálogo de Portal (jul-2026)

> Fuente de verdad del modelo completo (módulos, rubros, planes, billing, motores
> de navegación/dashboards): **`/projects/PLATFORM-CATALOG-BILLING.spec.md`**
> (unificó SUBSCRIPTION-BILLING-MULTITENANT y otras 3 specs; originales en
> `/projects/specs-archive/`).

Qué le toca a lila-app (y qué NO):
- **NO participa** en los motores de navegación/dashboards/planes de Portal
  (colecciones `navigation_catalog`, `dashboard_catalog`, `plan_catalog`,
  `plan_templates`, `module_catalog` son solo-Portal).
- **SÍ es la única fuente** de conteo de mensajes WhatsApp y del storage real por
  tenant; los límites de plan (`whatsappMessages`, `whatsappSessions`, storage) se
  miden aquí y se hacen visibles en Portal.
- **SÍ ejecuta** la colección `cronjobs` (scheduler v2). ⚠️ Portal registra ahí sus
  crons de billing (`expire-trials`, `trial-reminders`) con el shape de lila
  (`schedule` OBJETO `{cronExpression, timezone}` + `apiConfig`): un `schedule`
  string tumba el scheduler completo (incidente prod jul-2026).
- **Pendiente (cross-repo)**: endpoint tenant-scoped de uso que Portal consolide:
  `GET /api/tenant/usage` (JWT/api-key) → `{ storageBytes,
  whatsappMessagesThisMonth, apiCallsThisMonth }`. storage = suma real en
  `/mnt/constroad-storage/companies/{companyId}` (absoluto); whatsapp/apiCalls =
  mensuales. Portal lo ingiere por cron (`UsageTracker` + `usage_metrics`).

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
