# Shadowing Recorder MVP Implementation Plan

Status: Draft  
Last updated: 2026-07-12

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP technology stack and foundation plan](shadowing-recorder-mvp-technology-stack.md)
- [YouTube embed and privacy rules](../rules/youtube-compliance-and-privacy.md)
- [Cloudflare hosting and canonical-origin decision](../decisions/0005-cloudflare-workers-static-assets.md)
- [Cloudflare production rollout runbook](../release/cloudflare-rollout.md)

This plan defines delivery sequence and records implementation status. The root
[README](../../../README.md) describes the current runnable build. Completion is
determined by the acceptance criteria in the MVP requirements, not by stage
implementation alone.

## Foundation: walking skeleton

Completed locally on 2026-07-11. The original npm workspace, React/Vite
application, Hono walking-skeleton server, shared contracts, quality checks,
three-engine browser smoke test, and single-service preview container proved
the initial plumbing. The server, contracts, health route, and container were
historical scaffold rather than accepted product architecture and were removed
when the static Cloudflare foundation was implemented on 2026-07-12. Stage 1
evidence remains historical and is not rewritten to match the current topology.

## Stage 1: Non-public recorder proof of concept

Status: Complete. The fixed-video recorder implementation, synthetic automated browser coverage, production-container real-media testing, and the required current-stable desktop and physical mobile matrix were completed on 2026-07-11; see the [Stage 1 browser and device evidence](../stage-1-browser-matrix.md). The operator reported no unresolved incompatibilities.

- Fixed, developer-prechecked YouTube video.
- Explicit `Start recording` and `Stop recording` buttons.
- Learner-audio playback.
- Validate simultaneous YouTube playback and microphone recording on target browsers.
- Keep this stage on localhost or restricted development access; it is not a public-launch architecture.
- Before this stage exits, run the proof of concept from the locally built production container with the Vite application and Hono API served by one Node.js service.
- Do not block this stage on static-host selection, production DNS, or TLS provisioning.

## Static production deployment checkpoint

Status: Deployment-readiness implementation complete on 2026-07-12; first
production deployment and smoke evidence pending.

Cloudflare Workers Static Assets is selected for the canonical
`https://shadowing-recorder.htag.uk` origin. The retained repository contains
only the `apps/web` workspace. Pinned Wrangler configuration now owns the custom
domain, disabled `workers.dev` and preview URLs, disabled observability, static
asset directory, and SPA fallback. The artifact includes security/no-index
headers and a crawler disallow file; fingerprinted assets receive immutable
caching.

The Hono API, `/api/health`, shared contracts, server environment example,
container, and dead health UI are removed. Vite has no API proxy. The automated
suite checks deep-link fallback, application 404 rendering, required headers,
immutable caching, exact privacy-enhanced iframe origin behavior, forbidden
runtime request targets, and absence of application API URLs, Google API keys,
or selected fixtures in the production bundle. `npm run check` includes a
Wrangler deployment dry run.

Cloudflare Workers Builds must use the repository root, project name
`shadowing-recorder`, production branch `main`, cache enabled, non-production
branch builds disabled, `SKIP_DEPENDENCY_INSTALL=1`, the pinned npm install/check
command, and the checked-in Wrangler deploy command. No runtime variable or
secret is configured. GitHub verification must be required before merge.

Operational completion still requires the first deployment plus recorded
DNS/TLS, SPA, header, microphone, playback, exact iframe origin, Referer/error
153, request-boundary, Web Analytics, and Workers-observability checks. A local
dry run does not satisfy that evidence requirement.

## Stage 2: Public embed and policy foundation

Status: In progress. The local URL loader, privacy-enhanced dynamic embed,
load-generation replacement transaction, exact player-identity boundary,
source-labelled latest recording, and responsive video/Practice Mode setup were
completed on 2026-07-12. Consent, public terms/privacy links, official
attribution, explicit headphone confirmation, and the other launch-policy work
remain pending. The deployment may be publicly reachable for validation, but
`noindex` is not access control and does not make it public-launch-ready.

