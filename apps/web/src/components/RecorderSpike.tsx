import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import type { RecorderDependencies } from '../controller/browserCapabilities.js'
import { createBrowserRecorderDependencies } from '../controller/browserCapabilities.js'
import {
  RecorderController,
  type RecorderPlayerBinding,
} from '../controller/RecorderController.js'
import type { RecorderState } from '../controller/recorderMachine.js'
import type {
  YouTubePlaybackState,
  YouTubePlayerApi,
  YouTubePlayerError,
  YouTubePlayerInstance,
} from '../player/youTubePlayer.js'
import { parseYouTubeVideoUrl } from '../youtubeVideoUrl.js'
import { YouTubeVideoPlayer } from './YouTubeVideoPlayer.js'
import styles from './RecorderSpike.module.css'

export interface RecorderSpikeProps {
  dependencies?: RecorderDependencies | undefined
  origin?: string | undefined
  playerApi?: YouTubePlayerApi | undefined
}

interface SelectedVideo {
  generation: number
  videoId: string
}

type VideoLoadState =
  | { status: 'empty' }
  | { status: 'loading'; videoId: string }
  | { status: 'ready'; videoId: string }
  | { status: 'error'; message: string }

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
}: RecorderSpikeProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const comparisonTrayRef = useRef<HTMLElement>(null)
  const dockBoundaryRef = useRef<HTMLDivElement>(null)
  const lifecycle = useRef({ generation: 0 })
  const loadGeneration = useRef(0)
  const pendingComparisonPlayback = useRef(false)
  const playerBindingRef = useRef<RecorderPlayerBinding | null>(null)
  const playerRef = useRef<YouTubePlayerInstance | null>(null)
  const selectedVideoRef = useRef<SelectedVideo | null>(null)
  const [activePlayback, setActivePlayback] =
    useState<PlaybackSource>('reference')
  const [audioIsPlaying, setAudioIsPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(emptyPlaybackProgress)
  const [comparisonTrayHasFocus, setComparisonTrayHasFocus] = useState(false)
  const [comparisonTrayHasPassed, setComparisonTrayHasPassed] = useState(false)
  const [dockBoundaryIsVisible, setDockBoundaryIsVisible] = useState(false)
  const [playerIsReady, setPlayerIsReady] = useState(false)
  const [playerPlaybackState, setPlayerPlaybackState] =
    useState<YouTubePlaybackState>('unstarted')
  const [referenceProgress, setReferenceProgress] = useState(
    emptyPlaybackProgress,
  )
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null)
  const [videoLoadState, setVideoLoadState] = useState<VideoLoadState>({
    status: 'empty',
  })
  const [videoUrl, setVideoUrl] = useState('')
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

  const handlePlayerFailure = useCallback(
    (generation: number, message: string) => {
      if (generation !== loadGeneration.current) {
        return
      }

      try {
        playerRef.current?.pauseVideo()
      } catch {
        // Player teardown below remains the fail-safe.
      }
      stopAudio(audioRef.current)
      pendingComparisonPlayback.current = false
      playerBindingRef.current = null
      playerRef.current = null
      selectedVideoRef.current = null
      setSelectedVideo(null)
      setAudioIsPlaying(false)
      setPlayerIsReady(false)
      setPlayerPlaybackState('unstarted')
      setReferenceProgress(emptyPlaybackProgress)
      setVideoLoadState({ status: 'error', message })
      void controller.shutdownForPlayerChange()
    },
    [controller],
  )

  const handlePlaybackStateChange = useCallback(
    (state: YouTubePlaybackState, generation: number) => {
      const binding = playerBindingRef.current
      if (
        generation !== loadGeneration.current ||
        binding === null ||
        binding.loadGeneration !== generation
      ) {
        return
      }

      const validation =
        state === 'playing'
          ? controller.playerPlaying(binding)
          : state === 'buffering'
            ? controller.playerBuffering(binding)
            : controller.playerStopped(binding)
      if (validation.status === 'invalid') {
        handlePlayerFailure(generation, validation.message)
        return
      }
      if (validation.status !== 'valid') {
        return
      }

      setPlayerPlaybackState(validation.playbackState)
      if (validation.playbackState === 'playing') {
        pendingComparisonPlayback.current = false
        stopAudio(audioRef.current)
        setActivePlayback('reference')
        setAudioIsPlaying(false)
        setAudioProgress(emptyPlaybackProgress)
      }
    },
    [controller, handlePlayerFailure],
  )
  const handlePlayerError = useCallback(
    (error: YouTubePlayerError, generation: number) => {
      handlePlayerFailure(generation, error.message)
    },
    [handlePlayerFailure],
  )
  const handlePlayerReady = useCallback(
    (player: YouTubePlayerInstance, generation: number) => {
      const selection = selectedVideoRef.current
      if (
        generation !== loadGeneration.current ||
        selection === null ||
        selection.generation !== generation
      ) {
        try {
          player.destroy()
        } catch {
          // A superseded player may already have removed its iframe.
        }
        return
      }

      const binding = Object.freeze<RecorderPlayerBinding>({
        expectedVideoId: selection.videoId,
        getPlayerState: () => player.getPlayerState(),
        getVideoUrl: () => player.getVideoUrl(),
        loadGeneration: generation,
      })
      const validation = controller.bindPlayer(binding)
      if (validation.status === 'invalid') {
        handlePlayerFailure(generation, validation.message)
        return
      }
      if (validation.status !== 'valid') {
        return
      }

      playerBindingRef.current = binding
      playerRef.current = player
      setPlayerIsReady(true)
      setPlayerPlaybackState(validation.playbackState)
      setVideoLoadState({ status: 'ready', videoId: selection.videoId })
      updateReferenceProgress()
    },
    [controller, handlePlayerFailure, updateReferenceProgress],
  )

  useEffect(() => {
    const bindingError = snapshot.playerBindingError
    if (
      bindingError !== null &&
      bindingError.loadGeneration === loadGeneration.current &&
      selectedVideoRef.current?.generation === bindingError.loadGeneration
    ) {
      handlePlayerFailure(bindingError.loadGeneration, bindingError.message)
    }
  }, [handlePlayerFailure, snapshot.playerBindingError])

  const submitVideoUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const generation = ++loadGeneration.current
    const parsedUrl = parseYouTubeVideoUrl(videoUrl)

    try {
      playerRef.current?.pauseVideo()
    } catch {
      // Player teardown below remains the fail-safe.
    }
    stopAudio(audioRef.current)
    pendingComparisonPlayback.current = false
    playerBindingRef.current = null
    playerRef.current = null
    selectedVideoRef.current = null
    setSelectedVideo(null)
    setActivePlayback('reference')
    setAudioIsPlaying(false)
    setAudioProgress(emptyPlaybackProgress)
    setPlayerIsReady(false)
    setPlayerPlaybackState('unstarted')
    setReferenceProgress(emptyPlaybackProgress)

    const shutdown = controller.shutdownForPlayerChange()
    if (parsedUrl.status !== 'valid') {
      setVideoLoadState({ status: 'error', message: parsedUrl.message })
      return
    }

    setVideoLoadState({ status: 'loading', videoId: parsedUrl.videoId })
    void shutdown.then(() => {
      if (generation !== loadGeneration.current) {
        return
      }

      const selection = { generation, videoId: parsedUrl.videoId }
      selectedVideoRef.current = selection
      setSelectedVideo(selection)
    })
  }

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
  const canEnable =
    playerIsReady && ['disabled', 'error'].includes(snapshot.state)
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
  const practiceGateTitle = !playerIsReady
    ? 'Load a video before enabling Practice Mode'
    : snapshot.state === 'requestingMic'
      ? 'Allow microphone access to continue'
      : practiceModeIsEnabled
        ? 'Practice Mode is ready'
        : 'Turn on Practice Mode to record and compare'
  const practiceGateDescription = practiceModeIsEnabled
    ? 'Play the video to record. Headphones keep the reference audio out of your recording.'
    : playerIsReady
      ? 'Your microphone records only while the video plays. Headphones are recommended.'
      : 'Load a video first. Your microphone will record only while it plays.'
  const errorMessage = snapshot.errorMessage
  const visibleStatus = errorMessage ?? statusMessages[snapshot.state]
  const referenceIsPlaying = ['buffering', 'playing'].includes(
    playerPlaybackState,
  )
  const latestRecordingIsAvailable = snapshot.result !== null && !captureIsBusy
  const recordingIsAvailable =
    latestRecordingIsAvailable &&
    playerIsReady &&
    snapshot.result?.videoId === selectedVideo?.videoId
  const comparisonStatus = audioIsPlaying
    ? 'Playing your recording'
    : referenceIsPlaying
      ? 'Playing the reference video'
      : snapshot.state === 'finalising'
        ? 'Finishing your recording…'
        : recordingIsAvailable
          ? 'Ready to compare'
          : latestRecordingIsAvailable
            ? 'Latest recording belongs to another video'
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
    controller.enable()
  }
  const togglePracticeMode = () => {
    if (practiceModeIsEnabled) {
      controller.disable()
      return
    }

    enablePracticeMode()
  }
  const validatePlayerAction = useCallback(() => {
    const binding = playerBindingRef.current
    if (binding === null) {
      return false
    }

    const validation = controller.validatePlaybackAction(binding)
    if (validation.status === 'invalid') {
      handlePlayerFailure(binding.loadGeneration, validation.message)
      return false
    }
    return validation.status === 'valid'
  }, [controller, handlePlayerFailure])
  const playLatestAttempt = () => {
    pendingComparisonPlayback.current = false
    if (playerIsReady) {
      if (!validatePlayerAction()) {
        audioRef.current?.pause()
        return
      }
      playerRef.current?.pauseVideo()
    }
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
    if (player === null || !validatePlayerAction()) {
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
    if (audio === null || !recordingIsAvailable || !validatePlayerAction()) {
      return
    }

    pendingComparisonPlayback.current = false
    setActivePlayback('recording')
    if (audioIsPlaying) {
      audio.pause()
      return
    }

    playerRef.current?.pauseVideo()
    void audio.play().catch(() => {
      setAudioIsPlaying(false)
    })
  }
  const restartActivePlayback = () => {
    pendingComparisonPlayback.current = false
    if (activePlayback === 'recording') {
      const audio = audioRef.current
      if (audio === null || !recordingIsAvailable || !validatePlayerAction()) {
        return
      }

      playerRef.current?.pauseVideo()
      audio.currentTime = 0
      updateAudioProgress()
      void audio.play().catch(() => {
        setAudioIsPlaying(false)
      })
      return
    }

    const player = playerRef.current
    if (player === null || !validatePlayerAction()) {
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
      if (player === null || !validatePlayerAction()) {
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
  }, [
    recordingIsAvailable,
    referenceIsPlaying,
    snapshot.state,
    validatePlayerAction,
  ])

  return (
    <main id="main-content" className={styles.main}>
      <section className={styles.introduction} aria-labelledby="spike-title">
        <p className={styles.kicker}>Stage 2 · URL-first practice loader</p>
        <h1 id="spike-title">Listen. Shadow. Play it back.</h1>
        <p>
          Load a supported YouTube URL, enable Practice Mode, then use the
          video&apos;s native controls. Playing starts microphone recording;
          pausing or ending the video finishes the attempt.
        </p>
      </section>

      <section className={styles.playerPanel} aria-labelledby="video-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.step}>Practice video</p>
            <h2 id="video-title">Set up your practice video</h2>
          </div>
        </div>
        <div className={styles.videoSetup}>
          <form className={styles.videoLoader} onSubmit={submitVideoUrl}>
            <label htmlFor="youtube-video-url">YouTube video URL</label>
            <div className={styles.videoLoaderControls}>
              <input
                aria-describedby="youtube-video-help"
                autoComplete="url"
                id="youtube-video-url"
                inputMode="url"
                onChange={(event) => setVideoUrl(event.currentTarget.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                spellCheck="false"
                type="text"
                value={videoUrl}
              />
              <button type="submit">Load video</button>
            </div>
            <div className={styles.videoLoaderFooter}>
              <p id="youtube-video-help">
                Works with YouTube watch, Shorts, and embed links.
              </p>
              <p
                aria-live={
                  videoLoadState.status === 'error' ? 'assertive' : 'polite'
                }
                className={styles.videoLoadStatus}
                role={videoLoadState.status === 'error' ? 'alert' : 'status'}
              >
                <span className={styles.statusDot} aria-hidden="true" />
                {videoLoadState.status === 'empty' ? (
                  <>
                    <strong>No video</strong>
                    <span>Paste a link to begin.</span>
                  </>
                ) : videoLoadState.status === 'loading' ? (
                  <>
                    <strong>Loading video</strong>
                    <span>Verifying {videoLoadState.videoId}…</span>
                  </>
                ) : videoLoadState.status === 'ready' ? (
                  <>
                    <strong>Video ready</strong>
                    <span>Verified source ID {videoLoadState.videoId}.</span>
                  </>
                ) : (
                  <>
                    <strong>Video error</strong>
                    <span>{videoLoadState.message}</span>
                  </>
                )}
              </p>
            </div>
          </form>
          <div
            className={styles.practiceGate}
            data-active={practiceModeIsEnabled ? 'true' : 'false'}
          >
            <div className={styles.practiceGateCopy}>
              <p>Practice Mode</p>
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
              disabled={!playerIsReady && !practiceModeIsEnabled}
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
        </div>
        {selectedVideo === null ? (
          <div className={styles.videoPlaceholder}>
            <span aria-hidden="true">▶</span>
            <p>The player will appear after a video URL is validated.</p>
          </div>
        ) : (
          <YouTubeVideoPlayer
            key={selectedVideo.generation}
            loadGeneration={selectedVideo.generation}
            onError={handlePlayerError}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlayerReady={handlePlayerReady}
            origin={origin}
            playerApi={playerApi}
            videoId={selectedVideo.videoId}
          />
        )}
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
                Source video ID: <strong>{snapshot.result.videoId}</strong>.
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
