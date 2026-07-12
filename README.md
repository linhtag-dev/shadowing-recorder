# Shadowing Recorder

Shadowing Recorder is a browser-first language-practice tool. The current
pre-launch build accepts a supported YouTube URL, follows the verified player's
native play/pause state with microphone recording, and lets the learner compare
the reference with their latest recording locally.

The production artifact is a static React/Vite site deployed through Cloudflare
Workers Static Assets at <https://shadowing-recorder.htag.uk>. It contains no
Worker script, application API, runtime secret, analytics, or telemetry. The
initial deployment is public but deliberately marked `noindex` until the
separate public-launch requirements are complete.

> **Current status:** the URL loader, privacy-enhanced player, Practice Mode,
> latest-recording playback, quick comparison controls, static Cloudflare
> deployment contract, and recorder diagnostics are implemented. Consent,
> public policy pages, official attribution, explicit headphone confirmation,
> timing labels, resource ceilings, and a multi-attempt list remain before
> public launch. See the
> [MVP implementation plan](docs/maintainers/plans/shadowing-recorder-mvp-implementation.md).

## Use the current build

1. Paste a full HTTPS YouTube watch, `youtu.be`, Shorts, or embed URL and select
   **Load video**.
2. Wait for **Video ready**, then enable **Practice Mode** and grant microphone
   permission.
3. Use the embedded player's native controls. `PLAYING` starts recording,
   `BUFFERING` pauses it, and `PAUSED` or `ENDED` finalises it.
4. Use **Reference**, **My recording**, and restart in the comparison tray. The
   tray becomes a compact floating dock after it scrolls out of view.

After each completed attempt, the app stops every track in that attempt's
microphone stream and leaves Practice Mode in a mic-off standby state. The
completed recording remains available for comparison. When the reference
resumes, the app stops learner playback and obtains a fresh stream before
starting the video. If learner playback ends or pauses first, the app pre-arms
that stream while all playback is stopped. Starting learner playback again
releases it. This avoids both carrying a capture stream across iOS Safari's
learner-playback audio-session switch and opening one after reference audio has
already started.

Some iOS Safari recordings of genuine silence finalise as a zero-byte MP4.
The app treats that as an empty attempt rather than a microphone failure: it
saves nothing, preserves the last playable recording, releases the stream, and
keeps Practice Mode ready for another attempt.

`Alt+C` switches between the ready reference and the latest matching recording
when focus is outside an editable control. Playing either source stops the
other. The full native audio control remains available in the **Latest
recording** panel.

Use headphones during practice. Capture requests echo cancellation, noise
suppression, and automatic gain control off to avoid voice-processing artifacts
during simultaneous reference playback. Browsers may ignore or omit optional
settings; the diagnostics panel reports what the selected track applied. An
explicit headphone-confirmation gate is still pending.

Recording format selection currently prefers MP4 when the browser reports it
as supported, then falls back to Opus in WebM, Opus in Ogg, or the browser
default. A physical-iPhone Safari 26.5 test produced silent WebM/Opus attempts
but audible MP4 attempts, so MP4-first avoids that confirmed encoder anomaly.

## Video and recording ownership

The app starts without a player. It parses the submitted URL locally and uses
only the extracted 11-character video ID to construct the iframe. Loading never
changes the application path, query, fragment, or browser history and never
sends the selection to an application service.

Every submission starts a replacement generation, including invalid or
repeated URLs. Practice Mode remains unavailable until the new player reports
ready and its current URL resolves to the requested ID. Stale callbacks cannot
adopt an older player.

Only the latest completed recording is retained. A new result revokes and
replaces the previous Blob URL. The latest recording survives a video change
with its original source ID, but the quick comparison controls enable it only
when that ID matches the ready player. Refreshing or closing the page drops the
application's recording references.

## Privacy and architecture boundary

Shadowing Recorder is a general-audience utility. It is not designed, marketed,
or presented as child-directed or child-oriented.

