# Shadowing Recorder

Shadowing Recorder is a browser-first language-practice tool. The current
pre-launch build accepts a supported YouTube URL, follows the verified player's
native play/pause state with microphone recording in Shadowing, and adds a
Listen first style for reference → record → reflect. Both styles keep the
learner's latest recording local.

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

In Shadowing, `Space` / `Right Arrow` switches between the ready reference and the latest matching recording
when focus is outside an interactive control. Playing either source stops the
other. Use headphones during practice; an explicit headphone-confirmation gate
is still pending.

See the [practice guide](docs/users/how-to-guides/practice-with-a-youtube-video.md)
for the complete workflow and the
[recording, privacy, and browser reference](docs/users/reference/recording-privacy-and-browser-behavior.md)
for current lifecycle, storage, diagnostics, format, and Safari behavior.

### Listen first

Choose **Listen first · record · reflect** under **Practice style**, then enable
Practice Mode. Use the main button, **Space**, or **Right Arrow** to play the
reference, pause it and record your attempt, then stop and listen back. The next
advance replays the same passage; **New passage** starts a new selection from
the reference's current position. The microphone stays off during both playback
steps, and playback ending waits for your next action. Replay waits for the seek
and actual playback before applying the passage end. If learner playback cannot
start within five seconds, **Play my attempt** lets you retry. Changing styles finishes
any active attempt and leaves Practice Mode off.

An unexpected recorder stop releases every microphone track and offers a retry.
An unrecognised player state removes the player; reload the video before
continuing practice.

In Shadowing, app-controlled reference resume waits for the previous recording
to finish and the next microphone stream to be ready before starting playback.

See the [Listen first lifecycle](docs/maintainers/design/listen-first-practice.md)
for transitions, failure handling, and verification status.

## Privacy and architecture boundary

Shadowing Recorder is a general-audience utility. It is not designed, marketed,
or presented as child-directed or child-oriented.

The app parses the submitted URL locally and uses only the extracted
11-character video ID to construct the iframe. Loading does not change the
application URL or send the selection to an application service. Microphone
processing and recordings stay in the current browser session, and refreshing
or closing the page drops the application's recording references.

The app has no analytics, advertising trackers, telemetry, accounts, or
operator-side collection of selected videos, player activity, microphone audio,
recordings, diagnostics, or consent state. The embedded player is a third-party
service and communicates directly with YouTube; it uses
`youtube-nocookie.com`, native controls, and no autoplay.

Cloudflare serves only the built files in `apps/web/dist`. There is no
application backend, YouTube Data API credential, Worker script, binding,
runtime variable, or secret. SPA fallback and response headers are declarative
static-asset behavior in `wrangler.jsonc` and `apps/web/public/_headers`. See
[ADR 0005](docs/maintainers/decisions/0005-cloudflare-workers-static-assets.md).

## Development

The repository requires Node.js 24.18.0, pinned in `.node-version` and `.nvmrc`,
and npm 11.16.0, pinned by the root `packageManager` field. With `nvm`, run
`nvm use` before installing.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves only the browser application.
Microphone access works through the browser's localhost secure-context
exception.

### Automated verification

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`npm run check` covers formatting, lint, strict types, Vitest, the production
build, and a Wrangler deployment dry run. The Playwright suite exercises the
built site and deployment boundary in Chromium, Firefox, and WebKit without
contacting live YouTube or requesting a real microphone.

See the
[development and verification guide](docs/maintainers/contributing/development-and-verification.md)
for the complete command and test contract.

### Production-style local preview

```sh
npm run preview
```

Open <http://127.0.0.1:3000>. This builds `apps/web` and serves the static asset
configuration through `wrangler dev`, including SPA fallback, security headers,
crawler restrictions, and asset caching rules.

Synthetic media does not establish real codec, permission, backgrounding,
Referer, DNS, TLS, or device behavior. Use the
[current real-device test guide](docs/maintainers/testing/locally-hosted.md) for
the dynamic URL-loader build. The fixed-video Stage 1 run remains
[historical evidence](docs/maintainers/testing/evidence/stage-1-browser-matrix.md),
not a current procedure.

### Cloudflare deployment

The checked-in deployment source of truth is `wrangler.jsonc`. An authenticated
maintainer can deploy an already verified artifact with:

```sh
npm run deploy
```

Follow the
[Cloudflare production rollout runbook](docs/maintainers/release/cloudflare-rollout.md)
for the release gate, deployment paths, DNS/TLS and header smoke checks,
evidence requirements, and rollback. Do not claim deployment completion from a
local dry run.

## Repository and documentation map

```text
apps/web/          React/Vite browser product and colocated tests
tests/e2e/         Built-application Playwright and deployment checks
docs/users/        Current-build usage and user-visible behavior
docs/maintainers/ Requirements, design, plans, decisions, procedures, evidence
```

The [documentation index](docs/README.md) routes readers to user and maintainer
material. Start with the
[maintainer documentation index](docs/maintainers/README.md) when changing
product scope, runtime behavior, architecture, or release evidence.

Keep npm workspaces even though only `apps/web` remains. Browser configuration
may use only intentionally public `VITE_*` values; every such value is public
bundle content. Do not add an application server, Worker script, API contract,
learner-data network path, runtime secret, analytics, or telemetry without a
new architecture and privacy review.
