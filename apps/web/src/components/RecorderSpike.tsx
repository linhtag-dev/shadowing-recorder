import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import type { RecorderDependencies } from '../controller/browserCapabilities.js'
import { createBrowserRecorderDependencies } from '../controller/browserCapabilities.js'
import { RecorderController } from '../controller/RecorderController.js'
import type { RecorderState } from '../controller/recorderMachine.js'
import type {
  YouTubePlaybackState,
  YouTubePlayerApi,
  YouTubePlayerError,
  YouTubePlayerInstance,
} from '../player/youTubePlayer.js'
import type { VideoConfiguration } from '../videoConfiguration.js'
import { FixedVideoPlayer } from './FixedVideoPlayer.js'
import styles from './RecorderSpike.module.css'

export interface RecorderSpikeProps {
  dependencies?: RecorderDependencies | undefined
  origin?: string | undefined
  playerApi?: YouTubePlayerApi | undefined
  videoConfiguration: VideoConfiguration
}

const statusMessages: Record<RecorderState, string> = {
  armed: 'Ready. Play the video to start recording.',
  buffering: 'Video buffering; microphone recording paused.',
  disabled: 'Practice Mode is off.',
  error: 'Practice Mode stopped with an error.',
  finalising: 'Finishing your recording…',
  recording: 'Recording your microphone while the video plays.',
  requestingMic: 'Waiting for microphone permission…',
}

function stopAudio(audio: HTMLAudioElement | null) {
  if (audio === null) {
    return
  }

  audio.pause()
  audio.currentTime = 0
}

function formatBytes(byteCount: number) {
  return new Intl.NumberFormat('en-US').format(byteCount)
}

function formatBooleanSetting(value: boolean | string | null) {
  if (value === null) {
    return 'Not reported'
  }

  if (typeof value === 'string') {
    return `On (${value})`
  }

  return value ? 'On' : 'Off'
}

function formatNumericSetting(value: number | null, unit = '') {
  if (value === null) {
    return 'Not reported'
  }

  return `${new Intl.NumberFormat('en-US').format(value)}${unit}`
}

export function RecorderSpike({
  dependencies,
  origin,
  playerApi,
  videoConfiguration,
}: RecorderSpikeProps) {
  if (videoConfiguration.status !== 'configured') {
    return (
      <main
        id="main-content"
        className={styles.configurationError}
        aria-labelledby="spike-title"
      >
        <p className={styles.kicker}>Stage 1 · Non-public browser spike</p>
        <h1 id="spike-title">Recorder configuration required</h1>
        <p role="alert">{videoConfiguration.message}</p>
      </main>
    )
  }

  return (
    <ConfiguredRecorderSpike
      dependencies={dependencies}
      origin={origin}
      playerApi={playerApi}
      videoId={videoConfiguration.videoId}
    />
  )
}

interface ConfiguredRecorderSpikeProps {
  dependencies?: RecorderDependencies | undefined
  origin?: string | undefined
  playerApi?: YouTubePlayerApi | undefined
  videoId: string
}

