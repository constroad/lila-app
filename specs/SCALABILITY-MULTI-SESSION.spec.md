# SCALABILITY & MULTI-SESSION — lila-app (WhatsApp/Baileys)

> **Objetivo:** plan técnico para que lila-app escale a muchas sesiones de WhatsApp
> (una por company) sin degradar el servicio ni romper el aislamiento multi-tenant.
> Reemplaza a `../MULTI-SESSION-WHATSAPP.SPEC.md` (cuyos 2 fixes ya se implementaron;
> ver §2.1) e incorpora escalabilidad, row-level security y decisión de persistencia.
>
> **Estado:** en implementación por fases (§6). **Ya implementado (Junio 2026):**
> Fase 0 (store sin mensajes + escritura async/atómica + dirty-flag), exención del
> rate-limit por IP para tráfico autenticado de tenant, cache server-side de
> grupos/contactos en Portal, y `mongoSanitize` global. **(2026-07-13, §10.d):**
> backoff exponencial de reconexión, auth+ownership en TODAS las rutas de sesión,
> lease process-level de sockets (anti guerra 440), signal key cache, outbox con
> TTL/cap/lock y timeout de envíos. Pendiente: rate-limit por tenant en Redis y
> sharding horizontal (Fase 3).
> **Última actualización:** 2026-07-13.

---

## 1. Alcance

- **Incluye:** persistencia del store, escritura a disco, uso de memoria, aislamiento
  multi-tenant (RLS), límites/backpressure, y camino a escalamiento horizontal.
- **No incluye:** cambios al flujo de QR, reconexión automática ni a `makeWASocket`
  (salvo lo indicado explícitamente). El pairing-code queda fuera (deprecado, ver nota final).

---

## 2. Estado actual (as-is)

### 2.1 Aislamiento por sesión — YA correcto (heredado de MULTI-SESSION-WHATSAPP.SPEC)

`src/whatsapp/baileys/sessions.simple.ts` usa diccionarios por `sessionId`
(= número emisor sin `+`): `sessions`, `stores`, `qrCodes`, `readyClients`,
`storeTimers`, `startingPromises`. No hay estado global compartido entre sesiones.
En disco, cada sesión tiene su carpeta `data/sessions/{phone}/` y su outbox.

Los 2 GAPs del spec previo **ya están corregidos** (Junio 2026):
- **Guard anti-duplicado** en `startSession` (`startingPromises` + `isSessionReady`):
  reutiliza inicialización en curso / socket vivo sin bloquear la reconexión.
- **Tracking de intervals del store** (`storeTimers` + `clearStoreTimer`) en
  `startSession`, `createPairingSession`, `disconnect/end/clearSession`.

→ La coexistencia de N sesiones es **correcta**. Lo que falta es **escalar**.

### 2.2 Persistencia actual

| Dato | Mecanismo | Tamaño/naturaleza |
|---|---|---|
| **Credenciales** (auth state) | `useMultiFileAuthState(authDir)` → archivos en `data/sessions/{phone}/` | pequeño (~KB), debe persistir, se escribe en cada `creds.update` |
| **Store** (chats/contacts/messages) | `makeInMemoryStore` → `baileys_store.json`, `JSON.stringify(…, null, 2)` con `fs.writeFileSync` **cada 10 s** (`store.manager.ts:60-76`) | **grande y creciente**: cache reconstruible |

### 2.3 Dato duro (medición real en dev)

```
data/sessions/51902049935/baileys_store.json → 84 MB
```

Un solo store de 84 MB se **serializa con pretty-print y se escribe sincrónicamente
cada 10 segundos**. Esto es el cuello de botella central.

---

## 3. Hallazgos de escalabilidad

| # | Hallazgo | Evidencia | Impacto al escalar |
|---|---|---|---|
| **H1** | Escritura **bloqueante** del store completo cada 10 s/sesión, con `JSON.stringify(…, null, 2)` + `fs.writeFileSync` | `store.manager.ts:60-76`; `sessions.simple.ts:130` | Bloquea el **event loop**; con N stores grandes la latencia de TODAS las sesiones se degrada. **Peor cuello de botella.** |
| **H2** | **Mensajes en RAM sin límite**; cada mensaje recibido se acumula para siempre | handler `messaging-history.set` (`sessions.simple.ts`) + `messages.set/push` (`store.manager.ts:126-130`); store de **84 MB** | Memoria crece con el tráfico → OOM. **La app no necesita historial** (solo envía y lista grupos). |
| **H3** | **Un solo proceso Node**; todos los sockets en un event loop | arquitectura monolítica | Crypto de Baileys compite por CPU; no se reparte entre cores/instancias. |
| **H4** | **Restore secuencial** al boot (`for … await startSession`) | `restore-sessions.simple.ts` | Cold start lento, proporcional a #sesiones. |
| **H5** | **Sin límites ni backpressure** (máx sesiones, máx memoria) | — | Un pico de sesiones puede tumbar el proceso entero. |

