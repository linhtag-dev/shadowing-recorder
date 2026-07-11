# Stage 1 Browser and Device Evidence

Status: In progress
Last updated: 2026-07-11

Stage 1 remains in progress until every required real browser and physical mobile-device row passes, or an incompatibility has a documented resolution and a deliberate support decision. Passing Playwright with synthetic media does not close this gate.

The developer-prechecked video ID is recorded in the operator's external run log with its verification date. Do not add that ID, ngrok credentials, learner audio, or screenshots containing credentials to this repository.

## Automated evidence

| Surface | Command | Result | Scope and finding |
| --- | --- | --- | --- |
| Pinned repository toolchain | `docker run --rm <build-stage-image> npm run check` | Pass on Node 24.18/npm 11.16 on 2026-07-11 | Formatting, lint, strict types, all 34 tests, and all production builds pass under the exact pinned toolchain. The temporary verification image was removed afterward. |
| Vitest controller and components | `npm test` | Pass, 34 tests on 2026-07-11 | Deterministic coverage for configuration, iframe construction, every controller state, MIME selection and browser fallback, permission denial, unsupported APIs, pause/resume, asynchronous final data/stop ordering, empty output, recorder failure, track loss, five-second watchdog, late permission cleanup, all-track shutdown, accessible controls/status, playback rendering, and object-URL revocation. |
| Playwright Chromium | `npm run test:e2e` | Pass on 2026-07-11 | Built single-service application with synthetic `stage1_test`, intercepted iframe navigation, and injected media fakes. Confirms one-second timeslice, explicit controls, result playback URL, event diagnostics, track stop, API health, and `http://127.0.0.1:3000` iframe origin. No live media validation. |
| Playwright Firefox | `npm run test:e2e` | Pass on 2026-07-11 | Same synthetic scope as Chromium. No live media validation. |
| Playwright WebKit | `npm run test:e2e` | Pass on 2026-07-11 | Same synthetic scope as Chromium. No live media validation. |
| Production container plumbing | `VITE_SHADOWING_VIDEO_ID=stage1_test npm run container:build`, health curl, then `npx playwright test` against the running image | Pass on 2026-07-11 | The pinned Node 24 image received the named build argument, served health, and passed the synthetic flow in all three Playwright engines with the exact loopback iframe origin. |
| Production container real media | See container procedure below | Pending | Must be built with an external real prechecked ID and exercised with a real microphone before this row can pass. |

## Required real-browser matrix

Record exact browser, OS, and device versions, the external fixture-log reference, test date, operator, result, and evidence location for every row.

| Platform | Browser | Device | Exact versions | Grant | Deny | Concurrent video + mic | Pause/resume/stop order | MIME / bytes | Playback | Backgrounding | Mic shutdown | Result / resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop | Chrome stable | Test computer | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Desktop | Edge stable | Test computer | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Desktop | Firefox stable | Test computer | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Desktop | Safari stable | Test Mac | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mobile | Safari stable | Physical iPhone | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Tablet | Safari stable | Physical iPad | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Mobile | Chrome stable | Physical Android phone | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

If one physical Apple device cannot cover both the required iOS and iPadOS rows, both devices remain required. Automated WebKit does not substitute for either physical row.

## Local and container procedure

1. Confirm the prechecked video's current eligibility manually and record its ID and verification date outside the repository.
2. Export that ID only in the current shell:

   ```sh
   export VITE_SHADOWING_VIDEO_ID='<external-prechecked-id>'
   ```

3. Run the local production service and automated checks:

   ```sh
   npm run check
   npm run test:e2e
   VITE_SHADOWING_VIDEO_ID="$VITE_SHADOWING_VIDEO_ID" npm run preview
   ```

4. At `http://127.0.0.1:3000`, confirm `/api/health`, native visible video controls, no autoplay, the headphones instruction, and an iframe `origin` query value of exactly `http://127.0.0.1:3000`.
5. Build and start the actual production container:

   ```sh
   VITE_SHADOWING_VIDEO_ID="$VITE_SHADOWING_VIDEO_ID" npm run container:build
   npm run container:run
   curl --fail --silent --show-error http://127.0.0.1:3000/api/health
   ```

