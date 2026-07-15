# SESSION LEASE — ownership prod/dev de sesiones WhatsApp (lease con TTL)

> **Objetivo:** permitir que una sesión WhatsApp (Baileys) se "preste" de producción
> a una instancia local de desarrollo sin re-emparejar, sin guerra de 440s y con
> reversión automática a prod si dev desaparece (lease con TTL).
>
> **Problema:** un número WhatsApp admite UN solo socket vivo. Hoy, correr lila-app
> local con las mismas creds Mongo que prod produce conflicto 440 (ya mitigado con
> backoff largo + alerta en `sessions.simple.ts`), y dos procesos escribiendo
> `whatsapp_auth` a la vez pueden corromper signal keys → re-escaneo forzado.
>
> **Estado:** propuesto (Julio 2026). No implementado — CON UNA EXCEPCIÓN parcial:
> el 2026-07-13 se implementó un **lease PROCESS-LEVEL** complementario
> (`src/whatsapp/baileys/instance-lease.ts`, colección `whatsapp_instance_lease`,
> TTL 90s + heartbeat 30s, guard en startSession/pairing/restore, release en
> shutdown, toggle `WHATSAPP_SOCKET_LEASE=false`). Ese candado garantiza "UN solo
> proceso con sockets a la vez" (anti guerra 440 por proceso duplicado / dev sin
> proxy) con failover automático — pero NO cubre el objetivo de ESTE spec: el
> handoff prod↔dev POR SESIÓN con toggle en el super admin, que sigue propuesto.
> Ver SCALABILITY-MULTI-SESSION.spec §10.d.
> Relacionado: `specs/SCALABILITY-MULTI-SESSION.spec.md` (§5 persistencia creds en Mongo).

---

## 1. Alcance

- **Incluye:** modelo de lease en Mongo, watcher de reconciliación por rol
  (prod/dev), guards de ownership en start/restore/reconnect, protocolo de
  handoff ordenado, TTL con auto-reversión, endpoints en lila, toggle en el
  super admin de Portal.
- **No incluye:** cambios al flujo QR/pairing, al auth state (`mongo-auth-state.ts`
  queda igual), ni multi-instancia horizontal de prod (sigue habiendo 1 prod).
  No es sharding: es un switch prod↔dev por sesión.

### 1.1 Alternativas evaluadas (contexto de la decisión)

| Opción | E2E real (texto+media) | Prueba código lila local | Costo | Veredicto |
|---|---|---|---|---|
| Número dev dedicado | ✅ | ✅ | segundo número (no disponible) | ideal; descartado por falta de número |
| Portal local → lila prod (Tailscale) | ✅ | ❌ (corre lila de prod) | solo `.env` de Portal | usar YA para cambios de Portal; complementaria al lease |
| Send-proxy (lila local delega envío a `/message/*` de prod) | ✅ | ✅ lógica; ❌ path Baileys/entrantes/sesión | cambio chico en `whatsapp-direct.service` | ✅ **IMPLEMENTADO** (jul 2026): `whatsapp-proxy.service.ts` + `WHATSAPP_PROXY_TARGET_URL`; ver architecture-as-is §WhatsApp. Cubre el 90% de las pruebas; este lease queda para el caso socket/entrantes |
| Dry-run / desvío a Telegram | ❌ (canal y media distintos) | ✅ | chico | descartado como prueba e2e |
| **Lease (este spec)** | ✅ | ✅ completo (socket, entrantes, ciclo de sesión) | el mayor de la lista | única opción full-fidelity sin segundo número |

---

## 2. Estado actual relevante (as-is)

- Creds y signal keys en Mongo compartido (Atlas): colección `whatsapp_auth`,
  `src/whatsapp/baileys/mongo-auth-state.ts`. Portables entre máquinas —
  **cerrar socket sin `logout()` NO invalida la sesión** (base del handoff).
- `endSession()` (`sessions.simple.ts`) ya hace exactamente el cierre que
  necesita el release: `sock.end()` sin logout, marca `shuttingDown`, conserva creds.
- Restore al arranque: `restore-sessions.simple.ts` lista creds de Mongo y filtra
  por senders activos de companies. Gate por env: `WHATSAPP_RESTORE_SESSIONS`
  (default true solo en production, `config/environment.ts:55`).
- Reconexión: `scheduleReconnect()` con backoff, intentos ilimitados. 440
  (`connectionReplaced`) → backoff largo + alerta Telegram a las 3 consecutivas.
- Outbox: `JsonStore` **local por máquina** (`src/whatsapp/queue/outbox-queue.ts`,
  `data/outbox/`). Envíos con sesión no-ready se encolan y flushan en
  `connection.open` de ESA máquina. No cruza de prod a dev.
