# ADR 0004: Static Web Deployment Without the YouTube Data API

Status: Accepted
Date: 2026-07-12

## Context

The browser application can perform its core work entirely on the learner's
device: parse a selected YouTube URL, display a visible privacy-enhanced player,
capture microphone audio with `MediaRecorder`, and play session-local Blob
recordings. It has no account, upload, analytics, telemetry, advertising, or
durable application-data requirement.

The previous architecture introduced a server-side YouTube Data API call to
look up Made for Kids, live, and embeddability metadata before creating each
player. That lookup created the only product requirement for an API credential,
quota controls, runtime application endpoint, and stateful deployment
operations.

Shadowing Recorder is a general-audience language-practice utility. It is not
designed, marketed, or presented as child-directed or child-oriented.
Application code does not transmit learner-selected URLs, playback activity,
microphone audio, recordings, diagnostics, or consent state to the operator.
The app applies the same privacy-minimising behaviour to every player.

## Decision

Deploy Shadowing Recorder as a static web application:

- Do not integrate the YouTube Data API or provision a Google Cloud API key.
- Do not operate an application backend for normal product use.
- Accept a YouTube URL through an in-page input and load it only after the
  learner explicitly selects `Load video`.
- Parse supported YouTube URLs and validate video IDs locally. Keep the selected
  ID in session-local browser state and leave the application URL unchanged.
- Create a visible `youtube-nocookie.com` player with native controls and
  `autoplay=0` directly from a locally validated candidate ID.
- Let the IFrame Player API report invalid, unavailable, private, restricted, or
  embedding-disabled videos.
- Do not query or classify Made for Kids, live, embeddability, category,
  suitability, or audience metadata.
- Keep microphone audio, recordings, diagnostics, and consent state local to
  the browser and send none of them to the app operator.

The existing Hono server, health route, shared eligibility contracts, and
single-service container are walking-skeleton scaffolding rather than required
production architecture. Removing or simplifying that scaffolding is a separate
implementation change.

This decision supersedes [ADR 0001](0001-single-service-deployment-topology.md).
The canonical-origin decision in [ADR 0003](0003-canonical-application-origin.md)
still applies to the static application and YouTube player identity.

## Policy interpretation

The current YouTube Developer Policies contain mandatory language directing API
Clients to look up the Made for Kids status of each embedded video. The linked
Made for Kids guide describes the lookup as something a developer can perform
when unsure. The product owner has reviewed that discrepancy and deliberately
chosen uniform no-tracking, no-operator-collection behaviour and a static
architecture instead of the Data API integration.

This record makes that decision visible; it does not claim to override YouTube's
terms or applicable law. A written platform clarification, policy change,
audience change, or addition of tracking or operator-side collection requires a
new architecture and compliance review.

## Consequences

- The production artifact can be served by ordinary static hosting with HTTPS
  and SPA fallback support.
- There is no application secret, API quota, eligibility outage, application
  API log, or learner-audio server path. Ordinary static-host delivery metadata
  remains a separate infrastructure disclosure and minimisation concern.
- A selected video may fail only after the player is created. The UI must map
  IFrame errors clearly and allow another selection.
- The app cannot pre-classify live, Made for Kids, age-restricted,
  region-restricted, or embedding-disabled videos.
- User-selected video IDs and player traffic go directly from the browser to
  YouTube and are covered by the app's third-party embed disclosure.
- Any future backend, analytics, telemetry, upload, account, or child-oriented
  feature must supersede this decision before implementation.
