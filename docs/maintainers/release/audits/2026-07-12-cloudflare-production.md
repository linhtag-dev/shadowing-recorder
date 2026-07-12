# Cloudflare Initial Production Setup Audit — 2026-07-12

Status: Production deployment successful; operational completion pending manual
real-device evidence and resolution of the NEL telemetry anomaly  
Audit date: 2026-07-12  
Timezone: Asia/Singapore (UTC+08:00)

## Purpose and evidence handling

This record documents the browser-assisted Cloudflare Workers Builds setup,
initial production deployment, and immediate smoke checks for Shadowing
Recorder. It supplements the
[production rollout runbook](../cloudflare-rollout.md) and the
[implementation plan](../../plans/shadowing-recorder-mvp-implementation.md).

The record is intentionally sanitized. It contains no Cloudflare account ID,
API-token value, cookies, request identifiers, IP addresses, selected YouTube
URL or video ID, learner audio, microphone data, or browser profile details.
Cloudflare and GitHub retain their authoritative audit logs.

## Release identity

| Item | Recorded value |
| --- | --- |
| Canonical origin | `https://shadowing-recorder.htag.uk` |
| Git repository | `linhtag-dev/shadowing-recorder` |
| Git commit | `12240d0dd7c194bd931f24f8dc273330117771ef` |
| GitHub Actions run | `29180690383` (`verify` passed) |
| Cloudflare project | `shadowing-recorder` |
| Workers Build | `1255e7f2-387d-4f6a-9e4d-88656be1d5bc` |
| Deployed version | `15654a15-1e2f-4178-b8e2-8effa861ceb8` |

## Setup history

1. Confirmed that the `htag.uk` zone was active in the intended Cloudflare
   account and that the signed-in maintainer had administrative access to the
   zone and Workers dashboard.
2. Opened **Workers & Pages** and selected **Ship something new**.
3. Continued with the existing GitHub connection and selected
   `linhtag-dev/shadowing-recorder`.
4. Configured the Workers Builds project:
   - project name: `shadowing-recorder`;
   - root directory: `/`;
   - production branch: `main`;
   - build cache: enabled;
   - non-production branch builds: disabled;
   - build command:
     `npx --yes npm@11.16.0 ci && npx --yes npm@11.16.0 run check`;
   - deploy command: `./node_modules/.bin/wrangler deploy`; and
   - non-secret build variable: `SKIP_DEPENDENCY_INSTALL=1`.
5. Left runtime variables and secrets empty. The repository's
   `wrangler.jsonc` supplied the Static Assets directory, SPA fallback, custom
   domain, disabled observability, disabled `workers.dev`, and disabled preview
   URLs.
6. Reviewed Cloudflare's automatic Workers Builds API-token creation. The
   dashboard described account-level read access for account settings and edit
   access covering Workers Scripts and several Workers platform resources,
   zone-level Workers Routes edit access, and user/membership read access. The
   operator explicitly approved creation. Cloudflare created the named build
   token; its value was never displayed, copied, or stored in this repository.
7. Submitted **Deploy**, creating the project and starting the initial build on
   `main` at approximately 13:30 SGT.

## Build and deployment result

Cloudflare Workers Builds detected Node.js 24.18.0 and npm 11.16.0. Automatic
dependency installation was skipped because the configured build variable was
present, after which the pinned clean install and repository check ran.

The build evidence showed:

- `npm ci` completed and reported zero known vulnerabilities;
- formatting, ESLint, strict TypeScript, and all Vitest projects passed;
- 80 Vitest tests passed;
- the Vite production build completed;
- the Wrangler dry run read only the static artifact and reported no bindings;
- the checked-in deploy command uploaded the static assets;
- the custom domain trigger was deployed; and
- the Workers Build completed successfully at approximately 13:31 SGT.

The corresponding GitHub Actions run for the exact commit was successful. Its
`verify` job recorded 80 passing Vitest tests and 15 passing Playwright checks.

## Immediate production smoke evidence

The following checks passed on 2026-07-12:

| Boundary | Result |
| --- | --- |
| DNS and TLS | The canonical hostname resolved publicly and loaded over valid HTTPS. |
| Root route | `/` returned static HTML with status `200` and rendered Shadowing Recorder. |
| SPA fallback | A unique unknown path returned the SPA shell with status `200` and rendered **That page is not part of this recording.** |
| Crawler control | `/robots.txt` returned `User-agent: *` and `Disallow: /`. |
| No-index header | Root, deep-link, asset, and crawler responses included `X-Robots-Tag: noindex, nofollow`. |
| Security headers | CSP, microphone-only Permissions Policy, Referrer Policy, HSTS, `nosniff`, and `DENY` frame protection were present. |
| Asset caching | A current fingerprinted JavaScript asset returned `Cache-Control: public, max-age=31536000, immutable`. |
| No health API | `/api/health` returned the SPA shell, not a health payload or application endpoint. |
| Runtime topology | The dashboard showed one custom domain, zero Worker scripts, zero bindings, and no runtime variable or secret. |
| Diagnostics | Workers Logs and Workers Traces were disabled. |
| Alternate endpoints | `workers.dev` and preview URLs were disabled. |
| Builds | Production branch was `main`, non-production builds were disabled, and build cache was enabled. |
| Web Analytics | No Web Analytics site or injected RUM beacon existed for `shadowing-recorder.htag.uk`. The separately owned `htag.uk` hostname entry was not changed. |

