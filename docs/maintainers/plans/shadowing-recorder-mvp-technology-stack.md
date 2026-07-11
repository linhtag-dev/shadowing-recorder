# Shadowing Recorder MVP Technology Stack

Status: Active
Last updated: 2026-07-12

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP implementation plan](shadowing-recorder-mvp-implementation.md)
- [YouTube embed and privacy rules](../rules/youtube-compliance-and-privacy.md)
- [Static web deployment decision](../decisions/0004-static-web-deployment.md)
- [Current mainstream browser support decision](../decisions/0002-current-mainstream-browser-support.md)
- [Canonical application origin decision](../decisions/0003-canonical-application-origin.md)

This document owns the MVP stack and foundation direction. The implementation
plan owns delivery order; the technical design owns runtime behaviour.

## Decision summary

Shadowing Recorder is a static, browser-only product. React and Vite produce the
deployment artifact; a static host serves it over HTTPS from the canonical
origin. Runtime product behaviour uses browser APIs and the YouTube IFrame
Player API directly. It does not use the YouTube Data API, an API credential, a
runtime application backend, server-side rendering, or a database.

The product is general-audience and is not designed, marketed, or presented as
child-directed or child-oriented. It has no analytics, advertising trackers,
telemetry, accounts, or operator-side collection of selected URLs, playback
activity, microphone audio, recordings, diagnostics, or consent state.

## Implementation status

The walking skeleton was implemented and locally verified on 2026-07-11 before
the static deployment decision. It includes npm workspaces, a React/Vite app,
shared eligibility-contract scaffolding, a Hono health/static-preview server,
quality checks, Playwright smoke tests, and a production-style Node container.

Those server and eligibility pieces are historical scaffold, not requirements
of the accepted production architecture. They may remain temporarily for local
preview and regression testing, but new product behaviour must not depend on
them. Their removal or simplification should be handled as a focused
implementation change with corresponding test and README updates.

Stage 1's fixed-video recorder, synthetic automation, production-container
real-media run, and required desktop and physical-device matrix were completed
on 2026-07-11.

## Stack

| Layer | Choice |
| --- | --- |
| Development and CI runtime | Node.js 24 LTS, pinned in the repository |
| Package management | npm workspaces with a committed lockfile |
| Frontend | React, Vite, and strict TypeScript |
| Client routing | React Router with static-host SPA fallback |
| Styling | CSS Modules and CSS custom properties |
| Runtime orchestration | XState v5 for player-load and Practice Mode state machines |
| Video integration | YouTube IFrame Player API using `youtube-nocookie.com` |
| Local validation | Zod and explicit TypeScript parsing at browser boundaries |
| Unit and component tests | Vitest with fake clocks and injected browser adapters |
| End-to-end tests | Playwright for Chromium, Firefox, and WebKit |
| Static quality checks | TypeScript, ESLint, Prettier, and production build |
| Continuous integration | GitHub Actions |
| Production delivery | Static HTTPS hosting at the canonical origin |
| Application persistence | No database; only a local consent marker and session-scoped browser Blobs |

Exact dependency versions are pinned by the lockfile. Node is a build, test, and
local-tooling requirement; it is not a production application-server
requirement.

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

### No YouTube Data API

The browser parses supported YouTube URLs, validates the extracted 11-character
video ID, and constructs a visible privacy-enhanced player. It does not query
Made for Kids, live, embeddability, category, suitability, or audience
metadata. YouTube reports playability failures through the IFrame Player API.

There is consequently no API key, quota, secret manager, metadata proxy, rate
limiter, request coalescer, or eligibility outage in the production
architecture. The policy interpretation and review boundary are recorded in
the [YouTube embed and privacy rules](../rules/youtube-compliance-and-privacy.md)
and [ADR 0004](../decisions/0004-static-web-deployment.md).

### Headless controller and XState

The recording behaviour must not be implemented as loosely related React state
and effects. The technical design requires serialized events, mutually
exclusive controller states, asynchronous finalisation, generation guards,
operation-owned timers, and stale-callback suppression.

Use XState only for runtime orchestration, not all presentation state. At
minimum, separate ownership for:

- local URL parsing, player construction, replacement, and identity;
- Practice Mode and microphone lifecycle; and
- attempt-scoped recording and finalisation where child actors prove useful.

