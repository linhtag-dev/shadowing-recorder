# ADR 0005: Cloudflare Workers Static Assets and Canonical Origin

Status: Accepted

Date: 2026-07-12

## Context

[ADR 0004](0004-static-web-deployment.md) selected a browser-only static
application with no YouTube Data API credential or runtime backend. The
repository still needed a concrete host, canonical hostname, SPA fallback,
response headers, automatic deployment path, and rollback boundary. The earlier
canonical-origin choice in [ADR 0003](0003-canonical-application-origin.md) used
a different hostname before the production host was selected.

Microphone access needs HTTPS outside localhost. The YouTube IFrame Player API
also needs the embedding page's exact origin plus a usable Referer or equivalent
client identity. The deployment must preserve those properties without adding a
runtime data path or logging surface for learner activity.

## Decision

Deploy the Vite output in `apps/web/dist` through Cloudflare Workers Static
Assets at the single canonical production origin:

```text
https://shadowing-recorder.htag.uk
```

`wrangler.jsonc` is the deployment source of truth. It declares the
`shadowing-recorder` project, the custom-domain route, static asset directory,
and `single-page-application` not-found handling. It disables `workers.dev`,
preview URLs, and Workers observability.

The deployment has no Worker script or `main` entry, bindings, variables,
secrets, runtime application endpoint, Cloudflare Vite plugin, analytics, or
telemetry. The browser derives the iframe `origin` value from
`window.location.origin`, so production players receive exactly
`https://shadowing-recorder.htag.uk` and local or explicitly approved test
origins identify themselves accurately.

Vite copies `_headers` and `robots.txt` from `apps/web/public` into the artifact.
The header rules set the required Content Security Policy, microphone-only
Permissions Policy, Referer policy, transport and framing protections,
`noindex, nofollow`, and immutable browser caching for fingerprinted assets.
`robots.txt` disallows all crawling. The crawler restrictions remain until a
separate public-launch change removes both controls.

Cloudflare Workers Builds deploys verified pushes to `main`. Non-production
branch builds and preview deployments remain disabled. Builds run from the
repository root with cache enabled, `SKIP_DEPENDENCY_INSTALL=1`, the repository's
pinned npm install/check command, and the checked-in Wrangler binary. No runtime
variables or secrets are configured.

This decision implements ADR 0004 and supersedes ADR 0003. ADR 0003 remains as
historical evidence of the earlier origin choice. Operational deployment and
rollback follow the
[Cloudflare rollout runbook](../release/cloudflare-rollout.md).

## Consequences

- Cloudflare provisions DNS and TLS for the custom-domain route in the existing
  `htag.uk` zone.
- Unknown navigation paths receive the SPA shell and the React router renders
  the application 404. No `/api/health` or replacement application endpoint
  exists.
- Static delivery necessarily exposes ordinary request metadata to Cloudflare,
  but the app emits no application logs and enables no Workers observability,
  Web Analytics, or learner-activity network path.
- The GitHub verification workflow must be required before merging to `main`;
  unverified direct pushes must be disallowed because a production-branch push
  deploys automatically.
- The first successful deployment requires recorded DNS/TLS, header, SPA,
  player-identity, microphone, recording, request-boundary, and dashboard
  evidence. A local dry run proves configuration validity, not deployment.
- Roll back later failures through Cloudflare Version History. If the initial
  release fails, disable the custom-domain route and redeploy the last verified
  commit.
- Any second production hostname, Worker code, runtime binding or secret,
  backend, analytics, telemetry, branch preview, or access-control layer needs a
  new architecture and privacy review.