- Portal super admin: `src/pages/admin/super/whatsapp-sessions.tsx` (ya shadcn)
  + API `src/pages/api/super/whatsapp-sessions.ts` (proxy a lila `/sessions/list`).
- Auth de rutas de sesión: `requireTenantOrApiKey` (JWT tenant / `lk_fe_` / api key global).

---

## 3. Modelo de datos

Colección nueva `whatsapp_session_leases`, 1 doc por sesión. **Sin doc = owner
prod** (default implícito, cero migración: nada cambia hasta togglear).

```ts
// src/types/session-lease.types.ts
export type LeaseRole = 'prod' | 'dev';

export interface SessionLease {
  _id: string;                    // sessionId (sender sin '+')
  desiredOwner: LeaseRole;        // intención (toggle super admin)
  holder: LeaseRole | null;       // quién tiene el socket ahora
  holderInstanceId: string | null;// hostname para diagnóstico
  requestedAt: Date;              // cuándo se pidió el último cambio de owner
  releasedAt: Date | null;        // set por quien soltó limpiamente el socket
  heartbeatAt: Date | null;       // último latido del holder dev
  leaseExpiresAt: Date | null;    // solo con desiredOwner='dev'; sliding
  updatedAt: Date;
}
```

### Constantes (`src/constants/session-lease.constants.ts`)

| Constante | Valor | Razón |
|---|---|---|
| `LEASE_POLL_INTERVAL_MS` | 15 000 | latencia de handoff aceptable sin change streams |
| `LEASE_HEARTBEAT_INTERVAL_MS` | 60 000 | renovación del lease dev |
| `DEV_LEASE_TTL_MS` | 10 min | ventana máx. de sesión caída si dev muere sin soltar |
| `FORCE_CLAIM_GRACE_MS` | 90 000 | dev reclama sin `releasedAt` si prod no respondió (prod caído) |

TTL sliding: cada heartbeat extiende `leaseExpiresAt = now + DEV_LEASE_TTL_MS`.
`DEV_LEASE_TTL_MS >> skew` de relojes; los writes de fechas usan `$currentDate`
(hora del server Mongo) para no depender del reloj local.

### Rol de la instancia (SIN env nuevas)

- El rol se deriva de `config.nodeEnv`, que ya existe y ya gobierna
  `WHATSAPP_RESTORE_SESSIONS`: `production` → `'prod'`, cualquier otro → `'dev'`.
  Exponer como `config.whatsapp.leaseRole` en `config/environment.ts`.
- `holderInstanceId` = `os.hostname()` automático. No es configuración: es solo
  informativo (el UI muestra qué máquina tiene el socket).

---

## 4. Reglas de ownership

Una instancia "es owner efectivo" de una sesión cuando:

- **Rol prod:** no hay doc de lease, o `desiredOwner='prod'`, o
  `desiredOwner='dev'` con `leaseExpiresAt < now` (lease vencido).
- **Rol dev:** `desiredOwner='dev'` y lease no vencido y
  (`releasedAt != null` o `now - requestedAt > FORCE_CLAIM_GRACE_MS`).

Regla dura: **una instancia jamás abre socket de una sesión de la que no es
owner efectivo.** El guard vive en `startSession` (cubre restore, reconnect,
y creación manual vía API en una sola puerta).

---

## 5. Protocolo de handoff

### 5.1 Prod → dev (togglear "usar en local")

1. Super admin (Portal) → `PATCH /api/sessions/:phone/lease { desiredOwner: 'dev' }`
   en lila prod. Upsert del doc: `desiredOwner='dev'`, `requestedAt=now`,
   `releasedAt=null`, `leaseExpiresAt=now+TTL`.
2. Watcher de prod (siguiente tick ≤15 s): ve `desiredOwner='dev'` con socket
   local vivo → **release ordenado**: `endSession(sessionId)` (sin logout, marca
   `shuttingDown` → el `connection.close` NO reprograma reconnect) → luego
   `holder=null, releasedAt=now`. El orden importa: `releasedAt` se escribe
   DESPUÉS de cerrar, así dev nunca conecta con prod aún escribiendo keys.
3. Watcher de dev: ve `desiredOwner='dev'` + `releasedAt` set → claim atómico
   (§5.4) → `startSession(sessionId)`. Arranca heartbeat.
4. Si prod está caído y nunca escribe `releasedAt`: dev reclama igual tras
   `FORCE_CLAIM_GRACE_MS` (no hay socket rival que corromper). Cuando prod
   vuelva, su restore ve el lease dev vigente y NO levanta la sesión.

### 5.2 Dev → prod (toggle de vuelta, o apagado de dev)

- **Toggle manual:** `desiredOwner='prod'`. Watcher de dev → `endSession` +
  `holder=null, releasedAt=now`. Watcher de prod → claim + `startSession`.
