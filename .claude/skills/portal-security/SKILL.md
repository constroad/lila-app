---
name: portal-security
description: Invariantes canónicas de SEGURIDAD de lila-app (backend Express/TS ESM del producto Portal). Nace de la auditoría integral 2026-07-20. Usar SIEMPRE al escribir/revisar código que toque `requireTenant`/`requireAdmin` (auth por JWT/api-key), rutas HTTP montadas en `src/index.ts`, generación de PDF con Puppeteer (`documents.controller`, `printUrl`), storage/Drive multi-tenant, o el JobExecutor de crons. También al auditar ("revisá la seguridad", "esto es cross-tenant?", "SSRF?") o depurar: "companyId del cliente", "secreto hardcodeado", "Puppeteer navega a URL del cliente", "escaneo/probe en el Funnel". Es el lado backend de la misma seguridad que `portal-security` en Portal. Ref completa: `../Portal/specs/SECURITY-AUDIT-2026-07.spec.md` + `specs/architecture-as-is.md` §Seguridad + `specs/SCANNER-DECEPTION-CANARY.spec.md`.
---

# lila-app — Seguridad (canónico, lado backend)

Backend del producto (WhatsApp AI, Drive, PDF, crons) detrás del Funnel público
(Tailscale, sin WAF). Es el lado servidor de la auditoría integral 2026-07-20.
Antes de escribir/revisar auth, rutas HTTP, PDF/Puppeteer, storage o crons, aplicar
estas invariantes. Ref completa (findings, kill-chain, threat model, runbook):
`../Portal/specs/SECURITY-AUDIT-2026-07.spec.md`. Estado y hardening YA aplicado:
`specs/architecture-as-is.md` §Seguridad.

## 0. Frontera de confianza

El `companyId` autoritativo sale SOLO del token verificado por `requireTenant`
(JWT firmado con `LILA_APP_JWT_SECRET`, o `x-api-key: lk_fe_…` hasheada SHA-256 en
Mongo). **Nunca** de un header/query/body del cliente. El byte estático no es el
riesgo; sí los endpoints de **cómputo/datos** con una credencial de tenant filtrada.

## 1. Auth (`requireTenant` / `requireAdmin`)

- `requireTenant` acepta **ambos**: `Authorization: Bearer <jwt>` (Portal server-to-server
  y el flujo público-link que ahora recibe un JWT corto en vez de la master `lk_fe_`) y
  `x-api-key: lk_fe_…`. Setea `req.companyId` del token, jamás del cliente.
- **`requireAdmin` confía en el `role` del JWT VERIFICADO**, no en `x-user-role` del
  header. Portal dejó de reenviar ese header (era escalable). No reintroducir el fallback
  a header para authz.
- Rutas nuevas montadas en `src/index.ts`: confirmar el guard (`requireTenant`/`requireAdmin`)
  antes de exponerlas. Nada de rutas de datos/cómputo sin auth.

## 2. SSRF (Puppeteer / fetch de URLs del cliente)

- **Guard de generación de PDF (`documents.controller.ts` `isAllowedPrintUrl`):** solo deja
  que Puppeteer navegue a hosts de `PORTAL_PRINT_HOSTS` (dev=`localhost:3000`,
  prod=`www.constroad.com,constroad.com`). **Sin la env el guard es un no-op** (cualquier URL
  http[s] pasa) → una credencial de tenant filtrada se vuelve primitiva SSRF contra la red
  del host. La env es OBLIGATORIA.
- Cualquier otro fetch/navegación a una URL derivada del cliente: allowlist de host + no
  seguir redirects + bloquear IP interna (169.254 metadata, loopback, RFC1918, IPv6).

## 3. Secretos

- **Prohibido `process.env.X || 'literal'`** con un secreto en git (el mismo antipatrón que
  cerró Portal). `LILA_APP_JWT_SECRET`/`JWT_SECRET` deben venir de env; sin ellos, fallar
  cerrado, no firmar/verificar con un default público.
- `CRON_SECRET` (compartido con Portal): el JobExecutor lo envía SOLO a rutas `/api/cron` de
  Portal (`isPortalCronUrl`) — nunca a APIs de terceros (no filtrar el secreto); auto-redactado
  en logs. Debe ser idéntico al de Vercel.

## 4. Multi-tenant / storage

- Storage y Drive scopeados por `companyId` del token. Path traversal bloqueado en
  `storage-path.service`; sanitización de nombre en `storage-file-name.service`. No construir
  paths con input del cliente sin pasar por esos servicios.
- `requireTenant` hoy es **binario** (credencial válida = todas las ops de Drive). El JWT
  público de subida (H1) da full-drive por 12h; folder-scoped upload-only es backlog
  (enforcement de scope en `requireTenant`).

## 5. Superficie pública / detección

- Funnel público sin WAF → `scanner-detection.service.ts` ya banea por volumen de probes
  (`.env*`/`.git`/`wp-config.php`). Complemento pendiente: **canary tokens**
  (`specs/SCANNER-DECEPTION-CANARY.spec.md`) para detectar el *uso* de un secreto filtrado
  (no solo el sondeo). Alertas diferenciadas: un canary disparado ≠ ruido de volumen.

## Validar

- `curl` sin token a una ruta de datos → 401 (`requireTenant`).
- `x-user-role: admin` en un request con JWT de rol menor → NO debe escalar (`requireAdmin`
  ignora el header).
- Con `PORTAL_PRINT_HOSTS` seteada, un `printUrl` a un host no permitido → rechazado.
