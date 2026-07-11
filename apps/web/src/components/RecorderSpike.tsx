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

type PlaybackSource = 'recording' | 'reference'

interface PlaybackProgress {
  currentTime: number
  duration: number
}

interface ComparisonControlsProps {
  activePlayback: PlaybackSource
  audioIsPlaying: boolean
  audioProgress: PlaybackProgress
  onRestart: () => void
  onToggleRecording: () => void
  onToggleReference: () => void
  playerIsReady: boolean
  recordingIsAvailable: boolean
  referenceIsPlaying: boolean
  referenceProgress: PlaybackProgress
}

const emptyPlaybackProgress: PlaybackProgress = {
  currentTime: 0,
  duration: 0,
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

function normaliseMediaTime(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function formatMediaTime(value: number) {
  const totalSeconds = Math.floor(normaliseMediaTime(value))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatPlaybackProgress(progress: PlaybackProgress) {
  if (progress.duration === 0) {
    return 'Ready'
  }

  return `${formatMediaTime(progress.currentTime)} / ${formatMediaTime(
    progress.duration,
  )}`
}

function ComparisonControls({
  activePlayback,
  audioIsPlaying,
  audioProgress,
  onRestart,
  onToggleRecording,
  onToggleReference,
  playerIsReady,
  recordingIsAvailable,
  referenceIsPlaying,
  referenceProgress,
}: ComparisonControlsProps) {
  const restartLabel = `Restart ${
    activePlayback === 'reference' ? 'reference video' : 'my recording'
  }`

  return (
    <div
      className={styles.playbackControls}
      aria-label="Quick playback controls"
    >
      <button
        aria-label={
          referenceIsPlaying ? 'Pause reference video' : 'Play reference video'
        }
        aria-pressed={referenceIsPlaying}
        className={styles.sourceButton}
        data-active={referenceIsPlaying ? 'true' : 'false'}
        disabled={!playerIsReady}
        onClick={onToggleReference}
        type="button"
      >
        <span className={styles.playbackIcon} aria-hidden="true">
          {referenceIsPlaying ? 'Ⅱ' : '▶'}
        </span>
        <span className={styles.sourceButtonCopy}>
          <strong>Reference</strong>
          <small>{formatPlaybackProgress(referenceProgress)}</small>
        </span>
      </button>
      <button
        aria-label={audioIsPlaying ? 'Pause my recording' : 'Play my recording'}
        aria-pressed={audioIsPlaying}
        className={styles.sourceButton}
        data-active={audioIsPlaying ? 'true' : 'false'}
        disabled={!recordingIsAvailable}
        onClick={onToggleRecording}
        type="button"
      >
        <span className={styles.playbackIcon} aria-hidden="true">
          {audioIsPlaying ? 'Ⅱ' : '▶'}
        </span>
        <span className={styles.sourceButtonCopy}>
          <strong>My recording</strong>
          <small>
            {recordingIsAvailable
              ? formatPlaybackProgress(audioProgress)
              : 'Record an attempt first'}
          </small>
        </span>
      </button>
      <button
        aria-label={restartLabel}
        className={styles.restartButton}
        disabled={
          activePlayback === 'reference'
            ? !playerIsReady
            : !recordingIsAvailable
        }
        onClick={onRestart}
        title={restartLabel}
        type="button"
      >
        <span aria-hidden="true">↺</span>
      </button>
    </div>
  )
}

function isEditableShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  )
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
  const comparisonTrayRef = useRef<HTMLElement>(null)
  const dockBoundaryRef = useRef<HTMLDivElement>(null)
  const lifecycle = useRef({ generation: 0 })
  const pendingComparisonPlayback = useRef(false)
  const playerRef = useRef<YouTubePlayerInstance | null>(null)
  const [activePlayback, setActivePlayback] =
    useState<PlaybackSource>('reference')
  const [audioIsPlaying, setAudioIsPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(emptyPlaybackProgress)
  const [comparisonTrayHasFocus, setComparisonTrayHasFocus] = useState(false)
  const [comparisonTrayHasPassed, setComparisonTrayHasPassed] = useState(false)
  const [dockBoundaryIsVisible, setDockBoundaryIsVisible] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [playerIsReady, setPlayerIsReady] = useState(false)
  const [playerPlaybackState, setPlayerPlaybackState] =
    useState<YouTubePlaybackState>('unstarted')
  const [referenceProgress, setReferenceProgress] = useState(
    emptyPlaybackProgress,
  )
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
    const comparisonTray = comparisonTrayRef.current
    const dockBoundary = dockBoundaryRef.current
    if (
      comparisonTray === null ||
      dockBoundary === null ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === comparisonTray) {
          setComparisonTrayHasPassed(
            !entry.isIntersecting && entry.boundingClientRect.bottom <= 0,
          )
        }

        if (entry.target === dockBoundary) {
          setDockBoundaryIsVisible(entry.isIntersecting)
        }
      }
    })

    observer.observe(comparisonTray)
    observer.observe(dockBoundary)
    return () => observer.disconnect()
  }, [])

  const updateReferenceProgress = useCallback(() => {
    const player = playerRef.current
    if (player === null) {
      return
    }

    try {
      const nextProgress = {
        currentTime: normaliseMediaTime(player.getCurrentTime()),
        duration: normaliseMediaTime(player.getDuration()),
      }
      setReferenceProgress((currentProgress) =>
        currentProgress.currentTime === nextProgress.currentTime &&
        currentProgress.duration === nextProgress.duration
          ? currentProgress
          : nextProgress,
      )
    } catch {
      // The YouTube API can briefly reject reads while its iframe is changing.
    }
  }, [])

  const updateAudioProgress = useCallback(() => {
    const audio = audioRef.current
    if (audio === null) {
      return
    }

    const nextProgress = {
      currentTime: normaliseMediaTime(audio.currentTime),
      duration: normaliseMediaTime(audio.duration),
    }
    setAudioProgress((currentProgress) =>
      currentProgress.currentTime === nextProgress.currentTime &&
      currentProgress.duration === nextProgress.duration
        ? currentProgress
        : nextProgress,
    )
  }, [])

  useEffect(() => {
    updateReferenceProgress()

    if (!['buffering', 'playing'].includes(playerPlaybackState)) {
      return
    }

    const interval = window.setInterval(updateReferenceProgress, 500)
    return () => window.clearInterval(interval)
  }, [playerPlaybackState, updateReferenceProgress])

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
      setPlayerPlaybackState(state)

      switch (state) {
        case 'playing':
          pendingComparisonPlayback.current = false
          stopAudio(audioRef.current)
          setActivePlayback('reference')
          setAudioIsPlaying(false)
          setAudioProgress(emptyPlaybackProgress)
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
      pendingComparisonPlayback.current = false
      setPlayerError(error.message)
      setPlayerIsReady(false)
      controller.interrupt(error.message)
    },
    [controller],
  )
  const handlePlayerReady = useCallback(
    (player: YouTubePlayerInstance | null) => {
      playerRef.current = player
      setPlayerIsReady(player !== null)
      if (player !== null) {
        setPlayerError(null)
        updateReferenceProgress()
      }
    },
    [updateReferenceProgress],
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
  const practiceModeIsEnabled = canDisable
  const microphoneStatus =
    snapshot.state === 'requestingMic'
      ? 'Waiting for permission'
      : microphoneIsActive
        ? 'Microphone active'
        : 'Microphone off'
  const practiceControlLabel =
    snapshot.state === 'requestingMic'
      ? 'Connecting microphone…'
      : practiceModeIsEnabled
        ? 'Practice Mode on'
        : snapshot.state === 'error'
          ? 'Try Practice Mode again'
          : 'Enable Practice Mode'
  const practiceGateTitle =
    snapshot.state === 'requestingMic'
      ? 'Allow microphone access to continue'
      : practiceModeIsEnabled
        ? 'Practice Mode is ready'
        : 'Turn on Practice Mode to record and compare'
  const practiceGateDescription = practiceModeIsEnabled
    ? 'Play the video to start recording. Wear headphones to keep the reference audio out of your microphone recording.'
    : 'Your microphone records only while the reference plays. Wear headphones to keep the reference audio out of your recording.'
  const errorMessage = snapshot.errorMessage ?? playerError
  const visibleStatus = errorMessage ?? statusMessages[snapshot.state]
  const referenceIsPlaying = ['buffering', 'playing'].includes(
    playerPlaybackState,
  )
  const recordingIsAvailable = snapshot.result !== null && !captureIsBusy
  const comparisonStatus = audioIsPlaying
    ? 'Playing your recording'
    : referenceIsPlaying
      ? 'Playing the reference video'
      : snapshot.state === 'finalising'
        ? 'Finishing your recording…'
        : recordingIsAvailable
          ? 'Ready to compare'
          : practiceModeIsEnabled
            ? 'Record an attempt to compare'
            : 'Enable Practice Mode to record and compare'
  const comparisonSessionIsUseful =
    practiceModeIsEnabled ||
    referenceIsPlaying ||
    audioIsPlaying ||
    recordingIsAvailable ||
    captureIsBusy
  const showCompactDock =
    comparisonTrayHasPassed &&
    !dockBoundaryIsVisible &&
    !comparisonTrayHasFocus &&
    comparisonSessionIsUseful

  const enablePracticeMode = () => {
    stopAudio(audioRef.current)
    setAudioIsPlaying(false)
    setPlayerError(null)
    controller.enable()
  }
  const togglePracticeMode = () => {
    if (practiceModeIsEnabled) {
      controller.disable()
      return
    }

    enablePracticeMode()
  }
  const playLatestAttempt = () => {
    pendingComparisonPlayback.current = false
    playerRef.current?.pauseVideo()
    controller.playerStopped()
    setActivePlayback('recording')
    setAudioIsPlaying(true)
    updateAudioProgress()
  }
  const pauseLatestAttempt = () => {
    setAudioIsPlaying(false)
    updateAudioProgress()
  }
  const toggleReferencePlayback = () => {
    const player = playerRef.current
    if (player === null) {
      return
    }

    pendingComparisonPlayback.current = false
    setActivePlayback('reference')
    if (referenceIsPlaying) {
      player.pauseVideo()
      return
    }

    stopAudio(audioRef.current)
    setAudioIsPlaying(false)
    player.playVideo()
  }
  const toggleRecordingPlayback = () => {
    const audio = audioRef.current
    if (audio === null) {
      return
    }

    pendingComparisonPlayback.current = false
    setActivePlayback('recording')
    if (audioIsPlaying) {
      audio.pause()
      return
    }

    playerRef.current?.pauseVideo()
    controller.playerStopped()
    void audio.play().catch(() => {
      setAudioIsPlaying(false)
    })
  }
  const restartActivePlayback = () => {
    pendingComparisonPlayback.current = false
    if (activePlayback === 'recording') {
      const audio = audioRef.current
      if (audio === null) {
        return
      }

      playerRef.current?.pauseVideo()
      controller.playerStopped()
      audio.currentTime = 0
      updateAudioProgress()
      void audio.play().catch(() => {
        setAudioIsPlaying(false)
      })
      return
    }

    const player = playerRef.current
    if (player === null) {
      return
    }

    stopAudio(audioRef.current)
    setAudioIsPlaying(false)
    player.seekTo(0, true)
    player.playVideo()
  }

  useEffect(() => {
    if (!pendingComparisonPlayback.current || !recordingIsAvailable) {
      return
    }

    const audio = audioRef.current
    if (audio === null) {
      return
    }

    pendingComparisonPlayback.current = false
    void audio.play().catch(() => {
      setAudioIsPlaying(false)
    })
  }, [recordingIsAvailable])

  useEffect(() => {
    const handleComparisonShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.code !== 'KeyC' ||
        isEditableShortcutTarget(event.target)
      ) {
        return
      }

      const player = playerRef.current
      if (player === null) {
        return
      }

      event.preventDefault()
      if (
        pendingComparisonPlayback.current &&
        snapshot.state === 'finalising'
      ) {
        return
      }

      if (referenceIsPlaying) {
        const audio = audioRef.current
        pendingComparisonPlayback.current =
          audio === null &&
          ['buffering', 'finalising', 'recording'].includes(snapshot.state)
        player.pauseVideo()

        if (audio !== null && recordingIsAvailable) {
          void audio.play().catch(() => {
            setAudioIsPlaying(false)
          })
        }
        return
      }

      pendingComparisonPlayback.current = false
      stopAudio(audioRef.current)
      setAudioIsPlaying(false)
      player.playVideo()
    }

    document.addEventListener('keydown', handleComparisonShortcut)
    return () => {
      document.removeEventListener('keydown', handleComparisonShortcut)
    }
  }, [recordingIsAvailable, referenceIsPlaying, snapshot.state])

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
        <div
          className={styles.practiceGate}
          data-active={practiceModeIsEnabled ? 'true' : 'false'}
        >
          <span className={styles.practiceGateStep} aria-hidden="true">
            01
          </span>
          <div className={styles.practiceGateCopy}>
            <p>Before you play</p>
            <strong>{practiceGateTitle}</strong>
            <span id="practice-gate-description">
              {practiceGateDescription}
            </span>
          </div>
          <button
            aria-describedby="practice-gate-description"
            aria-label={`Turn Practice Mode ${
              practiceModeIsEnabled ? 'off' : 'on'
            }`}
            aria-pressed={practiceModeIsEnabled}
            className={styles.practiceControl}
            data-active={practiceModeIsEnabled ? 'true' : 'false'}
            onClick={togglePracticeMode}
            type="button"
          >
            <span className={styles.practiceSwitch} aria-hidden="true">
              <span />
            </span>
            <span className={styles.practiceToggleCopy}>
              <strong>{practiceControlLabel}</strong>
              <small>{microphoneStatus}</small>
            </span>
          </button>
        </div>
        <FixedVideoPlayer
          onError={handlePlayerError}
          onPlaybackStateChange={handlePlaybackStateChange}
          onPlayerReady={handlePlayerReady}
          origin={origin}
          playerApi={playerApi}
          videoId={videoId}
        />
        <section
          aria-hidden={showCompactDock ? true : undefined}
          aria-keyshortcuts="Alt+C"
          aria-label="Playback comparison"
          className={styles.comparisonTray}
          data-comparison-tray="inline"
          inert={showCompactDock}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setComparisonTrayHasFocus(false)
            }
          }}
          onFocusCapture={() => setComparisonTrayHasFocus(true)}
          ref={comparisonTrayRef}
        >
          <div className={styles.comparisonTrayHeading}>
            <p>Compare playback</p>
            <span aria-live="polite">{comparisonStatus}</span>
          </div>
          <ComparisonControls
            activePlayback={activePlayback}
            audioIsPlaying={audioIsPlaying}
            audioProgress={audioProgress}
            onRestart={restartActivePlayback}
            onToggleRecording={toggleRecordingPlayback}
            onToggleReference={toggleReferencePlayback}
            playerIsReady={playerIsReady}
            recordingIsAvailable={recordingIsAvailable}
            referenceIsPlaying={referenceIsPlaying}
            referenceProgress={referenceProgress}
          />
        </section>
      </section>

      {showCompactDock ? (
        <section
          aria-keyshortcuts="Alt+C"
          aria-label="Playback comparison"
          className={styles.comparisonDock}
          data-comparison-tray="floating"
        >
          <span className={styles.visuallyHidden} aria-live="polite">
            {comparisonStatus}
          </span>
          <ComparisonControls
            activePlayback={activePlayback}
            audioIsPlaying={audioIsPlaying}
            audioProgress={audioProgress}
            onRestart={restartActivePlayback}
            onToggleRecording={toggleRecordingPlayback}
            onToggleReference={toggleReferencePlayback}
            playerIsReady={playerIsReady}
            recordingIsAvailable={recordingIsAvailable}
            referenceIsPlaying={referenceIsPlaying}
            referenceProgress={referenceProgress}
          />
        </section>
      ) : null}

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
                onDurationChange={updateAudioProgress}
                onEnded={pauseLatestAttempt}
                onLoadedMetadata={updateAudioProgress}
                onPause={pauseLatestAttempt}
                onPlay={playLatestAttempt}
                onTimeUpdate={updateAudioProgress}
                preload="metadata"
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
      <div
        aria-hidden="true"
        className={styles.dockBoundary}
        data-comparison-dock-boundary
        ref={dockBoundaryRef}
      />
    </main>
  )
}
