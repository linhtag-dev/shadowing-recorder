# ADR 0002: Current Mainstream Browser Support

Status: Accepted  
Date: 2026-07-11

## Context

Shadowing Recorder depends on browser-sensitive behavior including microphone permission, `getUserMedia`, `MediaRecorder`, codecs, object URLs, page lifecycle events, user-gesture restrictions, and the YouTube IFrame Player API. Supporting old or niche browsers would expand implementation and testing without evidence that the MVP needs it.

Browser version numbers change too frequently to make a permanently pinned list useful. A rolling policy still needs a defined browser set and an auditable release test matrix.

## Decision

Official support is limited to the current stable release, at the time of application release, of:

- Chrome, Edge, Firefox, and Safari on desktop;
- Safari on iOS and iPadOS; and
- Chrome on Android.

Browsers outside this set, pre-release browsers, and older versions may work but receive no explicit compatibility commitment. Failures confined to those environments do not block a release, and compatibility code will not be added solely for them without a demonstrated product need.

Automated coverage uses the current Playwright-provided Chromium, Firefox, and WebKit builds. Before release, real-browser testing must cover the current stable desktop browsers and, at minimum, one physical iPhone or iPad running current Safari and one physical Android phone running current Chrome. The release checklist records the exact browser versions, operating-system versions, and device models tested.

The application should detect required capabilities and present a clear unsupported-browser message rather than entering Practice Mode when those capabilities are absent or unusable.

## Consequences

- Browser support moves forward as stable browser releases change; there is no guaranteed grace period for an earlier release.
- Automated engine coverage does not replace real-device microphone, codec, permission, playback, and lifecycle testing.
- A regression in a named current stable browser is release-blocking unless it is documented and the support decision is deliberately revised.
- The tested versions and device models belong in each release record rather than this ADR.
