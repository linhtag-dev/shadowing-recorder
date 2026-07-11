# Shadowing Recorder

Shadowing Recorder is a browser-first language practice tool. The current Stage 1 build is a non-public browser proof of concept: it embeds one developer-prechecked video, records microphone audio through explicit controls, and plays back only the latest recording locally.

This stage intentionally has no arbitrary URL input, eligibility request, YouTube Data API credential, consent flow, automatic player-driven recording, or learner-audio server route.

## Runtime requirements

- Node.js 24.18.0, pinned in `.node-version` and `.nvmrc`
- npm 11.16.0, pinned by the root `packageManager` field
- Docker, only for the production-container workflow

With `nvm`, run `nvm use` before installing. Other Node version managers can read `.node-version`.

## Fixed-video configuration

`VITE_SHADOWING_VIDEO_ID` is an optional build-time setting. Its trimmed value must match `[A-Za-z0-9_-]{11}`. A missing or invalid value deliberately produces a disabled page with no video iframe and no microphone controls.

Supply a developer-prechecked ID without committing it:

```sh
export VITE_SHADOWING_VIDEO_ID='<11-character-video-id>'
```

Alternatively, copy `.env.example` to the ignored root `.env` and uncomment the setting. Vite reads the repository root as its environment directory. The ID is not a credential, but the Stage 1 operator still keeps the selected test fixture out of version control.

## Local development

```sh
npm ci
VITE_SHADOWING_VIDEO_ID="$VITE_SHADOWING_VIDEO_ID" npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves the web application and proxies same-origin `/api/*` requests to Hono at `http://127.0.0.1:3000`. Microphone access works through the browser's localhost secure-context exception.

The page uses `youtube-nocookie.com`, native player controls, no autoplay, inline playback, and the current application origin. It does not load the YouTube IFrame Player API in Stage 1.

## Production preview

The video ID is compiled into the browser bundle, so provide it to the build rather than the runtime server:

```sh
VITE_SHADOWING_VIDEO_ID="$VITE_SHADOWING_VIDEO_ID" npm run preview
```

Open <http://127.0.0.1:3000>. Hono serves both `/api/health` and the built Vite assets from one process.

## Container

The npm command passes `VITE_SHADOWING_VIDEO_ID` through the Docker build argument with the same name:

```sh
VITE_SHADOWING_VIDEO_ID="$VITE_SHADOWING_VIDEO_ID" npm run container:build
npm run container:run
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

Open <http://127.0.0.1:3000> and inspect the iframe URL in browser developer tools. Its `origin` query parameter must be exactly `http://127.0.0.1:3000`.

## Automated verification

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`npm run check` runs formatting checks, linting, strict TypeScript checks, Vitest projects, and production builds. A normal production build has no fixed ID unless the operator supplies one and therefore validates the disabled state.

`npm run test:e2e` builds with the clearly synthetic `stage1_test` fixture, intercepts the iframe request, injects microphone and MediaRecorder fakes, and runs the full explicit start/pause/resume/stop/playback flow in Chromium, Firefox, and WebKit. CI never contacts live YouTube or requests a real microphone.

## Real-browser verification

Automated media fakes do not establish real codec, permission, backgrounding, or device behavior. Before Stage 1 can be marked complete, follow the manual runbook and record every required desktop and physical-mobile result in [the Stage 1 browser matrix](docs/maintainers/stage-1-browser-matrix.md).

At minimum, each real-browser run must cover permission grant and denial, simultaneous visible video playback and microphone recording, pause/resume/stop ordering, reported MIME type and byte count, output playback, page backgrounding, and confirmed microphone shutdown.

## Workspace boundaries

```text
apps/web/            React, Vite, browser-only code, and component tests
apps/api/            Hono routes, validated server environment, and static serving
packages/contracts/  Runtime-validated request and response schemas
tests/e2e/            Built-application browser smoke tests
```

Browser code may import shared contracts but cannot import the API workspace. Vite exposes only explicitly public `VITE_*` values; server configuration remains in `apps/api`. Learner audio exists only as browser-owned Blob data and object URLs. The API and shared contracts contain no learner-audio type or route.

Architecture and implementation notes live under [`docs/maintainers`](docs/maintainers).
