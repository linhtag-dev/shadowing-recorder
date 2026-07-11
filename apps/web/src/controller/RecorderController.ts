import { createActor } from 'xstate'

import type {
  MicrophoneStream,
  RecorderAdapter,
  RecorderDependencies,
  RecorderEventType,
} from './browserCapabilities.js'
import { selectRecorderMimeType } from './browserCapabilities.js'
import { recorderMachine, type RecorderState } from './recorderMachine.js'

const finalisationWatchdogMilliseconds = 5_000
const recordingTimesliceMilliseconds = 1_000

export interface CompletedRecording {
  byteLength: number
  mimeType: string
  objectUrl: string
}

export interface RecorderControllerSnapshot {
  errorMessage: string | null
  eventOrder: readonly string[]
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
  #disposed = false
  #generation = 0
  #intentionalTrackShutdown = false
  #snapshot: RecorderControllerSnapshot = {
    errorMessage: null,
    eventOrder: [],
    recordedByteCount: 0,
    recorderMimeType: null,
    result: null,
    state: 'idle',
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

  start() {
    if (
      this.#disposed ||
      !['error', 'idle', 'ready'].includes(this.#snapshot.state)
    ) {
      return
    }

    const generation = ++this.#generation

    this.#publish({
      errorMessage: null,
      eventOrder: [],
      recordedByteCount: 0,
      recorderMimeType: null,
    })
    this.#actor.send({ type: 'START' })

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

  pause() {
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
        this.#actor.send({ type: 'PAUSE' })
      }
    } catch (error) {
      this.#fail(describeRecorderError(error))
    }
  }

  resume() {
    const attempt = this.#activeAttempt

    if (
      this.#disposed ||
      this.#snapshot.state !== 'paused' ||
      attempt === null
    ) {
      return
    }

    try {
      attempt.recorder.resume()
      if (this.#isCurrentAttempt(attempt)) {
        this.#actor.send({ type: 'RESUME' })
      }
    } catch (error) {
      this.#fail(describeRecorderError(error))
    }
  }

  stop() {
    const attempt = this.#activeAttempt

    if (
      this.#disposed ||
      !['paused', 'recording'].includes(this.#snapshot.state) ||
      attempt === null ||
      attempt.finalisationRequested
    ) {
      return
    }

    attempt.finalisationRequested = true
    this.#actor.send({ type: 'STOP' })
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

  interrupt(message: string) {
    if (
      this.#disposed ||
      !['finalising', 'paused', 'recording', 'requestingMic'].includes(
        this.#snapshot.state,
      )
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
    ++this.#generation
    this.#intentionalTrackShutdown = true
    this.#releaseActiveAttempt(true)
    this.#stopCurrentStream()
    this.discardCompletedRecording()
    this.#actor.stop()
    this.#listeners.clear()
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

    if (
      this.#disposed ||
      generation !== this.#generation ||
      this.#snapshot.state !== 'requestingMic'
    ) {
      this.#stopStream(stream)
      return
    }

    this.#stream = stream
    this.#intentionalTrackShutdown = false
    this.#watchTracks(stream, generation)

    if (
      generation !== this.#generation ||
      this.#snapshot.state !== 'requestingMic'
    ) {
      this.#stopCurrentStream()
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
      generation,
      recorder,
      watchdogActive: false,
      watchdogHandle: undefined,
    }
    this.#activeAttempt = attempt
    this.#watchRecorder(attempt)
    this.#publish({
      recorderMimeType: readRecorderMimeType(recorder, selectedMimeType),
    })

    try {
      recorder.start(recordingTimesliceMilliseconds)
    } catch (error) {
      this.#fail(describeRecorderError(error))
      return
    }

    if (
      this.#isCurrentAttempt(attempt) &&
      this.#snapshot.state === 'requestingMic'
    ) {
      this.#actor.send({ type: 'MICROPHONE_GRANTED' })
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
          'The microphone disconnected during recording. Every microphone track has been stopped; try again.',
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
    this.#intentionalTrackShutdown = true
    this.#stopCurrentStream()

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
    this.#actor.send({ type: 'FINALISED' })
  }

  #fail(message: string) {
    if (this.#disposed) {
      return
    }

    ++this.#generation
    this.#intentionalTrackShutdown = true

    this.#releaseActiveAttempt(true)
    this.#stopCurrentStream()
    this.#publish({ errorMessage: message })
    this.#actor.send({ type: 'FAILURE' })
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