- **Shutdown graceful de dev (SIGINT/SIGTERM):** suelta el socket y escribe
  `holder=null, releasedAt=now` pero NO revierte `desiredOwner` — un reinicio
  rápido de dev retoma sin rebotar la sesión a prod. La sesión queda caída
  hasta que dev vuelva o venza el TTL (máx. 10 min, aceptable para empresa test).
- **Dev muere sin soltar (laptop cerrada, crash):** heartbeat se detiene →
  `leaseExpiresAt` vence → watcher de prod hace **auto-reversión**:
  `desiredOwner='prod', holder='prod', leaseExpiresAt=null` + `startSession` +
  alerta Telegram (`dedupeKey: lease-expired-{sessionId}`,
  "lease dev de {sessionId} venció; prod reclamó la sesión").

### 5.3 Ventana sin holder

Durante el handoff (≤ ~30 s) y mientras dev esté caído con lease vigente, los
envíos en cada instancia se encolan en **su** outbox local (comportamiento
actual, sin cambios) y se flushan cuando ESA instancia vuelva a abrir la
sesión. Consecuencia documentada: crons/envíos de prod durante ownership dev
quedan en el outbox de prod hasta la reversión. Aceptable para la empresa test;
NO togglear sesiones de companies reales con tráfico.

### 5.4 Claim atómico

Claim y release usan `findOneAndUpdate` con filtro condicional (p.ej. claim dev:
`{ _id, desiredOwner: 'dev', holder: null }` → `$set { holder: 'dev', ... }`).
Si el filtro no matchea, otra instancia ganó → no conectar. Evita doble socket
por carrera entre ticks.

---

## 6. Cambios por archivo

### lila-app

| Archivo | Cambio |
|---|---|
| `src/types/session-lease.types.ts` | **nuevo** — tipos §3 |
| `src/constants/session-lease.constants.ts` | **nuevo** — constantes §3 |
| `src/whatsapp/baileys/session-lease.ts` | **nuevo** — acceso a colección: `getLease`, `isEffectiveOwner(sessionId)`, `claimLease`, `releaseLease`, `renewLease`, `setDesiredOwner` (todas con writes atómicos §5.4) |
| `src/whatsapp/baileys/session-lease.watcher.ts` | **nuevo** — un solo `setInterval` global (tick §5 según `config.whatsapp.leaseRole`), heartbeat de sesiones dev-owned, auto-reversión por TTL + alerta |
| `src/whatsapp/baileys/sessions.simple.ts` | guard en `startSession`: si no soy owner efectivo → throw `LeaseNotOwnedError` (log claro, sin reintento). En el handler de 440: si no soy owner → NO reprogramar reconnect (hoy hace backoff largo). En catch de `scheduleReconnect`: `LeaseNotOwnedError` → abandonar el loop |
| `src/whatsapp/baileys/restore-sessions.simple.ts` | filtrar `sessionIds` por `isEffectiveOwner` (skip + log, mismo patrón que `ignoredSessionIds`) |
| `src/api/controllers/session.controller.simple.ts` | `getAllSessionsHandler`: incluir `lease` por sesión. Nuevo `updateLeaseHandler` (valida `desiredOwner`, llama `setDesiredOwner`) |
| `src/api/routes/session.routes.ts` | `PATCH /:phoneNumber/lease` con `requireTenantOrApiKey` |
| `src/index.ts` | arrancar `startLeaseWatcher()` tras `restoreAllSessions` (ambos roles); en dev arranca aunque `WHATSAPP_RESTORE_SESSIONS=false` — el watcher ES el mecanismo de claim en dev. Hook de shutdown: release §5.2 |
| `src/config/environment.ts` | `whatsapp.leaseRole` derivado de `nodeEnv` (§3). SIN env nuevas |

### Portal

| Archivo | Cambio |
|---|---|
| `src/pages/api/super/whatsapp-sessions.ts` | incluir `lease` en cada row (ya viene en `/sessions/list`) |
| `src/pages/api/super/whatsapp-session-lease.ts` | **nuevo** — PATCH proxy a lila `PATCH /sessions/:phone/lease` (gate super admin, mismo patrón de auth server-to-server existente) |
| `src/pages/admin/super/whatsapp-sessions.tsx` | columna "Entorno" + badges de lease. Detalle en §6.1 |

### 6.1 UI super admin — detalle (`whatsapp-sessions.tsx`)

Página ya shadcn (`AdminShadcnSurface` + `DataTable`); admin = desktop-first,
usable en móvil. Solo tokens del theme, sin hex.

**Columna nueva "Entorno"** (por row con sender):
- `Select` de `ui-shadcn/select` con opciones **Producción** / **Local (dev)**,
  valor = `lease.desiredOwner` (sin doc → Producción). Select y no Switch:
  el estado tiene más de dos lecturas (deseado ≠ holder durante el traspaso).
