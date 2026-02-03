# Repository Guidelines

## Project Structure & Module Organization
- Source code lives in `src/`, with feature areas grouped under folders like `api/`, `whatsapp/`, `jobs/`, and `utils/`.
- Build output is emitted to `dist/` by the build script; treat it as generated.
- Runtime data and artifacts may appear in `data/`, `uploads/`, and `logs/`. Keep these paths out of version control unless explicitly required.
- Templates live in `templates/` and configuration is in root files such as `tsconfig.json`.

## Build, Test, and Development Commands
- `npm run dev`: Run the resilient dev watchdog (auto-restarts) which launches `tsx src/index.ts`.
- `npm run dev:local`: Run the TypeScript entrypoint in watchless dev mode using `tsx` (`src/index.ts`).
- `npm run build`: Bundle/compile to `dist/` via `build.js`.
- `npm start`: Run the compiled server from `dist/index.js`.
- `npm run test`: Execute Jest (no project tests are defined yet).
- `npm run lint`: Lint `src/**/*.ts` with ESLint.
- `npm run format`: Format `src/**/*.ts` using Prettier defaults.

## Coding Style & Naming Conventions
- Language: TypeScript with ES module syntax (`type: "module"`).
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `kebab-case` for files.
- Formatting: Use `npm run format` (Prettier defaults). Run `npm run lint` before shipping changes.
- Keep module boundaries by feature folder to reduce cross-dependencies.

## Testing Guidelines
- Jest is configured but no repo tests exist yet. Place tests in `tests/` or `__tests__/` and name them `*.test.ts` or `*.spec.ts`.
- Add test coverage for new endpoints, jobs, and WhatsApp integration helpers as they grow.
- Run all tests with `npm run test`.

## Commit & Pull Request Guidelines
- No git history is present in this workspace; use clear, imperative commit messages (e.g., `Add webhook retry policy`).
- PRs should include purpose, scope, testing performed, and any breaking changes. Link related issues and add screenshots/logs when behavior changes.

## Security & Configuration Tips
- Store local secrets in `.env` files and keep them out of version control.
- Avoid committing runtime artifacts in `data/`, `uploads/`, or `logs/`.