6. Repeat the full real-media checklist below against the container. Stop it with `Ctrl-C` when the run finishes.

## Per-browser real-media checklist

For each matrix row:

1. Start with microphone permission unset. Confirm that `Start recording` is the only enabled recording action and that the video does not autoplay.
2. Play the visible video through its native controls while wearing headphones. Start recording, grant permission, and confirm the live microphone indication.
3. Pause, resume, and stop explicitly. Record the diagnostics in order, including every recorder event, selected MIME type, non-zero byte count, and whether the latest result plays through the native audio control.
4. Start a second recording while the completed result is playing. Confirm learner playback stops immediately and only the newly completed result remains afterward.
5. Reset browser permission, start again, deny access, and confirm a visible retryable error with no live microphone track.
6. While recording, background the tab or app and then return. Confirm the in-progress result was discarded, the error is visible, every microphone indicator is off, and retry is available.
7. Repeat with refresh or page exit. Use the browser and operating-system privacy indicator or device settings to confirm microphone shutdown; do not rely only on the app label.
8. Record anomalies, console output, screenshots of non-sensitive UI, and a clear pass/fail result. An incompatibility needs an owner, resolution, retest evidence, or explicit support-decision update.

## Temporary authenticated mobile endpoint

Only expose the local container for a scheduled mobile test window. ngrok's current Agent Endpoint flow accepts a separate Traffic Policy file through `--traffic-policy-file`; its `basic-auth` action rejects missing or invalid credentials with `401` when enforcement is enabled. See the official [Agent Endpoint Traffic Policy quickstart](https://ngrok.com/docs/traffic-policy/getting-started/agent-endpoints) and [`basic-auth` action reference](https://ngrok.com/docs/traffic-policy/actions/basic-auth).

1. Generate a unique strong temporary password and store the username/password in a password manager or ephemeral shell variables outside the repository. The current action requires passwords of at least eight characters; use a substantially longer random value.
2. With a restrictive umask, create a temporary policy such as `/tmp/shadowing-recorder-ngrok-policy.yml`. Insert the temporary credential directly into that ignored, short-lived file:

   ```yaml
   on_http_request:
     - actions:
         - type: basic-auth
           config:
             realm: shadowing-recorder-stage-1
             credentials:
               - "<temporary-user>:<temporary-strong-password>"
             enforce: true
   ```

3. With the container already listening only on `127.0.0.1:3000`, start the ephemeral endpoint:

   ```sh
   ngrok http 3000 --traffic-policy-file /tmp/shadowing-recorder-ngrok-policy.yml
   ```

4. Copy the assigned HTTPS origin into an ephemeral `NGROK_URL` shell variable. Before giving it to a device, verify the boundary from another terminal:

   ```sh
   test "$(curl --output /dev/null --silent --write-out '%{http_code}' "$NGROK_URL/")" = 401
   curl --fail --user "$STAGE1_NGROK_USER:$STAGE1_NGROK_PASSWORD" "$NGROK_URL/api/health"
   ```

5. Authenticate from the physical device, run the complete mobile checklist, and confirm the iframe `origin` query value equals the assigned ngrok HTTPS origin exactly.
6. Stop ngrok immediately after testing, stop the local container, securely delete the temporary policy file, unset the temporary credential variables, and delete any credential or policy retained in the ngrok account or password manager. Recheck that the endpoint no longer responds.

This tunnel is temporary test infrastructure. It is not a production hosting, authentication, or privacy decision.

## Current finding

The implementation and synthetic automated coverage are passing locally. Real codec, permission, playback, lifecycle, current-stable desktop browser, physical iOS/iPadOS, physical Android, authenticated tunnel, and real production-container evidence are still pending. Stage 1 is therefore **not complete**.
