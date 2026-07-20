---
name: portal-pitfalls
description: Checklist de bugs RECURRENTES de correctness en lila-app (backend del producto Portal; no perf, no UI). Usar SIEMPRE al construir URLs ABSOLUTAS de archivos que devuelve lila (`pdfUrlAbsolute`/`previewUrlAbsolute`/`/files/…`), queries/caches multi-tenant por `companyId`, render de fechas date-only en informes/PDF, o merges/seed de `schemaData`/`defaultData` de documentos. También al depurar: "localhost refused to connect en Portal", "veo/escribo data de otra empresa", "la fecha muestra un día antes en el PDF", "se borraron los textos por defecto del informe". Complementa (no reemplaza) portal-security (seguridad) y portal-scalability (perf). Ref: `../Portal/specs/*` + `specs/architecture-as-is.md`.

---

# lila-app — Pitfalls de correctness (recurrentes)

Errores que YA nos mordieron, lado backend. Antes de escribir/revisar código que
toque estas áreas, aplicar el checklist. No re-derives helpers: reusa los que hay.

## 1. URLs absolutas de archivos → host localhost persistido (el más lila)

**Causa:** lila arma la URL absoluta (`pdfUrlAbsolute`, `previewUrlAbsolute`,
`/files/…`) desde el **`Host` del request**. Detrás del túnel de la Mac mini ese
host es `localhost:3001`, y si se **persiste** en `media.url`/`report`, en prod da
"localhost refused to connect" cuando Portal la abre.

- **Fix canónico:** armar la absoluta con **`LILA_PUBLIC_BASE_URL`** (env, tiene
  **prioridad sobre el `Host`** del request). En prod es **OBLIGATORIA** y debe
  coincidir con el host público (Tailscale/Cloudflare), sin `/api`. En dev se puede
  omitir (usa el Host = localhost).
- **Anti-patrón:** construir `${protocol}://${req.headers.host}/files/...` y
  guardarlo. Nunca persistir una absoluta derivada del Host crudo.
- **Rehost:** el host embebido histórico (`joses-mac-mini`→`cloud-constroad-s3`) se
  reescribe con los scripts `lila:rehost` (dry-run/apply) sobre ~30k campos de URL.
  El lado Portal la sanea al mostrar (`resolveLilaFileUrl`), pero lila NO debe
  generar basura de entrada. Ver memoria `lila-host-rehost-db-scripts`.

## 2. Cross-tenant en queries y caches server-side

**Causa:** un query o un cache module-level sin `companyId` sirve/pisa data de
otra empresa. Es correctness (además de seguridad — ver portal-security).

- **Regla:** TODA query pasa por scope de `companyId` (del token verificado por
  `requireTenant`, nunca del cliente). Todo cache server-side lleva `companyId` en
  la key. Un helper "compartido" entre tenants (`getAll` vs `getAllAccessible`)
  puede tener DOS semánticas — diffear el cuerpo antes de consolidar (no filtrar
  cross-tenant al unificar).
- **Anti-patrón:** `new Map()` a nivel módulo keyed solo por id/url; `find({...})`
  sin `companyId` en un endpoint multi-tenant.

## 3. Fechas date-only → timezone en el render del informe/PDF

**Causa:** un campo date-only del negocio (`fecha`, `executionDate`, `quote.date`)
guardado como medianoche UTC, al renderizarse con `new Date(x)` + tz, retrocede un
día en Perú (UTC-5) dentro del PDF/handlebars.

- **Regla:** para date-only, **string-slice `YYYY-MM-DD`** (sin construir `Date` ni
  convertir tz). Solo los **timestamps reales** (con hora: `createdAt`) usan tz
  explícita (`America/Lima`/`UTC`).
- **Anti-patrón:** `new Date(report.fecha).toLocaleDateString()` en el renderer.

## 4. Merge/seed de defaults → blanco pisa el default

**Causa:** el `schemaData` de un informe mergea `schema.defaultData` → **`report-data`
(lila)** → `overrideData`. Si una fuente posterior trae el campo **vacío** (`""`),
pisa el default poblado → informe sin sus textos.

- **Regla:** al mergear defaults + data, un `""`/`null`/`undefined` entrante **NO**
  debe borrar un valor ya presente (`isBlankLeaf(incoming) && !isBlankLeaf(actual)`
  → conservar el actual). Nunca `output[k] = incoming` sin chequear si es blanco.
- Como lila es una de las fuentes del merge, **no emitir `report-data` con hojas en
  blanco** que pisen los defaults del schema.

## 5. Transversales

- **No re-derivar helpers.** URL de archivo → `LILA_PUBLIC_BASE_URL`; fecha date-only
  → string-slice; scope → `companyId` del token.
- **Perf es OTRO dominio** (Puppeteer, event loop, queries) → portal-scalability.
  **Seguridad** (auth, SSRF, secretos) → portal-security. Esta skill es solo correctness.
- **Al arreglar un bug de esta clase:** buscar el mismo patrón en módulos gemelos y
  arreglarlos en el mismo paso; test si el helper es puro.
- **Done:** build + lint + tests del área. José commitea.