- Al cambiar a Local: `AlertDialog` de confirmación que muestra:
  - companies afectadas (todas las rows que comparten ese sender — warning §7);
  - "los envíos de prod quedarán retenidos en su outbox hasta revertir";
  - TTL: "si tu máquina local se apaga, prod reclama solo en ≤10 min".
- Confirmar → `PATCH /api/super/whatsapp-session-lease` → refetch (sin
  optimistic update: el estado real lo definen los watchers).
- Al volver a Producción: mismo PATCH, sin dialog (acción segura).

**Columna/badge "Lease"** (estado real, no intención):
- Sin doc, o `desiredOwner='prod'` y holder prod → badge `muted` "Prod".
- `desiredOwner ≠ holder` (handoff en curso) → badge `outline` "Traspasando…".
- `holder='dev'` → badge `accent` "Local · {holderInstanceId} · expira {Xm}"
  (countdown desde `leaseExpiresAt`).
- Lease vencido sin reclamar aún → badge `outline` "Vencido — prod reclamará".

**Refresco:** mientras exista algún lease con `desiredOwner='dev'` o handoff en
curso, la página re-fetchea cada 10 s (ver el traspaso completarse sin F5).
Sin leases activos, comportamiento actual (fetch único).

**API Portal:**
- `GET /api/super/whatsapp-sessions`: agregar `lease` a cada row (lila ya lo
  incluye en `/sessions/list` tras §6-lila).
- `PATCH /api/super/whatsapp-session-lease` (**nuevo**): body
  `{ sender, desiredOwner }`, gate super admin (mismo patrón de los otros
  handlers `api/super/*`), proxy a lila `PATCH /sessions/:phone/lease`.
  Timeout corto y error legible si lila prod no responde (el doc puede
  escribirse igual vía grace period §5.1.4, informarlo en el toast).

---

## 7. Edge cases y riesgos

- **Doble socket por bug/carrera:** salvaguarda existente se mantiene (440 →
  backoff + alerta Telegram). El guard de ownership la vuelve terminal: el
  no-owner deja de reintentar en vez de guerrear.
- **Prod caído al togglear:** cubierto por `FORCE_CLAIM_GRACE_MS` (§5.1 paso 4).
- **Flag olvidado en dev:** cubierto por TTL + auto-reversión + alerta (§5.2).
- **Sesión compartida entre companies (mismo sender):** el lease es por
  `sessionId` (número), no por company — el toggle afecta a TODAS las companies
  que compartan el sender. Mostrar warning en el UI si aplica.
- **Mensajes entrantes durante ownership dev:** llegan a la máquina dev;
  listeners y conteo de quota corren ahí contra el Atlas compartido (el conteo
  sigue siendo único). Comportamiento esperado, no bug.
- **`clearSession`/`disconnectSession` (logout real):** sin cambios — matan las
  creds para ambos lados por diseño. El watcher del otro rol encontrará creds
  inexistentes y no hará nada. Borrar el doc de lease en `clearSession`.
- **Creación de sesión nueva (QR/pairing) desde Portal:** llega a prod; sin doc
  de lease prod es owner → sin fricción.

---

## 8. Fases

- **F1 — Core lease (lila):** tipos + constantes + `session-lease.ts` + guards
  en `startSession`/`restoreAllSessions`/440. Sin watcher aún: con esto, dev con
  un doc manual en Mongo ya puede tomar una sesión de forma segura.
- **F2 — Watcher + TTL (lila):** `session-lease.watcher.ts`, heartbeat,
  auto-reversión, alertas Telegram, hook de shutdown, env vars.
- **F3 — API + UI:** endpoints lease en lila, proxy + toggle en super admin Portal.
- **F4 — Tests + docs:** `session-lease.test.ts` (claim atómico con carrera,
  expiración TTL, reconciliación por rol, guard de `startSession`, filtro de
  restore); actualizar `specs/architecture-as-is.md` y
  `Portal/specs/ARCHITECTURE-Portal.as-is.md`.

Cada fase es no-breaking: sin doc de lease, todo el comportamiento actual se
preserva.

## 9. Verificación

1. Prod conectado, toggle a local → prod suelta ≤15 s, dev conecta ≤30 s,
   **sin QR ni pairing** y sin 440 en logs de ninguno.
2. Matar dev (kill -9) → prod reclama solo en ≤ TTL+15 s + alerta Telegram.
3. Toggle de vuelta a prod con dev vivo → handoff inverso limpio.
4. Reiniciar prod con lease dev vigente → restore omite esa sesión (log).
5. Enviar mensaje vía prod durante ownership dev → queda en outbox de prod y
   sale al revertir.
6. Sesiones sin doc de lease → comportamiento idéntico al actual.
