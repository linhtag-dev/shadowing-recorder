import type { Clock } from './browserCapabilities.js'
import {
  RecorderController,
  type RecorderPlayerBinding,
} from './RecorderController.js'
import type {
  YouTubePlaybackState,
  YouTubePlayerInstance,
} from '../player/youTubePlayer.js'

export type ListenFirstPhase = 'reference' | 'record' | 'listen'

export interface ListenFirstSnapshot {
  phase: ListenFirstPhase
  started: boolean
  busy: boolean
  needsPlayback: boolean
  message: string | null
}

interface LearnerAudio {
  src: string
  currentTime: number
  pause(): void
  play(): Promise<void>
}

const learnerPlaybackTimeoutMilliseconds = 5_000

const initialSnapshot: ListenFirstSnapshot = {
  phase: 'reference',
  started: false,
  busy: false,
  needsPlayback: false,
  message: null,
}

/** Owns the sequential practice intent; RecorderController remains the sole mic owner. */
export class ListenFirstController {
  readonly #recorder: RecorderController
  readonly #clock: Clock
  #audio: LearnerAudio | null = null
  readonly #listeners = new Set<() => void>()
  #unsubscribe: () => void = () => undefined
  #snapshot = initialSnapshot
  #player: YouTubePlayerInstance | null = null
  #binding: RecorderPlayerBinding | null = null
  #generation = 0
  #cancelWait: (() => void) | null = null
  #cancelPlayback: (() => void) | null = null
  #replayPending = false
  #segmentTimer: unknown
  #segmentStart: number | null = null
  #segmentEnd: number | null = null

  constructor(recorder: RecorderController, clock: Clock) {
    this.#recorder = recorder
    this.#clock = clock
  }

