# Shadowing Recorder MVP Requirements

Status: Draft  
Last updated: 2026-07-11

## Related documents

- [Technical design](../design/shadowing-recorder-technical-design.md)
- [YouTube compliance and privacy rules](../rules/youtube-compliance-and-privacy.md)
- [MVP implementation plan](../plans/shadowing-recorder-mvp-implementation.md)
- [TTS shadowing and prosody-feedback concept](../ideation/prosody-shadowing-design.md)

This document is the product-level entry point and owns MVP scope and acceptance. The technical design owns runtime behavior and failure handling. The compliance and privacy rules own public-launch constraints. The implementation plan owns delivery sequence.

## Summary

Shadowing Recorder lets a learner paste a YouTube URL, control the embedded video's normal play and pause controls, and record themselves shadowing what they hear. It is designed as a public MVP, not merely as a private prototype. Descriptive copy may say that it works with YouTube, but `YouTube`, `YT`, or a variant must not form part of the product, domain, feature, or company name.

While Practice Mode is enabled:

- YouTube playback starts microphone recording.
- Pausing or ending the video stops and asynchronously finalises the recording.
- The learner can immediately play back or delete the completed attempt.
- In the normal no-error case, each continuous play-to-pause interval becomes one attempt.

Headphones are a prerequisite so that the microphone captures the learner rather than the YouTube audio. Learner audio remains in browser-managed, session-scoped local storage; the application does not upload or intentionally persist it. Public deployment does, however, require a minimal server-side eligibility endpoint backed by the YouTube Data API so that every requested video is checked before an iframe is created. The MVP otherwise requires no TTS, speech recognition, feedback model, account, or upload service.

## User story

As an English learner, I want to paste a YouTube video, shadow a section using the normal YouTube controls, and listen to my own voice afterward so I can notice differences myself.

## Core interaction

```mermaid
flowchart TD
    A["Accept the app privacy policy and terms"] --> B["Paste and locally validate a YouTube URL"]
    B --> C{"Video eligibility result"}
    C -->|"Eligible"| D["Load the visible embedded player"]
    C -->|"Made for Kids, live, unavailable, or unknown"| X["Do not embed; explain or offer retry"]
    D --> E["Confirm headphones and enable Practice Mode"]
    E --> F["User presses Play; microphone recording starts"]
    F --> G["User presses Pause or video ends; recording finalises"]
    G --> H["Completed attempt appears"]
    H --> I["Play my attempt"]
    H --> J["Resume video and create another attempt"]
    H --> K["Delete attempt"]
```

Recording follows the YouTube player's state and its native controls remain usable. The application pauses playback only for an explicit attempt-playback request or a safety, eligibility, lifecycle, or resource-limit condition defined in the [technical design](../design/shadowing-recorder-technical-design.md).

## Scope

### Included in the MVP

- Paste and validate a single YouTube video URL.
- Require acceptance of the app privacy policy and terms before using URL-loading or practice features.
- Check Made for Kids status, live status, and embeddability through the YouTube Data API before creating the player.
- Display a visible embedded YouTube player with its native controls.
- Explicit headphone confirmation.
- Explicit microphone permission and Practice Mode.
- Automatic microphone recording while the player is playing.
- Automatic recording finalisation when the player is paused or ends.
- Playback and deletion of recorded attempts.
- Approximate YouTube timestamps plus explicit contiguous, discontinuous, or uncertain timing status.
- Clear player, microphone, recording, and error states.
- Bounded, browser-managed, session-scoped local recording that is not uploaded or intentionally persisted.
- A minimal metadata endpoint with credential protection, quota handling, and fail-closed eligibility states.

### Not included in the MVP

- System-generated pronunciation or prosody feedback.
- TTS reference generation.
- Speech recognition or transcription.
- Automatic subtitle extraction.
- YouTube audio capture, extraction, downloading, or mixing.
- Precise reference/learner waveform synchronisation.
- User accounts, cloud storage, sharing, or cross-device history.
- Playlists, live streams, or multi-video exercises.
- Videos designated Made for Kids.
- Automatic trimming or noise removal.
- Attempt renaming or notes.
- A child-directed product experience; that requires a separate product, consent, and legal design.

## User interface

```text
+----------------------------------------------------------------+
| Shadowing Recorder                                             |
|                                                                 |
| [ ] I agree to the Privacy Policy and Terms                     |
|     YouTube Terms | Google Privacy Policy                       |
|                                                                 |
| [ Paste a YouTube URL                                      ]    |
|                                                     [Load video]|
|                                                                 |
| +------------------------------------------------------------+ |
| |                 Visible YouTube player                     | |
| |                 Native player controls                     | |
| +------------------------------------------------------------+ |
| [Official clickable attribution logo asset below player]       |
|                                                                 |
| [ ] I am using headphones                                      |
| [Enable Practice Mode]                                         |
|                                                                 |
| Status: Ready                                                   |
|                                                                 |
| My attempts                                                     |
| 1. Approx. 01:42-01:57   [Play] [Delete]                       |
| 2. Multiple sections     [Play] [Delete]                       |
+----------------------------------------------------------------+
```

