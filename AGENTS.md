# lila-app — Backend
> Calidad/respuesta: `/projects/QUALITY-CODE-SHORT.SPEC.md` (canónico).
> Backend WhatsApp AI. No UI, no Chakra, no React.
> **Contexto de toda la app:** al iniciar sesión, lee **una vez** `specs/architecture-as-is.md` (este proyecto) y `../Portal/specs/ARCHITECTURE-Portal.as-is.md` (frontend, incl. integración con este backend). Fuente de verdad; actualízalos ante cambios significativos.

## Stack
TypeScript ESM (`type: module`) · Express · Baileys (WhatsApp) · Mongoose · Anthropic SDK · Puppeteer/PDF.

## Estructura
- `src/` por feature: `api/`, `whatsapp/`, `jobs/`, `utils/`.
- `dist/` generado (build.js). No editar.
- `data/`, `uploads/`, `logs/` = artefactos runtime, fuera de git.
- `templates/` plantillas. Secrets en `.env`.

## Comandos
- `npm run dev` watchdog · `dev:local` tsx · `build` · `start` dist.
- `npm test` Jest · `lint` ESLint · `format` Prettier.

## Convenciones
- `camelCase` vars/fns · `PascalCase` tipos/clases · `kebab-case` archivos.
- Límites por feature folder, minimizar cross-deps.
- Tests `*.test.ts`/`*.spec.ts` en `__tests__/`. Cubrir endpoints, jobs, helpers WhatsApp.
- Lint + format antes de shippear.