  connect() {
    const recorder = this.#recorder
    this.#unsubscribe = recorder.subscribe(() => {
      const state = recorder.getSnapshot()
      if (
        state.mode !== 'listen-first' ||
        ['disabled', 'error'].includes(state.state)
      ) {
        this.stop()
      }
    })
    return this.#unsubscribe
  }

  setAudio(audio: LearnerAudio | null) {
    this.#audio = audio
  }

  readonly getSnapshot = () => this.#snapshot
  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  bindPlayer(player: YouTubePlayerInstance, binding: RecorderPlayerBinding) {
    this.stop()
    this.#player = player
    this.#binding = binding
  }

  stop() {
    ++this.#generation
    this.#cancelWait?.()
    this.#cancelPlayback?.()
    this.#clearSegmentTimer()
    if (this.#recorder.getSnapshot().mode === 'listen-first') this.#stopAudio()
    this.#segmentStart = null
    this.#segmentEnd = null
    this.#replayPending = false
    this.#publish(initialSnapshot)
  }

  dispose() {
    this.stop()
    this.#unsubscribe()
    this.#listeners.clear()
    this.#player = null
    this.#binding = null
  }

  playerStateChanged(state: YouTubePlaybackState) {
    if (this.#recorder.getSnapshot().mode !== 'listen-first') return
    if (state !== 'playing') {
      if (state !== 'buffering') this.#clearSegmentTimer()
      return
    }
    // Native iframe playback supersedes a recording or reflection intent.
    if (this.#snapshot.phase !== 'reference') {
      this.stop()
      this.#segmentStart = this.#readTime()
      this.#publish({ phase: 'reference', started: true })
    } else if (
      !this.#snapshot.busy &&
      !this.#replayPending &&
      !this.#snapshot.started
    ) {
      this.#segmentStart ??= this.#readTime()
      this.#publish({ started: true, message: null })
    }
    if (!this.#snapshot.busy && !this.#replayPending)
      this.#watchSegment(this.#generation)
  }

  newPassage() {
    if (
      this.#snapshot.busy ||
      this.#recorder.getSnapshot().state !== 'standby' ||
      !this.#valid()
    )
      return
    this.stop()
    this.#player?.pauseVideo()
  }

  learnerPlaybackStarted() {
    const state = this.#recorder.getSnapshot()
    if (
      state.mode !== 'listen-first' ||
      ['disabled', 'error'].includes(state.state)
    )
      return
    if (this.#snapshot.phase === 'listen') {
      this.#publish({ needsPlayback: false, message: null })
      return
    }
    ++this.#generation
    this.#cancelWait?.()
    this.#cancelPlayback?.()
    this.#clearSegmentTimer()
    this.#publish({
      phase: 'listen',
      busy: false,
      needsPlayback: false,
      message: null,
    })
  }

  async advance() {
    const state = this.#recorder.getSnapshot()
    const player = this.#player
    const binding = this.#binding
    if (
      state.mode !== 'listen-first' ||
      ['disabled', 'error', 'finalising'].includes(state.state) ||
      this.#snapshot.busy ||
      player === null ||
      binding === null
    )
      return
    if (!this.#valid()) return
    const generation = ++this.#generation
    this.#clearSegmentTimer()
    this.#publish({ busy: true, message: null })
    try {
      if (this.#snapshot.phase === 'listen' && this.#snapshot.needsPlayback) {
        await this.#playAttempt(generation)
      } else if (
        this.#snapshot.phase === 'listen' ||
        (this.#snapshot.phase === 'reference' && !this.#snapshot.started)
      ) {
        this.#replayPending ||= this.#snapshot.phase === 'listen'
        if (!this.#stopAudio())
          throw new Error('Learner playback could not be stopped')
        this.#segmentStart ??= this.#readTime()
        this.#publish({
          phase: 'reference',
          started: false,
          needsPlayback: false,
        })
        if (this.#replayPending) player.seekTo(this.#segmentStart, true)
        if (!this.#current(generation)) return
        player.playVideo()
        if (!(await this.#waitForPlayer(true, generation))) {
          if (this.#current(generation)) {
            player.pauseVideo()
            this.#publish({
              started: false,
              message:
                'Reference playback did not start. Press Play reference to retry.',
            })
          }
          return
        }
        if (!this.#current(generation)) return
        this.#replayPending = false
        this.#publish({ started: true })
        this.#watchSegment(generation)
      } else if (
        this.#snapshot.phase === 'reference' ||
        state.state === 'standby'
      ) {
        if (!this.#stopAudio())
          throw new Error('Learner playback could not be stopped')
        player.pauseVideo()
        if (!(await this.#waitForPlayer(false, generation))) {
          if (this.#current(generation))
            this.#publish({
              message:
                'The reference could not be paused. Try again before recording.',
            })
          return
        }
        if (!this.#current(generation)) return
        const end = this.#readTime()
        if (
          this.#segmentEnd === null &&
          this.#segmentStart !== null &&
          end > this.#segmentStart
        )
          this.#segmentEnd = end
        this.#publish({ phase: 'record' })
        await this.#recorder.startIndependentRecording(binding)
        if (
          this.#current(generation) &&
          this.#recorder.getSnapshot().state !== 'recording'
        ) {
          this.#publish({
            message: 'Recording did not start. Try recording again.',
          })
        }
      } else if (
        this.#snapshot.phase === 'record' &&
        state.state === 'recording'
      ) {
        const result = await this.#recorder.finishIndependentRecording()
        if (!this.#current(generation)) return
        if (result === null) {
          this.#publish({
            message: 'No playable audio was saved. Try recording again.',
          })
          return
        }
        this.#publish({ phase: 'listen' })
        await this.#playAttempt(generation)
      }
    } catch {
      if (this.#current(generation))
        this.#publish({ message: 'This step could not start. Try again.' })
    } finally {
      if (generation === this.#generation) this.#publish({ busy: false })
    }
  }

  async #playAttempt(generation: number) {
    const audio = this.#audio
    const result = this.#recorder.getSnapshot().result
    if (
      !this.#current(generation) ||
      audio === null ||
      result === null ||
      result.videoId !== this.#binding?.expectedVideoId
    )
      return
    if (!(await this.#waitForPlayer(false, generation))) {
      if (this.#current(generation))
        this.#publish({
          needsPlayback: true,
          message: 'Pause the reference, then press Play my attempt to listen.',
        })
      return
    }
    if (!this.#current(generation)) return
    try {
      if (audio.src !== result.objectUrl) audio.src = result.objectUrl
      audio.currentTime = 0
      const outcome = await this.#startLearnerPlayback(audio)
      if (!this.#current(generation) || outcome === 'cancelled') return
      if (outcome === 'failed') {
        this.#stopAudio()
        this.#offerPlaybackRetry()
      } else {
        this.#publish({ needsPlayback: false })
      }
    } catch {
      if (this.#current(generation)) {
        this.#stopAudio()
        this.#offerPlaybackRetry()
      }
    }
  }

  #offerPlaybackRetry() {
    this.#publish({
      needsPlayback: true,
      message: 'Your attempt is ready. Press Play my attempt to listen.',
    })
  }

  #startLearnerPlayback(
    audio: LearnerAudio,
  ): Promise<'started' | 'failed' | 'cancelled'> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (outcome: 'started' | 'failed' | 'cancelled') => {
        if (settled) return
        settled = true
        this.#clock.clearTimeout(timer)
        this.#cancelPlayback = null
        resolve(outcome)
      }
      this.#cancelPlayback = () => finish('cancelled')
      const timer = this.#clock.setTimeout(
        () => finish('failed'),
        learnerPlaybackTimeoutMilliseconds,
      )
      try {
        void audio.play().then(
          () => finish('started'),
          () => finish('failed'),
        )
      } catch {
        finish('failed')
      }
    })
  }

  #valid() {
    return (
      this.#binding !== null &&
      this.#recorder.validatePlaybackAction(this.#binding).status === 'valid'
    )
  }

  #current(generation: number) {
    return (
      generation === this.#generation &&
      this.#recorder.getSnapshot().mode === 'listen-first' &&
      !['disabled', 'error'].includes(this.#recorder.getSnapshot().state) &&
      this.#valid()
    )
  }

  #readTime() {
    const time = this.#player?.getCurrentTime() ?? 0
    return Number.isFinite(time) && time >= 0 ? time : 0
  }

  #waitForPlayer(playing: boolean, generation: number): Promise<boolean> {
    return new Promise((resolve) => {
      let timer: unknown
      let polls = 0
      const finish = (ready: boolean) => {
        this.#clock.clearTimeout(timer)
        this.#cancelWait = null
        resolve(ready)
      }
      this.#cancelWait = () => finish(false)
      const poll = () => {
        if (!this.#current(generation)) {
          finish(false)
          return
        }
        const state = this.#recorder.validatePlaybackAction(this.#binding!)
        if (state.status !== 'valid') {
          finish(false)
          return
        }
        const active = ['playing', 'buffering'].includes(state.playbackState)
        let ready = playing ? state.playbackState === 'playing' : !active
        // seekTo() is asynchronous. Do not arm the end timer against the old
        // paused position until replay has actually moved back into the passage.
        if (playing && this.#replayPending && this.#segmentEnd !== null) {
          try {
            const time = this.#player?.getCurrentTime()
            ready &&=
              time !== undefined &&
              Number.isFinite(time) &&
              time >= (this.#segmentStart ?? 0) &&
              time < this.#segmentEnd
          } catch {
            finish(false)
            return
          }
        }
        if (ready) {
          finish(true)
          return
        }
        if (++polls > 40) {
          finish(false)
          return
        }
        timer = this.#clock.setTimeout(poll, 50)
      }
      poll()
    })
  }

  #watchSegment(generation: number) {
    this.#clearSegmentTimer()
    if (this.#segmentEnd === null) return
    const poll = () => {
      if (!this.#current(generation) || this.#snapshot.phase !== 'reference')
        return
      try {
        if (this.#readTime() >= this.#segmentEnd!) {
          this.#player?.pauseVideo()
          return
        }
        this.#segmentTimer = this.#clock.setTimeout(poll, 100)
      } catch {
        this.#publish({
          message:
            'Reference position is unavailable. Pause the video before recording.',
        })
      }
    }
    this.#segmentTimer = this.#clock.setTimeout(poll, 100)
  }

  #clearSegmentTimer() {
    this.#clock.clearTimeout(this.#segmentTimer)
    this.#segmentTimer = undefined
  }

  #stopAudio() {
    let paused = true
    const audio = this.#audio
    if (audio !== null) {
      try {
        audio.pause()
      } catch {
        // Cancel other work, but never start another source after this failure.
        paused = false
      }
      try {
        audio.currentTime = 0
      } catch {
        // An unavailable timeline must not block a later playback retry.
      }
    }
    return paused
  }

  #publish(update: Partial<ListenFirstSnapshot>) {
    const next = { ...this.#snapshot, ...update }
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof ListenFirstSnapshot] ===
          this.#snapshot[key as keyof ListenFirstSnapshot],
      )
    )
      return
    this.#snapshot = next
    for (const listener of this.#listeners) listener()
  }
}