### Required controls

- YouTube URL input.
- `Load video`.
- A first-use consent control with persistent links to the app privacy policy, app terms, YouTube Terms of Service, and Google Privacy Policy.
- A `Forget consent on this device` action that safely disables Practice Mode before deleting the local consent marker.
- A compliant attribution area as defined by the [YouTube compliance and privacy rules](../rules/youtube-compliance-and-privacy.md).
- Headphone confirmation.
- `Enable Practice Mode` / `Disable Practice Mode`.
- Persistent state label: `Consent needed`, `No video`, `Checking video`, `Video unsupported`, `Eligibility unavailable—video not loaded`, `Video ready`, `Microphone needed`, `Requesting microphone`, `Ready`, `Recording`, `Buffering—recording paused`, `Finalising`, `Storage limit reached`, or `Error`.
- A prominent recording indicator and elapsed recording time.
- Retained-audio usage against the 50 MiB session limit.
- One audio player or play button per completed attempt.
- Delete action per attempt.
- Visible warnings when an attempt is automatically finalised or discarded because of a duration, memory, page-lifecycle, identity, or encoder condition.

### Optional convenience controls

- `Delete all attempts`.
- `Replay this video section`, for a `contiguous` attempt with a readable start timestamp.
- `Play my attempt automatically` as an opt-in preference.

Automatic learner-audio playback should not be the default. A user may pause the video merely to think, and browsers may block playback that is initiated indirectly by a click inside a cross-origin iframe.

## Known limitations

- Advertisements may trigger playback states and cannot reliably be distinguished from the selected video content; ad-inclusive timing is outside the acceptance guarantee.
- Buffering creates a brief recorder pause/resume boundary and a stall longer than 30 seconds ends the attempt.
- Player events and microphone recording do not begin at exactly the same instant.
- If the learner starts YouTube through its native controls while an attempt is playing, IFrame event latency can cause a brief audible overlap; learner audio is stopped before microphone recording begins.
- Native player seeking produces discontinuous timing; detection is tolerance-based and cannot reconstruct every played section.
- Some videos cannot be embedded or may later become unavailable.
- Video loading depends on YouTube Data API availability and quota. The MVP intentionally refuses to embed when eligibility cannot be checked.
- The IFrame API has no video-change event. Identity checks run at relevant transitions, and an internally navigated mismatched iframe is destroyed when detected.
- YouTube may edit its player, policies, APIs, or supported parameters.
- The IFrame API does not expose a video's transcript text.
- Captions may be unavailable, inaccurate, or in a different language.
- Starting microphone recording alongside media playback needs testing across mobile Safari, Chrome, Firefox, Android, and desktop browsers.
- A user may shadow music, advertisements, or non-speech content; the MVP does not classify what is playing.
- An in-progress session-scoped recording may be lost when a page is killed before asynchronous recorder finalisation completes.
- The resource ceilings intentionally stop long sessions and may require the learner to delete attempts before recording more.

These limitations are acceptable for self-guided listening and playback, but they would matter more if automatic timing or speech feedback were later introduced.

## MVP acceptance criteria

The MVP is complete only when all criteria below pass. Runtime terminology and behavior are defined by the [technical design](../design/shadowing-recorder-technical-design.md), and launch constraints are defined by the [YouTube compliance and privacy rules](../rules/youtube-compliance-and-privacy.md).

### Eligibility and public-launch requirements

- The product and page header use `Shadowing Recorder`, not a name containing `YouTube`, `YT`, or a variant. A compliant official `Developed with YouTube` logo appears near the player/API area, visually separate from the product name, is not the most prominent element, and links to relevant YouTube content or functionality.
- Before URL processing, any YouTube Data API request, iframe creation, or practice, the user has accepted the current app privacy policy and terms; persistent links to those documents, YouTube Terms, and Google Privacy are visible.
- A supported URL is locally reduced to a candidate video ID, then checked through the server endpoint. No iframe exists for that candidate while the result is pending.
- Only an exact result with `madeForKids === false`, `embeddable === true`, and `liveBroadcastContent === "none"` creates a player. An ordinary `/watch?v=` URL that is live or upcoming is rejected from metadata, not claimed to be detectable by syntax.
- Made for Kids, live/upcoming, unavailable, non-embeddable, missing-status, timeout, API-error, rate-limit, and quota-exhaustion cases create no iframe and have distinct or appropriately grouped user-facing explanations. No stale eligible fallback is used.
- In a reversed-response-order test, submit A and then B, deliver B's response first and A's eligible response last, and verify that only B can set `expectedVideoId`, status, or player. Repeat with an invalid B and verify that A still cannot load. Aborted requests that nevertheless complete have no side effects.
- The YouTube Data API credential is absent from frontend source and bundles. Quota metrics, rate limiting, timeout behaviour, and a forced quota-exhaustion path are verified in staging.
- The player retains native controls and required YouTube functionality. The production deployment supplies the configured `origin` and Referer/equivalent client identity; a simulated error `153` produces a configuration-specific message.

