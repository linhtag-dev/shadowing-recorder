# Repository Guidelines

## Product and Architecture Boundary

Shadowing Recorder is a privacy-first browser product. React/Vite owns URL
parsing, the YouTube iframe, microphone capture, session-local Blob recordings,
and playback. Production is static-only Cloudflare Workers Static Assets at
`https://shadowing-recorder.htag.uk` with no Worker script, YouTube Data API
credential, runtime application backend, bindings, variables, secrets,
analytics, or telemetry.

Do not add selected URLs, player activity, diagnostics, consent state,
microphone data, or learner audio to a network contract. SPA fallback and
headers belong in the declarative static-asset configuration, not application
code.

## Project Structure and Module Ownership

- `apps/web/src/app/`: application shell and routes.
- `apps/web/src/components/`: React UI and component-scoped `*.module.css`.
- `apps/web/src/controller/`: headless Practice Mode, recorder, and microphone
  lifecycle. Keep browser capabilities injectable for deterministic tests.
- `apps/web/src/player/`: YouTube IFrame Player API adapter.
- `apps/web/src/youtubeVideoUrl.ts` and `videoEmbed.ts`: local URL validation
  and privacy-enhanced iframe construction.
- `apps/web/public/`: static response-header and crawler-control files copied
  into the deployment artifact.
- `wrangler.jsonc`: Cloudflare Static Assets, canonical domain, SPA fallback,
  preview, and observability contract.
- `tests/e2e/`: built-application Playwright and deployment-boundary tests.
- `docs/maintainers/`: requirements, design, plans, decisions, rules, test
  procedures, and historical evidence.

## Build, Test, and Development Commands

Use Node.js 24.18.0 and npm 11.16.0 as pinned by the repository.

- `npm ci`: install exactly from `package-lock.json`.
- `npm run dev`: run the Vite web workspace on `127.0.0.1:5173`.
- `npm test`: run the web Vitest projects.
- `npm run format`: format the repository with Prettier.
- `npm run check`: run formatting, lint, strict types, Vitest, the web build,
  and a Wrangler deployment dry run.
- `npm run test:e2e`: build and run Playwright through `wrangler dev` in
  Chromium, Firefox, and WebKit. Install them once with
  `npx playwright install chromium firefox webkit`.
- `npm run preview`: build and serve the static deployment locally at
  `127.0.0.1:3000` through Wrangler.
- `npm run deploy`: deploy the verified static artifact through the pinned
  Wrangler version. This requires explicit Cloudflare authority.

## Coding Style and Runtime Correctness

Write strict TypeScript with ES modules. EditorConfig and Prettier enforce
two-space indentation, LF endings, single quotes, trailing commas, and no
semicolons. ESLint warnings fail CI. Use `PascalCase` for React components,
`camelCase` for functions and variables, and CSS Modules for component styles.
Expose browser configuration only through intentionally public `VITE_*` values;
treat every such value as public bundle content.

Keep asynchronous media ownership in the controller rather than in loosely
related component effects. Player replacement and recorder work must preserve
load/session generations, immutable expected-video bindings, attempt-scoped
chunks, idempotent shutdown, and stale-callback guards. Revalidate player
identity at readiness and before state-changing playback or recording actions.
Never construct an iframe from unvalidated input or allow learner playback and
microphone recording to become app-initiated concurrent sources.

Do not add `main`, bindings, variables, secrets, a Cloudflare Vite plugin, or a
runtime handler to `wrangler.jsonc`. Do not weaken `_headers`, crawler controls,
canonical-origin behavior, or preview/observability restrictions without an
owned architecture or launch decision.

## Testing Guidelines

Vitest uses Node projects for controller, player, and URL code plus
jsdom/Testing Library for React components. Name colocated tests `*.test.ts` or
`*.test.tsx`; name Playwright scenarios `*.spec.ts` under `tests/e2e/`.

Add a focused regression test for every behavior change, especially permission
and finalisation failures, rapid player replacement, stale callbacks, identity
drift, lifecycle shutdown, visible accessibility state, deployment headers,
SPA routing, and forbidden network boundaries. Keep browser tests deterministic:
intercept YouTube and inject player/media fakes; CI must not contact live
YouTube or request a real microphone. Real-media checks follow
`docs/maintainers/testing/locally-hosted.md` and never replace automated
coverage.

Run `npm run check` for every change and `npm run test:e2e` for user-visible,
player, recorder, routing, preview, deployment, or browser-boundary changes.

## Documentation Ownership

- `README.md` describes the current implemented build and supported commands.
- `docs/maintainers/requirements/` owns target MVP scope and acceptance.
- `docs/maintainers/design/` owns target runtime semantics and failure safety.
- `docs/maintainers/plans/` records implementation status and remaining work.
- `docs/maintainers/release/` owns production rollout, evidence completion, and
  rollback procedures.
- `docs/maintainers/decisions/` contains accepted and superseded architecture
  decisions; do not rewrite historical decisions to look current.
- `docs/maintainers/testing/evidence/stage-1-browser-matrix.md` is historical
  evidence, not the current test procedure.

Update the README and implementation plan when behavior changes. Update
requirements, design, privacy rules, or an ADR only when their owned decision
changes. Keep implementation status separate from target acceptance language.
Do not mark a production deployment complete until DNS/TLS and the manual smoke
checks have actually passed.

## Commits and Pull Requests

Use Conventional Commits with an imperative `<type>: <summary>` subject, such
as `feat: add ...`, `fix: prevent ...`, or `docs: clarify ...`. Keep changes
focused and update the lockfile whenever dependencies change. Pull requests
should explain motivation and scope, link relevant maintainer documents, list
validation commands, and include screenshots for visible UI changes. Ensure
`npm run check` and relevant Playwright tests pass.

## Security and Configuration

Never commit `.env`, credentials, Cloudflare tokens, externally selected
test-video details, or learner audio. Do not put sensitive values in `VITE_*`
variables, shell history, screenshots, issues, or test logs. Learner audio must
remain session-local browser-owned Blob data. Cloudflare Workers Builds has the
single non-secret build variable `SKIP_DEPENDENCY_INSTALL=1`; production has no
runtime variables or secrets.
