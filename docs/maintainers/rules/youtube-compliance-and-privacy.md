# YouTube Embed and Privacy Rules

Status: Draft release-blocking rules
Last updated: 2026-07-12

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP implementation plan](../plans/shadowing-recorder-mvp-implementation.md)
- [Static web deployment decision](../decisions/0004-static-web-deployment.md)

These rules define the public-launch boundary for Shadowing Recorder. They must
be reviewed against the current YouTube terms, developer policies, branding
requirements, actual deployment behaviour, and applicable privacy law before
release and after every material audience or data-flow change.

## Audience boundary

Shadowing Recorder is a general-audience, self-directed language-practice
utility. It is not designed, marketed, or presented as child-directed or
child-oriented:

- The product does not target children or provide child-specific onboarding,
  content curation, characters, rewards, advertising, or social features.
- The app does not classify or recommend videos. A learner supplies the video
  they want to practise with.
- A learner choosing a video that YouTube designates Made for Kids does not
  change the app's intended audience or its privacy behaviour.
- Any future decision to target children, add child-oriented presentation, or
  knowingly operate a child-directed service requires a new product, privacy,
  consent, and legal review before release.

This audience statement describes the product's design and positioning; it is
not a substitute for reviewing the audience rules that apply in each launch
jurisdiction.

## No first-party tracking or operator data collection

Shadowing Recorder does not use first-party or third-party analytics,
advertising trackers, telemetry, tracking identifiers, accounts, or an
application backend that receives learner activity. Application code does not
intentionally send to the operator or persist remotely:

- submitted YouTube URLs or video IDs;
- player events, playback history, or timing samples;
- microphone streams, encoded chunks, recordings, or derived speech data;
- diagnostics, device identifiers, or browser identifiers; or
- consent-marker contents or other locally held application state.

In this documentation, `does not collect` means that the app operator does not
receive or retain the data. The browser still processes information locally to
provide the user-requested feature:

- Microphone audio is held only in browser-managed, session-scoped memory or
  temporary storage.
- Completed recordings are exposed through session-local Blob URLs and are not
  uploaded or intentionally persisted.
- Recorder diagnostics are computed and displayed only in the current browser
  session and exclude device and group identifiers.
- A versioned consent marker may be stored in `localStorage`; it remains on the
  learner's device and is never transmitted to the operator.

Serving any web page necessarily exposes ordinary delivery metadata, such as an
IP address and user agent, to the static host or CDN. Production hosting must
disable provider analytics, avoid application access logs, minimise any
unavoidable security-log retention, and disclose the host's actual processing.
The learner supplies the YouTube URL through the page's input and explicitly
selects `Load video`. The validated video ID remains in session-local browser
state and is never copied into the application URL path, query, or fragment, so
the static host does not receive the selection as part of a page request.

Refreshing or closing the page removes the application's references and access
to attempts. Browser cleanup of temporary backing storage is
implementation-defined and is not promised to be immediate physical deletion.
Any future save, upload, analytics, advertising, telemetry, sharing, or account
feature requires a new data-flow design, updated disclosures, and renewed
consent before release.

## YouTube embed and third-party data flow

The embedded YouTube player is a third-party service. It communicates directly
with YouTube to render and validate the player, determine playability and
content restrictions, serve media and advertisements where applicable, and
process playback. Those requests are not first-party collection by Shadowing
Recorder, but they remain a third-party data flow that the app must disclose.

Every player must:

