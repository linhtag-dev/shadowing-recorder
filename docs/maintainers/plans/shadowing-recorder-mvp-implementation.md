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

Status: Complete. The fixed-video recorder implementation, synthetic automated browser coverage, production-container real-media testing, and the required current-stable desktop and physical mobile matrix were completed on 2026-07-11; see the [Stage 1 browser and device evidence](../testing/evidence/stage-1-browser-matrix.md). The operator reported no unresolved incompatibilities.

- Fixed, developer-prechecked YouTube video.
- Explicit `Start recording` and `Stop recording` buttons.
- Learner-audio playback.
- Validate simultaneous YouTube playback and microphone recording on target browsers.
- Keep this stage on localhost or restricted development access; it is not a public-launch architecture.
- Before this stage exits, run the proof of concept from the locally built production container with the Vite application and Hono API served by one Node.js service.
- Do not block this stage on static-host selection, production DNS, or TLS provisioning.

## Static production deployment checkpoint

Status: Deployment-readiness implementation and the first production deployment
completed on 2026-07-12. Automated production routing, header, caching, and
dashboard evidence is recorded below; current-build real-device microphone,
YouTube, and request-boundary smoke evidence plus resolution of the Cloudflare
NEL telemetry anomaly remain pending.

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

The first production deployment used commit
`12240d0dd7c194bd931f24f8dc273330117771ef`, Cloudflare Workers Build
`1255e7f2-387d-4f6a-9e4d-88656be1d5bc`, and deployed version
`15654a15-1e2f-4178-b8e2-8effa861ceb8`. The exact commit's GitHub `verify` job
passed. The sanitized
[initial production audit](../release/audits/2026-07-12-cloudflare-production.md)
records the setup and smoke history. Cloudflare detected Node.js 24.18.0 and npm
11.16.0, ran the pinned clean install and full check, passed 80 Vitest tests,
produced the static artifact, reported no bindings in the Wrangler dry run, and
completed the checked-in deploy command.

Production checks on 2026-07-12 confirmed public DNS and valid HTTPS at the
canonical hostname, a static root response, `200` SPA fallback with the
application 404 for an unknown path, the crawler disallow file, the required
security and no-index headers, immutable caching on a current fingerprinted
asset, and no health payload at `/api/health`. The Cloudflare dashboard showed
one custom domain, zero Workers, zero bindings, no runtime variable or secret,
disabled Workers logs and traces, disabled `workers.dev` and previews, build
cache enabled, production branch `main`, and non-production builds disabled.
Cloudflare Web Analytics has no site entry or injected RUM beacon for
`shadowing-recorder.htag.uk`; the existing, separately owned `htag.uk` hostname
entry was not changed.

A read-only Cloudflare API and public HTTPS recheck on 2026-07-12 confirmed that
the recorded version remained active at 100 percent traffic, the build outcome
remained successful, the custom domain and production-only trigger remained in
place, and bindings, secrets, logpush, tail consumers, `workers.dev`, and
preview URLs remained absent or disabled. GitHub Actions run `29180690383`
independently identified the recorded commit and successful `verify` job. The
deployed HTML, JavaScript, and CSS were byte-for-byte identical to the local
production artifact, and the SPA, API, header, crawler, caching, and injected
application-telemetry checks passed again. The evidence working tree also
passed `npm run check` with 80 Vitest tests and an assets-only Wrangler dry run,
then all 15 Playwright checks in Chromium, Firefox, and WebKit. See the linked
production audit for the sanitized details and the Cloudflare build-metadata
caveat.

The recheck also confirmed that Cloudflare still adds platform-managed `NEL`
and `Report-To` response headers. Cloudflare documents NEL as browser-based
reporting to an external endpoint and exposes a zone setting to disable it. This
is an open anomaly against ADR 0005's no-telemetry contract. Operational
completion requires disabling NEL and verifying header and browser-request
absence, or an explicit architecture and privacy decision accepting that
provider data flow.

GitHub branch protection is not enforceable for this private repository on the
current organization plan: both repository rulesets and classic branch
protection report that enforcement requires GitHub Team or Enterprise. On
2026-07-12 the operator explicitly accepted this as a release limitation for
the non-public validation deployment. Until the plan changes, the maintainer
owns the procedural control: release only the exact `main` commit whose hosted
`verify` job passed, and do not make unverified direct pushes. Revisit enforced
branch protection before public launch; this accepted limitation does not
satisfy the runbook's branch-protection release boundary.

Operational completion still requires recorded current-build microphone,
playback, exact iframe origin, Referer/error 153, browser/device,
request-boundary, and lifecycle-shutdown smoke evidence, plus resolution and
retest of the NEL anomaly. The production checkpoint therefore remains open.

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
latest-recording playback, initial one-source comparison controls, `Space` / `Right Arrow`
switching, and a responsive floating comparison dock. Full playback-pause
confirmation, timing ownership, resource limits, consent/headphone confirmation,
and the attempt list remain.

