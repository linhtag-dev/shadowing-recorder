# Shadowing Recorder MVP Technology Stack

Status: Active

Last updated: 2026-07-11

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP implementation plan](shadowing-recorder-mvp-implementation.md)
- [YouTube compliance and privacy rules](../rules/youtube-compliance-and-privacy.md)
- [Single-service deployment topology decision](../decisions/0001-single-service-deployment-topology.md)
- [Current mainstream browser support decision](../decisions/0002-current-mainstream-browser-support.md)
- [Canonical application origin decision](../decisions/0003-canonical-application-origin.md)

This document records the proposed technology stack and the foundation work that should precede feature implementation. The implementation plan owns the overall delivery sequence; this document owns the initial stack and scaffolding recommendation.

## Decision summary

Project scaffolding should be the first implementation task, following a short architecture-baseline checkpoint that records the production topology, browser-support policy, and origin strategy. The production topology is one containerized Node.js service serving both the built web application and Hono API at `https://htag.uk`. Official browser support is limited to current stable releases of the mainstream browsers named below.

Hosting-provider selection and production operational infrastructure are deliberately deferred. They do not block scaffolding, a locally runnable container, or the non-public fixed-video YouTube and microphone proof of concept. They become release gates before the application is deployed to shared staging or exposes the arbitrary-video eligibility endpoint publicly.

The scaffolding task should produce a tested walking skeleton rather than only generated framework files. Microphone recording and YouTube integration begin in the subsequent non-public proof-of-concept stage.

## Implementation status

The walking-skeleton scaffold was implemented and locally verified on 2026-07-11. The repository now contains the npm workspaces, shared runtime contracts, accessible application shell, same-origin health route and development proxy, static quality and test configuration, production Node.js server, and multi-stage Docker image described below.

Local verification covers a clean lockfile install, the root `npm run check` workflow, the built-service Playwright smoke test in Chromium, Firefox, and WebKit, the development `/api/*` proxy, and a healthy locally running production container with no credential. The GitHub Actions workflow mirrors these commands; its first hosted run remains to be confirmed. Step 2 was completed on 2026-07-11, including the fixed-video implementation, synthetic automation, real production-container media test, and required desktop and physical-device matrix.

## Proposed stack

| Layer | Choice |
| --- | --- |
| Production and CI runtime | Node.js 24 LTS, pinned in the repository |
| Package management | npm workspaces with a committed lockfile |
| Frontend | React, Vite, and strict TypeScript |
| Client routing | React Router |
| Styling | CSS Modules and CSS custom properties |
| Runtime orchestration | XState v5 for the video-load and Practice Mode state machines |
| Eligibility API | Hono using Web Standard `Request`, `Response`, and `fetch` APIs |
| Boundary validation | Zod for request, upstream-response, and client-response schemas |
| Unit and integration tests | Vitest with fake clocks and injected browser adapters |
| End-to-end tests | Playwright for Chromium, Firefox, and WebKit |
| Static quality checks | TypeScript, ESLint, and Prettier |
| Continuous integration | GitHub Actions |
| Application persistence | No database; only the versioned consent marker uses `localStorage` |

Exact dependency versions should be selected at scaffolding time and pinned by the lockfile. Node.js 24 is the runtime baseline because it is an LTS release; a newer Current release should not become the production baseline until it enters LTS and the project deliberately upgrades.

## Architecture rationale

### React and Vite

The application is primarily a browser application. Its core capabilities depend on `getUserMedia`, `MediaRecorder`, object URLs, page-lifecycle events, and the YouTube IFrame Player API. It does not require server-rendered user data, server components, or a general-purpose backend framework.

React provides a familiar component model, while Vite supplies a small development and production build layer without imposing server-rendering boundaries on browser-only code. A full-stack rendering framework such as Next.js would add conventions that the MVP does not currently need.

### Headless controller and XState

The recording behavior must not be implemented as loosely related React state and effects. The technical design requires serialized events, mutually exclusive controller states, asynchronous finalisation, generation guards, operation-owned timers, and stale-callback suppression.

Use XState only for runtime orchestration, not for all presentation state. At minimum, define separate actors or machines for:

- video URL parsing and eligibility-load transaction ownership;
- Practice Mode and microphone lifecycle; and
- attempt-scoped recording/finalisation where child-actor ownership proves useful.

Browser capabilities should be injected behind narrow TypeScript interfaces, such as a player adapter, recorder factory, microphone provider, clock, and object-URL provider. This keeps controller tests deterministic. XState's event queue does not replace the generation, draft-identity, expected-video, and operation-token guards required by the technical design.

### Minimal Hono API

The server has one narrow responsibility for the MVP: validate a candidate video ID through the YouTube Data API and return a fail-closed eligibility result. Hono is sufficient for this boundary and keeps the handler based on portable Web APIs.

The public route should be same-origin, for example `POST /api/video-eligibility`. The server must own the YouTube credential, upstream timeout, response validation, rate limiting, same-ID request coalescing, structured operational errors, and quota metrics. No learner-audio type or code path should exist in the API application.

The containerized Node.js service serves both the Vite production assets and the API. A platform proxy or CDN may sit in front of the service, but the application remains one deployable service behind one public origin.

### Shared contracts

Place the eligibility request, response, and error schemas in a small shared package. Types inferred from runtime schemas may be consumed by both applications, but the browser must still validate the response at runtime. Do not share server configuration or credential-handling modules with the frontend workspace.

## Proposed repository shape

```text
apps/
  web/
    src/
      app/
      browser-adapters/
      components/
      controller/
  api/
    src/
      eligibility/
      middleware/
packages/
  contracts/
tests/
  e2e/
```

Use npm workspaces and ordinary root scripts. A monorepo task runner is unnecessary for the initial repository size.

## Initial execution sequence

### Step 0: Architecture baseline

Before generating the applications:

1. Use the accepted production topology: one containerized Node.js service serves both the built Vite application and Hono API under one public origin.
2. Apply the accepted rolling browser-support policy: current stable desktop Chrome, Edge, Firefox, and Safari, plus current stable iOS/iPadOS Safari and Android Chrome. Record the exact versions and physical devices exercised for each release.
3. Use the accepted canonical production origin `https://htag.uk`. In local development, expose the web application and proxied `/api/*` routes through one localhost origin.

Browsers outside this mainstream set, pre-release browsers, and versions older than the current stable release may work but are not explicitly supported or release-blocking. Do not add compatibility code solely for those environments without a demonstrated product need.

The accepted decisions are recorded as short architecture decision records. Scaffolding should preserve portable boundaries and must not assume an unselected hosting provider.

### Step 1: Walking-skeleton scaffolding

Create the workspace with:

- pinned Node.js and npm requirements;
- React/Vite web and Hono API applications;
- shared eligibility contracts;
- strict TypeScript configurations with browser/server boundaries;
- ESLint and Prettier configuration;
- Vitest projects for controller, component, contract, and API tests;
- Playwright configuration for Chromium, Firefox, and WebKit;
- a placeholder accessible application shell;
- a same-origin `/api/health` route and development proxy;
- environment validation and a safe `.env.example` without credentials;
- a production Dockerfile in which the Node.js service serves the built web application and API;
- production build, local preview, and local container-run commands; and
- continuous integration for clean install, formatting, linting, type checking, tests, and builds.

No YouTube iframe, Data API credential, microphone request, or recording behavior belongs in this task.

### Step 2: Non-public browser proof of concept

Proceed with the fixed-video recorder proof of concept already described in the MVP implementation plan. Keep it on localhost or restricted development access. Use it to validate the riskiest real-browser assumptions before building the complete controller:

- simultaneous visible YouTube playback and microphone recording;
- `MediaRecorder` start, pause, resume, stop, and final event ordering;
- supported MIME types and playable output across target browsers;
- permission behavior and user-gesture restrictions; and
- mobile Safari and Android lifecycle behavior.

The spike may use simple explicit start/stop controls, but browser capabilities should already sit behind the adapters intended for the production controller. Before this step exits, run the fixed-video proof of concept from the locally built production container and verify that the iframe receives the actual localhost origin. Because the video is fixed and developer-prechecked and the environment is non-public, this step requires neither a YouTube Data API credential nor the production eligibility safeguards.