- use [YouTube privacy-enhanced mode](https://support.google.com/youtube/answer/171780)
  through `youtube-nocookie.com`;
- set `autoplay=0` so playback begins only after learner interaction;
- retain native controls, branding, links, and advertisements;
- remain visible while playing; and
- provide the required `origin` and Referer or equivalent API Client identity.

Privacy-enhanced mode limits how an embedded view influences the viewer's
YouTube browsing and advertising experience. It does not make the player an
offline or first-party component and does not eliminate the need to disclose
YouTube's own data handling.

## No YouTube Data API integration

The MVP does not integrate the YouTube Data API, create a Google Cloud API key,
or send a candidate video ID to an application backend. URL processing is local
to the browser. After recognising a supported YouTube URL and validating its
11-character video ID, the app creates the privacy-enhanced player and relies on
the IFrame Player API to report invalid, unavailable, private, age-restricted,
or embedding-disabled content.

The app does not query or infer a video's Made for Kids designation, live
status, embeddability metadata, category, suitability, or audience. It applies
the same no-tracking and no-operator-collection behaviour to every selected
video.

The current YouTube Developer Policies contain mandatory wording about looking
up each embedded video's Made for Kids status, while the linked implementation
guide describes checking when the developer is unsure. The product owner has
deliberately selected a static, no-Data-API architecture and uniform
privacy-minimising behaviour rather than a per-video metadata service. This
decision and the source-language discrepancy must remain visible in release
review; this document does not claim that the architecture overrides YouTube's
terms. A written clarification or a future policy change may require this
decision to be revisited.

## Required notice and consent

Before enabling URL loading, iframe creation, or Practice Mode, require the
learner to accept the current app privacy policy and app terms. Store only a
JSON marker such as `shadowingRecorder.consent`, containing `policyVersion` and
`acceptedAt`, in local browser storage. `Forget consent on this device` first
disables Practice Mode and clears pending player loads, then removes the marker
and returns to the consent gate.

The app terms must link to the [YouTube Terms of Service](https://www.youtube.com/t/terms)
and state that the app's YouTube features are also subject to them. The privacy
policy must remain prominently accessible and, at minimum:

- state that Shadowing Recorder is general-audience and is not child-directed
  or child-oriented;
- state that the app has no analytics, advertising tracking, telemetry,
  accounts, or operator-side collection of URLs, playback activity, or learner
  audio;
- distinguish application data handling from ordinary static-host delivery
  metadata and describe any unavoidable infrastructure logs or retention;
- explain the local microphone, Blob, diagnostics, and consent-marker handling;
- state that the app uses YouTube API Services and link to the
  [Google Privacy Policy](https://policies.google.com/privacy);
- describe the information the embedded player sends directly to YouTube,
  including playback data, browser/device storage or similar technologies, and
  third-party advertisements where applicable; and
- explain local deletion, page-refresh deletion, microphone lifecycle, the
  absence of Google account authorization, and how to contact the operator
  about privacy questions.

## Product name and YouTube attribution

- The application name is `Shadowing Recorder`. Do not use `YouTube`, `YT`,
  `You-Tube`, or a derivative in the product, domain, feature, company, app
  icon, or product logo name.
- It is acceptable to describe the app separately as working with YouTube or to
  label the URL field as accepting a YouTube URL.
- Pages containing the player should display the official `Developed with
  YouTube` logo supplied by YouTube.
- Place the attribution near the player, visually separate from the Shadowing
  Recorder name. Use an official, unmodified asset with the required contrast
  and minimum size, and link it to the selected video or other relevant YouTube
  content.

## YouTube content boundary

The application uses YouTube only through its visible embedded player. It must
not:

- download, extract, proxy, cache, or separately store YouTube audio or video;
- capture the YouTube stream as the learner's reference file;
- hide or replace required player controls, branding, links, or advertisements;
- play YouTube content through a hidden or background-only player; or
- claim ownership of embedded content.

The microphone records the learner independently. Headphones are required to
avoid intentionally capturing YouTube audio through the microphone.

## Public-launch checklist

- The deployed product and privacy copy state the general-audience,
  non-child-directed and non-child-oriented positioning.
- No analytics, advertising trackers, telemetry, tracking identifiers, account
  system, or application endpoint receives user activity or learner audio.
- Terms, privacy disclosures, affirmative versioned consent, YouTube Terms, and
  Google Privacy links are deployed and match the actual local and third-party
  data flows.
- The visible player uses `youtube-nocookie.com`, preserves YouTube
  functionality and branding, uses `autoplay=0`, identifies the API Client
  through `origin` and Referer or equivalent identity, and handles error `153`.
- The official `Developed with YouTube` attribution is deployed separately from
  the app name in accordance with the
  [YouTube Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines).
- A release owner has reviewed the current YouTube terms, developer-policy
  revision history, the documented no-Data-API decision, actual browser network
  behaviour, and applicable privacy law.

## References

- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube API Terms revision history](https://developers.google.com/youtube/terms/revision-history)
- [Finding the Made for Kids status of a video](https://developers.google.com/youtube/v3/guides/made_for_kids_status)
- [YouTube Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [YouTube privacy-enhanced embedding](https://support.google.com/youtube/answer/171780)
