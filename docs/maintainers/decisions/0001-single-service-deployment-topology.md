# ADR 0001: Single-Service Deployment Topology

Status: Superseded by [ADR 0004](0004-static-web-deployment.md)
Date: 2026-07-11

This record preserves the original server-backed topology decision. The product
owner subsequently chose a static web deployment with no YouTube Data API or
runtime application backend.

## Context

The browser application needs a narrow server-side eligibility endpoint to protect the YouTube Data API credential and enforce quota safeguards. The public web application and API should share an origin, but they could be deployed either as one Node.js service or as a static site plus a separate function or worker.

The initial scaffold must not depend on an undecided hosting provider, but it does need a stable production topology and request-routing contract.

## Decision

Deploy one containerized Node.js service that:

- serves the built Vite application;
- runs the Hono API under same-origin `/api/*` routes; and
- exposes the canonical public HTTPS origin recorded in [ADR 0003](0003-canonical-application-origin.md).

The local Vite development server will proxy `/api/*` to the local Hono server so browser code uses the same relative URLs in development and production.

This decision selects the application topology, not the hosting provider. Provider selection and production operational infrastructure are deliberately deferred until after the locally containerized fixed-video proof of concept. They must be resolved before shared staging or public eligibility traffic.

## Consequences

- Web and API releases are deployed together from one container image.
- The browser needs no cross-origin API configuration for normal application requests.
- Server-only credentials and configuration remain outside the Vite build.
- The Node.js service owns static-asset fallback and API routing behavior.
- A CDN or platform proxy may sit in front of the service later without changing the public same-origin contract.
- Rate limiting and request coalescing cannot rely solely on process memory when the platform can run multiple replicas.
- Hosting-provider selection and provider-backed operational safeguards do not block scaffolding, local container execution, or the non-public proof of concept.
