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

> El resto de convenciones (estructura, comandos, naming, tests) está en `AGENTS.md`.
