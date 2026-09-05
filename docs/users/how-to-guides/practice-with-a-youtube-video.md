# Practice with a YouTube Video

In the default **Shadowing** style, Shadowing Recorder follows the embedded
YouTube player's native playback state and records your microphone locally
while the reference is playing. The additional **Listen first** style separates
reference playback, recording, and reflection. Use
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

Playing either source stops the other. `Space` / `Right Arrow` switches between the ready
reference and the latest matching recording when focus is outside an interactive
control.

Only the latest completed recording is retained. It remains associated with the
video used for that attempt. After loading a different video, quick comparison
is available only when the recording's source matches the ready player.

## Listen first, then try it yourself

1. Choose **Listen first · record · reflect** under **Practice style** and enable
   **Practice Mode**. Enabling this style does not open the microphone.
2. Press **Play reference** (or Space / Right Arrow) to listen. Press again when
   you have heard the passage you want to practice.
3. The app pauses the reference and asks for microphone permission if needed.
   Wait for **Recording your attempt**, then speak. Press **Stop & listen** when
   you finish.
4. The app finishes the new recording, turns the microphone off, and plays your
   attempt. Reflect at your own pace; playback ending does not advance the flow.
5. Press again to replay the same reference passage. It pauses near the end of
   the passage; press **Start recording** when ready for another attempt.

**New passage** stops playback and clears the replay range. Seek in the reference
if desired, then press **Play reference** to begin a new passage. Space and Right
Arrow work while the main action button has focus or while focus is outside
other interactive controls. The embedded player's own controls retain their
native keyboard behavior.

An empty attempt offers **Retry recording** and keeps the previous recording
without playing it automatically. If the browser blocks playback, press **Play
my attempt**. The same retry appears if playback has not started after five
seconds. Replaying a passage waits for the video to finish seeking; buffering
does not advance to recording. Changing practice styles finishes any current recording and turns
Practice Mode off; enable it again when ready.

## Finish or change videos

Loading another supported URL starts a new player replacement. Refreshing or
closing the page drops the application's recording references. Recordings are
not uploaded to an application service.

See [Recording, privacy, and browser behavior](../reference/recording-privacy-and-browser-behavior.md)
for storage, microphone, diagnostics, format, and known-browser details.
