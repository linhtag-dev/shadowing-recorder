# Shadowing Recorder MVP Implementation Plan

Status: Draft  
Last updated: 2026-07-12

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP technology stack and foundation plan](shadowing-recorder-mvp-technology-stack.md)
- [YouTube compliance and privacy rules](../rules/youtube-compliance-and-privacy.md)

This plan defines delivery sequence. Completion is determined by the acceptance criteria in the MVP requirements, not by stage implementation alone.

## Foundation: walking skeleton

Completed locally on 2026-07-11. The npm workspace, React/Vite application, Hono API, shared contracts, quality checks, three-engine browser smoke test, and single-service production container are in place. The first hosted CI run remains to be confirmed after the scaffold is pushed. No YouTube, microphone, or recording behavior was included in this foundation.

## Stage 1: Non-public recorder proof of concept

Status: Complete. The fixed-video recorder implementation, synthetic automated browser coverage, production-container real-media testing, and the required current-stable desktop and physical mobile matrix were completed on 2026-07-11; see the [Stage 1 browser and device evidence](../stage-1-browser-matrix.md). The operator reported no unresolved incompatibilities.

- Fixed, developer-prechecked YouTube video.
- Explicit `Start recording` and `Stop recording` buttons.
- Learner-audio playback.
- Validate simultaneous YouTube playback and microphone recording on target browsers.
- Keep this stage on localhost or restricted development access; it is not a public-launch architecture.
- Before this stage exits, run the proof of concept from the locally built production container with the Vite application and Hono API served by one Node.js service.
- Do not block this stage on hosting-provider selection, production secret management, distributed rate limiting, multi-replica request coalescing, quota metrics, or operational alerts.

## Deferred production deployment checkpoint

After the local container and fixed-video proof of concept work, select the hosting provider and production mechanisms for secrets, distributed rate limiting, same-ID request coalescing, quota/error metrics, alerts, HTTPS, and egress. Provider-neutral Stage 2 implementation may proceed locally while this checkpoint is open, but the checkpoint must close before shared staging or public eligibility traffic.

## Stage 2: Public eligibility and policy foundation

- App terms, privacy policy, required links, and versioned acceptance gate.
- Compliant `Shadowing Recorder` naming and official `Developed with YouTube` attribution.
- URL parsing and validation.
- Dedicated API project and restricted credential.
- Server-side `videos.list` eligibility endpoint with Made for Kids, live, embeddable, unavailable, quota, timeout, and unknown handling.
- Client-side `loadGeneration`, exact returned-ID checks, request abortion, and stale-response suppression.
- Iframe creation only after an eligible result; correct `origin`, Referer policy, native controls, and error `153` handling.
- Confirm and document the non-child-directed audience boundary.

## Stage 3: Automatic recording controller

Status: In progress. The fixed-video build now loads the YouTube IFrame Player API and connects `PLAYING`, `BUFFERING`, `PAUSED`, and `ENDED` events to an explicitly enabled Practice Mode. The remaining Stage 3 items below still require the public eligibility/player identity boundary, timing ownership, and attempt-list implementation.

Chrome's default microphone processing produced choppy learner audio during audible reference playback while muted Chrome playback and Safari on the same Mac were clean. The fixed-video capture now requests echo cancellation, noise suppression, and automatic gain control off and reports the browser-applied settings in diagnostics; this correction was implemented on 2026-07-12.

- YouTube IFrame Player API integration. Initial fixed-video integration completed 2026-07-11.
- Headphone confirmation and Practice Mode.
- Serialized `requestingMic`, `armed`, `recording`, `buffering`, and `finalising` states. Initial fixed-video state flow completed 2026-07-11.
- Post-permission reconciliation and expected-video identity checks. Playback reconciliation completed 2026-07-11; identity checks remain tied to the Stage 2 eligibility boundary.
- Attempt-scoped recorder/chunk ownership and asynchronous finalisation. Latest-attempt fixed-video slice completed 2026-07-11; the attempt list remains pending.
- Draft/generation-scoped timers, operation-token cleanup, and a five-second finalisation watchdog.
- One-audio-source playback interlock.
- Attempt list with approximate, discontinuous, and uncertain timing labels.

## Stage 4: Limits and usability hardening

- Loading and error states.
- Mobile-browser testing.
- Buffering pause/resume and timeout, seeking flags, ads, identity drift, rapid state changes, reversed eligibility responses, stale timers, and permission recovery.
- Five-minute/10 MiB per-attempt limits and 50 MiB total accounting.
- Visibility, page-exit, suspension-heartbeat, and microphone-track shutdown tests.
- Clear privacy copy and microphone lifecycle.
- Quota alerts, release-policy check, and deployment-header verification.
