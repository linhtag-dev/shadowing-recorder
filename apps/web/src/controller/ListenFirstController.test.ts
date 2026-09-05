import { describe, expect, it, vi } from 'vitest'
import {
  createFakeRecorderEnvironment,
  FakeStream,
} from '../test/recorderFakes.js'
import { FakeYouTubePlayer } from '../test/playerFakes.js'
import { RecorderController } from './RecorderController.js'
import { ListenFirstController } from './ListenFirstController.js'

async function setup() {
  const environment = createFakeRecorderEnvironment()
  const recorder = new RecorderController(environment.dependencies)
  const player = new FakeYouTubePlayer()
  const binding = Object.freeze({
    expectedVideoId: 'stage1_test',
    loadGeneration: 1,
    getVideoUrl: () => player.getVideoUrl(),
    getPlayerState: () => player.getPlayerState(),
  })
  const audio = {
    src: '',
    currentTime: 0,
    pause: vi.fn(),
    play: vi.fn(async () => undefined),
  }
  const flow = new ListenFirstController(recorder, environment.clock)
  flow.setAudio(audio)
  flow.connect()
  recorder.bindPlayer(binding)
  flow.bindPlayer(player, binding)
  const emitState = (state: 'playing' | 'paused' | 'ended') => {
    player.playerState = state === 'playing' ? 1 : state === 'paused' ? 2 : 0
    if (state === 'playing') recorder.playerPlaying(binding)
    else recorder.playerStopped(binding)
    flow.playerStateChanged(state)
  }
  vi.spyOn(player, 'playVideo').mockImplementation(() => emitState('playing'))
  vi.spyOn(player, 'pauseVideo').mockImplementation(() => emitState('paused'))
  await recorder.changeMode('listen-first')
  recorder.enable()
  const startAttempt = async () => {
    await flow.advance()
    player.currentTime = 18
    await flow.advance()
    expect(recorder.getSnapshot().state).toBe('recording')
    return environment.recorderFactory.recorders.at(-1)!
  }
  const finishAttempt = async (contents = 'voice') => {
    const pending = flow.advance()
    const attempt = environment.recorderFactory.recorders.at(-1)!
    attempt.emitData(new Blob([contents], { type: attempt.mimeType }))
    attempt.emitStop()
    await pending
  }
  return {
    ...environment,
    recorder,
    player,
    binding,
    audio,
    flow,
    emitState,
    startAttempt,
    finishAttempt,
  }
}