function ConfiguredRecorderSpike({
  dependencies,
  origin,
  playerApi,
  videoId,
}: ConfiguredRecorderSpikeProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const lifecycle = useRef({ generation: 0 })
  const playerRef = useRef<YouTubePlayerInstance | null>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [controller] = useState(
    () =>
      new RecorderController(
        dependencies ?? createBrowserRecorderDependencies(),
      ),
  )
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  )

  useEffect(() => {
    const lifecycleState = lifecycle.current
    const generation = ++lifecycleState.generation
    const interruptForHiddenPage = () => {
      if (document.visibilityState === 'hidden') {
        playerRef.current?.pauseVideo()
        controller.interrupt(
          'Practice Mode stopped because the page was hidden. Return to this page and try again.',
        )
      }
    }
    const interruptForExit = () => {
      playerRef.current?.pauseVideo()
      controller.interrupt(
        'Practice Mode stopped because the page was exited. Return to this page and try again.',
      )
      controller.discardCompletedRecording()
    }

    document.addEventListener('visibilitychange', interruptForHiddenPage)
    document.addEventListener('freeze', interruptForExit)
    window.addEventListener('beforeunload', interruptForExit)
    window.addEventListener('pagehide', interruptForExit)

    return () => {
      document.removeEventListener('visibilitychange', interruptForHiddenPage)
      document.removeEventListener('freeze', interruptForExit)
      window.removeEventListener('beforeunload', interruptForExit)
      window.removeEventListener('pagehide', interruptForExit)

      queueMicrotask(() => {
        if (lifecycleState.generation === generation) {
          controller.dispose()
        }
      })
    }
  }, [controller])

  const handlePlaybackStateChange = useCallback(
    (state: YouTubePlaybackState) => {
      setPlayerError(null)

      switch (state) {
        case 'playing':
          stopAudio(audioRef.current)
          controller.playerPlaying()
          break
        case 'buffering':
          controller.playerBuffering()
          break
        case 'cued':
        case 'ended':
        case 'paused':
        case 'unstarted':
          controller.playerStopped()
          break
      }
    },
    [controller],
  )
  const handlePlayerError = useCallback(
    (error: YouTubePlayerError) => {
      setPlayerError(error.message)
      controller.interrupt(error.message)
    },
    [controller],
  )
  const handlePlayerReady = useCallback(
    (player: YouTubePlayerInstance | null) => {
      playerRef.current = player
      if (player !== null) {
        setPlayerError(null)
      }
    },
    [],
  )

  const captureIsBusy = [
    'buffering',
    'finalising',
    'recording',
    'requestingMic',
  ].includes(snapshot.state)
  const microphoneIsActive = [
    'armed',
    'buffering',
    'finalising',
    'recording',
  ].includes(snapshot.state)
  const canEnable = ['disabled', 'error'].includes(snapshot.state)
  const canDisable = !['disabled', 'error'].includes(snapshot.state)
  const microphoneStatus =
    snapshot.state === 'requestingMic'
      ? 'Waiting for permission'
      : microphoneIsActive
        ? 'Microphone active'
        : 'Microphone off'
  const errorMessage = snapshot.errorMessage ?? playerError
  const visibleStatus = errorMessage ?? statusMessages[snapshot.state]

  const enablePracticeMode = () => {
    stopAudio(audioRef.current)
    setPlayerError(null)
    controller.enable()
  }
  const playLatestAttempt = () => {
    playerRef.current?.pauseVideo()
    controller.playerStopped()
  }

  return (
    <main id="main-content" className={styles.main}>
      <section className={styles.introduction} aria-labelledby="spike-title">
        <p className={styles.kicker}>Stage 3 · Player-connected recorder</p>
        <h1 id="spike-title">Listen. Shadow. Play it back.</h1>
        <p>
          Enable Practice Mode, then use the video&apos;s native controls.
          Playing starts microphone recording; pausing or ending the video
          finishes the attempt.
        </p>
      </section>

      <section className={styles.playerPanel} aria-labelledby="video-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.step}>Practice video</p>
            <h2 id="video-title">Control the recording from the video</h2>
          </div>
          <span className={styles.fixedBadge}>Fixed test video</span>
        </div>
        <FixedVideoPlayer
          onError={handlePlayerError}
          onPlaybackStateChange={handlePlaybackStateChange}
          onPlayerReady={handlePlayerReady}
          origin={origin}
          playerApi={playerApi}
          videoId={videoId}
        />
        <p className={styles.headphones}>
          <span aria-hidden="true">🎧</span>
          <span>
            <strong>Wear headphones while recording.</strong> This keeps the
            reference audio out of your microphone recording.
          </span>
        </p>
      </section>

      <div className={styles.workspace}>
        <section
          className={styles.recorderPanel}
          aria-labelledby="recorder-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.step}>Practice Mode</p>
              <h2 id="recorder-title">Connect the microphone</h2>
            </div>
            <span
              className={styles.microphoneStatus}
              data-active={microphoneIsActive ? 'true' : 'false'}
            >
              <span aria-hidden="true" />
              {microphoneStatus}
            </span>
          </div>

          <p
            className={styles.liveStatus}
            role={errorMessage === null ? 'status' : 'alert'}
            aria-live={errorMessage === null ? 'polite' : 'assertive'}
          >
            {visibleStatus}
          </p>

          <div className={styles.controls} aria-label="Practice Mode controls">
            <button
              className={styles.primaryButton}
              disabled={!canEnable}
              onClick={enablePracticeMode}
              type="button"
            >
              Enable Practice Mode
            </button>
            <button
              disabled={!canDisable}
              onClick={() => controller.disable()}
              type="button"
            >
              Disable Practice Mode
            </button>
          </div>

          {snapshot.result !== null && !captureIsBusy ? (
            <div className={styles.playback}>
              <p className={styles.step}>Latest recording</p>
              <audio
                aria-label="Latest recording playback"
                controls
                onPlay={playLatestAttempt}
                ref={audioRef}
                src={snapshot.result.objectUrl}
              />
              <p>
                This session-only audio stays in your browser. The next
                completed attempt replaces it.
              </p>
            </div>
          ) : null}
        </section>

        <aside
          className={styles.diagnostics}
          aria-labelledby="diagnostics-title"
        >
          <p className={styles.step}>Recorder diagnostics</p>
          <h2 id="diagnostics-title">Latest attempt</h2>
          <dl>
            <div>
              <dt>State</dt>
              <dd>{snapshot.state}</dd>
            </div>
            <div>
              <dt>MIME type</dt>
              <dd>{snapshot.recorderMimeType ?? 'Not selected'}</dd>
            </div>
            <div>
              <dt>Audio bytes</dt>
              <dd>{formatBytes(snapshot.recordedByteCount)}</dd>
            </div>
            <div>
              <dt>Echo cancellation</dt>
              <dd>
                {formatBooleanSetting(
                  snapshot.microphoneSettings?.echoCancellation ?? null,
                )}
              </dd>
            </div>
            <div>
              <dt>Noise suppression</dt>
              <dd>
                {formatBooleanSetting(
                  snapshot.microphoneSettings?.noiseSuppression ?? null,
                )}
              </dd>
            </div>
            <div>
              <dt>Auto gain</dt>
              <dd>
                {formatBooleanSetting(
                  snapshot.microphoneSettings?.autoGainControl ?? null,
                )}
              </dd>
            </div>
            <div>
              <dt>Sample rate</dt>
              <dd>
                {formatNumericSetting(
                  snapshot.microphoneSettings?.sampleRate ?? null,
                  ' Hz',
                )}
              </dd>
            </div>
            <div>
              <dt>Channels</dt>
              <dd>
                {formatNumericSetting(
                  snapshot.microphoneSettings?.channelCount ?? null,
                )}
              </dd>
            </div>
          </dl>
          <h3>Recorder event order</h3>
          {snapshot.eventOrder.length === 0 ? (
            <p className={styles.emptyEvents}>No recorder events yet.</p>
          ) : (
            <ol className={styles.eventList}>
              {snapshot.eventOrder.map((eventName, index) => (
                <li key={`${index}-${eventName}`}>{eventName}</li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </main>
  )
}
