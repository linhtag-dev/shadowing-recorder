# Shadowing Recorder MVP Technology Stack

Status: Active

Last updated: 2026-07-12

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP implementation plan](shadowing-recorder-mvp-implementation.md)
- [YouTube embed and privacy rules](../rules/youtube-compliance-and-privacy.md)
- [Static web deployment decision](../decisions/0004-static-web-deployment.md)
- [Cloudflare hosting and canonical-origin decision](../decisions/0005-cloudflare-workers-static-assets.md)
- [Current mainstream browser support decision](../decisions/0002-current-mainstream-browser-support.md)

This document owns the MVP stack and foundation direction. The implementation
plan owns delivery order; the technical design owns runtime behaviour.

## Decision summary

Shadowing Recorder is a static, browser-only product. React and Vite produce the
artifact; Cloudflare Workers Static Assets serves it over HTTPS at
`https://shadowing-recorder.htag.uk`. Runtime product behaviour uses browser
APIs and the YouTube IFrame Player API directly. It does not use the YouTube
Data API, an API credential, Worker code, a runtime application backend,
server-side rendering, or a database.

The product is general-audience and is not designed, marketed, or presented as
child-directed or child-oriented. It has no analytics, advertising trackers,
telemetry, accounts, or operator-side collection of selected URLs, playback
activity, microphone audio, recordings, diagnostics, or consent state.

## Implementation status

The 2026-07-11 walking skeleton proved npm workspace, Hono, shared-contract,
single-service preview, container, quality-check, and browser-test plumbing.
Those server-side pieces were scaffold rather than accepted product
architecture. Their evidence remains in the Stage 1 browser matrix, while the
API workspace, contracts workspace, health route, container, and server-only
configuration have now been removed.

The retained repository has one `apps/web` workspace. The URL loader,
privacy-enhanced player replacement, expected-video identity validation,
player-driven Practice Mode, latest-recording comparison controls, and
responsive layouts were implemented on 2026-07-12.

The Cloudflare deployment foundation is implemented and locally verifiable:
Wrangler is pinned, the static-only config declares the custom domain and SPA
fallback, response headers and crawler controls ship with the artifact,
Playwright exercises the deployment boundary, and `npm run check` includes a
Wrangler dry run. Production DNS/TLS and the first deployed real-device smoke
test remain operational acceptance work and must not be inferred from local
verification.

Pinned Wrangler's bundled local Workerd supports compatibility dates through
2026-07-09, so `wrangler dev` receives that local-only override. The production
source of truth remains `2026-07-12` in `wrangler.jsonc`. Because this deployment
has no Worker script, the override changes no application runtime semantics or
static-asset routing behavior.

## Stack

| Layer | Choice |
| --- | --- |
| Development and CI runtime | Node.js 24.18.0 and npm 11.16.0, pinned in the repository |
| Package management | npm workspaces with only `apps/*` and a committed lockfile |
| Frontend | React, Vite, and strict TypeScript |
| Client routing | React Router with Cloudflare Static Assets SPA fallback |
| Styling | CSS Modules and CSS custom properties |
| Runtime orchestration | XState v5 plus explicit generation-guarded player-load transactions |
| Video integration | YouTube IFrame Player API using `youtube-nocookie.com` |
| Local validation | Explicit TypeScript URL parsing and browser-boundary validation |
| Unit and component tests | Vitest with fake clocks and injected browser adapters |
| End-to-end tests | Playwright for Chromium, Firefox, and WebKit through `wrangler dev` |
| Static quality checks | TypeScript, ESLint, Prettier, Vite build, and Wrangler dry run |
| Continuous integration | GitHub Actions `verify` job required before merge |
| Production delivery | Cloudflare Workers Static Assets at the canonical custom domain |
| Runtime compute | None; no Worker script or application endpoint |
| Application persistence | No database; future local consent marker and session-scoped browser Blobs only |

Exact dependency versions are pinned by the lockfile. Node and Wrangler are
build, test, preview, and deployment tools; neither is a production application
server.

## Architecture rationale

### Browser-only product

The core capabilities depend on `getUserMedia`, `MediaRecorder`, object URLs,
page-lifecycle events, and the YouTube IFrame Player API. All learner-specific
state can remain on the learner's device. The product does not need server user
data, server components, secrets, durable storage, or general-purpose backend
logic.

React provides the component model, and Vite supplies the build and development
layer without imposing a server-rendering boundary. A full-stack rendering
framework would add conventions and infrastructure that the MVP does not need.

### Static Cloudflare delivery

Cloudflare Workers Static Assets provides the custom-domain TLS, SPA fallback,
declarative response headers, immutable fingerprinted-asset caching, versioned
deployments, and rollback needed by the static application. `wrangler.jsonc`
does not declare `main`, so there is no Worker request handler or runtime compute
path.

`workers.dev`, version preview URLs, non-production branch builds, Workers
observability, and Cloudflare Web Analytics remain disabled. Static hosting
still processes ordinary asset-delivery metadata; that infrastructure boundary
does not authorize application logging or learner-activity collection.

