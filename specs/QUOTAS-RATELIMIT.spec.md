# QUOTAS & RATE LIMITING — Auditoría y diseño estándar (lila-app como producto)

> **Rol:** auditoría técnica + diseño objetivo. Responde: ¿la implementación actual de
> rate-limit, quotas de mensajes/almacenamiento y control de cronjobs es la estándar e
> ideal para escalar como producto (incluyendo venta de API keys a terceros)? ¿Cómo
> hacerla **simple, robusta y estándar**?
>
> **Resumen ejecutivo:** El **modelo de datos** ya es correcto (límites por plan + usage por
> tenant + `usage_metrics`). Lo que falta para ser estándar es: (1) **un solo punto de
> enforcement** por recurso, (2) **límites por TENANT/API-key** (hoy son por IP o están
> apagados), y (3) **contadores en Redis** para que funcione en varias instancias. No hay que
> reescribir: hay que **consolidar y distribuir**.
>
> Relacionado: `SCALABILITY-MULTI-SESSION.spec` (§4.4 modelo de producto, §4.5 seguridad).
> **Última actualización:** Junio 2026.

---

## 1. Auditoría — estado actual vs estándar de industria

| Dimensión | CONSTROAD hoy | Estándar SaaS/API | Veredicto |
|---|---|---|---|
| **Identidad para límites** | per-IP (anti-abuso) + per-company (Map en memoria) | per-**tenant/API-key** | 🟡 falta granularidad de tenant |
| **Rate limit (ráfaga)** | `express-rate-limit` por IP, in-memory | **token bucket / sliding window** en **Redis** | 🟡 no distribuido |
| **Quota mensual (mensajes)** | `Company.subscription.usage.whatsappMessages` + `usage_metrics` (DB `$inc`) | counter por período en DB + cache | ✅ correcto |
| **Quota storage** | counter absoluto en DB + reconciliación | igual | ✅ correcto |
| **Quota cronjobs** | `limits.cronJobs` counter | igual | ✅ correcto |
| **Punto de conteo** | mensajes: único en lila-app; storage: lila-app | **un pipeline de metering** | 🟡 disperso entre servicios |
| **Enforcement** | parcial/desactivado en `/message` | check-antes-de-operar, 429/402 | 🔴 falta activar/unificar |
| **Alertas de uso** | 80/95/100% vía Telegram | soft limits antes de hard block | ✅ correcto |
| **API keys externas** | `lk_fe_` hash SHA-256 + allowedSenders | igual + scopes + límites por key | 🟡 falta scopes/límites por key |
| **Multi-instancia** | contadores in-memory | estado en Redis | 🔴 no escala horizontal |

**Conclusión del auditor:** la base es sólida y NO es necesario reescribir. Las brechas son
de **consolidación** (un solo enforcement) y **distribución** (Redis). Es exactamente lo que
hacen productos como Stripe/Twilio/SendGrid: *un metering pipeline + límites por API-key +
estado en un store rápido compartido.*

---

## 2. Principios estándar (el "bosque")

1. **Separar RATE de QUOTA.** Son cosas distintas:
   - **Rate** = ráfaga (req/seg, req/min). Protege el sistema. Algoritmo: **token bucket** o
     **sliding window** en Redis. Respuesta: `429 Too Many Requests` + `Retry-After`.
   - **Quota** = volumen por período/plan (mensajes/mes, GB de storage). Es de **negocio**.
     Counter en DB con reset por período. Respuesta: `402 Payment Required` / `403`.
2. **Jerarquía de límites, independientes:** (a) global/IP (anti-DDoS, anónimo) → (b)
   **por tenant/API-key** (fairness + plan) → (c) por endpoint (protege ops caras). El que
   importa para producto es **(b)**.
3. **Un solo pipeline de metering.** Toda operación medida emite un evento de uso por **una**
   ruta: `record(tenant, resource, amount)`. Nunca contar en dos lados (ya corregido para
   mensajes en Etapa 1).
4. **Check-then-act atómico** antes de la operación cara: si excede → corta **antes** de
   gastar (no envíes el WhatsApp y luego cobres).
5. **Estado en Redis** para lo hot/distribuido (rate + cache de counters); **DB** como fuente
   de verdad de quota mensual y storage. Sin Redis, los límites no sirven multi-instancia.
