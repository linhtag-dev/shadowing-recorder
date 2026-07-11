# Controller boundary

The recorder keeps its Practice Mode states in the small XState machine here and injects microphone, MediaRecorder, object-URL, and clock capabilities through browser adapters. The controller owns only session-local Blob data; it has no API or shared-contract path.

The fixed-video player now reports YouTube IFrame Player API state changes to the controller. Enabling Practice Mode obtains and retains a microphone stream; `PLAYING` starts an attempt, `BUFFERING` pauses/resumes that attempt, and `PAUSED` or `ENDED` asynchronously finalises it. Local URL loading, player identity checks, timing, resource limits, and the production player-replacement transaction remain deferred. The accepted architecture has no YouTube Data API eligibility request.

The browser microphone adapter requests echo cancellation, noise suppression, and automatic gain control off because simultaneous reference speech caused Chrome's default voice-call processing to produce choppy learner audio. The controller snapshots the accepted track's non-identifying settings for visible diagnostics; browsers remain free to omit unsupported settings.
