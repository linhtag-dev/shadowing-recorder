# Controller boundary

Stage 1 keeps its explicit recorder states in the small XState machine here and injects microphone, MediaRecorder, object-URL, and clock capabilities through browser adapters. The controller owns only session-local Blob data; it has no API or shared-contract path.

The future video-load and automatic Practice Mode actors remain deferred. Stage 1 does not load the YouTube IFrame Player API or react to player state.
