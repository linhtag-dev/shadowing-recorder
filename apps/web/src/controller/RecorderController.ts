import { createActor } from 'xstate'

import {
  parseYouTubePlaybackState,
  type YouTubePlaybackState,
} from '../player/youTubePlayer.js'
import { parseYouTubeVideoUrl } from '../youtubeVideoUrl.js'
import type {
  AppliedMicrophoneSettings,
  MicrophoneStream,
  RecorderAdapter,
  RecorderDependencies,
  RecorderEventType,
} from './browserCapabilities.js'
import {
  readAppliedMicrophoneSettings,
  selectRecorderMimeType,
} from './browserCapabilities.js'
import { recorderMachine, type RecorderState } from './recorderMachine.js'

const finalisationWatchdogMilliseconds = 5_000
const recordingTimesliceMilliseconds = 1_000

type PlayerPlaybackState = 'buffering' | 'playing' | 'stopped'

export interface CompletedRecording {
  byteLength: number
  mimeType: string
  objectUrl: string
  videoId: string
}

export interface RecorderPlayerBinding {
  readonly expectedVideoId: string
  readonly getPlayerState: () => number
  readonly getVideoUrl: () => string
  readonly loadGeneration: number
}

export type PlayerBindingValidation =
  | {
      status: 'valid'
      playbackState: YouTubePlaybackState
    }
  | {
      status: 'stale'
    }
  | {
      status: 'invalid'
      message: string
    }

export interface PlayerBindingError {
  loadGeneration: number
  message: string
}

export interface RecorderControllerSnapshot {
  errorMessage: string | null
  eventOrder: readonly string[]
  microphoneSettings: AppliedMicrophoneSettings | null
  playerBindingError: PlayerBindingError | null
  recordedByteCount: number
  recorderMimeType: string | null
  result: CompletedRecording | null
  state: RecorderState
}

interface ActiveAttempt {
  chunks: Blob[]
  cleanupRecorderListeners: Array<() => void>
  finalisationRequested: boolean
  generation: number
  recorder: RecorderAdapter
  videoId: string
  watchdogActive: boolean
  watchdogHandle: unknown
}

function describePermissionError(error: unknown) {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : ''

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission was denied. Allow microphone access and try again.'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a microphone and try again.'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone could not be opened. Close other audio apps and try again.'
  }

  return 'Microphone access failed. Check browser permission settings and try again.'
}

function describeRecorderError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `The recorder reported an error: ${error.message}`
  }

  return 'The recorder reported an error. The microphone has been stopped; try again.'
}

function readRecorderMimeType(
  recorder: RecorderAdapter,
  selectedMimeType: string | undefined,
) {
  try {
    return recorder.mimeType || selectedMimeType || 'Browser default'
  } catch {
    return selectedMimeType || 'Browser default'
  }
}

