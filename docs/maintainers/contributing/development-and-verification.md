# Development and Verification

Use the repository-pinned Node.js 24.18.0 and npm 11.16.0. Node is pinned in
`.node-version` and `.nvmrc`; npm is pinned by the root `packageManager` field.
With `nvm`, run `nvm use` before installing.

## Install and run

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves only the browser application.
Microphone access works through the browser's localhost secure-context
exception.

## Repository commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Vite web workspace on `127.0.0.1:5173`. |
| `npm test` | Run the web Vitest projects. |
| `npm run format` | Format the repository with Prettier. |
| `npm run check` | Check formatting, lint, strict types, Vitest, the web build, and a Wrangler deployment dry run. |
| `npm run preview` | Build and serve the static deployment on `127.0.0.1:3000` through Wrangler. |
| `npm run test:e2e` | Build and run Playwright through `wrangler dev` in Chromium, Firefox, and WebKit. |
| `npm run deploy` | Deploy the verified static artifact using authenticated Cloudflare authority. |

Install the Playwright browsers once with:

```sh
npx playwright install chromium firefox webkit
```

## Automated verification

Run for every change:

```sh
npm run check
```

Also run the browser suite for user-visible, player, recorder, routing, preview,
deployment, or browser-boundary changes:

```sh
npm run test:e2e
```

The Playwright suite rebuilds the site, starts it through `wrangler dev`, and
runs the user-visible flow plus deployment-boundary checks in Chromium, Firefox,
and WebKit. It intercepts the privacy-enhanced iframe and injects player,
microphone, and `MediaRecorder` fakes, so CI neither contacts live YouTube nor
requests a real microphone.

Deployment checks cover SPA deep links, required security and no-index headers,
immutable fingerprinted assets, absence of unexpected API, YouTube Data API,
analytics, or telemetry requests, and absence of application API URLs, Google
API keys, and selected test-video IDs in the production bundle.

Synthetic media does not establish real codec, permission, backgrounding,
Referer, DNS, TLS, or physical-device behavior. Follow the
[current real-device test guide](../testing/locally-hosted.md) for those checks.

## Production-style local preview

```sh
npm run preview
```

Open <http://127.0.0.1:3000>. The command builds `apps/web` and serves the same
static asset configuration through `wrangler dev`, including SPA fallback,
security headers, crawler restrictions, and asset caching rules. Stop it with
`Ctrl-C`.

The local command overrides only the no-script Workerd compatibility date to
the newest date bundled with pinned Wrangler. Production retains the date in
`wrangler.jsonc`, and static-asset behavior is unaffected.

## Deployment boundary

The checked-in deployment source of truth is `wrangler.jsonc`. Do not add a
Worker script, application API, binding, runtime variable, secret, analytics,
telemetry, or learner-data network path without a new architecture and privacy
review. Browser configuration may use only intentionally public `VITE_*`
values.

Use the [Cloudflare production rollout runbook](../release/cloudflare-rollout.md)
for release authority, configuration, evidence, and rollback. A local dry run
does not establish deployment completion.
