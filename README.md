# Shadowing Recorder

Shadowing Recorder is a browser-first language practice tool. The current non-public browser build embeds one developer-prechecked video, connects its native play/pause state to microphone recording, and plays back only the latest recording locally.

This build intentionally has no arbitrary URL input, eligibility request, YouTube Data API credential, consent flow, or learner-audio server route.

## Audience and privacy boundary

Shadowing Recorder is a general-audience language-practice utility. It is not designed, marketed, or presented as child-directed or child-oriented.

The app has no analytics, advertising trackers, telemetry, accounts, or operator-side collection of selected videos, player activity, microphone audio, recordings, diagnostics, or consent state. Microphone processing and recordings stay in the current browser session. The embedded YouTube player is a third-party service and communicates directly with YouTube; the app uses `youtube-nocookie.com` and disables autoplay to minimise that third-party data flow.

The accepted production direction is a static web app with no YouTube Data API integration or runtime application backend. The current Hono health/static server and shared eligibility contracts are walking-skeleton scaffolding and are not required product architecture. See [ADR 0004](docs/maintainers/decisions/0004-static-web-deployment.md).

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

The page uses `youtube-nocookie.com`, native player controls, no autoplay, inline playback, and the current application origin. It enables and loads the YouTube IFrame Player API so `PLAYING` starts microphone recording, `BUFFERING` pauses it, and `PAUSED` or `ENDED` finalises it while Practice Mode is enabled.

Because headphones are required, microphone capture explicitly requests echo cancellation, noise suppression, and automatic gain control off. Recorder diagnostics show the processing settings, sample rate, and channel count that the browser actually reports; a browser may decline or omit an optional setting.

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

`npm run test:e2e` builds with the clearly synthetic `stage1_test` fixture, intercepts the iframe request, injects YouTube-player, microphone, and MediaRecorder fakes, and verifies the player-driven play/buffer/resume/pause/playback flow in Chromium, Firefox, and WebKit. CI never contacts live YouTube or requests a real microphone.

## Real-browser verification

Automated media fakes do not establish real codec, permission, backgrounding, or device behavior. Stage 1's production-container, current-stable desktop, and physical-mobile real-media matrix was completed on 2026-07-11; the results and operator-evidence boundary are recorded in [the Stage 1 browser matrix](docs/maintainers/stage-1-browser-matrix.md).

At minimum, each real-browser run must cover permission grant and denial, simultaneous visible video playback and microphone recording, pause/resume/stop ordering, reported MIME type and byte count, output playback, page backgrounding, and confirmed microphone shutdown.

## Workspace boundaries

```text
apps/web/            React, Vite, browser-only code, and component tests
apps/api/            Temporary Hono health/static-preview scaffold
packages/contracts/  Temporary shared eligibility-contract scaffold
tests/e2e/            Built-application browser smoke tests
```

Browser code may import shared contracts but cannot import the API workspace. Vite exposes only explicitly public `VITE_*` values. Learner audio exists only as browser-owned Blob data and object URLs. No learner audio, selected URL, player activity, diagnostic, or consent state is sent to the scaffold server.

Architecture and implementation notes live under [`docs/maintainers`](docs/maintainers).
