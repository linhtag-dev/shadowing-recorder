# Test a locally hosted instance through a tunnel

Use a tunnel only during a scheduled real-browser or physical-device test
window. Keep the application bound to `127.0.0.1:3000`, require authentication
at the tunnel boundary, and stop the connector and container immediately after
the test.

Never commit or paste tunnel tokens, Cloudflare Access browser-transfer URLs,
Access tokens, application audience tags, account identifiers, tester
identities, learner audio, or the externally selected full test video URL into
the repository, an issue, a chat, a screenshot, or a run log.

The tunnel is temporary test infrastructure. It does not settle the production
hosting, authentication, privacy, secret-management, or monitoring decisions.
This guide exercises the current dynamic URL-loader build; the
[Stage 1 browser matrix](../stage-1-browser-matrix.md) is historical evidence.

## Prepare the preview container

Keep only the prechecked video ID and its verification date in the external
operator run log. Hold the full URL separately for the scheduled test. The
built bundle contains no selected video configuration:

```sh
npm run container:build
npm run container:run
```

`container:run` remains attached to the terminal and publishes only
`127.0.0.1:3000`. From another terminal, confirm the local origin before
opening a tunnel. After authentication, paste the externally held URL into the
in-page loader; do not put it in a shell variable, repository file, or run log:

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

The expected response is `{"status":"ok"}`.

## Cloudflare Tunnel with Access

Cloudflare is the preferred on-demand tunnel for this test workflow. Install
the connector with Homebrew, but do not install it as a system service:

```sh
brew install cloudflared
cloudflared --version
```