6. **Soft limits** (avisar 80/95%) antes del **hard block** (100%). Ya existe.
7. **Fail-open vs fail-closed:** para no tumbar el servicio, si el store de límites cae →
   **fail-open** en rate (permitir) pero **fail-closed** en quota de pago si se requiere
   estrictez de billing (decisión de negocio; default fail-open + alerta).

---

## 3. Diseño objetivo — simple y estándar

### 3.1 Una sola abstracción: `UsageGuard`

```
UsageGuard.check(tenantId, resource, amount?) -> { allowed, remaining, limit, retryAfter? }
UsageGuard.record(tenantId, resource, amount)  -> void   // idempotente por operación
```

- `resource ∈ { whatsappMessages, storageBytes, apiCalls, cronJobs }`.
- `check` evalúa **rate (Redis)** + **quota (DB/cache)**; `record` incrementa DB `$inc` +
  `usage_metrics` + invalida/actualiza cache. Reemplaza la lógica dispersa de
  `quota-validator.service` + `company-rate-limiter` con **un** contrato.

### 3.2 Un solo middleware de enforcement

```
enforceUsage('whatsappMessages')  // en /message/*
enforceUsage('storageBytes')      // en /drive/files (upload)
enforceUsage('cronJobs')          // en POST /jobs
```

- Resuelve el tenant del request (JWT de Portal **o** API key `lk_fe_`), llama
  `UsageGuard.check`; si no pasa → 429/402 con cuerpo claro; si pasa → `next()` y, al
  completar con éxito, `UsageGuard.record`.
- **Backward-compatible:** detrás del flag `WHATSAPP_RLS_ENFORCE` (ver SCALABILITY §4) para
  activar el bloqueo tras validar en prod.

### 3.3 Estado

| Dato | Dónde | Por qué |
|---|---|---|
| Límites por plan (`limits.*`) | DB `Company` (cache 60s) | fuente de verdad de negocio |
| Quota mensual usada (mensajes/apiCalls) | DB `subscription.usage.*` + `usage_metrics`; **cache en Redis** | exactitud + lectura rápida |
| Storage usado (bytes absolutos) | DB + reconciliación periódica | ya existe |
| **Rate** (ventana req/min) | **Redis** (INCR + EXPIRE / sliding window) | distribuido, efímero |
| API key (hash, scopes, límites) | DB `Company['api-key-lila-access']` (extender) | identidad de producto |

> **Redis es la única pieza de infra nueva** y es la que habilita: rate-limit por tenant
> multi-instancia + cache de counters + (a futuro) registry de sesiones para sharding.

---

## 4. Enforcement por recurso (tabla de referencia)

| Recurso | Rate (Redis, por tenant/key) | Quota (DB, por plan/período) | Acción al exceder |
|---|---|---|---|
| **WhatsApp mensajes** | p.ej. 60–120/min (según plan) | `limits.whatsappMessages`/mes | 429 (rate) / 402 (quota) |
| **Storage** | n/a | `limits.storage` GB (absoluto) | 402 al subir |
| **API calls** (producto) | por plan (p.ej. 60/min free, 600/min pro) | `limits.apiCallsPerMinute` y/o /mes | 429 |
| **Cron jobs** | crear: 10/min | `limits.cronJobs` (cantidad activa) | 402 |
| **Sesiones WhatsApp** | crear: 5/min | `limits.whatsappSessions` | 429/402 |

---

## 5. API keys de producto (consumidores externos)

Extender `lk_fe_` (ya hash SHA-256 + allowedSenders + allowedOrigins + rateLimit) con:
- **scopes** (`messages:send`, `groups:read`, …) → autorización por endpoint.
- **límites por key** (req/min + mensajes/mes) que **sobre-escriben** o complementan el plan.
- **rotación/expiración**, `lastUsedAt/IP`, **revocación** inmediata.
- métricas de uso por key (para facturar y detectar abuso).

Un consumidor externo = un `Company` (tenant) con su plan; el mismo `UsageGuard` aplica. Así
no hay un camino de código distinto para "externos" — **misma tubería, distinta identidad**.

---

## 6. Valores recomendados (realistas, ajustables por env)

Hoy (por IP, en `rateLimiter.ts` / `config.security`, env-tunables):
`RATE_LIMIT_MAX=200/5min`, `SESSION_RATE_MAX=5/min`, `JOBS_RATE_MAX=10/min`,
`MESSAGE_RATE_MAX=100/min`. Son **defaults sanos anti-abuso por IP**, pero la granularidad
correcta para producto es **por tenant/plan**, p.ej.:

| Plan | Mensajes/mes | Rate mensajes | API req/min | Storage |
|---|---|---|---|---|
| Free | 1.000 | 30/min | 60 | 1 GB |
| Pro | 50.000 | 120/min | 600 | 50 GB |
| Business | 500.000 | 600/min | 3.000 | 500 GB |
| Enterprise | ilimitado (-1) | configurable | configurable | configurable |

**Dónde ajustar:**
- Por IP (anti-abuso): `lila-app/src/api/middlewares/rateLimiter.ts` + envs
  `RATE_LIMIT_MAX`, `SESSION_RATE_MAX`, `JOBS_RATE_MAX`, `MESSAGE_RATE_MAX`.
- Por tenant/plan (negocio): los `limits.*` del `Company` (definidos por plan en Portal).
- Rate por tenant (objetivo): Redis vía `UsageGuard` (a implementar).

### ⚠️ A MEJORAR — los límites por tenant DEBEN derivar del PLAN (no hardcode)
Hoy los valores por IP están en env/código y el **rate por tenant aún no existe**. El objetivo
estándar: **el plan es la única fuente de verdad** de TODOS los límites por tenant (mensajes/mes,
rate de mensajes, api req/min, storage, cronjobs, sesiones). Es decir:

```
plan (Free | Pro | Business | Enterprise)
   └─► define limits.{whatsappMessages, whatsappMessagesPerMin, apiCallsPerMinute,
                       storage, cronJobs, whatsappSessions, ...}
        └─► se copian a Company.limits al asignar/cambiar plan
             └─► UsageGuard lee SIEMPRE de Company.limits (no de constantes)
```

- Definir los límites en la **definición del plan** (`PLAN_LIMITS` en Portal) — incluyendo el
  **rate** (`whatsappMessagesPerMin`, `apiCallsPerMinute`), que hoy falta en el plan.
- Al asignar/cambiar plan, **materializar** esos límites en `Company.limits` (override por
  empresa permitido para casos enterprise).
- `UsageGuard` y los rate-limiters por tenant deben leer de `Company.limits`, **nunca** de
  valores hardcodeados. Los env `*_RATE_MAX` quedan solo como **techo anti-abuso por IP**
  (defensa global), no como el límite de negocio.
- Enterprise: `-1` = ilimitado o valor custom por empresa.

---

## 7. Plan de migración (incremental, backward-compatible)

1. **Consolidar** la lógica existente (`quota-validator.service` + `company-rate-limiter`)
   detrás de `UsageGuard` **sin cambiar comportamiento** (solo refactor + tests).
2. **Activar enforcement por tenant** en `/message`, `/drive/files`, `/jobs` detrás de
   `WHATSAPP_RLS_ENFORCE` (rate+quota), con logging antes de bloquear.
3. **Introducir Redis**: mover rate-limit por tenant + cache de counters al store compartido
   (habilita multi-instancia). Fallback in-memory si Redis no está (fail-open en rate).
4. **API keys de producto**: scopes + límites por key + panel de uso.
5. **Reconciliación** periódica de counters (ya existe para storage; añadir para mensajes si
   se requiere exactitud de billing).

---

## 8. Anti-patterns a evitar

- ❌ Contar el mismo recurso en dos servicios (doble conteo). → un solo `record`.
- ❌ Rate-limit **solo** por IP en un producto multi-tenant (un NAT compartido castiga a varios).
- ❌ Contadores en memoria con varias instancias (cada proceso cuenta distinto).
- ❌ Cobrar/contar **después** de ejecutar la op cara sin checar antes.
- ❌ Un código aparte para "clientes externos": deben pasar por la **misma** tubería con su API key.
- ❌ Hard-block sin avisos previos (mala UX); usar soft limits 80/95%.

---

## 9. Qué ya quedó alineado (Junio 2026)

- Conteo de mensajes **único** en lila-app (Etapa 1). 
- Store sin mensajes + escritura async (SCALABILITY Fase 0).
- Rate-limit por IP **exime tenants autenticados**; lecturas (grupos/contactos) cacheadas.
- `requireTenantOrApiKey` + ownership de sender (`WHATSAPP_RLS_ENFORCE`) — base del enforcement por tenant.
- Límites por IP **env-tunables** (`config.security`).
- `mongoSanitize` global.

Pendiente (este spec): `UsageGuard` unificado, **Redis** para rate/counters por tenant, scopes
por API key. Es el camino para escalar lila-app como **producto** simple y estándar.