Chrome's default microphone processing produced choppy learner audio during audible reference playback while muted Chrome playback and Safari on the same Mac were clean. The fixed-video capture now requests echo cancellation, noise suppression, and automatic gain control off and reports the browser-applied settings in diagnostics; this correction was implemented on 2026-07-12.

An iOS Safari 26.5 real-device run produced valid-duration but silent
`audio/webm;codecs=opus` attempts and exposed a separate retained-stream failure
on the next attempt. Format selection now prefers supported MP4 as a controlled
A/B diagnostic before WebM/Ogg. The same physical iPhone produced audible voice
with `audio/mp4`, confirming the format-specific workaround; the separate
microphone-lifecycle correction was implemented on 2026-07-12. An initial eager
refresh still produced a zero-byte second MP4 after learner playback on the
physical iPhone. The controller now stops every completed attempt's tracks and
waits in mic-off standby; reference resume stops learner playback before
obtaining the next generation-bound stream. Current-build real-device retesting
then exposed a short reference stall because microphone access began only after
reference audio started. Learner playback pause/end now pre-arms the fresh
stream, learner playback start releases it, and app-initiated reference playback
waits for pre-arming. Current-build real-device retesting remains pending.

The same physical-iPhone flow showed that a genuinely silent interval can
finalise as a zero-byte MP4. Empty output is now a non-fatal discarded attempt:
the prior playable result is preserved, every current track is stopped, and
Practice Mode returns to standby with a visible explanation. Real-device
confirmation of this behavior remains pending.

- YouTube IFrame Player API integration. Initial fixed-video integration completed 2026-07-11.
- Practice Mode. Implemented for the latest-recording slice; explicit headphone
  confirmation remains pending.
- Serialized `requestingMic`, `standby`, `armed`, `recording`, `buffering`, and
  `finalising` states. Initial fixed-video state flow completed 2026-07-11;
  between-attempt standby was added 2026-07-12.
- Post-permission reconciliation and expected-video identity checks. Playback reconciliation completed 2026-07-11; generation-scoped replacement and identity validation completed 2026-07-12.
- Attempt-scoped recorder/chunk ownership and asynchronous finalisation. The
  latest recording retains its immutable source video ID across replacement;
  the attempt list remains pending.
- Five-second finalisation watchdog. Implemented. Buffering, heartbeat, timing,
  duration, and playback-request timer ownership remains pending.
- One-audio-source playback interlock. Initial reference/latest controls,
  restart, `Space` / `Right Arrow`, and stop-the-other-source behavior are implemented. The
  target two-second confirmed-player-pause protocol remains pending.
- Attempt list with approximate, discontinuous, and uncertain timing labels.

## Additional practice style: Listen first

Implemented on 2026-09-05. Shadowing remains the default. Listen first adds an
explicit reference → record → listen cycle, a shared main button and Space /
Right Arrow action, approximate passage replay, and a responsive three-step
dock. Microphone access occurs only for the record step. Empty attempts cannot
automatically play a previous result, and mode changes finish the active attempt
before switching off. Controller, component, and three-engine browser regressions
cover the flow; current-build physical-device microphone and Safari playback
verification remains pending. See the
[Listen first design](../design/listen-first-practice.md) and
[automated verification with screenshots](../testing/evidence/listen-first-automation.md).

Follow-up bug review on 2026-09-05 fixed premature replay stops during slow
seeks, treating buffering as a successful playback start, indefinite learner
playback waits, missing retry after media-position failures, and queued learner
play events changing the phase after cancellation. Regressions reproduce these
failures; browser coverage additionally decodes and plays two successive
synthetic WAV attempts through the native audio element.

## Stage 4: Limits and usability hardening

The 2026-09-05 controller review also fixed unexpected recorder stops leaving
Practice Mode stuck with live microphone tracks, and unknown player states
being treated as stopped. Unexpected stops now release tracks and enter the
retryable error state; unknown playback states invalidate the player before
microphone capture. Focused controller regressions cover both failures.

App-controlled Shadowing reference resume now also waits through an in-progress
finalisation before pre-arming the next microphone stream. Regression tests
cover the ordering and cancellation on disable, player replacement, style
change, and finalisation timeout. This closes a path that could reopen the
microphone after reference playback had already resumed; confirmation of its
effect on physical macOS Safari playback remains pending.

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
- Clear privacy copy and microphone lifecycle. Per-attempt mic-off standby and
  playback-safe stream pre-arming are implemented; consent/headphone gating and
  repeated-attempt real-device evidence remain pending.
- Static deployment automation, no-unexpected-first-party-request verification,
  bundle leakage checks, and local deployment-header verification are complete.
  First-deployment evidence and the public-launch policy review remain pending.