### Recording controller

- Nothing is recorded before eligible-video verification, headphone confirmation, and explicit microphone permission.
- Enabling Practice Mode while YouTube is already `PLAYING`, or starting playback while the permission prompt is open, begins visible recording from the post-permission reconciliation point without requiring another `PLAYING` event.
- `requestingMic`, `armed`, `recording`, `buffering`, and `finalising` are mutually exclusive controller states. Disabling during permission stops a late-returned stream; re-enable is unavailable during disable finalisation.
- Rapid pause/play, pause/play/pause, disable, video replacement, and recorder-error tests produce no mixed chunks, duplicate finalisation, stale state mutation, or recorder reuse. Playback that resumes during `finalising` is reconciled after `stop` and begins a new attempt if still applicable.
- After pause/end, finalisation, identity change, disable, error, page exit, or a new session, callbacks from old buffering, heartbeat, sampling, duration, finalisation-watchdog, pause-confirmation, and load-timeout timers perform no action. A stale buffering timer cannot pause or finalise a later attempt, and a stale pause-confirmation callback cannot start old learner audio.
- If `stop` never arrives, the five-second watchdog settles the pending finalisation, stops all microphone tracks, discards the failed draft, disables Practice Mode, and reports the error. Injected `MediaRecorder.onerror` and unexpected track `ended` cases use the same fail-safe; late recorder events cannot revive or save the failed draft, and a fresh explicit enable is available after track shutdown.
- Before each relevant transition and attempt start/resume, current video identity is compared with `expectedVideoId`. A mismatch requests finalisation, disables Practice Mode, stops microphone tracks, removes the mismatched iframe, and preserves prior attempts under their original IDs.
- In a controlled run using an eligible prerecorded video with no advertisement, seek, identity change, suspension, or encoder error, `PLAYING` followed by `PAUSED` or `ENDED` produces one playable attempt whenever the recorder emits a non-empty Blob. A zero-byte result is discarded with a visible message.
- `BUFFERING` pauses the recorder and gathers no buffered-period microphone data; returning to `PLAYING` resumes the same attempt. A 30-second stall finalises the attempt with a warning.
- Hiding the page finalises and disables Practice Mode; `pagehide`/`freeze` stops microphone tracks immediately; a detected suspension heartbeat gap marks the attempt uncertain and never silently resumes capture.
- At 5 minutes or 10 MiB, an attempt is automatically finalised and YouTube is paused. At 50 MiB retained across completed and in-flight data, new recording is blocked until deletion frees space. An over-limit final Blob is not retained.

### Playback and timing

- The user can play and delete every completed attempt.
- Requesting attempt playback while YouTube is active pauses YouTube, awaits recorder finalisation and a confirmed non-playing player state, then plays the attempt. If pause is not confirmed, learner audio does not start.
- A YouTube `PLAYING` event stops learner-attempt audio before microphone recording starts or resumes, preventing a prior attempt from being re-recorded.
- Every attempt stores the checked video ID. In the controlled no-ad/no-seek timing case, it displays an explicitly approximate start/end range.
- A detected backward or large forward seek sets `timingStatus: discontinuous`; an end earlier than the start never displays a simple range. Player-time, identity, unexpected-state, or suspension ambiguity sets `timingStatus: uncertain` with machine-readable flags.
- Acceptance tests do not assert universally correct ranges during advertisements because the IFrame API exposes no ad-specific state.

### Privacy and failure safety

- User-facing privacy copy says audio is browser-managed and session-scoped, is not uploaded or intentionally persisted, and may use memory or temporary browser storage. It says refresh/closure removes application access rather than promising immediate physical deletion.
- The privacy policy discloses the versioned `localStorage` consent marker, including its `policyVersion` and `acceptedAt` fields, cross-session persistence, and `Forget consent on this device` deletion method, separately from session-scoped learner audio.
- Invoking `Forget consent on this device` advances the relevant generations, aborts pending loads, safely shuts down Practice Mode and microphone tracks, removes the marker, and blocks interactive features until consent is accepted again.
- Disabling Practice Mode, hiding or leaving the page, identity mismatch, and fatal player/recorder errors stop every microphone track; the indicator remains visible until tracks actually stop.
- No YouTube audio is downloaded, extracted, or programmatically captured.
- No learner recording or microphone chunk leaves the browser. The eligibility request's application payload contains only the candidate video ID; ordinary request metadata is handled as disclosed in the privacy policy.
- Permission denial, eligibility failure, unavailable videos, unsupported recording, empty output, resource limits, and player/recorder errors are explained without an unchecked iframe, false recording state, invisible live microphone, app-initiated learner/YouTube overlap, or a recorder active while learner-attempt audio plays.
