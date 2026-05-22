# Handoff a Claude Code (Mac Pro) — Capa 3: resiliencia del Portal

> Este documento se generó en una sesión de Claude Code corriendo en la **Mac mini de producción**.
> El destinatario es Claude Code corriendo en la **Mac Pro de desarrollo**, donde están clonados los repos del Portal Next.js y de lila-app.
> Pega el contenido íntegro como primer mensaje en la sesión de la Mac Pro.

---

## Contexto

`lila-app` corre en una Mac mini detrás de Starlink, expuesto vía Tailscale Funnel en
`https://joses-mac-mini.tail46a1b0.ts.net`. El Portal Next.js está deployado en Vercel
(plan Hobby) y consume esa URL directamente desde el browser de los ingenieros de campo.

Los ingenieros reportan intermitentemente "no se conecta". Diagnóstico cerrado el 2026-05-22:

- El server, el funnel, el cert y los LaunchAgents están sanos.
- El síntoma se debe a que `*.ts.net` no resuelve de forma confiable en muchos resolvers
  (Cloudflare 1.1.1.1 NXDOMAIN, varios routers ISP NXDOMAIN). Es intermitente: el mismo
  dispositivo en la misma red a veces resuelve y a veces no.
- Causa raíz vive en infra DNS de Tailscale (DNSSEC strict / negative caching de resolvers).
  No se arregla desde la Mac mini.
- Opciones "estándar" (Vercel rewrites, Cloudflare en front, VPS) están descartadas por
  decisión del owner (Hobby plan + 300 MB uploads + >10s + no third-party + no paid infra).

Detalles completos: `lila-app/docs/tailscale-funnel.spec.md` sección 14.

**Server-side ya se hizo (Capa 1):** external probe + auto-restart en la Mac mini detecta
fallos reales del funnel (cuando los hay) y los recupera solos. Eso cubre el ~5-10% que sí
es problema del server. **El 90-95% restante es problema DNS del cliente y solo se mitiga
desde el Portal.**

## Tu trabajo en la Mac Pro

Implementar **Capa 3: resiliencia del Portal** para que el ingeniero **rara vez** vea un
error cuando el DNS hipa por segundos/minutos. No se busca esconder fallos largos — se
busca que la app sea elástica a los típicos hipos de 30s-5min.

### Fase 0 — Inventario (no toques nada todavía)

Antes de cambiar código:

1. Localiza el repo del Portal en `/Users/jose/projects/` (busca `package.json` con `next`).
2. Lee:
   - `package.json` para versión de Next.js, gestor de paquetes (yarn/npm/pnpm), y libs HTTP
     que ya use (axios, ky, fetch nativo, swr, @tanstack/react-query, tus-js-client).
   - El archivo donde se define la base URL de la API (busca `joses-mac-mini` o `ts.net` o
     `NEXT_PUBLIC_API_URL` o similar).
   - Cómo se envía el `x-api-key` (si se envía; lila-app exige header en endpoints
     destructivos desde 2026-05-09).
   - Si ya hay algún `service-worker.ts` / `manifest.json` / configuración PWA.
   - Si hay manejo de errores global (un `ErrorBoundary` / `onError` de SWR / interceptor de
     axios).
3. **Reporta hallazgos antes de seguir.** Lista concreta: "Next.js X.Y, fetcher = Z,
   sin SWR, archivo de base URL = `lib/api.ts`, etc."

### Fase 1 — Decisiones a confirmar con el usuario (no asumas)

Una vez tengas el inventario, pregunta:

- ¿Prefiere SWR o TanStack Query? (Si ya hay uno instalado, úsalo.)
- ¿Adoptamos Service Worker / queue offline ahora o lo dejamos para una segunda iteración?
  (Tiene complejidad real; tal vez baste con retry + SWR en una primera ronda.)
- ¿El Portal ya soporta TUS para uploads grandes o usa `multipart/form-data` directo?
  (Si es directo y suben 300 MB, ese es otro frente que conviene migrar a TUS — lila-app ya
  lo soporta.)

### Fase 2 — Implementación

**Lo mínimo viable (orden recomendado):**

1. **Capa fetch con retry + backoff.** Wrapper único que use todos los demás. Reintenta en:
   - `TypeError: Failed to fetch` (network / DNS)
   - Status >= 500
   - Status 0 (CORS / abort)
   - NO reintenta 4xx (excepto 408, 429 con `Retry-After`).
   - Backoff: 1s, 3s, 8s, 20s (con jitter ±20%).
   - Máximo 4 intentos por defecto, configurable per-call.
   - Cancela retries si el componente unmonta (AbortController).