See Cloudflare's [installation guide](https://developers.cloudflare.com/tunnel/downloads/)
and [tunnel run parameters](https://developers.cloudflare.com/tunnel/advanced/run-parameters/).

### One-time Cloudflare configuration

Create a remotely managed tunnel in the Cloudflare dashboard and add a
published application route with these properties:

- Hostname: a dedicated restricted-test hostname.
- Service: `http://127.0.0.1:3000`.
- Final ingress fallback: `http_status:404`.
- Private-network or WARP routing: disabled.

Protect the entire hostname with a **Self-hosted and private** Cloudflare Access
application. Do not limit protection to a path; `/`, `/api/health`, and every
other application route must require authentication.

For a maintainer-only test endpoint, use this Access configuration:

- Cloudflare identity provider with **Restrict to account members** enabled.
- **Allow** policy that includes the maintainer's exact email address and
  requires **Cloudflare Account Member** for the current account.
- **Apply instant authentication** enabled when Cloudflare is the only identity
  provider.
- Application and policy session duration of two hours.
- **Protect with Access** enabled on the tunnel's published application route,
  so `cloudflared` validates the Access JWT before proxying to the origin.
- MFA enabled on the maintainer's Cloudflare account.

Do not enable an **Everyone** or **Bypass** policy, expose `/api/health`
separately, or use Browser Isolation, Managed OAuth, the Cloudflare One Client,
or a service token for interactive browser and physical-device testing.
Browser Isolation would execute the application remotely instead of exercising
the tested device's browser and microphone.

For approved external testers, add a separate policy restricted to their exact
email addresses. If one-time PIN is used, require that login method in addition
to the exact email allowlist; selecting one-time PIN alone permits any user with
a valid email address.

See Cloudflare's guides for
[self-hosted Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/),
[Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/),
and [session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

### Remove a previously installed root service

The test tunnel must run only on demand as the current user. If `cloudflared`
was previously installed as a root LaunchDaemon, remove it before continuing:

```sh
sudo /opt/homebrew/bin/cloudflared service uninstall
```

Verify that neither the loaded service nor its token-bearing plist remains:

```sh
if launchctl print system/com.cloudflare.cloudflared >/dev/null 2>&1; then
  echo 'ERROR: root cloudflared service is still loaded'
else
  echo 'root cloudflared service is not loaded'
fi

test ! -e /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
```

Rotate the remotely managed tunnel token after removing a service that stored
it in a plist, or whenever a token may have appeared in a command, process
listing, terminal capture, chat, screenshot, or log. Store the replacement only
in a password manager. A tunnel token is a connector credential and is distinct
from a Cloudflare Access browser session or CLI transfer token.

### Start the named tunnel on demand

Retrieve the connector token from the tunnel's **Add replica** or installation
view. Copy only the token; do not run the displayed service-install command.

In a separate terminal, read the token without echoing it and pass it through
the environment rather than a command-line argument:

```sh
read -rs 'TUNNEL_TOKEN?Paste the tunnel token: '
echo
export TUNNEL_TOKEN

cloudflared tunnel run

unset TUNNEL_TOKEN
```

Do not use `sudo`. Keep this process attached to the terminal and press
`Ctrl-C` to stop it. If `cloudflared tunnel run` says that it requires a tunnel
ID or name, `TUNNEL_TOKEN` is missing or was not exported.

Using `TUNNEL_TOKEN` avoids putting the credential in shell history or the
process argument list. Do not add the tunnel ID or token to this document.

### Verify the Access boundary

Record the non-secret HTTPS origin only in the external run log, then set it in
the current shell:

```sh
export TEST_TUNNEL_ORIGIN='https://<configured-test-hostname>'
```

Before authenticating, inspect both routes from a private browser session or a
terminal that has no Access session:

```sh
curl --silent --show-error --dump-header - --output /dev/null \
  "$TEST_TUNNEL_ORIGIN/"

curl --silent --show-error --dump-header - --output /dev/null \
  "$TEST_TUNNEL_ORIGIN/api/health"
```

Both requests must be denied or redirected to the account's
`cloudflareaccess.com` login hostname. A `200` response before authentication
is a failed security boundary; stop the tunnel and fix the Access application
or policy before sharing the hostname.

Verify authenticated CLI access separately:

```sh
cloudflared access curl "$TEST_TUNNEL_ORIGIN/api/health"
```

On first use, `cloudflared` opens a browser for Access authentication. The
command must ultimately return `{"status":"ok"}`. The printed fallback browser
URL contains a temporary transfer token: never paste, capture, or share it. If
one is exposed, log out of Access before repeating the authentication flow. Do
not rotate the tunnel connector token solely because an Access transfer URL was
exposed; they are different credentials.

Authenticate separately on each physical test device. Confirm that the YouTube
iframe's `origin` query value exactly matches `TEST_TUNNEL_ORIGIN`, then follow
the current-build checklist below. Reset microphone permission between its
grant and denial cases.

### Exercise the current build

For every required browser and physical-device row from
[ADR 0002](../decisions/0002-current-mainstream-browser-support.md):

1. Open the authenticated root route. Confirm the app starts with **No video**,
   no iframe, no autoplay, and Practice Mode unavailable.
2. Paste the externally held HTTPS YouTube URL and select **Load video**. Confirm
   **Video ready**, an unchanged application URL/history, a visible
   `youtube-nocookie.com` iframe, native controls, and an iframe `origin` equal
   to `TEST_TUNNEL_ORIGIN`.
3. Put on headphones, enable Practice Mode, grant permission, and confirm the
   live microphone indicator plus reported processing, sample-rate, and channel
   settings. Use the operating-system privacy indicator as independent evidence.
4. Play through native YouTube controls and confirm visible recording. Pause or
   end playback and confirm asynchronous finalisation, a non-zero byte count, a
   reported MIME type, and a playable latest recording. If natural buffering
   occurs, confirm capture pauses and resumes without ending that attempt.
5. Exercise **Reference**, **My recording**, restart, the floating comparison
   dock, and `Alt+C`. Confirm app-initiated reference and learner playback do not
   remain audible together. Complete another attempt and confirm it replaces
   the previous latest recording.
6. Submit an invalid URL, a repeated valid URL, and a second valid URL. Confirm
   each submission replaces the player generation, disables Practice Mode, does
   not mutate the app URL, ignores stale player callbacks, and never enables the
   old recording in quick controls for a different source ID.
7. Reset microphone permission, enable Practice Mode again, deny access, and
   confirm a retryable error with no live microphone track.
8. While recording, background the page and return. Confirm the player pauses,
   Practice Mode stops, the in-progress attempt is not exposed as a completed
   recording, and every microphone track and system privacy indicator turns off.
   Repeat for refresh or page exit.
9. Record exact browser, OS, and device versions, results, non-sensitive
   diagnostics, and evidence locations in the external run log. Give every
   anomaly an owner, resolution and retest, or an explicit support-decision
   update.

### Shut down and clean up

At the end of the scheduled window:

1. Visit `<configured-test-hostname>/cdn-cgi/access/logout` on each authenticated
   browser or device.
2. Press `Ctrl-C` in the `cloudflared tunnel run` terminal.
3. Press `Ctrl-C` in the container terminal. The `--rm` container exits and is
   removed.
4. Clear the ephemeral shell state:

   ```sh
   unset TUNNEL_TOKEN TEST_TUNNEL_ORIGIN
   ```

5. Confirm that no connector remains and that the root service was not
   recreated:

   ```sh
   pgrep -x cloudflared >/dev/null \
     && echo 'ERROR: cloudflared is still running' \
     || echo 'cloudflared is stopped'

   test ! -e /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   ```

6. Confirm through the Cloudflare dashboard that the connector is disconnected.
   Keep the Access application enabled so an accidental future connector start
   does not expose the origin publicly.

## ngrok fallback

Do not use a bare `ngrok http` command or a committed reserved hostname; that
would bypass the authentication requirement. If Cloudflare Tunnel is
unavailable, stop and review ngrok's current authentication and ephemeral
endpoint documentation before exposing the preview. The
[Stage 1 ngrok procedure](../stage-1-browser-matrix.md#temporary-authenticated-mobile-endpoint-fallback)
is preserved only as historical evidence and must not be treated as current
configuration guidance.
