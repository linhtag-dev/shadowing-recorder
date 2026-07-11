# YouTube Compliance and Privacy Rules

Status: Draft release-blocking rules  
Last updated: 2026-07-11

## Related documents

- [MVP requirements](../requirements/shadowing-recorder-mvp.md)
- [Technical design](../design/shadowing-recorder-technical-design.md)
- [MVP implementation plan](../plans/shadowing-recorder-mvp-implementation.md)

These rules define the public-launch boundary for Shadowing Recorder. They must be reviewed against the current YouTube terms, developer policies, branding requirements, actual deployment behavior, and applicable privacy law before release and after every material API or data-flow change.

## Product name and YouTube attribution

- The application name is `Shadowing Recorder`. Do not use `YouTube`, `YT`, `You-Tube`, or a derivative in the overall app name, domain, feature names, company name, app icon, or product logo.
- It is acceptable to describe the app separately as working with YouTube or to label the URL field as accepting a YouTube URL.
- Removing YouTube functionality would make this application nonfunctional, so pages containing the player or other YouTube API functionality should display the official `Developed with YouTube` logo supplied by YouTube.
- Place the attribution near the player/API implementation, visually separate from the `Shadowing Recorder` name and description. It must not be the page's most prominent element or be combined into an app-name lockup.
- Use an official, unmodified asset with the required contrast and minimum size. Make it clickable and link it to the selected video on YouTube or another relevant YouTube content/component. Do not recreate the logo as styled text.

## Pre-embed eligibility service

Public deployment requires one Google Cloud API project dedicated to this API Client, with YouTube Data API v3 enabled. Keep its credential in server-side configuration or a secret manager, restrict it to the required API and deployment environment, and never ship it in frontend source or commit it to the repository. This read-only lookup does not require the learner to sign in to Google.

