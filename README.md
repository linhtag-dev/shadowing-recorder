# Shadowing Recorder

Shadowing Recorder is a browser-first language-practice tool. The current
non-public build accepts a supported YouTube URL, follows the verified player’s
native play/pause state with microphone recording, and lets the learner compare
the reference with their latest recording locally.

> **Current status:** the URL loader, privacy-enhanced player, Practice Mode,
> latest-recording playback, quick comparison controls, and recorder diagnostics
> are implemented. Consent, public policy pages, official attribution, explicit
> headphone confirmation, timing labels, resource ceilings, and a multi-attempt
> list remain before public release. See the
> [MVP implementation plan](docs/maintainers/plans/shadowing-recorder-mvp-implementation.md).

## Use the current build

1. Paste a full HTTPS YouTube watch, `youtu.be`, Shorts, or embed URL and select
   **Load video**.
2. Wait for **Video ready**, then enable **Practice Mode** and grant microphone
   permission.
3. Use the embedded player’s native controls. `PLAYING` starts recording,
   `BUFFERING` pauses it, and `PAUSED` or `ENDED` finalises it.
4. Use **Reference**, **My recording**, and restart in the comparison tray. The
   tray becomes a compact floating dock after it scrolls out of view.

`Alt+C` switches between the ready reference and the latest matching recording
when focus is outside an editable control. Playing either source stops the other.
The full native audio control remains available in the **Latest recording**
panel.

Use headphones during practice. Capture requests echo cancellation, noise
suppression, and automatic gain control off to avoid the voice-processing
artifacts observed during simultaneous reference playback. Browsers may ignore
or omit optional settings; the diagnostics panel reports what the selected
track actually applied. An explicit headphone-confirmation gate is still
pending.

## Video and recording ownership

The app starts without a player. It parses the submitted URL locally and uses
only the extracted 11-character video ID to construct the iframe. Loading never
changes the application path, query, fragment, or browser history and never
sends the selection to the application scaffold.

Every submission starts a replacement generation, including invalid or
repeated URLs. Practice Mode remains unavailable until the new player reports
ready and its current URL resolves to the requested ID. Stale callbacks cannot
adopt an older player.

Only the latest completed recording is retained. A new result revokes and
replaces the previous Blob URL. The latest recording survives a video change
with its original source ID, but the quick comparison controls enable it only
when that ID matches the ready player. Refreshing or closing the page drops the
application’s recording references.

## Privacy and architecture boundary

Shadowing Recorder is a general-audience utility. It is not designed, marketed,
or presented as child-directed or child-oriented.

The app has no analytics, advertising trackers, telemetry, accounts, or
operator-side collection of selected videos, player activity, microphone audio,
recordings, diagnostics, or consent state. Microphone processing and recordings
stay in the current browser session. The embedded player is a third-party
service and communicates directly with YouTube; it uses `youtube-nocookie.com`,
native controls, and no autoplay.

The accepted production direction is a static web app with no YouTube Data API
credential or runtime application backend. The Hono health/static server and
shared eligibility contracts currently in the repository are walking-skeleton
scaffolding used by local preview and automated tests, not required product
architecture. See
[ADR 0004](docs/maintainers/decisions/0004-static-web-deployment.md).

## Requirements

- Node.js 24.18.0, pinned in `.node-version` and `.nvmrc`
- npm 11.16.0, pinned by the root `packageManager` field
- Docker, only for the container workflow

With `nvm`, run `nvm use` before installing. Other Node version managers can
read `.node-version`.

## Local development

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves the web application and retains the
walking-skeleton `/api/*` proxy to Hono at `http://127.0.0.1:3000`. Current
product behavior does not depend on that API. Microphone access works through
the browser’s localhost secure-context exception.

## Production-style local preview

```sh
npm run preview
```

Open <http://127.0.0.1:3000>. This builds every workspace, then uses the
temporary Hono scaffold to serve `/api/health` and the Vite assets from one
process. It verifies the existing single-service package but is not the accepted
static production topology.

## Container

Build and keep the container attached in one terminal:

```sh
npm run container:build
npm run container:run
```

From another terminal, verify it:

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

Open <http://127.0.0.1:3000> and inspect the iframe URL in browser developer
tools. Its `origin` query parameter must be exactly
`http://127.0.0.1:3000`. Stop the attached container with `Ctrl-C`.

## Automated verification

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`npm run check` verifies Prettier formatting, ESLint, strict TypeScript, all
Vitest projects, and production builds.

`npm run test:e2e` builds the application and runs the user-visible URL loading,
player/recorder, comparison, responsive-dock, and health flow in Chromium,
Firefox, and WebKit. The suite intercepts the privacy-enhanced iframe and injects
YouTube-player, microphone, and `MediaRecorder` fakes, so CI neither contacts
live YouTube nor requests a real microphone.

## Real-browser verification

Synthetic media does not establish real codec, permission, backgrounding, or
device behavior. The fixed-video Stage 1 matrix was completed on 2026-07-11 and
is preserved as [historical browser evidence](docs/maintainers/stage-1-browser-matrix.md).
The dynamic URL-loader build must be retested before release using the
[current locally hosted test guide](docs/maintainers/testing/locally-hosted.md).

At minimum, a current-build run covers URL loading and replacement, permission
grant and denial, simultaneous visible video playback and microphone recording,
pause/resume/finalisation order, reported MIME type and byte count, reference
and learner playback interlock, page backgrounding, and confirmed microphone
shutdown. The supported release matrix is defined by
[ADR 0002](docs/maintainers/decisions/0002-current-mainstream-browser-support.md).

## Workspace boundaries

```text
apps/web/            React/Vite browser product and colocated tests
apps/api/            Temporary Hono health/static-preview scaffold
packages/contracts/  Temporary shared health/eligibility scaffold
tests/e2e/            Built-application Playwright smoke tests
docs/maintainers/    Requirements, design, plans, decisions, and evidence
```

Browser code may import shared contracts but must not import the API workspace.
New product behavior must not depend on the temporary server or add learner
activity to a network contract. Vite exposes only explicitly public `VITE_*`
values.

Start with the [maintainer documentation index](docs/maintainers/README.md) when
changing product scope, runtime behavior, architecture, or release evidence.
