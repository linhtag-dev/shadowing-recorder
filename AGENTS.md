# Repository Guidelines

## Project Structure & Module Organization

This is an npm-workspace TypeScript monorepo. `apps/web/src/` contains the React/Vite client, component styles, and browser tests. `apps/api/src/` contains the Hono server, routes, and runtime configuration. Shared Zod schemas and types belong in `packages/contracts/src/`. Both apps may import contracts; browser code must not import the API workspace. Cross-browser smoke tests live in `tests/e2e/`, while architecture notes live in `docs/maintainers/`.

## Build, Test, and Development Commands

Use Node.js 24.18 and npm 11.16 as pinned by the repository.

- `npm ci`: install the exact dependencies from `package-lock.json`.
- `npm run dev`: build shared contracts, then run the API and Vite dev servers.
- `npm run check`: verify formatting, linting, types, unit tests, and production builds.
- `npm run test:e2e`: build the application and run Playwright in Chromium, Firefox, and WebKit. Install browsers once with `npx playwright install chromium firefox webkit`.
- `npm run preview`: build and serve the single-service production preview at `127.0.0.1:3000`.

## Coding Style & Naming Conventions

Write strict TypeScript using ES modules. EditorConfig and Prettier enforce two-space indentation, LF endings, single quotes, trailing commas, and no semicolons. Run `npm run format` before submitting; ESLint warnings fail CI. Use `PascalCase` for React components, `camelCase` for functions and variables, and `*.module.css` for component-scoped styles. Keep server-only environment access in `apps/api`; expose browser configuration only through explicitly public `VITE_*` variables.

## Testing Guidelines

Vitest runs Node tests for contracts and API code plus jsdom/Testing Library tests for React components. Name colocated unit tests `*.test.ts` or `*.test.tsx`; name Playwright scenarios `*.spec.ts` under `tests/e2e/`. Add a focused regression test with each behavior change. No coverage threshold is configured, so prioritize meaningful boundary, failure-path, and user-visible assertions. Run `npm test` for unit tests and `npm run test:e2e` for full browser verification.

## Commit & Pull Request Guidelines

Commit messages must follow the Conventional Commits format, using an imperative `<type>: <summary>` subject such as `chore: scaffold ...` or `docs: add ...`. Common types include `feat`, `fix`, `test`, `docs`, and `chore`. Pull requests should explain the motivation and scope, link relevant issues or maintainer documents, list validation commands, and include screenshots for visible UI changes. Keep changes focused, update the lockfile when dependencies change, and ensure both `npm run check` and Playwright pass.

## Security & Configuration

Copy `.env.example` only for local overrides. Never commit `.env`, credentials, or learner audio. Treat all `VITE_*` values as public browser data.