**Observación clave (corregida):** los **grupos** sí se obtienen on-demand vía
`sock.groupFetchAllParticipating()` (`populate-store-simple.ts:16`). Pero los **contactos NO
tienen un fetch on-demand** en Baileys: sólo llegan por el history-sync
(`messaging-history.set` → `contacts`) y los eventos `contacts.upsert/update`, y se sirven
desde `store.contacts`. Por eso el store **sí es necesario para chats y contactos** (no para
mensajes). La Fase 0 (§6) mantiene chats+contactos y sólo elimina los **mensajes** (lo que
realmente crecía sin límite). Listar contactos sigue funcionando igual que antes.

### Contactos en Baileys — limitación conocida y solución
Baileys **no** expone "traer todos los contactos"; el estado es por eventos y no hay una sola
forma canónica de storage. Además, `contacts.upsert` es **poco fiable en WhatsApp personal** y
funciona mejor en **WhatsApp Business** (issue #522). Sin history local ⇒ pocos/ningún contacto.

**Solución (implementada + recomendada):**
1. ✅ **`syncFullHistory: true`** en `makeWASocket` (startSession + createPairingSession): pide el
   history completo al conectar → maximiza chats+contactos. Sin costo de memoria porque ya no
   almacenamos mensajes.
2. ✅ **Persistir el store** (chats+contactos) para que se acumulen entre reconexiones/reinicios.
3. **Usar WhatsApp Business** en el número emisor → los contactos sincronizan de forma fiable.
4. **Derivar contactos de los chats individuales** (`@s.whatsapp.net` en `store.chats`) como
   fallback cuando `store.contacts` venga escaso (opción a futuro en `listContacts`).
5. **`sock.onWhatsApp(numero)`** para resolver/verificar un número puntual (no es una lista).
6. UX robusta: para destinos, ofrecer **grupos** (fiables) + **número manual**, sin depender de
   que WhatsApp entregue toda la agenda.

---

## 4. Row-Level Security (RLS) / multi-tenancy — re-análisis

### 4.1 Modelo de aislamiento por tenant (companyId)

- **Auth:** `requireTenant` (`middleware/tenant.middleware.ts`) deriva `companyId` de:
  - **JWT Bearer** firmado por Portal (`companyId` en el payload), o
  - **API key** `lk_fe_{companyId}_{secret}` (hash SHA-256), que además valida
    `allowedSenders` (la key solo puede usar ciertos senders) y módulos habilitados.
- **Storage:** rutas por path `companies/{companyId}/…` con anti path-traversal.
- **MongoDB Portal:** consultas filtradas por `companyId`.
- **Sesiones WhatsApp:** aisladas por `sessionId` (= sender).

### 4.2 GAP CRÍTICO de RLS — rutas `/message` sin enforcement

`src/api/routes/message.routes.ts`: **`requireTenant`, `whatsappRateLimiter` y
`requireWhatsAppQuota` están comentados** ("TESTING MODE"). Consecuencias:

1. **Sin autenticación de tenant** en el envío: `req.companyId` llega `undefined`.
2. **Sin ownership sender↔company:** nada impide que un caller haga
   `POST /api/message/{sender_de_otra_company}/text`. Un tenant podría **enviar
   mensajes desde la sesión WhatsApp de otra company** (cross-tenant). El conteo
   (Etapa 1) resuelve company por sender solo para **billing**, no autoriza.
3. **Sin enforcement de quota ni rate-limit** por company en el envío.

> Hoy el riesgo está mitigado porque el **único caller HTTP es Portal** (que sí
> firma JWT con el companyId correcto y resuelve el sender de esa company). Pero la
> defensa depende de que nadie más alcance el puerto/ruta. Es una RLS frágil.

### 4.3 Recomendaciones RLS

- **R1 (alta):** re-activar `requireTenant` en `/message` y **validar ownership**:
  el `sender` del path debe pertenecer al `companyId` autenticado
  (`company.whatsappConfig.sender` o `allowedSenders` de la API key). Rechazar 403 si no.
- **R2 (media):** índice **único parcial** sobre `whatsappConfig.sender` en Portal Mongo
  para impedir que dos companies compartan sender (evita ambigüedad de routing y de conteo).
- **R3 (media):** re-activar `requireWhatsAppQuota` para enforcement (hoy solo se cuenta).
- **R4 (baja):** rate-limit por company (`whatsappRateLimiter`) para evitar abuso de una sola company.

### 4.4 lila-app como PRODUCTO: provider de mensajería por API (sin Portal)

Visión: vender envío de mensajes por **API key de lila-app** a terceros que NO usan Portal.
Modelo correcto (la base ya existe):

- Cada consumidor externo = un **tenant** en `constroad_db` (un `Company` con `plan`/`limits`/
  `subscription.usage`), aunque no use el resto del Portal. `companyId` = identidad del cliente.
- **Auth = API key tenant** `lk_fe_{companyId}_{secret}` (ya implementada: hash SHA-256,
  `allowedSenders`, `allowedOrigins`, `rateLimit`, `keyPrefix`, `last4`, `lastUsedAt`). El JWT
  de Portal queda solo para el caller interno (Portal). `requireTenantOrApiKey` (nuevo) acepta
  ambos como puente durante la transición.
- Cada key debe portar: **scopes** (qué endpoints), **límites de uso** (mensajes/mes),
  **rate-limit** (req/min), **allowedSenders** (qué números puede usar), estado activo,
  rotación y `lastUsedAt/IP`. El `sender` del request DEBE pertenecer al tenant de la key
  (cierra el GAP §4.2 también para externos).
- **Deprecar `API_SECRET_KEY` global**: un único secreto compartido no sirve para un producto
  multi-cliente (no se puede revocar/medir/limitar por cliente). Migrar todo a keys por tenant.

→ Implica que el conteo y los límites NO pueden asumir Portal: el **enforcement vive en
lila-app** (rate-limit + quota + usage por tenant), exactamente lo que ya centralizamos para
el contador de mensajes (Etapa 1).

### 4.5 Seguridad — estado actual y hardening (rate limit · API keys · NoSQL injection)

**Rate limiting — existe pero con huecos.** Hay `apiLimiter` (global por IP), `sessionLimiter`,
`jobsLimiter`, `messageLimiter` (`api/middlewares/rateLimiter.ts`) y `company-rate-limiter`
(por company). Problemas:
- `messageLimiter` y `requireWhatsAppQuota` están **comentados** en `/message`.
- El store del rate-limiter por company es un **`Map` en memoria**
  (`company-rate-limiter.middleware.ts:70`) → **no funciona entre instancias**; al escalar
  horizontalmente cada proceso cuenta por separado.
- **Recomendado:** enforcement **por tenant** (no solo IP); mover el contador a **Redis**
  (store compartido) para multi-instancia; límites por API key (req/min + mensajes/mes).

**Protección de API key — buena base, falta cerrar.** Las keys `lk_fe_` están **hasheadas
SHA-256** con `allowedSenders`/`allowedOrigins`/`rateLimit` y compare **timing-safe**. Debilidades:
- `API_SECRET_KEY` global sigue activo → **deprecar**.
- **Recomendado:** rotación + expiración opcional, **scopes por endpoint**, registro de uso/IP,
  alertas de uso anómalo, y aplicar timing-safe en todas las comparaciones de secreto.

**NoSQL injection (Mongo) — riesgo BAJO hoy.** Se usa Mongoose con filtros estructurados; los
`$regex` de migración escapan input (`escapeRegex`); no se hallaron sinks `find(req.body)`,
`findOne(req.query)` ni `$where` desde input. Hardening defensivo:
- Añadir **`express-mongo-sanitize`** (elimina claves con `$`/`.` de `req.body/query/params`)
  para neutralizar operator-injection (`{ "$ne": null }`, `{ "$gt": "" }`).
- **Validar/whitelistear** todo input con joi/zod en cada controller (hoy parcial); castear a
  los tipos esperados antes de consultar. **Nunca** pasar `req.body`/`req.query` crudos como filtro.
- Mantener `helmet` + CORS por origen (ya presente).

---

## 5. Persistencia del store: ¿JSON local → MongoDB? (decisión)

### 5.1 Naturaleza de cada dato

- **Creds (auth state):** pequeño, **debe persistir** (perder = re-escanear QR), churn bajo.
- **Store (chats/contacts/messages):** tamaño GRANDE por los mensajes; churn ALTO.
  - `messages`: **no se necesitan** → eliminar (era el 99% del peso).
  - `groups`: reconstruibles on-demand (`groupFetchAllParticipating`).
  - `contacts`: **NO** hay fetch on-demand; dependen del store (history-sync + `contacts.*`).
    Por eso chats+contactos se mantienen persistidos (son pequeños sin los mensajes).

### 5.2 Comparativa de opciones

| Opción | Creds | Store hot (groups/contacts) | Pros | Contras |
|---|---|---|---|---|
| **A. JSON local optimizado** (async+atómico, sin pretty-print, dirty-flag, sin messages) | volumen | archivo pequeño | Cero infra nueva; mínimo cambio | Atado a FS local → no sirve para multi-instancia sin volumen compartido |
| **B. MongoDB** (`useMongoDBAuthState` para creds + doc pequeño de groups) | Mongo | doc pequeño/sesión | Sin FS compartido → **habilita workers stateless**; ya hay conexión a Mongo Portal | **NO** para el store completo: límite 16 MB/doc (¡el store actual es 84 MB!) y write-amplification por churn |
| **C. Redis** (creds + cache hot con TTL) | Redis (AOF) | keys por sesión, TTL | Ideal para estado hot efímero; rápido; pub/sub para routing | Infra nueva; durabilidad de creds requiere AOF/persistencia bien configurada |

### 5.3 Recomendación

1. **Eliminar el almacenamiento de mensajes** (no bindear historial; o cap a los últimos
   N por chat). El store cae de **~84 MB a KB**. Resuelve H1 y H2 casi por completo, sin infra nueva.
2. **Creds:** mantener `useMultiFileAuthState` (volumen) **mientras sea single-instance**.
   Migrar a **MongoDB auth state** (opción B, solo creds) **cuando se vaya a multi-instancia**
   (workers stateless sin volumen compartido).
3. **Groups/contacts:** servir **on-demand** + cache en memoria con TTL corto; persistir solo
   un snapshot **pequeño** (archivo async/atómico, o Redis si ya existe).
4. **NO** mover el store JSON completo a Mongo (límite 16 MB + churn). Mongo solo para creds
   y, si acaso, un snapshot reducido de grupos.

> Regla: **Mongo para lo durable y pequeño (creds); memoria/Redis para lo hot; nada para
> los mensajes.** "JSON local → Mongo" del store completo **no es recomendable**.

---

## 6. Plan de escalamiento por fases (incremental, no-breaking)

### Fase 0 — Quick wins de I/O y memoria — ✅ IMPLEMENTADO (Junio 2026)
- **No persistir mensajes**: `store.manager.ts` ya no escucha `messages.upsert` ni hidrata/
  serializa `messages`; el handler `messaging-history.set` (`sessions.simple.ts`) solo guarda
  chats/contactos. El store cae de ~84 MB a KB.
- **Escritura async + atómica**: `writeToFile` ahora es async, escribe a `${file}.tmp` + `rename`,
  sin pretty-print. Ya no bloquea el event loop.
- **Dirty-flag**: solo persiste si hubo cambios (`markDirty()` desde bind/history/populate).
- **Lecturas (grupos/contactos) fuera del rate-limit:** el limiter por IP ahora **exime** el
  tráfico autenticado de tenant (JWT/`lk_fe_`), y Portal cachea grupos/contactos 60 s server-side
  (`server/whatsapp/whatsappReadCache.ts`) + hooks con `cacheTime` 60 s sin `revalidateOnFocus`.
  Resultado: muchos selectores en muchas páginas = ≤1 lectura/min/company a lila-app.

### Fase 1 — Persistencia/creds redesign — 🟡 PARCIAL (Junio 2026)
- ✅ **Creds SIEMPRE en Mongo** (único auth store, sin env var): `mongo-auth-state.ts`
  (`useMongoAuthState`, `clearMongoAuthState`, `listMongoAuthSessions`), wired en
  `startSession`/`createPairingSession`/`clearSession`/`restoreAllSessions`. Colección
  `whatsapp_auth` = creds + signal keys (KB). Resuelve el caso prod: el sender vive en la DB
  compartida, así que sus creds viven ahí también → cualquier máquina/instancia restaura las
  sesiones. Los **chats/contactos NO van a Mongo** (cache local liviano; se reconstruyen al
  conectar). Habilita multi-instancia (workers stateless). `restoreAllSessions` lista los
  sessionIds desde Mongo (no desde archivos).
- ⏳ Pendiente: servir grupos/contactos on-demand con cache TTL; reducir el snapshot persistido.

### Fase 2 — RLS + seguridad de producto (ver §4.3, §4.4, §4.5) — 🟡 PARCIAL (Junio 2026)
- ✅ **Auth + ownership en `/message`, env-gated y backward-compatible.** Por defecto
  (`WHATSAPP_RLS_ENFORCE` ≠ `true`) usa `optionalTenant` (identifica tenant si hay JWT, **no
  bloquea**) + `requireSenderOwnership` en modo **solo-aviso** (loggea mismatches). Con el flag
  en `true` exige `requireTenantOrApiKey` (JWT/`lk_fe_`/secreto) y **bloquea** envíos cuyo sender
  no pertenece a la company. Permite push a prod sin romper y activar el bloqueo tras validar logs.
- ✅ **Auth en `/sessions/*`** (state-changing) vía `requireTenantOrApiKey`.
- ⏳ Pendiente: índice único parcial en `whatsappConfig.sender` (R2); enforcement de quota/
  rate-limit por tenant (R3/R4, idealmente Redis); scopes por API key (§4.4); deprecar
  `API_SECRET_KEY` global. Validación joi/zod por controller.
- ✅ **`mongoSanitize` global** (§4.5) ya aplicado.

### Backward-compatibility (push a producción)
- **Default seguro:** todo lo de Fase 2 que podría rechazar tráfico está detrás de
  `WHATSAPP_RLS_ENFORCE` (off por defecto). Con el flag off, `/message` se comporta igual que
  hoy (sin bloqueo); solo mejora el conteo (companyId autoritativo) y loggea mismatches.
- **`/sessions/*`:** `requireTenantOrApiKey` es más permisivo que el secreto-global previo
  (acepta también JWT y `lk_fe_`) → no rompe a Portal (que firma JWT).
- **A vigilar:** `mongoSanitize` elimina claves con `$`/`.`; confirmar que ningún endpoint
  recibe legítimamente claves así. `requireSenderOwnership` añade un `findOne` por envío cuando
  hay JWT (cacheable a futuro).

### Fase 3 — Escalamiento horizontal (sharding de sesiones)
- **Registry de sesiones** (Mongo `whatsapp_sessions` o Redis): `{ sender, workerId, status,
  heartbeat }`. Fuente de verdad de qué worker tiene cada sesión.
- **N workers** (procesos/contenedores), cada uno con M sesiones; creds en Mongo auth state
  (stateless, sin volumen compartido).
- **Router/Gateway**: enruta `POST /message/{sender}` al worker dueño (consulta el registry).
  Sticky por sender; rebalanceo al caer un worker (claim por heartbeat expirado).
- **Restore paralelo y acotado** (pool de concurrencia) por worker.

### Fase 4 — Límites y observabilidad
- Máx sesiones por worker + backpressure (rechazar/encolar nuevas si saturado).
- **Rate-limit por tenant en Redis** (store compartido) — reemplaza el `Map` en memoria
  (`company-rate-limiter.middleware.ts`) que no sirve multi-instancia (§4.5).
- Métricas: #sesiones, RAM/sesión, latencia de envío, tamaño de store, fallos de reconexión,
  **uso por API key/tenant** (para billing del producto, §4.4).
- Alertas (reusar `telegram-alert.service`) por saturación, store anómalo o abuso de key.

---

## 7. Arquitectura objetivo (Fase 3)

```
                 ┌────────────────────────┐
 Portal ───────► │  Gateway / Router       │  (resuelve worker por sender)
   (JWT)         │  + requireTenant + RLS   │
                 └──────────┬─────────────┘
                            │ consulta registry (sender → workerId)
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
        Worker A        Worker B          Worker C
     (sesiones 1..M)  (sesiones …)      (sesiones …)
        creds ◄────────── MongoDB authState (stateless) ──────────►
        registry/heartbeat ◄──── Mongo `whatsapp_sessions` / Redis ────►
```

---

## 8. Mapa de impacto / no romper / riesgos

| Cambio | Toca QR | Toca reconexión | Riesgo | Mitigación |
|---|---|---|---|---|
| Fase 0 (no-messages, async write) | No | No | Bajo | Mantener formato del JSON (sin `messages`); fallback a leer formato viejo |
| Fase 2 (RLS) | No | No | **Medio-alto** (puede rechazar envíos si algún caller no autentica) | Validar que Portal es el único caller; rollout con logging antes de bloquear |
| Fase 3 (sharding) | No | Sí (routing) | Alto | Feature-flag; correr 1 worker primero; registry con claim idempotente |

**No romper:** aislamiento por sesión, outbox, `makeWASocket`, contratos HTTP con Portal.

---

## 9. Métricas de éxito / verificación

- Store por sesión < 1 MB (tras Fase 0); sin `writeFileSync` bloqueante en perfiles.
- RAM por sesión acotada y estable bajo tráfico.
- Envío cross-tenant **rechazado** (403) tras Fase 2.
- Con sharding: caída de un worker no afecta sesiones de otros; rebalanceo automático.
- `npm run build` + tests verdes en cada fase. Correr jest con
  `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=4096"`. Suites de
  `sessions.simple` / `restore-sessions` / `session.routes` + `tenant.middleware` ya verdes
  (57/57). ⚠️ Otras ~10 suites siguen rotas por usar `jest.mock` (incompatible con ESM) en
  vez de `jest.unstable_mockModule` — pre-existente, arreglar aparte.

---

## 10.b Hardening multi-tenant + recuperación (✅ IMPLEMENTADO jul 2026)

Raíz del incidente `51949376824`: `POST /sessions/:phone/clear` desde UN tenant borraba las
creds Mongo de un número **compartido por varias companies** (globofas-s8k, constroad, test);
sin re-emparejar QR no había recuperación. Además, un cierre `401 (loggedOut)` dejaba las creds
muertas en Mongo → `restoreAllSessions` las relevantaba en cada arranque → 401 → loop infinito.

Implementado (commit "fix(whatsapp): guard multi-tenant… + fix loop 401"):
- **`guardSharedSenderDestructive`** (`tenant.middleware.ts`) en `/clear`, `/logout`, `DELETE`:
  409 si >1 company usa el sender (salvo `force:true`); 403 si el sender es de otra company;
  fail-open ante fallo de lookup (backward-compatible). Usa `quotaValidatorService.
  listCompaniesByWhatsappSender` (todas las dueñas).
- **`restartSession` + `POST /:phone/restart`**: reinicio SUAVE (`sock.end()` sin logout,
  conserva creds/store). Es la operación que debe usar el botón "reconectar" del Portal.
- **Fix loop 401**: el close `loggedOut` ahora hace `clearMongoAuthState` (creds muertas ya no
  se reintentan en restore). Igual criterio en `createPairingSession`.

## 10.c Pendientes (tras 10.b)

Ordenado por prioridad. Nada de esto está hecho todavía.

1. **Parte 1 — Store chats/contactos → Mongo** (elimina el último archivo local de sesión,
   `data/sessions/{id}/baileys_store.json`). Sin mensajes el store pesa KB → cabe en Mongo
   (colección `whatsapp_store`, 1 doc/sessionId) sin chocar con el límite de 16 MB que vetaba
   §5.3. Nuevo `mongo-store.ts` (load/save/clear); `store.manager` deja de usar `fs`;
   `clearSession` borra doc Mongo en vez de `fs.remove(sessionDir)`; script de migración
   opcional (el store se reconstruye al conectar). Habilita workers stateless (Fase 3).
2. **Parte 2 — `whatsapp_sessions` como fuente de verdad del estado** (status/lifecycle en
   Mongo por sessionId: `connected|connecting|disconnected|logged_out`, `lastConnectedAt`,
   `lastDisconnectReason`). Hoy hay divorcio: restore mira `whatsapp_auth` (creds) pero
   "registrada" = `whatsappConfig.sender` en la company → una sesión puede figurar registrada
   y no restaurarse. `restoreAllSessions` restauraría donde haya creds Y status != logged_out;
   `/status` y `/list` leerían de aquí.
3. **Atribución de cuota para senders compartidos**: `quota-validator.getCompanyByWhatsappSender`
   asume 1 sender→1 company y resuelve "a la primera por companyId". Con sender compartido
   (confirmado como legítimo) el conteo/quota/rate-limit debe atribuirse a la company del
   `companyId` autenticado en el request, no al "dueño" del sender. Decidir e implementar.
4. **Portal (repo aparte)**: el botón de "reset/reconectar" debe llamar `POST /:phone/restart`
   (suave); dejar el `/clear` destructivo detrás de confirmación explícita + `force:true`.
5. ~~**Guard en re-emparejar**~~ ✅ RESUELTO en 10.d (2026-07-13): `/qr`, `request-pairing-code`
   y demás rutas por número están tras `requireSessionOwnership` (dueño/co-dueño del sender).
6. **`data/outbox` y `data/conversations`**: siguen en filesystem (no son "sesión" pero son
   estado local). Migrar a Mongo para multi-instancia real (Fase 3). Mitigado en 10.d con
   cap de 50 items + TTL 24h + maxAttempts (ya no crece sin límite).
7. **Recuperación de `51949376824`**: sus creds ya se borraron el 2026-07-01 → requiere
   re-emparejar (`GET /api/sessions/51949376824/qr`). El guard evita reincidencia, no resucita
   creds ya borradas.
8. **Deuda de tests**: arreglar las ~10 suites que usan `jest.mock` (ESM) — ver §9.

## 10.d Hardening post-incidente reconexión (✅ IMPLEMENTADO 2026-07-13)

Contexto: incidente del 2026-07-13 — un blip de red (EPIPE a Atlas + disconnect `428`)
tiró la sesión `51902049935`; el backoff lineal (3s×intento, cap 60s) martilló el login
cada ~2.5 min y WhatsApp **throtleó el handshake** (14 intentos colgados sin open/close,
el watchdog de 90s los mataba con `Disconnect reason: undefined`) durante ~35 min hasta
aceptar uno en 2s. La auditoría posterior encontró además huecos cross-tenant en las
rutas de sesión. Todo lo siguiente quedó implementado:

### Resiliencia de reconexión (`sessions.simple.ts`)
- **Backoff exponencial** `reconnectDelayMs()`: base 3s, duplica por intento, cap 10 min,
  jitter ±20% (evita sincronizar reintentos multi-sesión tras un corte común). El caso
  440 fuerza intento ≥6 (delay ≥96s). Reemplaza al lineal capado a 60s que sostenía el
  throttle. Alerta Telegram al intento 5 ahora dice "NO re-emparejes: se recupera sola".
- **Logger Baileys configurable**: `pino({ level: WHATSAPP_BAILEYS_LOG_LEVEL })` (default
  `fatal`); antes hardcodeado `silent` = ceguera total durante handshakes fallidos.
  `Disconnect reason` loggea código + mensaje del error (adiós `undefined` mudo).
- **`makeCacheableSignalKeyStore`** sobre el auth-state Mongo: sin él, cada
  cifrado/descifrado (por device en grupos) hacía `findOne` a Atlas (~100ms RTT) —
  envíos lentos y capa cripto acoplada a hipos de Atlas.
- **`msgRetryCounterCache`** (CacheStore Map propio, cap 5k, sin dependencia nueva):
  dedupe de retry-receipts (evita bucles de reintento multi-device).
- **Versión WA cacheada** (`baileys-version.ts`): TTL 6h + stale-on-error. Antes cada
  reconexión hacía fetch a internet — quemaba intentos justo cuando la red estaba mal.

### Lease process-level de sockets (`instance-lease.ts`) — anti guerra 440
- Doc único en `whatsapp_instance_lease` con TTL 90s + heartbeat 30s. Solo el holder
  abre sockets: guard en `startSession`/`createPairingSession` (cubre restore, reconnect
  y QR); `restoreAllSessions` se omite en procesos pasivos (con alerta Telegram).
- Failover automático al expirar el TTL; release explícito en graceful shutdown.
- **Fencing suave deliberado**: perder el lease en caliente (Atlas inaccesible >TTL) NO
  cierra sockets — matar sesiones sanas durante un corte de Mongo sería peor. Previene
  el escenario real (dos procesos VIVOS restaurando a la vez).
- Toggle: `WHATSAPP_SOCKET_LEASE=false`. NO es el handoff prod↔dev por sesión de
  `SESSION-LEASE.spec.md` (ese sigue propuesto); es el candado "un proceso con sockets".

### Seguridad de rutas de sesión (cierra 10.c#5 y amplía §4)
- **TODAS** las rutas `/api/sessions/*` exigen `requireTenantOrApiKey`. Antes `/groups`,
  `/contacts`, `/status`, `/list` y `GET /` estaban SIN auth — con lila expuesta por
  HTTPS público era volcado de PII (contactos/grupos de cualquier sesión) a internet.
- **`requireSessionOwnership`** (tenant.middleware) en `/qr`, `/request-pairing-code`,
  `/restart`, `/status`, `/groups`, `/syncGroups`, `/contacts` y `POST /sessions`
  (lee `:phoneNumber` o `body.phoneNumber`): dueño o co-dueño del sender; número SIN
  dueño pasa con warn (1er emparejamiento); mismatch 403; lookup caído 503 fail-closed
  (un QR no se regala por un hipo de Mongo). Sin esto, cualquier tenant autenticado
  podía ver el QR de un sender ajeno (= account takeover del canal) o reiniciarle la
  sesión (DoS que además dispara el throttle de login).
- **Guard de modo proxy en `/clear` y `/disconnect`**: un `/clear` en una instancia dev
  con send-proxy activo borraba las creds de PROD en el Mongo compartido.
- Portal: `api/super/whatsapp-sessions` ahora firma JWT (`portal-super`) para `/list`.
- Rate limiter: el bypass por API key global exige string no vacío (antes, sin
  `API_SECRET_KEY` en el env, `undefined === undefined` desactivaba el límite).

### Outbox robusto (`outbox-queue.ts` + `flushOutbox`)
- `OUTBOX_MAX_ATTEMPTS=5` + `OUTBOX_TTL_MS=24h` + **skip** de items envenenados/expirados
  (antes: break-on-first-error → un item podrido bloqueaba TODA la cola para siempre).
  Solo corta si la sesión cae a mitad del flush.
- Media del flush con `queueOnFail:false`: antes un fallo re-encolaba un DUPLICADO al
  final y el flush daba el original por enviado (rotación infinita silenciosa).
- **Cap `OUTBOX_MAX_ITEMS=50`** por sesión con drop-oldest + alerta Telegram (dedupe):
  los media viajan base64 dentro del JSON (se reescribe entero por operación).
- **Lock anti-flush concurrente** por sesión (dos `open` cercanos duplicaban envíos).
- **Timeout defensivo 120s** en los 4 `sock.sendMessage` (text/image/video/document):
  un socket medio muerto ya no cuelga el request del caller; al vencer cae al
  `queueOnFail`. Trade-off: entrega post-timeout ⇒ posible duplicado (aceptado).

Cobertura: ~50 tests nuevos (backoff, lease, ownership, outbox, timeout, guards).
Detalle narrativo en `architecture-as-is.md` §Observaciones.

## 10.e Throttle de login en cuentas pesadas: menos ruido + recuperación más rápida (✅ IMPLEMENTADO 2026-07-14)

Contexto: log de prod 2026-07-14 — un blip de red tiró a la vez `51903124919`,
`51949376824` y `51902049935` (varios `428` en 22:42–22:46). Los dos primeros (cuentas
livianas, ~100–240 chats) reconectaron en 1–2 intentos. `51902049935` (cuenta PESADA: 2426
chats / 3243 contactos, el número del send-proxy) entró en throttle de login: 10 intentos y
~48 min de `session closed` / `watchdog 90s` antes de abrir (`RECONECTADA tras 10 intentos`
a las 23:10). **Recuperó solo, SIN re-emparejar → las creds están VIVAS.** No es loop
infinito ni creds muertas (hipótesis inicial descartada por el propio log). Es throttle, y
duele solo en la cuenta pesada.

Dos causas del RUIDO (no de la caída inicial, que es la red):
1. **Backoff demasiado gradual**: el ramp 3s→6s→12s→24s→48s→81s (primeros ~6 intentos en
   ~3 min) **martilla** el login y SOSTIENE el throttle; recién al espaciar ~200s+ (intento
   7+) WhatsApp lo aceptó. Los primeros 6–8 `session closed` no aportaban nada.
2. **`syncFullHistory:true` en CADA reconexión**: el store vive en Mongo y persiste (2426
   chats se recargan de Mongo), así que re-pedir el history completo cada vez es carga
   desperdiciada que además agrava el throttle en cuentas grandes.

### Fixes (`sessions.simple.ts`)
- **Piso de backoff ante STALL** `STALL_BACKOFF_FLOOR_ATTEMPT=6`: si un socket cierra/expira
  SIN llegar nunca a `open` (= throttle, no corte normal), el siguiente reintento salta ya a
  ~192s en vez de subir desde 3s. El primer reintento rápido (3s) sigue cubriendo el corte
  transitorio; solo si ESE se cuelga espaciamos duro. Efecto: ~2–3 `session closed` en vez
  de ~10 y recuperación más rápida. NO afecta a cuentas livianas (nunca hacen stall).
- **`syncFullHistory: !state.creds.registered`**: history completo solo en el 1er
  emparejamiento; ya emparejada, el store de Mongo basta + eventos en vivo. Menos carga por
  reconexión en cuentas pesadas.

### Estado terminal "aparcado" (red de seguridad, no el caso de hoy)
- **`connectingStalls[sessionId]`** cuenta stalls (cierres sin `open`); flags por-socket
  (`everOpened`, `stallCounted`) evitan doble conteo; un `open` lo resetea.
- **`MAX_CONNECTING_STALLS=12`** (env `WHATSAPP_MAX_CONNECTING_STALLS`): al alcanzarlo,
  `parkSession()` corta el loop, marca `readyClients=false` y alerta distinta ("APARCADA …
  re-emparejar"). Con el backoff nuevo un throttle real recupera en pocos stalls (hoy fueron
  ~10 con el ramp viejo), así que 12 NO se dispara por throttle: solo si algo está de verdad
  muerto (~1.5–2 h colgado). Los mensajes siguen a salvo en el outbox.
- **Desaparque solo MANUAL** (restart/pairing/disconnect/clear/loggedOut); la reconexión
  automática NO resetea (si no, nunca llegaría al tope).
- **`isSessionParked()`** → status `needs_repair` + `needsRepair:true` para Portal.
- Cobertura: +3 tests (aparca y deja de crear sockets; restart desaparca; open resetea).

> Nota operativa: el DISPARADOR diario es el blip de red de la Mac mini (varias sesiones
> `428` a la vez). Estabilizar esa conectividad (o quitar el número de pruebas del restore
> si no se usa en prod) elimina el ruido de raíz; los fixes de código lo hacen tolerable.

## 10. Nota: pairing-code (deprecado)

El emparejamiento por código nunca funcionó (Portal ni lila-app). La UI de Portal ya se
eliminó. El server aún expone `createPairingSession` + ruta `/pairing-code` (huérfanos).
Recomendado: eliminarlos del controller/rutas/tests para reducir superficie.