- App terms, privacy policy, required links, and versioned acceptance gate.
- Compliant `Shadowing Recorder` naming and official `Developed with YouTube` attribution.
- Explicit general-audience, non-child-directed and non-child-oriented positioning.
- Explicit disclosure that the app has no analytics, advertising trackers, telemetry, accounts, or operator-side collection of URLs, playback activity, diagnostics, consent state, or learner audio.
- URL parsing and validation. Completed for the supported HTTPS watch, `youtu.be`, Shorts, and embed forms on 2026-07-12.
- In-page YouTube URL input and explicit `Load video` action, with the selected ID held only in session-local browser state and no application-URL mutation. Completed 2026-07-12.
- Direct privacy-enhanced iframe creation from a locally validated ID, with no YouTube Data API integration or application backend. Completed 2026-07-12.
- Client-side `loadGeneration`, exact player-identity checks, stale-player destruction, and replacement safety. Completed for the latest-recording slice on 2026-07-12.
- Correct `origin`, Referer policy, native controls, `autoplay=0`, and IFrame error handling including error `153`. Completed 2026-07-12.

## Stage 3: Automatic recording controller

Status: In progress. The dynamic-video build loads the YouTube IFrame Player
API and connects `PLAYING`, `BUFFERING`, `PAUSED`, and `ENDED` events to an
explicitly enabled Practice Mode. It implements post-permission reconciliation,
attempt-scoped chunk ownership, a five-second finalisation watchdog,
latest-recording playback, initial one-source comparison controls, `Alt+C`
switching, and a responsive floating comparison dock. Full playback-pause
confirmation, timing ownership, resource limits, consent/headphone confirmation,
and the attempt list remain.

Chrome's default microphone processing produced choppy learner audio during audible reference playback while muted Chrome playback and Safari on the same Mac were clean. The fixed-video capture now requests echo cancellation, noise suppression, and automatic gain control off and reports the browser-applied settings in diagnostics; this correction was implemented on 2026-07-12.

- YouTube IFrame Player API integration. Initial fixed-video integration completed 2026-07-11.
- Practice Mode. Implemented for the latest-recording slice; explicit headphone
  confirmation remains pending.
- Serialized `requestingMic`, `armed`, `recording`, `buffering`, and `finalising` states. Initial fixed-video state flow completed 2026-07-11.
- Post-permission reconciliation and expected-video identity checks. Playback reconciliation completed 2026-07-11; generation-scoped replacement and identity validation completed 2026-07-12.
- Attempt-scoped recorder/chunk ownership and asynchronous finalisation. The
  latest recording retains its immutable source video ID across replacement;
  the attempt list remains pending.
- Five-second finalisation watchdog. Implemented. Buffering, heartbeat, timing,
  duration, and playback-request timer ownership remains pending.
- One-audio-source playback interlock. Initial reference/latest controls,
  restart, `Alt+C`, and stop-the-other-source behavior are implemented. The
  target two-second confirmed-player-pause protocol remains pending.
- Attempt list with approximate, discontinuous, and uncertain timing labels.

## Stage 4: Limits and usability hardening

- Loading and mapped URL/player error states. Initial slice implemented.
- Responsive setup and comparison-dock layout. Implemented in automation;
  current dynamic-loader real-device testing remains pending.
- Buffering pause/resume is implemented. The 30-second timeout, seeking flags,
  ads, identity drift hardening, rapid state changes, stale timers, and
  permission recovery remain.
- Five-minute/10 MiB per-attempt limits and 50 MiB total accounting.
- Initial visibility/page-exit interruption and microphone-track shutdown are
  implemented. Full lifecycle finalisation semantics, suspension heartbeat, and
  current-build real-device retesting remain.
- Clear privacy copy and microphone lifecycle.
- Static deployment automation, no-unexpected-first-party-request verification,
  bundle leakage checks, and local deployment-header verification are complete.
  First-deployment evidence and the public-launch policy review remain pending.
