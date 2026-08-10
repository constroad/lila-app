# lila-app — Backend (Claude Context)
> Calidad/respuesta: `/projects/QUALITY-CODE-SHORT.SPEC.md` (canónico) y `/projects/.claude/CLAUDE.md`.
> Reglas específicas del proyecto: ver `AGENTS.md` (mismo contenido aplica a Claude).
> Backend WhatsApp AI. No UI, no Chakra, no React.

## Contexto de toda la app (leer UNA vez por sesión)
Al iniciar sesión que toque arquitectura, flujos o integración Portal↔lila-app, lee **una sola vez**:
- `specs/architecture-as-is.md` (este backend: WhatsApp/Baileys, Drive, PDF, crons, storage multi-tenant).
- `../Portal/specs/ARCHITECTURE-Portal.as-is.md` (frontend Next + cómo consume este backend).
Son la fuente de verdad del estado actual; ante un cambio significativo, actualízalos.

## Stack
TypeScript ESM (`type: module`) · Express · Baileys (WhatsApp) · Mongoose · Anthropic SDK · Puppeteer/PDF.

## Performance y escalabilidad (canónico)
Ref: `/projects/PERFORMANCE-SCALABILITY.SPEC.md` (dolores y lecciones del
incidente de GB-Hrs en Vercel, jul-2026). Reglas duras para este backend:
- Queries independientes → `Promise.all`; prohibido await-en-loop (N+1) y
  queries cuyo resultado nadie lee. Listados con `.lean()` + projection +
  paginación. Índices compuestos `{companyId, campo}` en queries frecuentes.
- LLM (Anthropic): contexto repetido → prompt caching; toda llamada con
  timeout; retry con backoff solo si es idempotente. En webhooks de WhatsApp:
  ack temprano, nunca LLM inline sin timeout.
- Llamadas externas y alertas: fire-and-forget (`void ...catch`) si no
  bloquean la respuesta; jamás un `await` de alerta en el camino del request.
- Multi-tenant: todo query y todo cache server-side llevan `companyId` en
  scope/key.

## Alertas y monitoreo
Antes de agregar una alerta, un chequeo o un job agendado, leer
`specs/OBSERVABILITY-ALERTING.spec.md` (lecciones de fallos reales + checklist).
Reglas duras: distinguir "no pude chequear" de "está roto"; dedupe por firma del
fallo si el job es frecuente; avisar también al recuperarse; no alertar por tareas
sin configurar; y toda ruta HTTP nueva se expone CON guard de auth, verificado con
`curl` sin credenciales contra la URL pública.

> El resto de convenciones (estructura, comandos, naming, tests) está en `AGENTS.md`.