export class RecorderController {
  readonly #actor = createActor(recorderMachine)
  readonly #dependencies: RecorderDependencies
  readonly #listeners = new Set<() => void>()
  #activeAttempt: ActiveAttempt | null = null
  #cleanupTrackListeners: Array<() => void> = []
  #disableAfterFinalisation = false
  #disposed = false
  #generation = 0
  #intentionalTrackShutdown = false
  #playerBinding: RecorderPlayerBinding | null = null
  #playerChangeShutdown: {
    promise: Promise<void>
    resolve: () => void
  } | null = null
  #playerState: PlayerPlaybackState = 'stopped'
  #practiceEnabled = false
  #snapshot: RecorderControllerSnapshot = {
    errorMessage: null,
    eventOrder: [],
    microphoneSettings: null,
    playerBindingError: null,
    recordedByteCount: 0,
    recorderMimeType: null,
    result: null,
    state: 'disabled',
  }
  #stream: MicrophoneStream | null = null

  constructor(dependencies: RecorderDependencies) {
    this.#dependencies = dependencies
    this.#actor.subscribe((snapshot) => {
      this.#publish({ state: snapshot.value as RecorderState })
    })
    this.#actor.start()
  }

  readonly getSnapshot = () => this.#snapshot

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  bindPlayer(binding: RecorderPlayerBinding): PlayerBindingValidation {
    if (this.#disposed) {
      return { status: 'stale' }
    }

    const validation = this.#readPlayerBinding(binding)
    if (validation.status !== 'valid') {
      if (validation.status === 'invalid') {
        this.#invalidatePlayerBinding(binding, validation.message)
      }
      return validation
    }

    this.#playerBinding = binding
    this.#playerState = this.#toControllerPlayerState(validation.playbackState)
    this.#publish({ playerBindingError: null })
    return validation
  }

  enable() {
    if (
      this.#disposed ||
      !['disabled', 'error'].includes(this.#snapshot.state)
    ) {
      return
    }

    const binding = this.#playerBinding
    if (binding === null) {
      return
    }

    const validation = this.#validateCurrentPlayerBinding(binding)
    if (validation.status !== 'valid') {
      return
    }

    this.#playerState = this.#toControllerPlayerState(validation.playbackState)

    const generation = ++this.#generation
    this.#practiceEnabled = true
    this.#disableAfterFinalisation = false
    this.#publish({ errorMessage: null, microphoneSettings: null })
    this.#actor.send({ type: 'ENABLE' })

    if (!this.#dependencies.microphone.isAvailable()) {
      this.#fail(
        'This browser cannot request microphone access. Use a current supported browser and try again.',
      )
      return
    }

    if (!this.#dependencies.recorders.isAvailable()) {
      this.#fail(
        'This browser does not support microphone recording. Use a current supported browser and try again.',
      )
      return
    }

    void this.#requestMicrophone(generation)
  }

  disable() {
    if (this.#disposed || this.#snapshot.state === 'disabled') {
      return
    }

    this.#practiceEnabled = false

    if (
      this.#snapshot.state === 'recording' ||
      this.#snapshot.state === 'buffering'
    ) {
      this.#disableAfterFinalisation = true
      this.#requestFinalisation()
      return
    }

    if (this.#snapshot.state === 'finalising') {
      this.#disableAfterFinalisation = true
      return
    }

    ++this.#generation
    this.#disableAfterFinalisation = false
    this.#intentionalTrackShutdown = true
    this.#stopCurrentStream()
    this.#publish({ errorMessage: null })
    this.#actor.send({ type: 'DISABLE' })
  }

  playerPlaying(binding: RecorderPlayerBinding) {
    return this.#handlePlayerStateChange(binding)
  }

  playerBuffering(binding: RecorderPlayerBinding) {
    return this.#handlePlayerStateChange(binding)
  }

  playerStopped(binding: RecorderPlayerBinding) {
    return this.#handlePlayerStateChange(binding)
  }

  validatePlaybackAction(binding: RecorderPlayerBinding) {
    const validation = this.#validateCurrentPlayerBinding(binding)
    if (validation.status === 'valid') {
      this.#playerState = this.#toControllerPlayerState(
        validation.playbackState,
      )
    }

    return validation
  }

  shutdownForPlayerChange(): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve()
    }

    this.#playerBinding = null
    this.#playerState = 'stopped'

    if (this.#playerChangeShutdown !== null) {
      return this.#playerChangeShutdown.promise
    }

    let resolveShutdown: () => void = () => {
      // Assigned by the promise constructor below.
    }
    const promise = new Promise<void>((resolve) => {
      resolveShutdown = resolve
    })
    this.#playerChangeShutdown = { promise, resolve: resolveShutdown }
    this.#practiceEnabled = false

    if (
      ['buffering', 'recording'].includes(this.#snapshot.state) &&
      this.#activeAttempt !== null
    ) {
      this.#disableAfterFinalisation = true
      this.#requestFinalisation()
      return promise
    }

    if (this.#snapshot.state === 'finalising') {
      this.#disableAfterFinalisation = true
      return promise
    }

    ++this.#generation
    this.#disableAfterFinalisation = false
    this.#intentionalTrackShutdown = true
    this.#stopCurrentStream()
    this.#publish({ errorMessage: null })
    if (this.#snapshot.state !== 'disabled') {
      this.#actor.send({ type: 'DISABLE' })
    }
    this.#settlePlayerChangeShutdown()
    return promise
  }

  interrupt(message: string) {
    if (
      this.#disposed ||
      ![
        'armed',
        'buffering',
        'finalising',
        'recording',
        'requestingMic',
      ].includes(this.#snapshot.state)
    ) {
      return
    }

    this.#fail(message)
  }

  discardCompletedRecording() {
    const result = this.#snapshot.result

    if (result === null) {
      return
    }

    this.#revokeObjectUrl(result.objectUrl)
    this.#publish({ result: null })
  }

  dispose() {
    if (this.#disposed) {
      return
    }

    this.#disposed = true
    this.#practiceEnabled = false
    this.#playerBinding = null
    this.#playerState = 'stopped'
    ++this.#generation
    this.#intentionalTrackShutdown = true
    this.#releaseActiveAttempt(true)
    this.#stopCurrentStream()
    this.discardCompletedRecording()
    this.#actor.stop()
    this.#listeners.clear()
    const shutdown = this.#playerChangeShutdown
    this.#playerChangeShutdown = null
    shutdown?.resolve()
  }

  #handlePlayerStateChange(
    binding: RecorderPlayerBinding,
  ): PlayerBindingValidation {
    const validation = this.#validateCurrentPlayerBinding(binding)
    if (validation.status !== 'valid') {
      return validation
    }

    const playerState = this.#toControllerPlayerState(validation.playbackState)
    this.#playerState = playerState

    if (!this.#practiceEnabled) {
      return validation
    }

    if (playerState === 'playing') {
      if (this.#snapshot.state === 'armed') {
        this.#startAttempt()
      } else if (this.#snapshot.state === 'buffering') {
        this.#resumeAttempt()
      }
      return validation
    }

    if (playerState === 'buffering') {
      if (this.#snapshot.state === 'recording') {
        this.#pauseAttempt()
      }
      return validation
    }

    if (['buffering', 'recording'].includes(this.#snapshot.state)) {
      this.#requestFinalisation()
    }
    return validation
  }

  #readPlayerBinding(binding: RecorderPlayerBinding): PlayerBindingValidation {
    let playerUrl: string
    try {
      playerUrl = binding.getVideoUrl()
    } catch {
      return {
        status: 'invalid',
        message:
          'The YouTube player could not verify the requested video. Remove the player and load the URL again.',
      }
    }

    const parsedUrl = parseYouTubeVideoUrl(playerUrl)
    if (parsedUrl.status !== 'valid') {
      return {
        status: 'invalid',
        message:
          'The YouTube player returned an unverified video URL. The player was removed; load the video again.',
      }
    }

    if (parsedUrl.videoId !== binding.expectedVideoId) {
      return {
        status: 'invalid',
        message: `The player loaded video ${parsedUrl.videoId} instead of ${binding.expectedVideoId}. The player was removed; load the intended video again.`,
      }
    }

    let state: number
    try {
      state = binding.getPlayerState()
    } catch {
      return {
        status: 'invalid',
        message:
          'The YouTube player could not report its playback state. The player was removed; load the video again.',
      }
    }

    return {
      status: 'valid',
      playbackState: parseYouTubePlaybackState(state) ?? 'unstarted',
    }
  }

  #validateCurrentPlayerBinding(
    binding: RecorderPlayerBinding,
  ): PlayerBindingValidation {
    if (this.#disposed || this.#playerBinding !== binding) {
      return { status: 'stale' }
    }

    const validation = this.#readPlayerBinding(binding)
    if (validation.status === 'invalid') {
      this.#invalidatePlayerBinding(binding, validation.message)
    }
    return validation
  }

  #invalidatePlayerBinding(binding: RecorderPlayerBinding, message: string) {
    if (this.#playerBinding !== null && this.#playerBinding !== binding) {
      return
    }

    this.#publish({
      playerBindingError: {
        loadGeneration: binding.loadGeneration,
        message,
      },
    })
    void this.shutdownForPlayerChange()
  }

  #toControllerPlayerState(state: YouTubePlaybackState): PlayerPlaybackState {
    if (state === 'playing') {
      return 'playing'
    }
    if (state === 'buffering') {
      return 'buffering'
    }
    return 'stopped'
  }

  #settlePlayerChangeShutdown() {
    if (
      this.#playerChangeShutdown === null ||
      (!this.#disposed && this.#snapshot.state !== 'disabled')
    ) {
      return
    }

    const shutdown = this.#playerChangeShutdown
    this.#playerChangeShutdown = null
    shutdown.resolve()
  }

  async #requestMicrophone(generation: number) {
    let stream: MicrophoneStream

    try {
      stream = await this.#dependencies.microphone.request()
    } catch (error) {
      if (
        !this.#disposed &&
        generation === this.#generation &&
        this.#snapshot.state === 'requestingMic'
      ) {
        this.#fail(describePermissionError(error))
      }
      return
    }

    const binding = this.#playerBinding
    const bindingValidation =
      binding === null
        ? ({ status: 'stale' } as const)
        : this.#validateCurrentPlayerBinding(binding)

    if (
      this.#disposed ||
      !this.#practiceEnabled ||
      generation !== this.#generation ||
      this.#snapshot.state !== 'requestingMic' ||
      bindingValidation.status !== 'valid'
    ) {
      this.#stopStream(stream)
      return
    }

    this.#playerState = this.#toControllerPlayerState(
      bindingValidation.playbackState,
    )

    this.#stream = stream
    this.#intentionalTrackShutdown = false
    this.#watchTracks(stream, generation)
    this.#publish({
      microphoneSettings: readAppliedMicrophoneSettings(stream),
    })
    this.#actor.send({ type: 'MICROPHONE_GRANTED' })

    if (
      this.#practiceEnabled &&
      generation === this.#generation &&
      this.getSnapshot().state === 'armed' &&
      this.#playerState === 'playing'
    ) {
      this.#startAttempt()
    }
  }

  #startAttempt() {
    const stream = this.#stream
    const binding = this.#playerBinding

    if (
      this.#disposed ||
      !this.#practiceEnabled ||
      this.#playerState !== 'playing' ||
      this.#snapshot.state !== 'armed' ||
      stream === null ||
      binding === null
    ) {
      return
    }

    const bindingValidation = this.#validateCurrentPlayerBinding(binding)
    if (
      bindingValidation.status !== 'valid' ||
      bindingValidation.playbackState !== 'playing'
    ) {
      return
    }

    const selectedMimeType = selectRecorderMimeType(
      this.#dependencies.recorders,
    )
    let recorder: RecorderAdapter

    try {
      recorder = this.#dependencies.recorders.create(stream, selectedMimeType)
    } catch (error) {
      this.#fail(describeRecorderError(error))
      return
    }

    const attempt: ActiveAttempt = {
      chunks: [],
      cleanupRecorderListeners: [],
      finalisationRequested: false,
      generation: this.#generation,
      recorder,
      videoId: binding.expectedVideoId,
      watchdogActive: false,
      watchdogHandle: undefined,
    }
    this.#activeAttempt = attempt
    this.#watchRecorder(attempt)
    this.#publish({
      errorMessage: null,
      eventOrder: [],
      recordedByteCount: 0,
      recorderMimeType: readRecorderMimeType(recorder, selectedMimeType),
    })
    this.#actor.send({ type: 'PLAYER_PLAYING' })

    try {
      recorder.start(recordingTimesliceMilliseconds)
    } catch (error) {
      this.#fail(describeRecorderError(error))
    }
  }

  #pauseAttempt() {
    const attempt = this.#activeAttempt

    if (
      this.#disposed ||
      this.#snapshot.state !== 'recording' ||
      attempt === null
    ) {
      return
    }

    try {
      attempt.recorder.pause()
      if (this.#isCurrentAttempt(attempt)) {
        this.#actor.send({ type: 'PLAYER_BUFFERING' })
      }
    } catch (error) {
      this.#fail(describeRecorderError(error))
    }
  }

  #resumeAttempt() {
    const attempt = this.#activeAttempt
    const binding = this.#playerBinding

    if (
      this.#disposed ||
      this.#snapshot.state !== 'buffering' ||
      attempt === null ||
      binding === null
    ) {
      return
    }

    const bindingValidation = this.#validateCurrentPlayerBinding(binding)
    if (
      bindingValidation.status !== 'valid' ||
      bindingValidation.playbackState !== 'playing'
    ) {
      return
    }

    try {
      attempt.recorder.resume()
      if (this.#isCurrentAttempt(attempt)) {
        this.#actor.send({ type: 'PLAYER_PLAYING' })
      }
    } catch (error) {
      this.#fail(describeRecorderError(error))
    }
  }

  #requestFinalisation() {
    const attempt = this.#activeAttempt

    if (
      this.#disposed ||
      !['buffering', 'recording'].includes(this.#snapshot.state) ||
      attempt === null ||
      attempt.finalisationRequested
    ) {
      return
    }

    attempt.finalisationRequested = true
    this.#actor.send({ type: 'PLAYER_STOPPED' })
    attempt.watchdogActive = true
    attempt.watchdogHandle = this.#dependencies.clock.setTimeout(() => {
      if (
        this.#isCurrentAttempt(attempt) &&
        attempt.watchdogActive &&
        this.#snapshot.state === 'finalising'
      ) {
        this.#fail(
          'Recording did not finish within five seconds. The microphone has been stopped; try again.',
        )
      }
    }, finalisationWatchdogMilliseconds)

    try {
      attempt.recorder.stop()
    } catch (error) {
      this.#fail(describeRecorderError(error))
    }
  }

  #watchRecorder(attempt: ActiveAttempt) {
    const eventTypes: RecorderEventType[] = [
      'start',
      'pause',
      'resume',
      'dataavailable',
      'stop',
      'error',
    ]

    for (const type of eventTypes) {
      const cleanup = attempt.recorder.on(type, (event) => {
        if (!this.#isCurrentAttempt(attempt)) {
          return
        }

        if (type === 'dataavailable') {
          const size = event.data?.size ?? 0
          this.#appendEvent(`dataavailable (${size} bytes)`)
          if (event.data !== undefined && size > 0) {
            attempt.chunks.push(event.data)
            this.#publish({
              recordedByteCount:
                this.#snapshot.recordedByteCount + event.data.size,
            })
          }
          return
        }

        this.#appendEvent(type)

        if (type === 'error') {
          this.#fail(describeRecorderError(event.error))
          return
        }

        if (type === 'stop') {
          this.#completeFinalisation(attempt)
        }
      })
      attempt.cleanupRecorderListeners.push(cleanup)
    }
  }

  #watchTracks(stream: MicrophoneStream, generation: number) {
    this.#cleanupTrackListeners = []

    for (const track of stream.getTracks()) {
      if (track.addEventListener === undefined) {
        continue
      }

      const listener: EventListener = () => {
        if (
          this.#intentionalTrackShutdown ||
          generation !== this.#generation ||
          this.#stream !== stream
        ) {
          return
        }

        this.#fail(
          'The microphone disconnected during practice. Every microphone track has been stopped; try again.',
        )
      }

      track.addEventListener('ended', listener)
      this.#cleanupTrackListeners.push(() => {
        track.removeEventListener?.('ended', listener)
      })
    }
  }

  #completeFinalisation(attempt: ActiveAttempt) {
    if (
      !this.#isCurrentAttempt(attempt) ||
      this.#snapshot.state !== 'finalising'
    ) {
      return
    }

    this.#clearWatchdog(attempt)

    const chunks = attempt.chunks.filter((chunk) => chunk.size > 0)
    const mimeType =
      this.#snapshot.recorderMimeType === 'Browser default'
        ? chunks.find((chunk) => chunk.type.length > 0)?.type
        : (this.#snapshot.recorderMimeType ?? undefined)
    const blob = new Blob(
      chunks,
      mimeType === undefined ? undefined : { type: mimeType },
    )

    if (blob.size === 0) {
      this.#fail(
        'The recorder returned no audio. Check the selected microphone and try again.',
      )
      return
    }

    let objectUrl: string

    try {
      objectUrl = this.#dependencies.objectUrls.create(blob)
    } catch (error) {
      this.#fail(describeRecorderError(error))
      return
    }

    const previousResult = this.#snapshot.result
    const completedRecording: CompletedRecording = {
      byteLength: blob.size,
      mimeType: blob.type || 'Browser default',
      objectUrl,
      videoId: attempt.videoId,
    }

    this.#releaseActiveAttempt(false)
    if (previousResult !== null) {
      this.#revokeObjectUrl(previousResult.objectUrl)
    }
    this.#publish({
      errorMessage: null,
      recordedByteCount: completedRecording.byteLength,
      recorderMimeType: completedRecording.mimeType,
      result: completedRecording,
    })

    if (!this.#practiceEnabled || this.#disableAfterFinalisation) {
      this.#disableAfterFinalisation = false
      ++this.#generation
      this.#intentionalTrackShutdown = true
      this.#stopCurrentStream()
      this.#actor.send({ type: 'FINALISED_DISABLED' })
      this.#settlePlayerChangeShutdown()
      return
    }

    this.#actor.send({ type: 'FINALISED' })
    if (this.#playerState === 'playing') {
      this.#startAttempt()
    }
  }

  #fail(message: string) {
    if (this.#disposed) {
      return
    }

    this.#practiceEnabled = false
    this.#disableAfterFinalisation = false
    ++this.#generation
    this.#intentionalTrackShutdown = true

    this.#releaseActiveAttempt(true)
    this.#stopCurrentStream()
    this.#publish({ errorMessage: message })
    this.#actor.send({ type: 'FAILURE' })
    if (this.#playerChangeShutdown !== null) {
      this.#actor.send({ type: 'DISABLE' })
      this.#settlePlayerChangeShutdown()
    }
  }

  #releaseActiveAttempt(stopRecorder: boolean) {
    const attempt = this.#activeAttempt

    if (attempt === null) {
      return
    }

    this.#clearWatchdog(attempt)
    this.#activeAttempt = null
    attempt.chunks = []
    for (const cleanup of attempt.cleanupRecorderListeners.splice(0)) {
      cleanup()
    }

    if (stopRecorder) {
      try {
        if (attempt.recorder.state !== 'inactive') {
          attempt.recorder.stop()
        }
      } catch {
        // Track shutdown below remains the fail-safe.
      }
    }
  }

  #clearWatchdog(attempt: ActiveAttempt) {
    if (!attempt.watchdogActive) {
      return
    }

    attempt.watchdogActive = false
    this.#dependencies.clock.clearTimeout(attempt.watchdogHandle)
  }

  #stopCurrentStream() {
    const stream = this.#stream
    this.#stream = null
    for (const cleanup of this.#cleanupTrackListeners.splice(0)) {
      cleanup()
    }
    if (stream !== null) {
      this.#stopStream(stream)
    }
  }

  #stopStream(stream: MicrophoneStream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop()
      } catch {
        // Continue stopping every remaining track.
      }
    }
  }

  #revokeObjectUrl(url: string) {
    try {
      this.#dependencies.objectUrls.revoke(url)
    } catch {
      // A failed browser cleanup must not destabilise the controller.
    }
  }

  #appendEvent(eventName: string) {
    this.#publish({
      eventOrder: [...this.#snapshot.eventOrder, eventName],
    })
  }

  #isCurrentAttempt(attempt: ActiveAttempt) {
    return (
      !this.#disposed &&
      this.#activeAttempt === attempt &&
      attempt.generation === this.#generation
    )
  }

  #publish(changes: Partial<RecorderControllerSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...changes }
    for (const listener of this.#listeners) {
      listener()
    }
  }
}
