# Shadowing Recorder MVP Implementation Plan

Status: Draft  
Last updated: 2026-07-11

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [YouTube compliance and privacy rules](../rules/youtube-compliance-and-privacy.md)

This plan defines delivery sequence. Completion is determined by the acceptance criteria in the MVP requirements, not by stage implementation alone.

## Stage 1: Non-public recorder proof of concept

- Fixed, developer-prechecked YouTube video.
- Explicit `Start recording` and `Stop recording` buttons.
- Learner-audio playback.
- Validate simultaneous YouTube playback and microphone recording on target browsers.
- Keep this stage on localhost or restricted development access; it is not a public-launch architecture.

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

- YouTube IFrame Player API integration.
- Headphone confirmation and Practice Mode.
- Serialized `requestingMic`, `armed`, `recording`, `buffering`, and `finalising` states.
- Post-permission reconciliation and expected-video identity checks.
- Attempt-scoped recorder/chunk ownership and asynchronous finalisation.
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
