# Shadowing Recorder

Shadowing Recorder is a browser-first language practice tool. This repository currently contains its tested walking skeleton: a React/Vite web application and a Hono API served from one containerized Node.js service.

The next milestone is a non-public, fixed-video browser proof of concept. There is no YouTube iframe, Data API credential, microphone request, or recording behavior in the scaffold.

## Runtime requirements

- Node.js 24.18.0, pinned in `.node-version` and `.nvmrc`
- npm 11.16.0, pinned by the root `packageManager` field
- Docker, only for the production-container workflow

With `nvm`, run `nvm use` before installing. Other Node version managers can read `.node-version`.

## Local development

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves the web application and proxies same-origin `/api/*` requests to Hono at `http://127.0.0.1:3000`.

Copy `.env.example` to `.env` only when you need to override the production-preview host, port, or built-web path. The walking skeleton needs no credentials.

## Production preview

```sh
npm run preview
```

This builds all workspaces, then starts one Node.js process at <http://127.0.0.1:3000>. Hono serves both `/api/health` and the built Vite assets, including the single-page-application fallback.

## Container

```sh
npm run container:build
npm run container:run
```

Open <http://127.0.0.1:3000>. The image uses the same pinned Node.js 24 runtime and does not require a YouTube credential.

## Verification

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`npm run check` runs formatting checks, linting, strict TypeScript checks, Vitest projects, and production builds. The Playwright smoke test runs against the built single service in Chromium, Firefox, and WebKit. CI performs both flows from the committed lockfile.

## Workspace boundaries

```text
apps/web/            React, Vite, browser-only code, and component tests
apps/api/            Hono routes, validated server environment, and static serving
packages/contracts/  Runtime-validated request and response schemas
tests/e2e/            Built-application browser smoke tests
```

Browser code may import shared contracts but cannot import the API workspace. Vite exposes only explicitly prefixed `VITE_*` values; server configuration remains in `apps/api`. The API has no learner-audio route or type. Its future eligibility request contract accepts only a candidate video ID.

Architecture and implementation notes live under [`docs/maintainers`](docs/maintainers).
