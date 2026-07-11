import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { VideoConfiguration } from '../videoConfiguration.js'
import {
  createBrowserRecorderDependencies,
  type RecorderDependencies,
} from '../controller/browserCapabilities.js'
import { RecorderController } from '../controller/RecorderController.js'
import type { RecorderState } from '../controller/recorderMachine.js'
import { FixedVideoPlayer } from './FixedVideoPlayer.js'
import styles from './RecorderSpike.module.css'

export interface RecorderSpikeProps {
  dependencies?: RecorderDependencies | undefined
  origin?: string | undefined
  videoConfiguration: VideoConfiguration
}

const statusMessages: Record<RecorderState, string> = {
  error: 'Recording stopped with an error.',
  finalising: 'Finishing your recording…',
  idle: 'Ready to record.',
  paused: 'Recording paused.',
  ready: 'Your latest recording is ready to play.',
  recording: 'Recording your microphone.',
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

export function RecorderSpike({
  dependencies,
  origin,
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
      videoId={videoConfiguration.videoId}
    />
  )
}

interface ConfiguredRecorderSpikeProps {
  dependencies?: RecorderDependencies | undefined
  origin?: string | undefined
  videoId: string
}

function ConfiguredRecorderSpike({
  dependencies,
  origin,
  videoId,
}: ConfiguredRecorderSpikeProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const lifecycle = useRef({ generation: 0 })
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
        controller.interrupt(
          'Recording stopped because the page was hidden. Return to this page and try again.',
        )
      }
    }
    const interruptForExit = () => {
      controller.interrupt(
        'Recording stopped because the page was exited. Return to this page and try again.',
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

  const isBusy = [
    'finalising',
    'paused',
    'recording',
    'requestingMic',
  ].includes(snapshot.state)
  const microphoneStatus =
    snapshot.state === 'requestingMic'
      ? 'Waiting for permission'
      : ['finalising', 'paused', 'recording'].includes(snapshot.state)
        ? 'Microphone active'
        : 'Microphone off'
  const visibleStatus =
    snapshot.state === 'error' && snapshot.errorMessage !== null
      ? snapshot.errorMessage
      : statusMessages[snapshot.state]

  const startRecording = () => {
    stopAudio(audioRef.current)
    controller.start()
  }

  return (
    <main id="main-content" className={styles.main}>
      <section className={styles.introduction} aria-labelledby="spike-title">
        <p className={styles.kicker}>Stage 1 · Non-public browser spike</p>
        <h1 id="spike-title">Listen. Shadow. Play it back.</h1>
        <p>
          Play the fixed, developer-prechecked video with its native controls,
          then record your microphone with the explicit controls below.
        </p>
      </section>

      <section className={styles.playerPanel} aria-labelledby="video-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.step}>Step 1</p>
            <h2 id="video-title">Play the practice video</h2>
          </div>
          <span className={styles.fixedBadge}>Fixed test video</span>
        </div>
        <FixedVideoPlayer videoId={videoId} origin={origin} />
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
              <p className={styles.step}>Step 2</p>
              <h2 id="recorder-title">Record your shadowing</h2>
            </div>
            <span
              className={styles.microphoneStatus}
              data-active={
                ['finalising', 'paused', 'recording'].includes(snapshot.state)
                  ? 'true'
                  : 'false'
              }
            >
              <span aria-hidden="true" />
              {microphoneStatus}
            </span>
          </div>

          <p
            className={styles.liveStatus}
            role={snapshot.state === 'error' ? 'alert' : 'status'}
            aria-live={snapshot.state === 'error' ? 'assertive' : 'polite'}
          >
            {visibleStatus}
          </p>

          <div
            className={styles.controls}
            aria-label="Microphone recording controls"
          >
            <button
              className={styles.primaryButton}
              disabled={isBusy}
              onClick={startRecording}
              type="button"
            >
              Start recording
            </button>
            <button
              disabled={snapshot.state !== 'recording'}
              onClick={() => controller.pause()}
              type="button"
            >
              Pause
            </button>
            <button
              disabled={snapshot.state !== 'paused'}
              onClick={() => controller.resume()}
              type="button"
            >
              Resume
            </button>
            <button
              disabled={!['paused', 'recording'].includes(snapshot.state)}
              onClick={() => controller.stop()}
              type="button"
            >
              Stop
            </button>
          </div>

          {snapshot.result !== null && !isBusy ? (
            <div className={styles.playback}>
              <p className={styles.step}>Latest recording</p>
              <audio
                aria-label="Latest recording playback"
                controls
                ref={audioRef}
                src={snapshot.result.objectUrl}
              />
              <p>
                This session-only audio stays in your browser. Starting another
                recording replaces it after the new recording finishes.
              </p>
            </div>
          ) : null}
        </section>

        <aside
          className={styles.diagnostics}
          aria-labelledby="diagnostics-title"
        >
          <p className={styles.step}>Spike diagnostics</p>
          <h2 id="diagnostics-title">Recorder output</h2>
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
