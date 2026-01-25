# Prompt para construir API Node.js + Baileys (TypeScript)

## Resumen
Eres un desarrollador/a senior en backend y agentes de IA. Tu tarea es diseñar e implementar una API en TypeScript (Node.js) que:

- Use Baileys para conectar múltiples sesiones de WhatsApp simultáneas y enviar mensajes de texto, imágenes y archivos.
- Exponga una API para manejo de cronjobs (crear, listar, actualizar, eliminar), con persistencia local en un archivo JSON.
- Mantenga contactos y grupos de WhatsApp en archivos JSON locales y ofrezca endpoints para sincronizar (pull) las últimas actualizaciones desde las sesiones activas.
- Permita generar PDFs basados en plantillas, rellenarlos con datos recibidos por la API y descargar o enviar esos PDFs a números/grupos de WhatsApp o a Telegram.
- Provea un agente (bot) conversacional que interactúe con clientes como si fuera 100% humano (estilo, tiempos de respuesta, variaciones de texto), con control de latencia y cadencia para simular comportamiento humano.
- Resiliencia: si la aplicación Node se cae (error de la app o de un paquete), debe poder recuperarse automáticamente y volver a levantar el servidor y reconectar sesiones de WhatsApp.
- Debe ser escalable y performante, lista para producción y despliegue en contenedores.

> Toma como input el archivo [swagger.ts](swagger.ts) existente en el repositorio y úsalo para alinear la especificación OpenAPI y los endpoints.

---

## Requisitos funcionales (detallados)

- Conexiones WhatsApp
  - Soportar múltiples sesiones activas simultáneamente (por cliente/tenant).
  - Persistir credenciales/sesiones de Baileys en disco de forma segura (cifrado opcional y rotación).
  - Endpoints para crear, listar, eliminar y recuperar sesiones.
  - Envío de mensajes: texto, imagen, archivos (con metadatos), y mensajes a grupos.

- Cronjobs
  - CRUD de cronjobs vía API.
  - Cronjobs almacenados en `cronjobs.json` en formato legible.
  - Capacidad de ejecutar tareas programadas que disparen envíos de mensajes o generación de PDFs.
  - Habilitar modo de simulación/testing sin enviar mensajes reales.

- Contactos y Grupos
  - Sincronización: endpoints para forzar sincronización desde cada sesión WhatsApp hacia `contacts.json` y `groups.json` locales.
  - Buscar y filtrar contactos/grupos por nombre, número, id.

- PDF templating
  - Subir/almacenar plantillas PDF (o plantillas compatibles como HTML->PDF).
  - Endpoint para rellenar una plantilla con datos JSON y generar PDF resultante.
  - Opciones: descargar, enviar por WhatsApp (número o grupo) o enviar a un bot de Telegram.

- Agente conversacional (bot)
  - Motor de respuestas que combine reglas + LLM (opcional) para respuestas naturales.
  - Simulación de comportamiento humano: latencia configurable, variaciones de texto, detección de contexto previo.
  - Handover a operador humano vía evento/endpoint.

- Resiliencia y recuperación
  - Auto-restart y recuperación de sesiones tras fallo (usar PM2 / systemd / contenedores con restart policy).
  - Mecanismo de persistencia para recuperar estado: sesiones, cronjobs, colas pendientes.
  - Retries para operaciones idempotentes y backoff exponencial para reconexiones.

- Seguridad
  - Protección de APIs con autenticación (JWT / API keys) y autorización por sesión/tenant.
  - Validación y saneamiento de archivos subidos.
  - Cifrado en reposo para datos sensibles si requerido.

- Observabilidad y operación
  - Logging estructurado (JSON) y niveles (info/debug/error).
  - Métricas básicas (requests, latencia, envíos exitosos/fallidos) y health checks.
  - Endpoints de health/readiness.

- Deploy & Escalabilidad
  - Dockerfile y recomendaciones de despliegue (replicas, clustering, worker queues).
  - Separación de procesos: API server vs workers (envío masivo, generación de PDF).

---

## Requisitos no funcionales y recomendaciones de arquitectura (expert)

- Persistencia local y migración futura:
  - Guardar cronjobs, contactos y grupos en JSON local como requisito inicial, pero diseñar una capa de abstracción (repository pattern) para migrar a DB (Postgres/Redis) fácilmente.

- Concurrencia y envío:
  - Implementar cola local (p. ej. BullMQ con Redis en producción; para local puede ser una cola en memoria persistente) para desacoplar recepción de mensajes/cron triggers y envío a WhatsApp.
  - Rate-limiting y batching para evitar bloqueos por WhatsApp.

- Manejo de sesiones Baileys:
  - Mantener una fábrica de clientes Baileys por sesión con reconexión automática y monitor de estado.
  - Serializar/deserializar credenciales a archivos por sesión en carpeta `sessions/`.