describe('Listen first practice', () => {
  it('records only in the explicit record phase, listens to that attempt, and replays the passage', async () => {
    const test = await setup()
    test.player.currentTime = 12
    expect(test.microphone.requestCalls).toBe(0)
    await test.startAttempt()
    expect(test.player.playerState).toBe(2)
    expect(test.microphone.requestCalls).toBe(1)
    test.recorder.playerStopped(test.binding)
    expect(test.recorder.getSnapshot().state).toBe('recording')
    await test.finishAttempt()
    expect(test.flow.getSnapshot().phase).toBe('listen')
    expect(test.audio.src).toBe('blob:recording-1')
    expect(test.audio.play).toHaveBeenCalledOnce()
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    await test.recorder.prepareForReferencePlayback(test.binding)
    expect(test.microphone.requestCalls).toBe(1)
    await test.flow.advance()
    expect(test.player.seekToCalls).toEqual([[12, true]])
    expect(test.audio.pause).toHaveBeenCalled()
    test.player.currentTime = 18
    test.clock.runAll()
    expect(test.player.playerState).toBe(2)
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'reference',
      started: true,
    })
    expect(test.microphone.requestCalls).toBe(1)
    const fresh = new FakeStream()
    test.microphone.requestImplementation = async () => fresh
    await test.flow.advance()
    expect(test.microphone.requestCalls).toBe(2)
    await test.finishAttempt()
    expect(fresh.tracks[0]?.stopCalls).toBe(1)
    expect(test.audio.src).toBe('blob:recording-2')
  })

  it('waits for reference pause confirmation before requesting the microphone', async () => {
    const test = await setup()
    await test.flow.advance()
    vi.mocked(test.player.pauseVideo).mockImplementation(() => undefined)
    const pending = test.flow.advance()
    await test.flow.advance()
    expect(test.microphone.requestCalls).toBe(0)
    test.emitState('paused')
    test.clock.runAll()
    await pending
    expect(test.microphone.requestCalls).toBe(1)
    expect(test.recorder.getSnapshot().state).toBe('recording')
  })

  it('bounds a failed pause without opening the microphone', async () => {
    const test = await setup()
    await test.flow.advance()
    vi.mocked(test.player.pauseVideo).mockImplementation(() => undefined)
    const pending = test.flow.advance()
    for (let i = 0; i < 41; i++) test.clock.runAll()
    await pending
    expect(test.microphone.requestCalls).toBe(0)
    expect(test.flow.getSnapshot().message).toContain('could not be paused')
    expect(test.clock.tasks.size).toBe(0)
  })

  it('waits at reference end and does not record automatically', async () => {
    const test = await setup()
    await test.flow.advance()
    test.emitState('ended')
    expect(test.microphone.requestCalls).toBe(0)
    expect(test.flow.getSnapshot().phase).toBe('reference')
    await test.flow.advance()
    expect(test.recorder.getSnapshot().state).toBe('recording')
  })

  it('serializes permission and finalisation despite repeated advance requests', async () => {
    const test = await setup()
    await test.flow.advance()
    let grant!: (stream: FakeStream) => void
    test.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        grant = resolve
      })
    const starting = test.flow.advance()
    await vi.waitFor(() => expect(test.microphone.requestCalls).toBe(1))
    await test.flow.advance()
    grant(test.stream)
    await starting
    const finishing = test.flow.advance()
    await test.flow.advance()
    const attempt = test.recorderFactory.recorders[0]!
    expect(attempt.stopCalls).toBe(1)
    expect(test.audio.play).not.toHaveBeenCalled()
    attempt.emitData(new Blob(['voice']))
    attempt.emitStop()
    await finishing
    expect(test.audio.play).toHaveBeenCalledOnce()
    expect(test.microphone.requestCalls).toBe(1)
  })

  it('keeps the previous result but does not play it for an empty attempt', async () => {
    const test = await setup()
    await test.startAttempt()
    await test.finishAttempt()
    await test.flow.advance()
    await test.flow.advance()
    test.audio.play.mockClear()
    await test.finishAttempt('')
    expect(test.recorder.getSnapshot().result?.objectUrl).toBe(
      'blob:recording-1',
    )
    expect(test.audio.play).not.toHaveBeenCalled()
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'record',
      busy: false,
    })
    expect(test.flow.getSnapshot().message).toContain('No playable audio')
    await test.flow.advance()
    expect(test.recorder.getSnapshot().state).toBe('recording')
  })

  it('provides a playback retry when the browser rejects automatic learner playback', async () => {
    const test = await setup()
    await test.startAttempt()
    test.audio.play.mockRejectedValueOnce(new Error('play blocked'))
    await test.finishAttempt()
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'listen',
      needsPlayback: true,
    })
    await test.flow.advance()
    expect(test.audio.play).toHaveBeenCalledTimes(2)
    expect(test.flow.getSnapshot().needsPlayback).toBe(false)
    expect(test.player.seekToCalls).toEqual([])
  })

  it('cancels a pending permission request when changing modes and stops the late stream', async () => {
    const test = await setup()
    await test.flow.advance()
    let grant!: (stream: FakeStream) => void
    test.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        grant = resolve
      })
    const starting = test.flow.advance()
    await vi.waitFor(() => expect(test.microphone.requestCalls).toBe(1))
    await test.recorder.changeMode('shadowing')
    grant(test.stream)
    await starting
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    expect(test.recorderFactory.recorders).toHaveLength(0)
    expect(test.recorder.getSnapshot()).toMatchObject({
      mode: 'shadowing',
      state: 'disabled',
    })
  })

  it('finishes a recording before changing modes and cancels queued learner playback', async () => {
    const test = await setup()
    const attempt = await test.startAttempt()
    const finishing = test.flow.advance()
    const changing = test.recorder.changeMode('shadowing')
    expect(test.recorder.getSnapshot().mode).toBe('listen-first')
    attempt.emitData(new Blob(['voice']))
    attempt.emitStop()
    await Promise.all([finishing, changing])
    expect(test.recorder.getSnapshot()).toMatchObject({
      mode: 'shadowing',
      state: 'disabled',
    })
    expect(test.recorder.getSnapshot().result).not.toBeNull()
    expect(test.audio.play).not.toHaveBeenCalled()
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('cancels recording intent when native reference playback resumes during permission', async () => {
    const test = await setup()
    await test.flow.advance()
    let grant!: (stream: FakeStream) => void
    test.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        grant = resolve
      })
    const pending = test.flow.advance()
    await vi.waitFor(() => expect(test.microphone.requestCalls).toBe(1))
    test.emitState('playing')
    grant(test.stream)
    await pending
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    expect(test.recorderFactory.recorders).toHaveLength(0)
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'reference',
      busy: false,
    })
  })

  it('invalidates replacement callbacks and queued playback during finalisation', async () => {
    const test = await setup()
    const attempt = await test.startAttempt()
    const finishing = test.flow.advance()
    test.flow.stop()
    const shutdown = test.recorder.shutdownForPlayerChange()
    attempt.emitData(new Blob(['voice']))
    attempt.emitStop()
    await Promise.all([finishing, shutdown])
    expect(test.audio.play).not.toHaveBeenCalled()
    expect(test.recorder.getSnapshot().state).toBe('disabled')
    expect(test.recorder.getSnapshot().result?.videoId).toBe('stage1_test')
    expect(test.clock.tasks.size).toBe(0)
  })

  it('fails safely on a recorder timeout and preserves a retryable disabled flow', async () => {
    const test = await setup()
    await test.startAttempt()
    const finishing = test.flow.advance()
    test.clock.runAll()
    await finishing
    expect(test.recorder.getSnapshot().state).toBe('error')
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    expect(test.audio.play).not.toHaveBeenCalled()
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'reference',
      busy: false,
      started: false,
    })
  })

  it('does not acquire a microphone when disable supersedes an already confirmed pause', async () => {
    const test = await setup()
    await test.flow.advance()
    const pending = test.flow.advance()
    test.flow.stop()
    test.recorder.disable()
    await pending
    expect(test.microphone.requestCalls).toBe(0)
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'reference',
      started: false,
    })
  })

  it('settles finalisation and mode-change waiters on disposal without playback', async () => {
    const test = await setup()
    await test.startAttempt()
    const finishing = test.flow.advance()
    const changing = test.recorder.changeMode('shadowing')
    test.flow.dispose()
    test.recorder.dispose()
    await Promise.all([finishing, changing])
    expect(test.audio.play).not.toHaveBeenCalled()
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    expect(test.clock.tasks.size).toBe(0)
  })

  it('rejects video identity drift after microphone permission without creating a recorder', async () => {
    const test = await setup()
    await test.flow.advance()
    test.microphone.requestImplementation = async () => {
      test.player.videoUrl = 'https://www.youtube.com/watch?v=stage2_test'
      return test.stream
    }
    await test.flow.advance()
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    expect(test.recorderFactory.recorders).toHaveLength(0)
    expect(test.recorder.getSnapshot().state).toBe('disabled')
    expect(test.audio.play).not.toHaveBeenCalled()
  })

  it('releases the microphone if reference playback changes at the final start check', async () => {
    const test = await setup()
    const originalState = test.binding.getPlayerState
    let reads = 0
    test.microphone.requestImplementation = async () => {
      vi.spyOn(test.player, 'getPlayerState').mockImplementation(() =>
        ++reads === 1 ? 2 : 1,
      )
      return test.stream
    }
    await test.flow.advance()
    await test.flow.advance()
    expect(test.stream.tracks[0]?.stopCalls).toBe(1)
    expect(test.recorderFactory.recorders).toHaveLength(0)
    expect(test.recorder.getSnapshot().state).toBe('standby')
    expect(originalState()).toBe(1)
  })
  it('waits for an asynchronous replay seek before applying the passage end', async () => {
    const test = await setup()
    test.player.currentTime = 12
    await test.startAttempt()
    await test.finishAttempt()
    vi.spyOn(test.player, 'seekTo').mockImplementation(() => undefined)
    const pauses = test.player.pauseVideoCalls
    const replay = test.flow.advance()
    await Promise.resolve()
    test.clock.runAll()
    await Promise.resolve()
    expect(test.flow.getSnapshot().busy).toBe(true)
    expect(test.player.pauseVideoCalls).toBe(pauses)
    test.player.currentTime = 12
    test.clock.runAll()
    await replay
    test.player.currentTime = 18
    test.clock.runAll()
    expect(test.player.playerState).toBe(2)
  })

  it('does not treat buffering as confirmed reference playback', async () => {
    const test = await setup()
    vi.mocked(test.player.playVideo).mockImplementation(() => {
      test.player.playerState = 3
    })
    const starting = test.flow.advance()
    await Promise.resolve()
    expect(test.flow.getSnapshot().busy).toBe(true)
    expect(test.flow.getSnapshot().started).toBe(false)
    test.emitState('playing')
    test.clock.runAll()
    await starting
    expect(test.flow.getSnapshot()).toMatchObject({
      busy: false,
      started: true,
    })
  })

  it('offers retry when learner playback never settles and ignores its late completion', async () => {
    const test = await setup()
    await test.startAttempt()
    let resolvePlayback!: () => void
    test.audio.play.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePlayback = resolve
        }),
    )
    const finishing = test.finishAttempt()
    await vi.waitFor(() => expect(test.audio.play).toHaveBeenCalledOnce())
    test.clock.runAll()
    await vi.waitFor(() =>
      expect(test.flow.getSnapshot().needsPlayback).toBe(true),
    )
    await finishing
    expect(test.flow.getSnapshot().busy).toBe(false)
    const pauses = test.audio.pause.mock.calls.length
    resolvePlayback()
    await Promise.resolve()
    expect(test.flow.getSnapshot().needsPlayback).toBe(true)
    expect(test.audio.pause.mock.calls.length).toBeGreaterThanOrEqual(pauses)
    await test.flow.advance()
    expect(test.audio.play).toHaveBeenCalledTimes(2)
    expect(test.flow.getSnapshot().needsPlayback).toBe(false)
  })

  it('settles a pending learner play when practice is disabled', async () => {
    const test = await setup()
    await test.startAttempt()
    let resolvePlayback!: () => void
    test.audio.play.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePlayback = resolve
        }),
    )
    let finished = false
    const finishing = test.finishAttempt().then(() => {
      finished = true
    })
    await vi.waitFor(() => expect(test.audio.play).toHaveBeenCalledOnce())
    test.recorder.disable()
    await vi.waitFor(() => expect(finished).toBe(true))
    expect(test.clock.tasks.size).toBe(0)
    resolvePlayback()
    await finishing
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'reference',
      started: false,
    })
  })

  it('offers learner playback retry when resetting its position throws', async () => {
    const test = await setup()
    await test.startAttempt()
    Object.defineProperty(test.audio, 'currentTime', {
      configurable: true,
      get: () => 0,
      set: () => {
        throw new Error('media position unavailable')
      },
    })
    await test.finishAttempt()
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'listen',
      busy: false,
      needsPlayback: true,
    })
    Object.defineProperty(test.audio, 'currentTime', {
      configurable: true,
      writable: true,
      value: 0,
    })
    await test.flow.advance()
    expect(test.audio.play).toHaveBeenCalledOnce()
    expect(test.player.seekToCalls).toEqual([])
  })

  it('retries the original replay seek after its first seek times out', async () => {
    const test = await setup()
    test.player.currentTime = 12
    await test.startAttempt()
    await test.finishAttempt()
    const seek = vi
      .spyOn(test.player, 'seekTo')
      .mockImplementationOnce(() => undefined)
    const replay = test.flow.advance()
    for (let i = 0; i < 41; i++) test.clock.runAll()
    await replay
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'reference',
      started: false,
      busy: false,
    })
    expect(test.player.playerState).toBe(2)
    await test.flow.advance()
    expect(seek).toHaveBeenCalledTimes(2)
    expect(seek).toHaveBeenLastCalledWith(12, true)
    expect(test.flow.getSnapshot()).toMatchObject({
      started: true,
      message: null,
    })
  })

  it('does not start the reference when learner audio cannot be stopped', async () => {
    const test = await setup()
    await test.startAttempt()
    await test.finishAttempt()
    test.audio.pause.mockImplementationOnce(() => {
      throw new Error('audio stop failed')
    })
    const plays = vi.mocked(test.player.playVideo).mock.calls.length
    await test.flow.advance()
    expect(test.player.playVideo).toHaveBeenCalledTimes(plays)
    expect(test.flow.getSnapshot()).toMatchObject({
      phase: 'listen',
      busy: false,
    })
    await test.flow.advance()
    expect(test.flow.getSnapshot().phase).toBe('reference')
  })
})
