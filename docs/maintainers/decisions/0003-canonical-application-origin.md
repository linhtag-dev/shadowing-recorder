# ADR 0003: Canonical Application Origin

Status: Superseded by [ADR 0005](0005-cloudflare-workers-static-assets.md)
Date: 2026-07-11
Updated: 2026-07-12

## Context

Microphone access requires a secure browser context outside localhost. The YouTube IFrame Player API also expects the application to identify its origin and send a Referer or equivalent client identity. The static web application therefore needs one canonical public origin even though it has no runtime application API.

## Decision

The canonical production origin is:

```text
https://htag.uk
```

The YouTube player receives `https://htag.uk` as its `origin` value. Any alternate hostname configured for the application must redirect to the canonical origin rather than serve the application as a second production origin.

Local development uses one `http://localhost:<web-port>` browser origin. Localhost uses the browser's secure-context exception for microphone development.

Restricted preview or staging environments may use separate HTTPS origins, but each origin must be explicitly configured and must supply its own matching YouTube `origin` value. Preview and staging origins are not aliases for the canonical production origin.

## Consequences

- Production DNS and TLS must make `https://htag.uk` available before public testing.
- Application links, YouTube player configuration, deployment-header checks, and privacy documentation use this origin.
- The deployment must preserve an appropriate Referer or equivalent client identity; it must not apply a `no-referrer` policy to YouTube requests.
- Alternate production hostnames must redirect before application behavior begins, preventing multiple production-origin identities.
