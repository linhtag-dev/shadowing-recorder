# Controller boundary

The recorder keeps its Practice Mode states in the small XState machine here and injects microphone, MediaRecorder, object-URL, and clock capabilities through browser adapters. The controller owns only session-local Blob data; it has no API or shared-contract path.

The dynamic YouTube player is attached through an immutable binding containing its load generation, expected video ID, and current URL/state readers. The controller revalidates that binding at readiness, before enabling, for every player callback, after microphone permission, before recorder start/resume, and before comparison playback. Stale bindings are no-ops. Identity failure invalidates the player and safely shuts down Practice Mode.

Enabling Practice Mode obtains and retains a microphone stream; `PLAYING` starts an attempt, `BUFFERING` pauses/resumes that attempt, and `PAUSED` or `ENDED` asynchronously finalises it. Player replacement uses one idempotent awaitable shutdown: it invalidates callbacks immediately, finishes an active attempt through the five-second watchdog, stops every microphone track, and settles only in a safe disabled state. A completed Blob keeps the attempt's immutable source video ID and survives later player changes. Timing labels, resource ceilings, consent, and the multi-attempt list remain deferred. The accepted architecture has no YouTube Data API eligibility request.

The browser microphone adapter requests echo cancellation, noise suppression, and automatic gain control off because simultaneous reference speech caused Chrome's default voice-call processing to produce choppy learner audio. The controller snapshots the accepted track's non-identifying settings for visible diagnostics; browsers remain free to omit unsupported settings.