After local URL parsing and before creating any YouTube iframe, send only the extracted video ID to an HTTPS application endpoint. The endpoint calls [`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list) with that ID and `part=id,status,snippet`, then returns a narrow eligibility result. The public MVP does not cache API Data persistently or use a stale result as a fallback.

| Lookup result | Eligibility action |
| --- | --- |
| Exactly one matching item, `status.madeForKids === false`, `status.embeddable === true`, and `snippet.liveBroadcastContent === "none"` | `eligible`; the browser may create an iframe for that exact ID. |
| `status.madeForKids === true` | `madeForKids`; do not create the iframe in this MVP. |
| `snippet.liveBroadcastContent` is `live` or `upcoming` | `liveOrUpcoming`; do not create the iframe. |
| No matching item or explicitly non-embeddable item | `unavailable`; do not create the iframe. |
| Missing any required status field, timeout, network failure, malformed response, API error, rate limit, or quota exhaustion | `unknown`; fail closed, do not create the iframe, and offer a retry. |

The endpoint must apply per-client rate limiting, coalesce simultaneous checks for the same ID, enforce a short timeout, and expose quota/error metrics and an operational alert before daily quota is exhausted. It must distinguish retryable service failure from an invalid URL, return no credential details, and never receive learner audio. Quota exhaustion is an unavailable dependency, not permission to bypass the check.

## Privacy and permissions

### Learner recordings

By default:

- Audio remains in browser-managed, session-scoped local storage, which may be backed by memory or temporary browser storage.
- The application does not upload or intentionally persist the audio.
- Refreshing or closing the page removes the application's references and access to attempts. Browser cleanup of underlying temporary data is implementation-defined and is not promised to be immediate physical deletion.
- The microphone stream is stopped when Practice Mode is disabled, the page is hidden or exited, player identity changes, or a fatal controller error occurs.
- The application payload sent to the eligibility endpoint contains only the candidate YouTube video ID—not microphone audio, chunks, Blobs, or derived speech data. Ordinary network metadata and any operational logging must be disclosed separately.

The UI must state this plainly. Any future save, upload, analytics, or sharing feature requires a separate consent and retention design and a new policy acceptance when the described data use changes.

### Required notice and consent

Before enabling URL loading, eligibility lookup, iframe creation, or practice, require the learner to affirmatively accept the current version of the app privacy policy and app terms. Store a JSON marker in `localStorage` under an app-owned key such as `shadowingRecorder.consent`, containing only `policyVersion` and `acceptedAt`; it intentionally persists across sessions and never contains learner audio. If the policy version changes, require acceptance again. `Forget consent on this device` first disables Practice Mode and clears pending loads, then removes the marker and returns to the consent gate. Declining leaves only the static explanatory, privacy, and terms pages available.

The app terms must link to the [YouTube Terms of Service](https://www.youtube.com/t/terms) and state that use of the app's YouTube features is also subject to them. The privacy policy must remain prominently accessible and, at minimum:

- state that the app uses YouTube API Services;
- link to the [Google Privacy Policy](https://policies.google.com/privacy);
- describe the candidate video ID sent through the app server to the YouTube Data API and any operational request logging or retention;
- disclose the versioned `localStorage` consent marker, its fields, cross-session persistence, and `Forget consent on this device` deletion method;
- describe the information the embedded player shares with YouTube, including playback data, device/browser storage or similar technologies, and third-party advertisements where applicable;
- distinguish those third-party flows from learner microphone audio, which remains local in the MVP; and
- explain local deletion, page-refresh deletion, microphone lifecycle, the absence of Google account authorization, and how to contact the operator about privacy questions.

This MVP is specified as a general-audience, non-child-directed API Client and rejects Made for Kids videos. Consent to this privacy policy is not a substitute for parental consent or a child-directed product design.

Rejecting a Made for Kids result before iframe creation means the MVP creates no player or app-side tracking for that video. Any future decision to support such videos must first turn off tracking with respect to those players and establish a data-collection design that complies with applicable child-privacy law; that work is outside this MVP.

### YouTube embed

An embedded YouTube player communicates with YouTube even before playback to render and validate the player, and additional data can be shared when playback begins. The application must disclose that third-party embed and the distinction between the app's data handling and YouTube's.

Use [YouTube privacy-enhanced mode](https://support.google.com/youtube/answer/171780) through `youtube-nocookie.com` for the public MVP to limit how an embedded view influences the viewer's YouTube browsing experience. It does not make the player an offline or first-party component and does not remove the notice, consent, Made for Kids lookup, or applicable-law obligations.

## YouTube policy boundary

The application uses YouTube only through its visible embedded player. It must not:

- Download or extract the video's audio or video.
- Separate the audio from the video.
- Capture the YouTube stream as the learner's reference file.
- Hide or replace required player controls, branding, or advertisements.
- Play the YouTube content through a hidden or background-only player.
- Claim ownership of the embedded content.

The microphone records the learner independently. Headphones are required specifically to avoid intentionally recording the YouTube audio through the microphone.

The current [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies) are an MVP architecture and release requirement, not a later optional review. Public launch is blocked until all of the following are true:

- The dedicated API project, restricted server-side credential, quota monitoring, rate limiting, and fail-closed eligibility endpoint are operational.
- Every video ID for which the application creates an iframe is checked through the documented [Made for Kids lookup](https://developers.google.com/youtube/v3/guides/made_for_kids_status) first; the public MVP refuses Made for Kids and unknown results. Any cross-origin in-player navigation to an unchecked ID triggers the identity-drift teardown and cannot be adopted in place.
- Terms, privacy disclosures, affirmative versioned consent, YouTube Terms, and Google Privacy links are deployed and match actual logging and data flows.
- The operator has confirmed and documented that the API Client is not child-directed. A change in audience or support for Made for Kids content blocks release pending a new compliance design.
- The visible player preserves YouTube functionality and branding, identifies the API Client through `origin` and Referer/equivalent identity, and handles error `153`.
- The product is named `Shadowing Recorder`, with no YouTube name or variant in its overall identity. The official `Developed with YouTube` attribution is deployed near API functionality, separate from the app name, using an unmodified clickable asset in accordance with the [YouTube Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines).
- A release owner has checked the current YouTube terms, developer-policy revision history, branding requirements, and applicable privacy law before initial launch and every material API/data-flow change.

## References

- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)
- [Finding the Made for Kids status of a video](https://developers.google.com/youtube/v3/guides/made_for_kids_status)
- [YouTube Data API `videos.list`](https://developers.google.com/youtube/v3/docs/videos/list)
- [YouTube Data API video resource](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [YouTube privacy-enhanced embedding](https://support.google.com/youtube/answer/171780)