### Step 3: Deferred production deployment checkpoint

After the local container and fixed-video proof of concept work, and before shared staging or public eligibility traffic:

1. Select and record the hosting provider for the accepted single-container topology.
2. Decide how the deployment supplies and rotates the server-only YouTube Data API credential.
3. Select distributed or platform-backed per-client rate limiting and a multi-replica-safe same-ID request-coalescing design.
4. Select quota/error metrics, operational alerts, log handling, and retention.
5. Validate HTTPS and DNS provisioning for `htag.uk`, egress controls, scaling behavior, and expected cost.

Provider-neutral eligibility contracts, handlers, deterministic tests, and local process implementations may be developed before this checkpoint. Process-local safeguards are acceptable for local testing but do not satisfy the shared-staging or public-launch requirements.

## Scaffolding exit criteria

Scaffolding is complete when all of the following are true:

- A clean checkout can install dependencies from the lockfile using the pinned LTS runtime.
- One root command runs formatting checks, linting, type checking, unit tests, and production builds.
- The web application can call the local same-origin health endpoint in development and production preview modes.
- The production container image builds and serves the web application and `/api/health` locally without a YouTube credential.
- Server-only environment variables cannot be imported into or exposed by the frontend build.
- A representative shared-contract test rejects malformed eligibility responses.
- Playwright can start the built application and complete a smoke test in Chromium, Firefox, and WebKit.
- CI performs the same checks without requiring a YouTube credential.
- The README explains setup, commands, environment variables, application boundaries, and the non-public status of the upcoming recorder spike.

## Test strategy

Use three complementary layers:

1. Deterministic controller and API tests use fake players, recorders, media streams, tracks, clocks, lifecycle events, and upstream YouTube responses. These tests own the race-condition and stale-callback acceptance cases.
2. Playwright tests exercise user-visible state, request ordering, permissions where automation permits, player-adapter behavior, accessibility, and multi-browser smoke coverage. Most automated player tests should use a controlled fake IFrame adapter rather than depend on live YouTube behavior.
3. Restricted staging and real-device sessions validate the actual YouTube IFrame API, microphone, codecs, permissions, playback interlocks, mobile Safari, Android, and deployment headers. These results should be recorded in a release checklist.

Live YouTube and real-microphone checks cannot be the only automated acceptance mechanism because they are external, stateful, and difficult to reproduce. Conversely, simulated browser tests cannot replace the required real-device matrix.

## Deliberate exclusions

Do not add the following without a demonstrated need:

- Redux or another general-purpose client store;
- a database, ORM, account system, or durable learner-audio storage;
- a large component library or CSS framework;
- a monorepo task runner;
- GraphQL;
- a service worker or offline mode;
- server-side rendering; or
- analytics that would alter the documented privacy data flow.

## Deferred production deployment details

The production topology and origin are selected: one containerized Node.js service serves the built Vite application and Hono API at `https://htag.uk`. The hosting platform and production operational infrastructure are intentionally deferred until after the locally containerized fixed-video proof of concept. Google Cloud Run is the initial candidate because it aligns naturally with the Google Cloud project, YouTube Data API credential, quota visibility, secret management, and HTTPS requirements, but rate limiting, request coalescing, egress restrictions, and cost must be validated before it becomes the recorded provider decision.

These open decisions do not block local development or the non-public proof of concept. They block shared staging and public eligibility traffic.

A provider that requires splitting the static application from a function or worker does not match the accepted topology. Adopting that model later would require superseding the topology decision as well as providing an explicit plan for platform-backed rate limiting, request coalescing, secrets, metrics, quota alerts, and local parity.

## Technical references

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Vite guide](https://vite.dev/guide/)
- [XState actors](https://stately.ai/docs/actors)
- [Hono Web Standards](https://hono.dev/docs/concepts/web-standard)
- [Hono on Node.js](https://hono.dev/docs/getting-started/nodejs)
- [Vitest Browser Mode](https://main.vitest.dev/guide/browser/)
- [Playwright browsers](https://playwright.dev/docs/browsers)
