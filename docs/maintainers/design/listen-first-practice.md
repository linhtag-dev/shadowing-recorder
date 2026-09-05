# Listen First Practice

Status: Implemented; current-build real-device media verification pending.
Last updated: 2026-09-05

Listen first is an additional practice style. Shadowing remains the default and
continues to follow native reference playback for recording. The Practice Mode
on/off control applies to either style; changing styles stops both sources,
finishes any active attempt, and leaves Practice Mode off.

## Three-step flow

| Phase | Active source | Advance action |
| --- | --- | --- |
| Play reference | Reference only; microphone off | Confirm reference pause, then request a fresh microphone stream and record. |
| Record | Microphone only; reference paused | Finalise once, release all tracks, then play this attempt from its beginning. |
| Listen | Learner attempt only; microphone off | Stop learner audio and replay the practiced reference passage. |

Enabling Listen first does not request microphone access or start playback.
The initial advance starts the reference at its current position. Subsequent
advances use the primary button, Space, or Right Arrow, including key-only
Right Arrow events from clickers. Shortcuts work on the primary button and
outside interactive controls; other controls retain native keyboard behavior.
Keys inside the embedded iframe remain owned by that iframe.

The first reference start and confirmed pause establish an approximate local
passage range. Later rounds seek to that start and pause at the end, sampled at
100 ms intervals. These are convenience replay bounds, not precise speech
alignment or learner-recording timestamps. **New passage** clears the range
and stops playback; the next advance starts from the reference's current
position. It is available between attempts, and the user can seek before
starting the next passage.

Reference end or pause never starts recording automatically. Learner playback
end or pause never starts the next round or pre-arms the microphone. A learner
can reflect for as long as needed. Recording length is manually controlled.

## Ownership and transition safety

`ListenFirstController` owns phase, pending advance, source ordering, bounded
player-state confirmation, passage replay timers, and playback retry intent.
It receives an injectable clock, a validated player binding, and a learner-audio
port. React renders snapshots and forwards user and media events.

`RecorderController` remains the sole owner of microphone streams, recorder
attempts, immutable video identity, chunks, finalisation, and Blob URLs. Its
Listen first policy enables into mic-off standby and accepts explicit recording
commands while the validated reference is stopped. Shadowing retains its
existing play-to-record policy and Safari stream pre-arming behavior.

An advance waits up to two seconds for a confirmed non-playing reference before
requesting the microphone. Identity and playback state are revalidated after
permission and immediately before recording. No active reference, including
buffering, qualifies for independent recording. Playback-start confirmation is
also bounded; a failed start offers retry.

Only one advance can be pending. Repeated key events, held keys, composition,
and modified shortcuts cannot skip steps. Finalisation uses the existing
five-second watchdog. The attempt selected for automatic reflection must be the
newly completed result; empty output preserves the previous recording but
shows **Retry recording** without playing that previous result. A rejected
learner `play()` offers **Play my attempt** for an explicit retry.

Mode changes, disable, player replacement, identity failure, page interruption,
and disposal cancel pending phase actions and passage timers. Late permission
streams are stopped; stale callbacks cannot start playback or a new recording.
Native reference playback during independent recording finalises that recording
and returns the flow to reference; during permission it cancels capture intent.
Completed attempts retain their source video ID.

All data remains session-local. This feature adds no storage persistence,
backend, network contract, credentials, analytics, or telemetry.

## Verification

Controller regressions cover the full cycle, passage replay, fresh streams,
pause confirmation and timeout, rapid advances, empty attempts, rejected learner
playback, native reference interference, mode switching, replacement, and
finalisation timeout. Component tests cover Space, ArrowRight and key-only
clickers, focus guards, active-step accessibility, and hidden-page cancellation.
Playwright exercises the new flow and responsive dock in Chromium, Firefox,
and WebKit with synthetic media and intercepted YouTube.

Run `npm run check` and `npm run test:e2e`. Follow
[locally hosted testing](../testing/locally-hosted.md) for real microphone,
permission, codec, and repeated-round checks, particularly iOS Safari. Automated
media fakes do not establish real-device recording or playback reliability.