The app has no analytics, advertising trackers, telemetry, accounts, or
operator-side collection of selected videos, player activity, microphone audio,
recordings, diagnostics, or consent state. Microphone processing and recordings
stay in the current browser session. The embedded player is a third-party
service and communicates directly with YouTube; it uses
`youtube-nocookie.com`, native controls, and no autoplay.

Cloudflare serves only the built files in `apps/web/dist`. There is no
application backend, YouTube Data API credential, Worker script, binding,
runtime variable, or secret. SPA fallback and response headers are declarative
static-asset behavior in `wrangler.jsonc` and `apps/web/public/_headers`. See
[ADR 0005](docs/maintainers/decisions/0005-cloudflare-workers-static-assets.md).

## Requirements

- Node.js 24.18.0, pinned in `.node-version` and `.nvmrc`
- npm 11.16.0, pinned by the root `packageManager` field

With `nvm`, run `nvm use` before installing. Other Node version managers can
read `.node-version`.

## Local development

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves only the browser application.
Microphone access works through the browser's localhost secure-context
exception.

## Production-style local preview

```sh
npm run preview
```

Open <http://127.0.0.1:3000>. This builds `apps/web` and serves the same static
asset configuration through `wrangler dev`, including SPA fallback, security
headers, crawler restrictions, and asset caching rules. Stop it with `Ctrl-C`.
The local command overrides only the no-script Workerd compatibility date to the
newest date bundled with pinned Wrangler; production retains the date in
`wrangler.jsonc`, and static-asset behavior is unaffected.

## Automated verification

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`npm run check` verifies formatting, ESLint, strict TypeScript, web Vitest
projects, the production build, and a Wrangler deployment dry run.

`npm run test:e2e` rebuilds the site, starts it through `wrangler dev`, and runs
the user-visible flow plus deployment-boundary checks in Chromium, Firefox, and
WebKit. The suite intercepts the privacy-enhanced iframe and injects player,
microphone, and `MediaRecorder` fakes, so CI neither contacts live YouTube nor
requests a real microphone.

The deployment checks verify SPA deep links, required security and no-index
headers, immutable fingerprinted assets, absence of unexpected API/Data API/
analytics/telemetry requests, and absence of application API URLs, Google API
keys, and selected test-video IDs in the production bundle.

## Cloudflare deployment

The checked-in deployment source of truth is `wrangler.jsonc`. An authenticated
maintainer can deploy the already verified artifact with:

```sh
npm run deploy
```

Follow the
[Cloudflare production rollout runbook](docs/maintainers/release/cloudflare-rollout.md)
for the exact Workers Builds settings, release gate, automatic and manual deploy
paths, DNS/TLS and header smoke checks, evidence requirements, and rollback.
Do not claim deployment completion from a local dry run.

## Real-browser verification

Synthetic media does not establish real codec, permission, backgrounding,
Referer, DNS, TLS, or device behavior. The fixed-video Stage 1 matrix was
completed on 2026-07-11 and remains
[historical browser evidence](docs/maintainers/stage-1-browser-matrix.md).

Use the
[current real-device test guide](docs/maintainers/testing/locally-hosted.md) for
the dynamic URL-loader build. It covers the exact iframe `origin`, usable Referer
behavior without IFrame error 153, permission grant/denial, recording and
playback, lifecycle shutdown, and unexpected first-party requests. The rollout
runbook owns DNS/TLS, routing/headers, dashboard settings, evidence completion,
and rollback.

## Workspace boundaries

```text
apps/web/          React/Vite browser product and colocated tests
tests/e2e/         Built-application Playwright and deployment checks
docs/maintainers/ Requirements, design, plans, decisions, procedures, evidence
```

Keep npm workspaces even though only `apps/web` remains. Browser configuration
may use only intentionally public `VITE_*` values; every such value is public
bundle content. Do not add an application server, Worker script, API contract,
learner-data network path, runtime secret, analytics, or telemetry without a
new architecture and privacy review.

Start with the [maintainer documentation index](docs/maintainers/README.md) when
changing product scope, runtime behavior, architecture, or release evidence.
