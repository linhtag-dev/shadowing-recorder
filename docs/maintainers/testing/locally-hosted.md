# Current Real-Device Verification

Use this procedure to verify the current dynamic URL-loader build in a
same-machine Wrangler preview and on real browsers/devices against
`https://shadowing-recorder.htag.uk`. Cloudflare setup, deployment, HTTP smoke
checks, evidence completion, and rollback are owned by the
[Cloudflare rollout runbook](../release/cloudflare-rollout.md). The
[Stage 1 browser matrix](evidence/stage-1-browser-matrix.md) preserves the old
container/tunnel evidence and must not be treated as the current procedure.

The site may be publicly reachable during validation but is not
public-launch-ready. `noindex` is crawler guidance, not authentication. Do not
place a selected video URL or ID, learner audio, Cloudflare credential, transfer
URL, browser profile, or microphone recording in the repository, command line,
screenshots, CI logs, issues, or shared test evidence.

## Prepare and verify the artifact

Use the repository-pinned Node.js 24.18.0 and npm 11.16.0:

```sh
npm ci
npm run check
npm run test:e2e
```

`npm run check` must finish with a Wrangler dry run. Playwright must pass in
Chromium, Firefox, and WebKit. These checks prove the artifact and local
deployment contract; they do not prove DNS, TLS, live YouTube, Referer,
microphone, physical-device, or Cloudflare dashboard behavior.

Keep only the externally prechecked video's verification date and non-sensitive
result summary in the operator run log. Hold its full HTTPS URL outside the
repository and paste it only into the in-page loader during the scheduled test.

## Same-machine Wrangler preview

Start the built static site:

```sh
npm run preview
```

Open <http://127.0.0.1:3000>. Localhost receives the browser secure-context
exception for microphone testing. Confirm:

1. `/` renders the recorder and an unknown path returns the SPA shell before the
   application renders its 404 page.
2. `/robots.txt` contains `User-agent: *` and `Disallow: /`.
3. The root response includes the configured CSP, Permissions Policy, Referer
   Policy, HSTS, framing/content-type protections, and
   `X-Robots-Tag: noindex, nofollow`.
4. A fingerprinted `/assets/*` response has
   `Cache-Control: public, max-age=31536000, immutable`.
5. There is no `/api/health` or other application endpoint.
6. A loaded iframe uses `youtube-nocookie.com` and has an `origin` query value
   of exactly `http://127.0.0.1:3000`.

This preview is for the same machine only. Do not expose it through a tunnel,
Cloudflare Access, a LAN binding, or a temporary public endpoint. Physical
devices use the canonical HTTPS deployment.

Stop the preview with `Ctrl-C` when the same-machine run finishes.

## Exercise the production build

Do not start until the rollout runbook's DNS, TLS, routing, and header checks
pass for the exact deployed version under test.

For every required browser and physical-device row from
[ADR 0002](../decisions/0002-current-mainstream-browser-support.md):

1. Open the canonical root route. Confirm the app starts with **No video**, no
   iframe, no autoplay, and Practice Mode unavailable.
2. Paste the externally held HTTPS YouTube URL and select **Load video**. Confirm
   **Video ready**, unchanged application URL/history, a visible
   `youtube-nocookie.com` iframe, and usable native controls.
3. Inspect the iframe request. Its `origin` query value must be exactly
   `https://shadowing-recorder.htag.uk`, and the request must carry a usable
   origin-level Referer or equivalent API Client identity. IFrame error `153` is
   a deployment failure, not a video-selection failure.
4. Put on headphones, enable Practice Mode, grant permission, and confirm the
   live microphone indicator plus reported processing, sample-rate, and channel
   settings. Use the operating-system privacy indicator as independent evidence.
5. Play through native YouTube controls and confirm visible recording. Pause or
   end playback and confirm asynchronous finalisation, a non-zero byte count, a
   reported MIME type, and playable learner audio. If natural buffering occurs,
   confirm capture pauses and resumes without ending that attempt.
6. Exercise **Reference**, **My recording**, restart, the floating comparison
   dock, and `Space` / `Right Arrow`. Confirm app-initiated reference and learner playback do not
   remain audible together. Complete another attempt and confirm it replaces
   the previous latest recording.
7. Submit an invalid URL, a repeated valid URL, and a second valid URL. Confirm
   each submission replaces the player generation, disables Practice Mode,
   leaves the app URL unchanged, ignores stale player callbacks, and never
   enables an old-source recording for a different ready video.
8. Reset microphone permission, enable Practice Mode again, deny access, and
   confirm a retryable error with no live microphone track.
9. While recording, background the page and return. Confirm the player pauses,
   Practice Mode stops, the in-progress attempt is not exposed as completed, and
   every microphone track and system privacy indicator turns off. Repeat for
   refresh or page exit.

Record exact browser, OS, and device versions plus non-sensitive results in the
external run log. Every anomaly needs an owner and either a resolution/retest or
an explicit support decision.

## Inspect the network and Cloudflare boundary

During a clean production session, preserve a sanitized request-host/path list
without query strings. Confirm:

- first-party requests target only the SPA shell, fingerprinted static assets,
  `robots.txt`, or an explicit browser navigation;
- no request targets `/api`, the YouTube Data API, analytics, telemetry,
  `static.cloudflareinsights.com`, or another collection endpoint;
- selected-video and player traffic goes directly to the disclosed YouTube
  domains, not through a first-party service; and
- no microphone Blob or recording is uploaded.

Return the sanitized browser/device and network results to the
[Cloudflare rollout runbook](../release/cloudflare-rollout.md) for dashboard
verification, evidence completion, and any rollback decision.
