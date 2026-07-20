---
name: portal-scalability
description: Reglas canónicas de PERFORMANCE y ESCALABILIDAD de lila-app (backend Express/TS ESM en la Mac mini, no serverless). Usar SIEMPRE al escribir/revisar queries Mongoose (repos, `src/**`), generación de PDF con Puppeteer, el pipeline de medios/inliner, handlers de WhatsApp/Baileys, llamadas al LLM (Anthropic), alertas externas (Telegram/WhatsApp), o el JobExecutor de crons. También al depurar síntomas: "cold-start 40s", "PDF timeout / cuelga con muchas fotos", "el bot no responde / event loop bloqueado", "query lenta", "compite con las sesiones de prod". Complementa (no reemplaza) portal-security (seguridad) y — si aplica — portal-pitfalls (correctness). Ref completa: `/projects/PERFORMANCE-SCALABILITY.SPEC.md` + `CLAUDE.md` §Performance.

---

# lila-app — Escalabilidad & Performance (canónico, backend)

Lado backend del incidente jul-2026 (75% de GB-Hrs de Vercel en Portal). lila NO
es serverless: es un **proceso Node de larga vida en la Mac mini** con Atlas
compartido con Portal. Ref completa: `/projects/PERFORMANCE-SCALABILITY.SPEC.md`.

## 0. El modelo de coste acá es distinto (interiorizar)

En Portal el cuello es GB-Hrs por pestaña. En **lila el cuello es el proceso**: un
request lento **bloquea el event loop** (el bot deja de responder), compite por
CPU/memoria de la Mac mini con Puppeteer y con la sesión de WhatsApp, y toda query
pega al **Atlas compartido con prod**. Regla mental: nada pesado o sincrónico en el
camino de un webhook de WhatsApp o de un request HTTP.

## 1. Queries Mongoose (igual que Portal)

- **Independientes → `Promise.all`.** Prohibido `await` en `for/forEach` cuando las
  iteraciones no dependen entre sí. N+1 → lookup por lote (`$in` + Map).
- Listados: **`.lean()` + projection + paginación**. Nada de `find()` sin límite.
- **Índices compuestos `{companyId, campo}`** en toda query frecuente; gestión en los
  scripts de sync-indexes. `.explain()` ante dudas.
- **Queries muertas:** al auditar, buscar `await`s cuyo resultado nadie lee.
- **Multi-tenant:** todo query y todo cache server-side llevan `companyId` en scope/key
  (también es correctness/seguridad — ver portal-security).

## 2. Puppeteer / PDF

- **Concurrencia acotada** (`PDF_MAX_CONCURRENT_RENDERS`, ~2): un slot por render; una
  URL que nunca responde cuelga un slot. No lanzar renders sin el límite.
- **Boot perezoso:** NO inicializar Chromium en el arranque detrás de `app.listen()`
  (era el cold-start de 40s). `listen()` temprano + launch lazy/background + servir cache
  mientras carga.
- **Inliner de imágenes:** concurrencia acotada + `setContent` con `load` (no
  `networkidle0`) — el informe con 14 fotos hacía timeout 180s. Puppeteer NO debe tocar la
  red durante `setContent` (inlinear a data URIs primero).
- Desde Portal, generar PDF **directo a lila** (no ocupar la función Vercel esperando a
  Puppeteer).

## 3. WhatsApp / Baileys

- **Nunca LLM ni trabajo pesado inline en el webhook**: ack temprano + cola. Un `await`
  lento ahí congela el socket.
- Reconexión con **backoff exponencial** (cap ~10min); no reintentar en loop apretado.
- En dev, **no competir con prod**: `WHATSAPP_RESTORE_SESSIONS=false` (evita kickear las
  sesiones productivas / rate-limit de WhatsApp). El send-proxy cubre el envío.

## 4. LLM (Anthropic)

- Contexto estático repetido → **prompt caching** (`cache_control`). Toda llamada con
  **timeout explícito**; retry con backoff solo si la semántica es idempotente.

## 5. Externas / alertas

- **`timeout` explícito + fire-and-forget** (`void fn().catch(noop)`) si no bloquean la
  respuesta. Jamás un `await` de alerta (Telegram/WhatsApp) en el camino del request —
  con red caída sumaba ~10s a cada uno.

## 6. Crons

- En dev, **`CRONJOBS_ENABLED=false`** (no doble-ejecutar los que ya corre prod). El
  JobExecutor es el que llama a los `/api/cron` de Portal (con `x-cron-secret` — ver
  portal-security), a la frecuencia mínima necesaria.

## 7. Modo auditoría

Al pedir "audita performance", devolver punch list por severidad (no editar sin OK):
- [ ] `await` en loop con iteraciones independientes → `Promise.all`
- [ ] `find()` sin `.lean()`/projection/límite; query frecuente sin índice `{companyId,campo}`
- [ ] N+1 sin `$in`+Map; `await` cuyo resultado nadie lee
- [ ] Puppeteer sin límite de concurrencia; Chromium en el boot; inliner sin acotar
- [ ] LLM/trabajo pesado inline en un webhook de WhatsApp (sin ack/cola)
- [ ] llamada externa/alerta con `await` en vez de fire-and-forget + timeout
- [ ] cache server-side sin `companyId` en la key
