# Practice with a YouTube Video

Shadowing Recorder follows the embedded YouTube player's native playback state
and records your microphone locally while the reference is playing. Use
headphones so the microphone does not capture the reference audio.

## Load a reference

1. Open <https://shadowing-recorder.htag.uk>.
2. Paste a full HTTPS YouTube watch, `youtu.be`, Shorts, or embed URL.
3. Select **Load video**.
4. Wait for the status to report **Video ready**.

Each submission replaces the current player request, including an invalid or
repeated URL. Practice Mode remains unavailable until the requested video is
ready and its identity has been verified.

## Record an attempt

1. Enable **Practice Mode**.
2. Grant microphone permission when the browser asks.
3. Start the reference with the embedded player's native controls.
4. Speak along with the reference while it plays.
5. Pause or end the reference to finalise the attempt.

The player states control recording: `PLAYING` starts or resumes capture,
`BUFFERING` pauses it, and `PAUSED` or `ENDED` finalises it. After finalisation,
the app releases the attempt's microphone stream and leaves Practice Mode ready
for another attempt with the microphone off.

If an attempt contains no playable data, the app saves nothing and preserves
the last playable recording. You can retry without leaving Practice Mode.

## Compare the latest attempt

Use **Reference**, **My recording**, and restart in the comparison tray. The tray
becomes a compact floating dock after it scrolls out of view. The full native
audio control remains available in the **Latest recording** panel.

Playing either source stops the other. `Alt+C` switches between the ready
reference and the latest matching recording when focus is outside an editable
control.

Only the latest completed recording is retained. It remains associated with the
video used for that attempt. After loading a different video, quick comparison
is available only when the recording's source matches the ready player.

## Finish or change videos

Loading another supported URL starts a new player replacement. Refreshing or
closing the page drops the application's recording references. Recordings are
not uploaded to an application service.

See [Recording, privacy, and browser behavior](../reference/recording-privacy-and-browser-behavior.md)
for storage, microphone, diagnostics, format, and known-browser details.