The initial deployment carries both `X-Robots-Tag: noindex, nofollow` and a
site-wide `robots.txt` disallow rule. They are crawler guidance rather than
access control and remain until a separate public-launch change completes the
policy, consent, and attribution work.

### No YouTube Data API

The browser parses supported YouTube URLs, validates the extracted 11-character
video ID, and constructs a visible privacy-enhanced player. It does not query
Made for Kids, live, embeddability, category, suitability, or audience
metadata. YouTube reports playability failures through the IFrame Player API.

There is consequently no API key, quota, secret manager, metadata proxy, rate
limiter, request coalescer, or eligibility outage. The policy interpretation is
recorded in the [YouTube embed and privacy rules](../rules/youtube-compliance-and-privacy.md)
and [ADR 0004](../decisions/0004-static-web-deployment.md).

### Headless controller and XState

Recording behaviour must not be implemented as loosely related React state and
effects. The technical design requires serialized events, mutually exclusive
controller states, asynchronous finalisation, generation guards,
operation-owned timers, and stale-callback suppression.

Use XState only for runtime orchestration, not all presentation state. Keep
separate ownership for local URL parsing/player replacement, Practice Mode and
microphone lifecycle, and attempt-scoped recording/finalisation. Inject player,
recorder, microphone, clock, and object-URL capabilities behind narrow
TypeScript interfaces. XState's event queue does not replace generation,
draft-identity, expected-video, and operation-token guards.

### Privacy boundary

The app makes no first-party runtime request containing learner activity. Local
microphone audio, chunks, Blob URLs, timing samples, diagnostics, and consent
state never cross an application-server boundary because no such product
boundary exists.

The YouTube iframe is a disclosed third-party boundary. It communicates
directly with YouTube and must use privacy-enhanced mode, `autoplay=0`, native
controls, the exact current application `origin`, and an appropriate Referer or
equivalent client identity. Production therefore supplies
`https://shadowing-recorder.htag.uk` as the iframe `origin` value.

## Repository direction

The repository remains an npm workspace without moving Vite to the root:

```text
apps/
  web/                 React/Vite product and colocated tests
tests/
  e2e/                 built-app and deployment-boundary Playwright tests
docs/
  maintainers/         product and operational sources of truth
wrangler.jsonc         static deployment contract
```

Do not recreate a server or shared network-contract workspace for browser-only
product state. No learner audio, selected URL, player event, diagnostic, or
consent type belongs in a network contract.

## Cloudflare build and release contract

Operational setup, deployment, evidence, and rollback steps are owned by the
[Cloudflare rollout runbook](../release/cloudflare-rollout.md).

Workers Builds uses the repository root, project name `shadowing-recorder`,
production branch `main`, build cache enabled, and non-production branch builds
disabled. Set the non-secret build variable `SKIP_DEPENDENCY_INSTALL=1` because
the platform's default npm does not match the repository pin.

Use exactly:

```text
Build:  npx --yes npm@11.16.0 ci && npx --yes npm@11.16.0 run check
Deploy: ./node_modules/.bin/wrangler deploy
```

Configure no runtime variable or secret. Require the GitHub `verify` job before
merge and prohibit unverified direct pushes to `main`. Record the first
successful deployment and manual smoke evidence. Use Cloudflare Version History
for rollback after a successful release; for a failed initial release, disable
the custom-domain route and redeploy the last verified commit.

## Verification strategy

Use three complementary layers:

1. Deterministic controller and component tests use fake players, recorders,
   media streams, tracks, clocks, lifecycle events, and object URLs. They own
   race-condition, player-replacement, and stale-callback coverage.
2. Playwright tests exercise user-visible state, URL validation, player errors,
   permissions where automation permits, accessibility, SPA fallback, static
   headers, caching, forbidden network targets, and bundle leakage in all three
   browser engines.
3. Real-device sessions validate DNS/TLS, the actual YouTube IFrame API,
   Referer behavior, microphone codecs and permissions, playback interlocks,
   mobile lifecycle, dashboard settings, and shutdown.

Live YouTube and real-microphone checks complement but do not replace
deterministic automation.

## Deliberate exclusions

Do not add the following without a demonstrated need and a superseding privacy
and architecture review where applicable:

- YouTube Data API integration or an API credential;
- a Worker script, runtime binding, variable, or secret;
- an application backend, serverless function, database, ORM, account system,
  or durable learner-audio storage;
- analytics, advertising trackers, telemetry, or server-side activity logging;
- branch previews, `workers.dev`, or Cloudflare Access;
- the Cloudflare Vite plugin;
- Redux or another general-purpose client store;
- a large component library, CSS framework, or monorepo task runner;
- a service worker, offline mode, or server-side rendering.

## Technical references

- [Cloudflare Workers Static Assets SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare Workers Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Vite guide](https://vite.dev/guide/)
- [XState actors](https://stately.ai/docs/actors)
- [Vitest](https://vitest.dev/)
- [Playwright browsers](https://playwright.dev/docs/browsers)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