2. **Cliente SWR/TanStack Query** envolviendo el fetcher anterior:
   - `staleTime` razonable por dominio (sesiones: 10s; contactos/grupos: 60s; configs: 5min).
   - `revalidateOnFocus: true` y `revalidateOnReconnect: true`.
   - Permite ver datos viejos mientras revalida.
   - Errores van a un Toast no bloqueante, NO a un error boundary que tumbe la UI.

3. **Indicador global "Reconectando…"** en el header cuando un fetch está reintentando.
   Implementación: un store (Zustand/Jotai/contexto) que el fetcher actualice; un componente
   en el layout que muestre un badge sutil. Cuando recupere, badge "Conectado".

4. **Toast humano para errores definitivos**:
   - "El servidor no responde. Lo estamos reintentando. Si persiste, abre Diagnóstico"
     con botón → `/troubleshoot`.
   - Nunca mostrar mensajes técnicos (`Failed to fetch`, `NS_ERROR_...`) al ingeniero.

5. **Página `/troubleshoot`** estática (no llama a la API). Instrucciones simples:
   - "Si la app dejó de cargar, probablemente tu red no está resolviendo bien nuestro
     servidor. Esto se arregla cambiando el DNS de tu móvil."
   - Pasos en iOS (screenshot) y Android (screenshot).
   - Botón "Probar conexión" que hace un fetch a `/health` y muestra OK/FAIL.
   - Mensaje claro: "Si tras cambiar DNS sigue sin funcionar, reporta a soporte."

6. **(Opcional, segunda iteración) Service Worker con queue de mutations**:
   - Solo si el usuario confirma que lo quiere. Tiene costo de complejidad.
   - Workbox `BackgroundSyncPlugin` para POSTs/PUTs idempotentes.
   - Marca local en la UI ("Pendiente de sincronizar") para mutaciones encoladas.
   - Reintenta cuando vuelve la conexión.

### Fase 3 — Tests

- Unit del fetcher: simula `fetch` fallando N veces, verifica que reintenta el número
  correcto de veces con el backoff esperado.
- Integration en local: levanta el Portal apuntando a un servidor mock que devuelva 500
  intermitente; verifica que la UI se mantiene navegable.
- Smoke manual: levanta Portal contra la URL de funnel real, navega un flujo crítico (login,
  listar sesiones, una mutación). Documenta resultado.
- **Importante:** NO bloquees `lila-app` ni hagas cambios ahí desde la Mac Pro. Si descubres
  un bug en el server, créalo como issue y reportalo, no lo arregles en esta sesión.

### Fase 4 — Deploy

- Push a una rama de feature (NO main).
- Deploy preview de Vercel.
- Comparte URL del preview con el usuario.
- Pide que un ingeniero de campo lo pruebe desde su red real (la que estaba fallando antes).
- Solo después de confirmación → merge a main.

### Fase 5 — Reporte

Al final, deja en `lila-app/docs/portal-resiliencia.spec.md` (o donde el usuario prefiera):

- Decisiones tomadas (qué librería, qué timeouts, qué backoff).
- Cómo probar la resiliencia localmente.
- Qué casos NO cubre (por ejemplo: NXDOMAIN cacheado >10min sigue requiriendo cambio de DNS).
- Métricas que vale la pena monitorear más adelante (tasa de reintentos, tiempo de
  recuperación).

## Restricciones

- **No commitees `.env`, claves, o tokens**.
- **No deployes a producción sin que el usuario lo apruebe explícitamente** — solo preview.
- **No instales librerías pesadas sin justificar.** Cada nueva dependencia debe valer su peso.
- Si lila-app local no levanta por dependencias rotas, dilo; no "lo arregles" sin contexto.
- Si el Portal ya implementa parte de esto (retry, SWR, etc.), no dupliques — mejora lo
  existente.

## Archivos de referencia en este mismo repo (lila-app, en Mac Pro deberías tenerlo)

- `docs/tailscale-funnel.spec.md` — toda la infra del funnel + diagnóstico DNS (sección 14).
- `src/index.ts` — config CORS, helmet, rate limit, trust proxy.
- `src/api/routes/session.routes.ts` — endpoints con `x-api-key`.
- Headers de respuesta confirman que **lila-app expone TUS** para uploads (vimos
  `Tus-Resumable`, `Upload-Offset`, `Upload-Length`, `Upload-Expires` en las CORS
  expose headers).

## Empieza por Fase 0 (inventario) e itera con el usuario.