Browser capabilities should be injected behind narrow TypeScript interfaces,
including the player adapter, recorder factory, microphone provider, clock, and
object-URL provider. This keeps controller tests deterministic. XState's event
queue does not replace generation, draft-identity, expected-video, and
operation-token guards.

### Privacy boundary

The app makes no first-party runtime request containing learner activity. Local
microphone audio, chunks, Blob URLs, timing samples, diagnostics, and consent
state never cross an application-server boundary because no such product
boundary exists. Static hosting may still process ordinary asset-delivery
metadata; disable provider analytics, minimise log retention, and disclose any
unavoidable infrastructure processing.

The YouTube iframe is a disclosed third-party boundary. It communicates
directly with YouTube and must use privacy-enhanced mode, `autoplay=0`, native
controls, the canonical `origin`, and an appropriate Referer or equivalent
client identity.

## Repository direction

The current repository remains an npm workspace while the server scaffold is
retired deliberately:

```text
apps/
  web/                 React/Vite product and browser tests
  api/                 temporary health/static-preview scaffold
packages/
  contracts/           temporary shared eligibility scaffold
tests/
  e2e/                 built-application browser smoke tests
```

Browser code must not import the API workspace. No learner-audio, selected-URL,
player-event, diagnostic, or consent type belongs in a server workspace or
network contract. A later cleanup may collapse the workspace if the remaining
package boundaries no longer justify it.

## Execution sequence

### Step 0: Architecture baseline

1. Use the accepted static-web topology in
   [ADR 0004](../decisions/0004-static-web-deployment.md).
2. Use the accepted rolling browser-support policy: current stable desktop
   Chrome, Edge, Firefox, and Safari, plus current stable iOS/iPadOS Safari and
   Android Chrome.
3. Use `https://htag.uk` as the canonical production origin. Redirect
   alternate production hostnames before application behaviour begins.

Browsers outside this set, prerelease browsers, and older versions may work but
are not explicitly supported or release-blocking.

### Step 1: Walking skeleton

Completed on 2026-07-11. The original scaffold intentionally proved build,
test, preview, container, and workspace boundaries before the static production
decision. Preserve its evidence while removing obsolete runtime pieces in a
separate change.

### Step 2: Browser recorder proof of concept

Completed on 2026-07-11. The proof validated visible YouTube playback alongside
microphone recording, recorder event ordering, supported output, permissions,
page lifecycle, and physical mobile behaviour.

### Step 3: Static production foundation

Before public deployment:

1. Select a static host that supports HTTPS, the canonical hostname, redirects,
   cache control, security headers, and SPA fallback.
2. Verify the built app makes no first-party runtime request containing user
   activity and contains no YouTube Data API credential.
3. Verify `youtube-nocookie.com`, `autoplay=0`, native controls, `origin`, and
   Referer behaviour against the deployed origin.
4. Publish the terms, privacy policy, audience statement, consent gate, and
   YouTube/Google links required by the privacy rules.
5. Define static-asset rollback and policy-review ownership.

## Verification strategy

Use three complementary layers:

1. Deterministic controller and component tests use fake players, recorders,
   media streams, tracks, clocks, lifecycle events, and object URLs. They own
   race-condition, player-replacement, and stale-callback coverage.
2. Playwright tests exercise user-visible state, URL validation, player errors,
   permissions where automation permits, accessibility, privacy assertions, and
   three-engine smoke coverage. Most player tests use a controlled fake adapter.
3. Restricted real-device sessions validate the actual YouTube IFrame API,
   microphone, codecs, permissions, playback interlocks, mobile lifecycle, and
   deployment headers.

Add an automated production-bundle or browser-network assertion that rejects
unexpected first-party analytics, telemetry, API, selected-video, and audio
requests. Live YouTube and real-microphone checks complement but do not replace
deterministic automation.

## Deliberate exclusions

Do not add the following without a demonstrated need and a superseding privacy
and architecture review where applicable:

- YouTube Data API integration or an API credential;
- a runtime application backend, serverless function, database, ORM, account
  system, or durable learner-audio storage;
- analytics, advertising trackers, telemetry, or server-side activity logging;
- Redux or another general-purpose client store;
- a large component library or CSS framework;
- a monorepo task runner;
- GraphQL;
- a service worker or offline mode; or
- server-side rendering.

## Technical references

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Vite guide](https://vite.dev/guide/)
- [XState actors](https://stately.ai/docs/actors)
- [Vitest](https://vitest.dev/)
- [Playwright browsers](https://playwright.dev/docs/browsers)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
