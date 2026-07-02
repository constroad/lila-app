# SCALABILITY & MULTI-SESSION — lila-app (WhatsApp/Baileys)

> **Objetivo:** plan técnico para que lila-app escale a muchas sesiones de WhatsApp
> (una por company) sin degradar el servicio ni romper el aislamiento multi-tenant.
> Reemplaza a `../MULTI-SESSION-WHATSAPP.SPEC.md` (cuyos 2 fixes ya se implementaron;
> ver §2.1) e incorpora escalabilidad, row-level security y decisión de persistencia.
>
> **Estado:** en implementación por fases (§6). **Ya implementado (Junio 2026):**
> Fase 0 (store sin mensajes + escritura async/atómica + dirty-flag), exención del
> rate-limit por IP para tráfico autenticado de tenant, cache server-side de
> grupos/contactos en Portal, y `mongoSanitize` global. Pendiente: RLS de `/message`
> (ownership), rate-limit por tenant en Redis, y sharding horizontal (Fase 3).
> **Última actualización:** Junio 2026.

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
5. **Guard en re-emparejar**: `GET /:phone/qr` y `request-pairing-code` reemplazan creds al
   escanear → también destruyen la sesión compartida. Hoy NO están tras el guard (fuera del
   alcance de 10.b). Evaluar aplicar `guardSharedSenderDestructive` (o variante) ahí.
6. **`data/outbox` y `data/conversations`**: siguen en filesystem (no son "sesión" pero son
   estado local). Migrar a Mongo para multi-instancia real (Fase 3).
7. **Recuperación de `51949376824`**: sus creds ya se borraron el 2026-07-01 → requiere
   re-emparejar (`GET /api/sessions/51949376824/qr`). El guard evita reincidencia, no resucita
   creds ya borradas.
8. **Deuda de tests**: arreglar las ~10 suites que usan `jest.mock` (ESM) — ver §9.

## 10. Nota: pairing-code (deprecado)

El emparejamiento por código nunca funcionó (Portal ni lila-app). La UI de Portal ya se
eliminó. El server aún expone `createPairingSession` + ruta `/pairing-code` (huérfanos).
Recomendado: eliminarlos del controller/rutas/tests para reducir superficie.
