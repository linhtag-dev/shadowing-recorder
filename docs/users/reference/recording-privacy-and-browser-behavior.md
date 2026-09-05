# Recording, Privacy, and Browser Behavior

This reference describes the user-visible behavior of the current pre-launch
build. Target MVP requirements may include behavior that is not implemented
yet; the
[implementation plan](../../maintainers/plans/shadowing-recorder-mvp-implementation.md)
tracks that distinction.

## Video and recording ownership

The app starts without a player. It parses a submitted URL locally and uses only
the extracted 11-character video ID to construct the iframe. Loading never
changes the application path, query, fragment, or browser history and never
sends the selection to an application service.

Every submission starts a replacement generation, including invalid or
repeated URLs. Practice Mode remains unavailable until the new player reports
ready and its current URL resolves to the requested ID. Callbacks from an older
player cannot make that player current again.

Only the latest completed recording is retained. A new result revokes and
replaces the previous browser-owned Blob URL. The latest recording survives a
video change with its original source ID, but the quick comparison controls
enable it only when that ID matches the ready player. Refreshing or closing the
page drops the application's recording references.

## Microphone lifecycle and playback coordination

After each completed attempt, the app stops every track in that attempt's
microphone stream and leaves Practice Mode in a mic-off standby state. The
completed recording remains available for comparison.

When the reference resumes, the app stops learner playback and obtains a fresh
stream before starting the video. If learner playback ends or pauses first, the
app pre-arms that stream while all playback is stopped. Starting learner
playback again releases it. This avoids carrying a capture stream across iOS
Safari's learner-playback audio-session switch or opening one after reference
audio has already started.

Playing either the reference or learner recording stops the other. `Space` / `Right Arrow`
switches between the ready reference and the latest matching recording when
focus is outside an interactive control.

## Headphones and microphone diagnostics

Use headphones during practice. Capture requests echo cancellation, noise
suppression, and automatic gain control off to avoid voice-processing artifacts
during simultaneous reference playback. Browsers may ignore or omit optional
settings; the diagnostics panel reports what the selected track applied. An
explicit headphone-confirmation gate is still pending.

## Recording formats and Safari behavior

Recording format selection prefers MP4 when the browser reports it as
supported, then falls back to Opus in WebM, Opus in Ogg, or the browser default.
A physical-iPhone Safari 26.5 test produced silent WebM/Opus attempts but
audible MP4 attempts, so MP4-first avoids that confirmed encoder anomaly.

Some iOS Safari recordings of genuine silence finalise as a zero-byte MP4. The
app treats that as an empty attempt rather than a microphone failure: it saves
nothing, preserves the last playable recording, releases the stream, and keeps
Practice Mode ready for another attempt.

## Privacy boundary

The app has no analytics, advertising trackers, telemetry, accounts, or
operator-side collection of selected videos, player activity, microphone audio,
recordings, diagnostics, or consent state. Microphone processing and recordings
stay in the current browser session.

The embedded player is a third-party service and communicates directly with
YouTube. It uses `youtube-nocookie.com`, native controls, and no autoplay.
Cloudflare serves only the static application files; Shadowing Recorder has no
runtime application backend.

Shadowing Recorder is a general-audience utility. It is not designed, marketed,
or presented as child-directed or child-oriented. Consent, public policy pages,
and official attribution remain required before public launch.