- Recuperación automática (resiliencia):
  - Usar un supervisor (PM2 en modo cluster o restart policy Docker) y diseñar arranque idempotente que restaure colas y reconecte sesiones.
  - Guardar operaciones pendientes en un journal (append-only) para reintentar después de crash.

- Simulación humana:
  - Implementar middleware que introduzca delays aleatorios dentro de rangos configurables, typing indicators (si Baileys/WhatsApp lo soporta) y varianza en plantillas de texto.
  - Mantener plantillas de respuestas con probabilidad y sinónimos para evitar mensajes repetitivos.

- PDFs y archivos:
  - Apoyarse en HTML->PDF (puppeteer / playwright) o en librería de plantillas PDF para relleno de campos.
  - Almacenar PDFs generados en carpeta `storage/` con TTL/rotación.

- Seguridad operacional:
  - No guardar secretos en repo; usar `.env` o secretos del entorno.
  - Firmar/verificar payloads para endpoints que disparan envíos de alto impacto.

- Observabilidad y testing:
  - Agregar tests unitarios y de integración para: creación de sesiones, persistencia de cronjobs, generación de PDF, y el flujo de reintentos post-crash.
  - Instrumentar traces distribuidos si se integra con microservicios.

---

## Entregables esperados

- Repositorio en TypeScript con:
  - API server Express/Koa/Fastify (preferible Fastify para performance) y estructura `src/`.
  - Implementación de conexión Baileys con manejo de múltiples sesiones.
  - Endpoints CRUD para cronjobs y sincronización de contactos/grupos (persistencia en JSON).
  - Endpoints para subir plantillas y generar/enviar PDFs.
  - Worker/cola para envíos, con simulación de comportamiento humano.
  - Dockerfile, scripts de inicio y ejemplo de `docker-compose` para local (incluyendo Redis si se usa).
  - `README.md` con instrucciones de arranque, variables de entorno y ejemplo de uso.

---

## API: Endpoints sugeridos (alinearlos con `swagger.ts`)

- POST /api/sessions -> crear sesión WhatsApp (devuelve session id)
- GET /api/sessions -> listar sesiones
- DELETE /api/sessions/:id -> eliminar sesión
- POST /api/send -> enviar mensaje (body: sessionId, destino, tipo, payload)
- POST /api/templates -> subir plantilla
- POST /api/pdf/generate -> generar PDF (body: templateId, datos)
- POST /api/pdf/send -> generar y enviar PDF a destino
- GET /api/cron -> listar cronjobs
- POST /api/cron -> crear cronjob
- PUT /api/cron/:id -> actualizar cronjob
- DELETE /api/cron/:id -> eliminar cronjob
- POST /api/sync/contacts -> sincronizar contactos desde sesión
- POST /api/sync/groups -> sincronizar grupos desde sesión
- GET /health, GET /ready

---

## Criterios de aceptación (QA)

- Se pueden abrir y mantener al menos 3 sesiones concurrentes de WhatsApp sin degradación apreciable.
- Los cronjobs persisten en `cronjobs.json` y sobreviven reinicios.
- Contactos y grupos sincronizados se reflejan en `contacts.json` y `groups.json`.
- PDFs generados cumplen formato y se pueden descargar y enviar.
- Ante un crash simulado, el servicio se reinicia y restaura sesiones y colas pendientes.
- Endpoint `POST /api/send` con `simulate=true` no envía mensajes reales y responde con payload simulado.

---

## Puntos adicionales que como Senior recomiendo considerar

- Tests end-to-end que incluyan simulación de Baileys (mocks) para CI.
- Mecanismo de firmas/verificación de webhooks si se integran otros sistemas.
- Versionado de APIs (v1) y migraciones para JSON locales a DB.
- Política de backup y compactación para archivos JSON (cron jobs tienen TTL y snapshots).
- Límite razonable de almacenamiento local y opción de integrar S3 para archivos pesados.
- Política de gestión de sesiones (expiry, reauth) y notificaciones administrativas.

---

## Notas para el desarrollador que implementará

- Antes de implementar, parsea y utiliza [swagger.ts](swagger.ts) como la fuente de verdad para modelos y rutas.
- Prioriza endpoints mínimos viables: sesiones, envío básico, cron CRUD, sincronización y generación PDF.
- Documenta claramente cómo probar la simulación humana y cómo ajustar parámetros (delays, variance).

---

## Preguntas abiertas para aclarar con el cliente

- ¿Deseas cifrar los archivos de sesión en disco por defecto?
- ¿Preferencia por framework HTTP (Express vs Fastify) y sistema de colas en producción (Redis recomendado)?
- ¿Limite en el número de sesiones concurrentes esperado inicialmente?

---

Fin del prompt. Implementa y genera pruebas alineadas con esta especificación.