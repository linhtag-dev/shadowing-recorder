# Cloudflare Production Rollout

Status: Active

Last updated: 2026-07-12

This runbook is the operational source of truth for configuring, deploying,
verifying, and rolling back Shadowing Recorder on Cloudflare Workers Static
Assets. Architecture and canonical-origin decisions are owned by
[ADR 0005](../decisions/0005-cloudflare-workers-static-assets.md). Browser and
microphone acceptance is owned by the
[current real-device guide](../testing/locally-hosted.md).

The canonical production origin is:

```text
https://shadowing-recorder.htag.uk
```

The initial site is publicly reachable but remains pre-launch and carries
`noindex` crawler guidance. That guidance is not access control. Do not remove
the `_headers` no-index rule or `robots.txt` disallow rule during rollout.

## Release safety

Never place Cloudflare credentials, selected YouTube URLs or IDs, learner audio,
cookies, request identifiers, IP addresses, browser profiles, or transfer URLs
in the repository, shell history, screenshots, CI logs, issues, or release
evidence.

Do not add a Worker script, runtime binding, variable, secret, analytics,
telemetry, alternate hostname, preview URL, or Cloudflare Access layer as a
release workaround. Stop and obtain a new architecture/privacy decision if the
static-only contract cannot be deployed as written.

## One-time Cloudflare configuration

Before connecting the repository, confirm that:

- `htag.uk` is active in the target Cloudflare account;
- `shadowing-recorder.htag.uk` is unused; and
- the Cloudflare user performing setup can manage Workers Builds, the zone's
  custom domains, DNS, and TLS.

Create or connect a Workers project with these exact settings:

- Project name: `shadowing-recorder`
- Git repository: this repository
- Root directory: repository root
- Production branch: `main`
- Build cache: enabled
- Non-production branch builds: disabled
- Build variable: `SKIP_DEPENDENCY_INSTALL=1`
- Build command:
  `npx --yes npm@11.16.0 ci && npx --yes npm@11.16.0 run check`
- Deploy command: `./node_modules/.bin/wrangler deploy`
- Runtime variables and secrets: none
- Workers observability: disabled
- Cloudflare Web Analytics: disabled

Do not configure a non-production deploy command. The checked-in
`wrangler.jsonc` disables `workers.dev` and preview URLs and declares the custom
domain, SPA fallback, and static artifact directory. The Cloudflare project name
must match its `name` field.

In GitHub, require the `verify` job from `.github/workflows/ci.yml` before merge
to `main` and disallow unverified direct pushes. A push to `main` is a production
deployment trigger, so branch protection is part of the release boundary.

## Release eligibility

Use Node.js 24.18.0 and npm 11.16.0. From the exact candidate commit, run:

```sh
node --version
npm --version
npm ci
npm run check
npm run test:e2e
git status --short
```

Required results:

- the versions are `v24.18.0` and `11.16.0`;
- the clean install succeeds from `package-lock.json`;
- formatting, lint, types, all Vitest projects, the Vite build, and Wrangler dry
  run pass;
- Playwright passes in Chromium, Firefox, and WebKit;
- the Wrangler dry run finds only static assets and reports no bindings; and
- `git status --short` contains only the intentional candidate changes, or is
  empty for the committed release candidate.

Confirm the GitHub `verify` job passed for the exact commit. Do not release a
locally amended commit whose hosted check belongs to a different SHA.

## Deploy

Merge the verified candidate to `main` and monitor the corresponding Workers
Build. It must run the configured build command and then the checked-in Wrangler
deploy command. Record the non-secret Git commit, Workers Build, and deployed
version identifiers in the external release log.

An authorized maintainer may use `npm run deploy` for a deliberate manual
release of the exact verified commit. That command changes production state; it
is not a substitute for `npm run deploy:dry-run` and must not be used merely to
test configuration.

Do not retry a failed build after changing dashboard settings without recording
the change and rerunning release eligibility against the resulting contract.

## Verify DNS, TLS, routing, and headers

After Cloudflare reports a successful deployment:

1. Confirm public DNS resolves `shadowing-recorder.htag.uk` through the intended
   Cloudflare zone and the HTTPS certificate is valid for that hostname.
2. Request `/` and confirm a successful static HTML response.
3. Request a unique unknown path. It must return the SPA shell with status `200`;
   a browser must then render **That page is not part of this recording.**
4. Confirm `/robots.txt` contains `User-agent: *` and `Disallow: /`.
5. Confirm the root and deep-link responses include
   `X-Robots-Tag: noindex, nofollow`.
6. Inspect a fingerprinted `/assets/*` URL from the current HTML and confirm
   `Cache-Control: public, max-age=31536000, immutable`.
7. Confirm `/api/health` does not return a health payload and no replacement
   application endpoint is exposed.
8. Confirm production responses carry:
   - the checked-in Content Security Policy;
   - `Permissions-Policy: camera=(), geolocation=(), microphone=(self)`;
   - `Referrer-Policy: strict-origin-when-cross-origin`;
   - `Strict-Transport-Security: max-age=31536000`;
   - `X-Content-Type-Options: nosniff`; and
   - `X-Frame-Options: DENY`.

Record sanitized status/header evidence without cookies, request identifiers, IP
addresses, or selected-video details.

## Verify the browser and data boundary

Run the deployed production checks in the
[real-device guide](../testing/locally-hosted.md). At minimum, confirm:

- the iframe uses `youtube-nocookie.com` and its `origin` parameter is exactly
  `https://shadowing-recorder.htag.uk`;
- YouTube receives a usable origin-level Referer or equivalent client identity
  and does not report IFrame error `153`;
- microphone permission, recording, playback, and lifecycle shutdown work on
  the required browser/device matrix;
- first-party requests are limited to the SPA shell, static assets,
  `robots.txt`, and explicit navigations;
- no request targets `/api`, the YouTube Data API, analytics, telemetry,
  `static.cloudflareinsights.com`, or another collection endpoint; and
- no microphone Blob or recording is uploaded.

Recheck the Cloudflare dashboard after the smoke test: Web Analytics and Workers
observability remain disabled, no runtime variable or secret exists,
`workers.dev` and preview URLs are disabled, and non-production branch builds
remain off.

## Complete the release

Link sanitized DNS/TLS, routing, header, browser/device, request-boundary, and
dashboard evidence from the implementation plan. Only then mark the production
deployment checkpoint operationally complete.

The evidence record must identify the commit and Cloudflare deployed version,
the exact browser/OS/device versions used, the result of each required check,
and an owner plus resolution/retest or explicit support decision for every
anomaly.

## Roll back

For a regression after a successful release, use Cloudflare Version History to
restore the last verified version. Repeat the DNS/TLS, routing/header, browser,
and request-boundary smoke checks before declaring recovery.

If the initial release fails before any verified production version exists,
disable the custom-domain route and redeploy the last verified commit. Do not
leave a partially verified origin active, and do not enable `workers.dev` or a
preview URL as a substitute production endpoint.