## Independent production re-verification

A read-only Cloudflare API and public HTTPS recheck later on 2026-07-12
independently confirmed:

| Boundary | Re-verification result |
| --- | --- |
| Active deployment | Version `15654a15-1e2f-4178-b8e2-8effa861ceb8` remained active at 100 percent traffic on the production custom domain. |
| Workers Build | Build `1255e7f2-387d-4f6a-9e4d-88656be1d5bc` had outcome `success`; its retained logs showed Node.js 24.18.0, npm 11.16.0, skipped automatic dependency installation, 80 passing Vitest tests, a Wrangler dry run, no bindings, and successful deployment. |
| Build configuration | The GitHub repository remained connected to production branch `main` with repository-root execution, build cache enabled, one production trigger, the checked-in build and deploy commands, and only the non-secret `SKIP_DEPENDENCY_INSTALL=1` build variable. No non-production trigger existed. |
| GitHub verification | Actions run `29180690383` remained successful and identified commit `12240d0dd7c194bd931f24f8dc273330117771ef`; its `verify` job was complete and successful. |
| Runtime configuration | The deployed project retained compatibility date `2026-07-12`, zero bindings, zero secrets, no tail consumer, disabled logpush, disabled `workers.dev`, and disabled preview URLs. |
| Domain | The single checked custom domain still mapped `shadowing-recorder.htag.uk` to the production `shadowing-recorder` service. |
| TLS and headers | A certificate-validating HTTPS request succeeded with status `200`; the CSP, Permissions Policy, Referrer Policy, HSTS, `nosniff`, frame denial, and no-index header exactly matched the checked-in contract. |
| SPA and API boundary | The root, a unique unknown path, and `/api/health` returned byte-identical HTML shells with status `200`. `/api/health` therefore exposed no health payload or application endpoint. |
| Crawler control | `/robots.txt` remained exactly `User-agent: *` followed by `Disallow: /`. |
| Static assets | The current fingerprinted JavaScript and CSS returned status `200`, the expected content types, and `Cache-Control: public, max-age=31536000, immutable`. |
| Artifact identity | The deployed HTML, JavaScript, and CSS were byte-for-byte identical to the local production artifact for the release source; the working-tree differences were documentation evidence only. |
| Repository gates | The evidence working tree passed `npm run check` with 80 Vitest tests and an assets-only Wrangler dry run reporting no bindings, then passed all 15 Playwright checks in Chromium, Firefox, and WebKit. The fresh build remained byte-identical to production. |
| Injected application telemetry | No Cloudflare Web Analytics beacon, analytics or telemetry marker, application API reference, or Google API credential pattern appeared in the deployed HTML or JavaScript. |

Cloudflare's build API labels the initial project-creation build source as
`manual` and leaves its commit-hash field empty. The source identity chain is
therefore supported by the exact-SHA GitHub verification above, the recorded
repository selection during setup, and byte identity between the deployed and
local production artifacts rather than by that empty Cloudflare field alone.

No controllable browser session was available to the independent verifier.
These API, HTTPS, and artifact checks do not replace the required live YouTube,
microphone, lifecycle, request-boundary, or physical-device observations.

## Accepted release limitation

GitHub had no enforceable branch protection for `main`. Both repository
rulesets and classic branch protection warned that enforcement for this private
repository requires a GitHub Team or Enterprise organization plan.

On 2026-07-12 the operator explicitly accepted this limitation for the
non-public validation deployment. Until the plan changes, the maintainer owns
the procedural control: deploy only the exact `main` commit whose hosted
`verify` job passed and do not make unverified direct pushes. Enforced branch
protection must be revisited before public launch. This acceptance does not
satisfy the runbook's branch-protection release boundary.

## Platform observations

- Production responses still carried platform-managed `Report-To` and `NEL`
  headers during the independent recheck. Their values and full reporting URL
  were not retained because they contained per-response data. Cloudflare's
  [Network Error Logging documentation](https://developers.cloudflare.com/network-error-logging/)
  describes NEL as browser-based reporting to an external endpoint and provides
  a zone setting to disable it. This is an open anomaly against ADR 0005's
  no-telemetry contract. The maintainer owns resolution: disable NEL for the
  zone and reverify header and browser-request absence, or obtain an explicit
  architecture and privacy decision accepting the provider data flow. No NEL
  setting was changed during this read-only audit.
- Wrangler printed its standard anonymous-telemetry notice during the build and
  deploy commands. No application runtime analytics, telemetry script, Worker
  observability, or Web Analytics beacon was configured.
- Cloudflare reported that build-output caching is unsupported for this project;
  the dependency cache remained enabled and uploaded successfully.

## Evidence still required

Do not mark the production checkpoint operationally complete until the current
deployed build passes and records the real-device checks in the
[locally hosted and real-device guide](../../testing/locally-hosted.md),
including:

- resolution of the Cloudflare NEL anomaly plus a response-header and browser
  network recheck;
- exact `youtube-nocookie.com` iframe origin and usable Referer behavior;
- absence of YouTube IFrame error `153`;
- microphone permission, recording, playback, and lifecycle shutdown across
  the required browser/device matrix;
- first-party and third-party request-boundary inspection;
- confirmation that no learner recording Blob is uploaded; and
- a final Cloudflare dashboard recheck after the real-device smoke session.

The evidence owner must record browser, OS, and device versions plus an owner
and resolution, retest, or explicit support decision for every anomaly.
