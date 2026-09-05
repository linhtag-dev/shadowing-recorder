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
  type PracticeMode,
} from '../controller/RecorderController.js'
import { ListenFirstController } from '../controller/ListenFirstController.js'
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
  standby: 'Ready. Play the video to start recording.',
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

function isInteractiveShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input, select, textarea, button, a[href], summary, audio, video, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="slider"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="tab"], [role="radio"], [role="spinbutton"], [tabindex]:not([tabindex="-1"])',
      ) !== null)
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
  const referencePlaybackRequest = useRef(0)
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
  const [recorderDependencies] = useState(
    () => dependencies ?? createBrowserRecorderDependencies(),
  )
  const [modeChanging, setModeChanging] = useState(false)
  const [controller] = useState(
    () => new RecorderController(recorderDependencies),
  )
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  )

  const [listenFlow] = useState(
    () => new ListenFirstController(controller, recorderDependencies.clock),
  )
  const listenSnapshot = useSyncExternalStore(
    listenFlow.subscribe,
    listenFlow.getSnapshot,
  )
  const listenFirst = snapshot.mode === 'listen-first'
  useEffect(() => listenFlow.connect(), [listenFlow])
  const setAudioElement = useCallback(
    (audio: HTMLAudioElement | null) => {
      audioRef.current = audio
      listenFlow.setAudio(audio)
    },
    [listenFlow],
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

    // A large scroll can move the tray from below to above the viewport
    // without crossing an observer threshold. Measure those jumps as well.
    let frame: number | null = null
    const measureAfterScroll = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        setComparisonTrayHasPassed(
          comparisonTray.getBoundingClientRect().bottom <= 0,
        )
        const boundary = dockBoundary.getBoundingClientRect()
        setDockBoundaryIsVisible(
          boundary.top <= window.innerHeight && boundary.bottom >= 0,
        )
      })
    }
    observer.observe(comparisonTray)
    observer.observe(dockBoundary)
    window.addEventListener('scroll', measureAfterScroll, { passive: true })
    window.addEventListener('resize', measureAfterScroll)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', measureAfterScroll)
      window.removeEventListener('resize', measureAfterScroll)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
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
        listenFlow.stop()
        stopAudio(audioRef.current)
        playerRef.current?.pauseVideo()
        controller.interrupt(
          'Practice Mode stopped because the page was hidden. Return to this page and try again.',
        )
      }
    }
    const interruptForExit = () => {
      listenFlow.stop()
      stopAudio(audioRef.current)
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
          listenFlow.dispose()
          controller.dispose()
        }
      })
    }
  }, [controller, listenFlow])

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
      listenFlow.stop()
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
    [controller, listenFlow],
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

      if (state === 'playing') {
        ++referencePlaybackRequest.current
        pendingComparisonPlayback.current = false
        stopAudio(audioRef.current)
        setActivePlayback('reference')
        setAudioIsPlaying(false)
        setAudioProgress(emptyPlaybackProgress)
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

      listenFlow.playerStateChanged(validation.playbackState)
      setPlayerPlaybackState(validation.playbackState)
    },
    [controller, handlePlayerFailure, listenFlow],
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
      listenFlow.bindPlayer(player, binding)
      setPlayerIsReady(true)
      setPlayerPlaybackState(validation.playbackState)
      setVideoLoadState({ status: 'ready', videoId: selection.videoId })
      updateReferenceProgress()
    },
    [controller, handlePlayerFailure, updateReferenceProgress, listenFlow],
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
    listenFlow.stop()
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
  const practiceGateDescription = listenFirst
    ? 'Listen to the reference, record your attempt, then listen back. Space or Right Arrow advances each step.'
    : practiceModeIsEnabled
      ? 'Play the video to record. Headphones keep the reference audio out of your recording.'
      : playerIsReady
        ? 'Your microphone records only while the video plays. Headphones are recommended.'
        : 'Load a video first. Your microphone will record only while it plays.'
  const errorMessage =
    snapshot.errorMessage ?? (listenFirst ? listenSnapshot.message : null)
  const visibleStatus =
    errorMessage ??
    (listenFirst && practiceModeIsEnabled
      ? snapshot.state === 'recording'
        ? 'Recording your attempt. The reference is paused.'
        : snapshot.state === 'finalising' || snapshot.state === 'requestingMic'
          ? statusMessages[snapshot.state]
          : listenSnapshot.phase === 'listen'
            ? 'Listen to your attempt and reflect. Advance when you are ready.'
            : 'Listen first. Your microphone stays off until you start recording.'
      : statusMessages[snapshot.state])
  const referenceIsPlaying = ['buffering', 'playing'].includes(
    playerPlaybackState,
  )
  const latestRecordingIsAvailable =
    snapshot.result !== null &&
    !['buffering', 'finalising', 'recording'].includes(snapshot.state)
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
    listenFlow.stop()
    stopAudio(audioRef.current)
    setAudioIsPlaying(false)
    controller.enable()
  }
  const disablePracticeMode = () => {
    listenFlow.stop()
    if (listenFirst) {
      playerRef.current?.pauseVideo()
      stopAudio(audioRef.current)
    }
    controller.disable()
  }
  const changePracticeMode = (mode: PracticeMode) => {
    listenFlow.stop()
    ++referencePlaybackRequest.current
    pendingComparisonPlayback.current = false
    stopAudio(audioRef.current)
    playerRef.current?.pauseVideo()
    setAudioIsPlaying(false)
    setModeChanging(true)
    void controller.changeMode(mode).then(() => setModeChanging(false))
  }
  const togglePracticeMode = () => {
    if (practiceModeIsEnabled) {
      disablePracticeMode()
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
  const prepareLearnerPlayback = useCallback(() => {
    const binding = playerBindingRef.current
    if (binding === null) {
      return false
    }

    const validation = controller.prepareForLearnerPlayback(binding)
    if (validation.status === 'invalid') {
      handlePlayerFailure(binding.loadGeneration, validation.message)
      return false
    }
    return validation.status === 'valid'
  }, [controller, handlePlayerFailure])
  const prepareReferencePlayback = useCallback(async () => {
    const binding = playerBindingRef.current
    if (binding === null) {
      return false
    }

    const validation = await controller.prepareForReferencePlayback(binding)
    if (validation.status === 'invalid') {
      handlePlayerFailure(binding.loadGeneration, validation.message)
      return false
    }
    return validation.status === 'valid'
  }, [controller, handlePlayerFailure])
  const playLatestAttempt = () => {
    if (
      listenFirst &&
      ['recording', 'finalising', 'requestingMic'].includes(
        controller.getSnapshot().state,
      )
    ) {
      stopAudio(audioRef.current)
      return
    }
    pendingComparisonPlayback.current = false
    if (playerIsReady) {
      if (!prepareLearnerPlayback()) {
        audioRef.current?.pause()
        return
      }
      playerRef.current?.pauseVideo()
    }
    if (listenFirst) listenFlow.learnerPlaybackStarted()
    setActivePlayback('recording')
    setAudioIsPlaying(true)
    updateAudioProgress()
  }
  const pauseLatestAttempt = () => {
    setAudioIsPlaying(false)
    updateAudioProgress()
    if (playerIsReady && !referenceIsPlaying) {
      void prepareReferencePlayback()
    }
  }
  const toggleReferencePlayback = () => {
    const player = playerRef.current
    if (player === null) {
      return
    }

    pendingComparisonPlayback.current = false
    setActivePlayback('reference')
    if (referenceIsPlaying) {
      ++referencePlaybackRequest.current
      player.pauseVideo()
      return
    }

    const request = ++referencePlaybackRequest.current
    stopAudio(audioRef.current)
    setAudioIsPlaying(false)
    void prepareReferencePlayback().then((ready) => {
      if (ready && request === referencePlaybackRequest.current) {
        player.playVideo()
      }
    })
  }
  const toggleRecordingPlayback = () => {
    const audio = audioRef.current
    if (audio === null || !recordingIsAvailable || !prepareLearnerPlayback()) {
      return
    }

    ++referencePlaybackRequest.current
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
      if (
        audio === null ||
        !recordingIsAvailable ||
        !prepareLearnerPlayback()
      ) {
        return
      }

      ++referencePlaybackRequest.current
      playerRef.current?.pauseVideo()
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

    const request = ++referencePlaybackRequest.current
    stopAudio(audioRef.current)
    setAudioIsPlaying(false)
    void prepareReferencePlayback().then((ready) => {
      if (ready && request === referencePlaybackRequest.current) {
        player.seekTo(0, true)
        player.playVideo()
      }
    })
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
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== 'Space' &&
          event.key !== ' ' &&
          event.code !== 'ArrowRight' &&
          event.key !== 'ArrowRight') ||
        (isInteractiveShortcutTarget(event.target) &&
          !(
            listenFirst &&
            event.target instanceof HTMLElement &&
            event.target.closest('[data-practice-advance]')
          ))
      ) {
        return
      }

      if (modeChanging) return
      if (listenFirst) {
        if (!practiceModeIsEnabled) return
        event.preventDefault()
        void listenFlow.advance()
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

        if (
          audio !== null &&
          recordingIsAvailable &&
          prepareLearnerPlayback()
        ) {
          ++referencePlaybackRequest.current
          void audio.play().catch(() => {
            setAudioIsPlaying(false)
          })
        }
        return
      }

      pendingComparisonPlayback.current = false
      const request = ++referencePlaybackRequest.current
      stopAudio(audioRef.current)
      setAudioIsPlaying(false)
      void prepareReferencePlayback().then((ready) => {
        if (ready && request === referencePlaybackRequest.current) {
          player.playVideo()
        }
      })
    }

    document.addEventListener('keydown', handleComparisonShortcut)
    return () => {
      document.removeEventListener('keydown', handleComparisonShortcut)
    }
  }, [
    listenFirst,
    listenFlow,
    practiceModeIsEnabled,
    modeChanging,
    recordingIsAvailable,
    referenceIsPlaying,
    prepareLearnerPlayback,
    prepareReferencePlayback,
    snapshot.state,
    validatePlayerAction,
  ])

  const advanceLabel = listenSnapshot.busy
    ? snapshot.state === 'finalising'
      ? 'Finishing recording…'
      : 'Preparing…'
    : listenSnapshot.phase === 'listen'
      ? listenSnapshot.needsPlayback
        ? 'Play my attempt'
        : 'Play reference'
      : listenSnapshot.phase === 'record'
        ? snapshot.state === 'recording'
          ? 'Stop & listen'
          : 'Retry recording'
        : listenSnapshot.started
          ? 'Start recording'
          : 'Play reference'
  const listenControls = (
    <div className={styles.listenControls}>
      <ol className={styles.practiceSteps} aria-label="Listen first steps">
        {(['reference', 'record', 'listen'] as const).map((phase, index) => (
          <li
            key={phase}
            aria-current={listenSnapshot.phase === phase ? 'step' : undefined}
          >
            <span>{index + 1}</span>
            {phase === 'reference'
              ? 'Play reference'
              : phase === 'record'
                ? 'Record'
                : 'Listen'}
          </li>
        ))}
      </ol>
      <button
        type="button"
        data-practice-advance="true"
        aria-keyshortcuts="Space ArrowRight"
        className={styles.advanceButton}
        disabled={!practiceModeIsEnabled || modeChanging}
        aria-disabled={listenSnapshot.busy || snapshot.state === 'finalising'}
        onClick={() => {
          void listenFlow.advance()
        }}
      >
        {advanceLabel}
        <span aria-hidden="true"> →</span>
      </button>
      <button
        className={styles.newPassageButton}
        type="button"
        disabled={listenSnapshot.busy || snapshot.state !== 'standby'}
        onClick={() => listenFlow.newPassage()}
      >
        New passage
      </button>
    </div>
  )

  return (
    <main id="main-content" className={styles.main}>
      <section className={styles.introduction} aria-labelledby="spike-title">
        <p className={styles.kicker}>Stage 2 · URL-first practice loader</p>
        <h1 id="spike-title">Listen. Shadow. Play it back.</h1>
        <p>
          Load a supported YouTube URL and choose how to practice. In Shadowing,
          the video&apos;s native controls guide recording. Playing starts
          microphone recording; pausing or ending the video finishes the
          attempt.
        </p>
      </section>

      <section className={styles.playerPanel} aria-labelledby="video-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.step}>Practice video</p>
            <h2 id="video-title">Set up your practice video</h2>
          </div>
        </div>
        <div className={styles.modePicker}>
          <label htmlFor="practice-mode">Practice style</label>
          <select
            id="practice-mode"
            value={snapshot.mode}
            disabled={modeChanging}
            onChange={(event) =>
              changePracticeMode(event.target.value as PracticeMode)
            }
          >
            <option value="shadowing">Shadowing · speak along</option>
            <option value="listen-first">
              Listen first · record · reflect
            </option>
          </select>
          <span>
            {listenFirst
              ? 'Hear it first. Try it yourself. Listen back.'
              : 'Record while the reference plays.'}
          </span>
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
                    <span>Checking link…</span>
                  </>
                ) : videoLoadState.status === 'ready' ? (
                  <>
                    <strong>Video ready</strong>
                    <span>Ready to play.</span>
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
              disabled={
                modeChanging || (!playerIsReady && !practiceModeIsEnabled)
              }
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
          aria-keyshortcuts="Space ArrowRight"
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
            <p>
              {listenFirst ? 'Listen first' : 'Compare playback'} · Space / → to
              cycle
            </p>
            <span aria-live="polite">
              {listenFirst ? visibleStatus : comparisonStatus}
            </span>
          </div>
          {listenFirst ? (
            listenControls
          ) : (
            <ComparisonControls
              activePlayback={activePlayback}
              audioIsPlaying={audioIsPlaying}
              audioProgress={audioProgress}
              onRestart={restartActivePlayback}
              onToggleRecording={toggleRecordingPlayback}
              onToggleReference={toggleReferencePlayback}
              playerIsReady={playerIsReady && !modeChanging}
              recordingIsAvailable={recordingIsAvailable && !modeChanging}
              referenceIsPlaying={referenceIsPlaying}
              referenceProgress={referenceProgress}
            />
          )}
        </section>
      </section>

      {showCompactDock ? (
        <section
          aria-keyshortcuts="Space ArrowRight"
          aria-label="Playback comparison"
          className={styles.comparisonDock}
          data-comparison-tray="floating"
        >
          <span className={styles.visuallyHidden} aria-live="polite">
            {listenFirst ? visibleStatus : comparisonStatus}
          </span>
          {listenFirst ? (
            listenControls
          ) : (
            <ComparisonControls
              activePlayback={activePlayback}
              audioIsPlaying={audioIsPlaying}
              audioProgress={audioProgress}
              onRestart={restartActivePlayback}
              onToggleRecording={toggleRecordingPlayback}
              onToggleReference={toggleReferencePlayback}
              playerIsReady={playerIsReady && !modeChanging}
              recordingIsAvailable={recordingIsAvailable && !modeChanging}
              referenceIsPlaying={referenceIsPlaying}
              referenceProgress={referenceProgress}
            />
          )}
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
              disabled={!canEnable || modeChanging}
              onClick={enablePracticeMode}
              type="button"
            >
              Enable Practice Mode
            </button>
            <button
              disabled={!canDisable}
              onClick={disablePracticeMode}
              type="button"
            >
              Disable Practice Mode
            </button>
          </div>

          {listenFirst ||
          (snapshot.result !== null && latestRecordingIsAvailable) ? (
            <div
              className={styles.playback}
              hidden={snapshot.result === null || !latestRecordingIsAvailable}
            >
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
                ref={setAudioElement}
                src={snapshot.result?.objectUrl}
              />
              <p>
                Source video ID: <strong>{snapshot.result?.videoId}</strong>.
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
