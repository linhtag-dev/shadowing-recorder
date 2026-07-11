import { createActor } from 'xstate'
import { describe, expect, it, vi } from 'vitest'

import {
  createFakeRecorderEnvironment,
  FakeRecorderFactory,
  FakeStream,
  FakeTrack,
} from '../test/recorderFakes.js'
import { FakeYouTubePlayer } from '../test/playerFakes.js'
import { selectRecorderMimeType } from './browserCapabilities.js'
import {
  RecorderController,
  type RecorderPlayerBinding,
} from './RecorderController.js'
import { recorderMachine } from './recorderMachine.js'

async function waitForState(
  controller: RecorderController,
  state: ReturnType<RecorderController['getSnapshot']>['state'],
) {
  await vi.waitFor(() => {
    expect(controller.getSnapshot().state).toBe(state)
  })
}

interface BoundTestPlayer {
  binding: RecorderPlayerBinding
  player: FakeYouTubePlayer
}

function bindTestPlayer(
  controller: RecorderController,
  videoId = 'stage1_test',
  loadGeneration = 1,
): BoundTestPlayer {
  const player = new FakeYouTubePlayer(videoId)
  const binding = Object.freeze({
    expectedVideoId: videoId,
    getPlayerState: () => player.getPlayerState(),
    getVideoUrl: () => player.getVideoUrl(),
    loadGeneration,
  })
  expect(controller.bindPlayer(binding).status).toBe('valid')
  return { binding, player }
}

function sendPlayerState(
  controller: RecorderController,
  boundPlayer: BoundTestPlayer,
  state: 'buffering' | 'playing' | 'stopped',
) {
  boundPlayer.player.playerState =
    state === 'playing' ? 1 : state === 'buffering' ? 3 : 2
  if (state === 'playing') {
    return controller.playerPlaying(boundPlayer.binding)
  }
  if (state === 'buffering') {
    return controller.playerBuffering(boundPlayer.binding)
  }
  return controller.playerStopped(boundPlayer.binding)
}

async function enablePracticeMode(
  controller: RecorderController,
  boundPlayer = bindTestPlayer(controller),
) {
  controller.enable()
  await waitForState(controller, 'armed')
  return boundPlayer
}

async function startPlayerDrivenAttempt(
  controller: RecorderController,
  boundPlayer = bindTestPlayer(controller),
) {
  await enablePracticeMode(controller, boundPlayer)
  sendPlayerState(controller, boundPlayer, 'playing')
  await waitForState(controller, 'recording')
  return boundPlayer
}

function finishRecording(
  controller: RecorderController,
  recorder: ReturnType<
    typeof createFakeRecorderEnvironment
  >['recorderFactory']['recorders'][number],
  boundPlayer: BoundTestPlayer,
  contents = 'voice',
) {
  sendPlayerState(controller, boundPlayer, 'stopped')
  recorder.emitData(new Blob([contents], { type: recorder.mimeType }))
  recorder.emitStop()
}

describe('recorderMachine', () => {
  it('serialises player-connected Practice Mode states', () => {
    const actor = createActor(recorderMachine).start()

    expect(actor.getSnapshot().value).toBe('disabled')
    actor.send({ type: 'ENABLE' })
    expect(actor.getSnapshot().value).toBe('requestingMic')
    actor.send({ type: 'MICROPHONE_GRANTED' })
    expect(actor.getSnapshot().value).toBe('armed')
    actor.send({ type: 'PLAYER_PLAYING' })
    expect(actor.getSnapshot().value).toBe('recording')
    actor.send({ type: 'PLAYER_BUFFERING' })
    expect(actor.getSnapshot().value).toBe('buffering')
    actor.send({ type: 'PLAYER_PLAYING' })
    expect(actor.getSnapshot().value).toBe('recording')
    actor.send({ type: 'PLAYER_STOPPED' })
    expect(actor.getSnapshot().value).toBe('finalising')
    actor.send({ type: 'FINALISED' })
    expect(actor.getSnapshot().value).toBe('armed')
    actor.send({ type: 'DISABLE' })
    expect(actor.getSnapshot().value).toBe('disabled')
    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'FAILURE' })
    expect(actor.getSnapshot().value).toBe('error')
  })
})

describe('selectRecorderMimeType', () => {
  it('prefers Opus/WebM, then Opus/Ogg, then MP4, with a default fallback', () => {
    const factory = new FakeRecorderFactory()

    expect(selectRecorderMimeType(factory)).toBe('audio/webm;codecs=opus')

    factory.supportedMimeTypes = new Set(['audio/ogg;codecs=opus'])
    expect(selectRecorderMimeType(factory)).toBe('audio/ogg;codecs=opus')

    factory.supportedMimeTypes = new Set(['audio/mp4'])
    expect(selectRecorderMimeType(factory)).toBe('audio/mp4')

    factory.supportedMimeTypes.clear()
    expect(selectRecorderMimeType(factory)).toBeUndefined()
  })
})

describe('RecorderController', () => {
  it('arms first, follows player buffering, and finalises on player pause', async () => {
    const environment = createFakeRecorderEnvironment(
      new FakeStream([new FakeTrack(), new FakeTrack()]),
    )
    const controller = new RecorderController(environment.dependencies)

    const boundPlayer = await enablePracticeMode(controller)
    expect(environment.recorderFactory.recorders).toHaveLength(0)

    sendPlayerState(controller, boundPlayer, 'playing')
    await waitForState(controller, 'recording')

    const recorder = environment.recorderFactory.recorders[0]
    expect(recorder?.startCalls).toEqual([1_000])
    expect(environment.recorderFactory.createCalls).toEqual([
      'audio/webm;codecs=opus',
    ])

    sendPlayerState(controller, boundPlayer, 'buffering')
    expect(controller.getSnapshot().state).toBe('buffering')
    sendPlayerState(controller, boundPlayer, 'playing')
    expect(controller.getSnapshot().state).toBe('recording')
    sendPlayerState(controller, boundPlayer, 'stopped')
    expect(controller.getSnapshot().state).toBe('finalising')

    recorder?.emitData(new Blob([], { type: 'audio/webm;codecs=opus' }))
    recorder?.emitData(new Blob(['voice'], { type: 'audio/webm;codecs=opus' }))
    expect(controller.getSnapshot().state).toBe('finalising')
    recorder?.emitStop()

    expect(controller.getSnapshot()).toMatchObject({
      eventOrder: [
        'start',
        'pause',
        'resume',
        'dataavailable (0 bytes)',
        'dataavailable (5 bytes)',
        'stop',
      ],
      recordedByteCount: 5,
      microphoneSettings: {
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: false,
        latency: 0.01,
        noiseSuppression: false,
        sampleRate: 48_000,
        sampleSize: 16,
      },
      recorderMimeType: 'audio/webm;codecs=opus',
      result: {
        byteLength: 5,
        mimeType: 'audio/webm;codecs=opus',
        objectUrl: 'blob:recording-1',
        videoId: 'stage1_test',
      },
      state: 'armed',
    })
    expect(environment.stream.tracks.map((track) => track.stopCalls)).toEqual([
      0, 0,
    ])
    expect(environment.clock.tasks.size).toBe(0)

    controller.disable()
    expect(controller.getSnapshot().state).toBe('disabled')
    expect(environment.stream.tracks.map((track) => track.stopCalls)).toEqual([
      1, 1,
    ])
  })

  it('reconciles video playback after microphone permission resolves', async () => {
    const environment = createFakeRecorderEnvironment()
    let resolvePermission: ((stream: FakeStream) => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = resolve
      })
    const controller = new RecorderController(environment.dependencies)
    const boundPlayer = bindTestPlayer(controller)

    sendPlayerState(controller, boundPlayer, 'playing')
    controller.enable()
    expect(controller.getSnapshot().state).toBe('requestingMic')
    sendPlayerState(controller, boundPlayer, 'stopped')
    resolvePermission?.(environment.stream)
    await waitForState(controller, 'armed')
    expect(environment.recorderFactory.recorders).toHaveLength(0)

    sendPlayerState(controller, boundPlayer, 'playing')
    expect(controller.getSnapshot().state).toBe('recording')
  })

  it('reports permission denial and allows an explicit retry', async () => {
    const environment = createFakeRecorderEnvironment()
    environment.microphone.requestImplementation = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
    const controller = new RecorderController(environment.dependencies)
    bindTestPlayer(controller)

    controller.enable()
    await waitForState(controller, 'error')
    expect(controller.getSnapshot().errorMessage).toContain(
      'Microphone permission was denied',
    )

    environment.microphone.requestImplementation = async () =>
      environment.stream
    controller.enable()
    await waitForState(controller, 'armed')
    expect(environment.microphone.requestCalls).toBe(2)
  })

  it.each([
    ['microphone', 'cannot request microphone access'],
    ['recorder', 'does not support microphone recording'],
  ] as const)(
    'fails visibly when the %s API is unavailable',
    (api, message) => {
      const environment = createFakeRecorderEnvironment()
      if (api === 'microphone') {
        environment.microphone.available = false
      } else {
        environment.recorderFactory.available = false
      }
      const controller = new RecorderController(environment.dependencies)
      bindTestPlayer(controller)

      controller.enable()

      expect(controller.getSnapshot()).toMatchObject({
        errorMessage: expect.stringContaining(message),
        state: 'error',
      })
      expect(environment.microphone.requestCalls).toBe(0)
    },
  )

  it('uses the browser default when no preferred MIME type is supported', async () => {
    const environment = createFakeRecorderEnvironment()
    environment.recorderFactory.supportedMimeTypes.clear()
    environment.recorderFactory.defaultMimeType = 'audio/mp4'
    const controller = new RecorderController(environment.dependencies)

    await startPlayerDrivenAttempt(controller)

    expect(environment.recorderFactory.createCalls).toEqual([undefined])
    expect(controller.getSnapshot().recorderMimeType).toBe('audio/mp4')
  })

  it('rejects empty output only after stop and shuts down Practice Mode', async () => {
    const firstTrack = new FakeTrack()
    const secondTrack = new FakeTrack()
    firstTrack.throwOnStop = true
    const environment = createFakeRecorderEnvironment(
      new FakeStream([firstTrack, secondTrack]),
    )
    const controller = new RecorderController(environment.dependencies)

    const boundPlayer = await startPlayerDrivenAttempt(controller)
    const recorder = environment.recorderFactory.recorders[0]
    sendPlayerState(controller, boundPlayer, 'stopped')
    recorder?.emitData(new Blob([]))
    expect(controller.getSnapshot().state).toBe('finalising')
    recorder?.emitStop()

    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: expect.stringContaining('returned no audio'),
      result: null,
      state: 'error',
    })
    expect(firstTrack.stopCalls).toBe(1)
    expect(secondTrack.stopCalls).toBe(1)
    expect(environment.objectUrls.blobs).toHaveLength(0)
  })

  it('fails safely on recorder errors and unexpected track endings', async () => {
    const environment = createFakeRecorderEnvironment(
      new FakeStream([new FakeTrack(), new FakeTrack()]),
    )
    const controller = new RecorderController(environment.dependencies)

    await startPlayerDrivenAttempt(controller)
    environment.recorderFactory.recorders[0]?.emitError(
      new Error('encoder exploded'),
    )

    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: 'The recorder reported an error: encoder exploded',
      state: 'error',
    })
    expect(environment.stream.tracks.map((track) => track.stopCalls)).toEqual([
      1, 1,
    ])

    const retryStream = new FakeStream([new FakeTrack(), new FakeTrack()])
    environment.microphone.requestImplementation = async () => retryStream
    controller.enable()
    await waitForState(controller, 'recording')
    retryStream.tracks[0]?.endUnexpectedly()

    expect(controller.getSnapshot().errorMessage).toContain(
      'microphone disconnected',
    )
    expect(retryStream.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
  })

  it('bounds finalisation with a five-second watchdog and ignores late events', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)
    bindTestPlayer(controller)

    const boundPlayer = await startPlayerDrivenAttempt(controller)
    const recorder = environment.recorderFactory.recorders[0]
    sendPlayerState(controller, boundPlayer, 'stopped')
    expect(environment.clock.tasks.size).toBe(1)
    expect(environment.clock.delays).toEqual([5_000])

    environment.clock.runAll()

    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: expect.stringContaining('within five seconds'),
      result: null,
      state: 'error',
    })
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    recorder?.emitData(new Blob(['late']))
    recorder?.emitStop()
    expect(controller.getSnapshot().result).toBeNull()
  })

  it('stops a late permission stream after lifecycle interruption', async () => {
    const environment = createFakeRecorderEnvironment()
    let resolvePermission: ((stream: FakeStream) => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = resolve
      })
    const controller = new RecorderController(environment.dependencies)
    bindTestPlayer(controller)

    controller.enable()
    expect(controller.getSnapshot().state).toBe('requestingMic')
    controller.interrupt('Practice Mode stopped because the page was hidden.')
    expect(controller.getSnapshot().state).toBe('error')

    resolvePermission?.(environment.stream)
    await vi.waitFor(() => {
      expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    })
    expect(environment.recorderFactory.recorders).toHaveLength(0)
  })

  it('starts a fresh attempt when playback resumes during finalisation', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)

    const boundPlayer = await startPlayerDrivenAttempt(controller)
    const firstRecorder = environment.recorderFactory.recorders[0]
    sendPlayerState(controller, boundPlayer, 'stopped')
    sendPlayerState(controller, boundPlayer, 'playing')
    firstRecorder?.emitData(new Blob(['first']))
    firstRecorder?.emitStop()

    expect(controller.getSnapshot().state).toBe('recording')
    expect(environment.recorderFactory.recorders).toHaveLength(2)
    expect(environment.recorderFactory.recorders[1]?.startCalls).toEqual([
      1_000,
    ])
  })

  it('finishes an active attempt before disabling and stopping tracks', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)

    await startPlayerDrivenAttempt(controller)
    const recorder = environment.recorderFactory.recorders[0]
    controller.disable()
    expect(controller.getSnapshot().state).toBe('finalising')
    expect(environment.stream.tracks[0]?.stopCalls).toBe(0)

    recorder?.emitData(new Blob(['voice']))
    recorder?.emitStop()

    expect(controller.getSnapshot().state).toBe('disabled')
    expect(controller.getSnapshot().result?.objectUrl).toBe('blob:recording-1')
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('revokes replaced and disposed URLs while reusing one armed stream', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)

    const boundPlayer = await startPlayerDrivenAttempt(controller)
    const firstRecorder = environment.recorderFactory.recorders[0]
    if (firstRecorder === undefined) {
      throw new Error('first recorder was not created')
    }
    finishRecording(controller, firstRecorder, boundPlayer, 'first')
    expect(controller.getSnapshot().result?.objectUrl).toBe('blob:recording-1')

    sendPlayerState(controller, boundPlayer, 'playing')
    await waitForState(controller, 'recording')
    const secondRecorder = environment.recorderFactory.recorders[1]
    if (secondRecorder === undefined) {
      throw new Error('second recorder was not created')
    }
    finishRecording(controller, secondRecorder, boundPlayer, 'second')

    expect(controller.getSnapshot().result?.objectUrl).toBe('blob:recording-2')
    expect(environment.objectUrls.revokedUrls).toEqual(['blob:recording-1'])
    expect(environment.microphone.requestCalls).toBe(1)
    expect(environment.stream.tracks[0]?.stopCalls).toBe(0)

    controller.dispose()
    expect(environment.objectUrls.revokedUrls).toEqual([
      'blob:recording-1',
      'blob:recording-2',
    ])
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('rejects a player whose verified URL does not match its expected ID', () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)
    const player = new FakeYouTubePlayer('stage2_test')
    const binding = Object.freeze({
      expectedVideoId: 'stage1_test',
      getPlayerState: () => player.getPlayerState(),
      getVideoUrl: () => player.getVideoUrl(),
      loadGeneration: 7,
    })

    expect(controller.bindPlayer(binding)).toEqual({
      status: 'invalid',
      message: expect.stringContaining('stage2_test'),
    })
    expect(controller.getSnapshot()).toMatchObject({
      playerBindingError: {
        loadGeneration: 7,
        message: expect.stringContaining('instead of stage1_test'),
      },
      state: 'disabled',
    })
    controller.enable()
    expect(environment.microphone.requestCalls).toBe(0)
  })

  it('revalidates identity immediately after microphone permission resolves', async () => {
    const environment = createFakeRecorderEnvironment()
    let resolvePermission: ((stream: FakeStream) => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = resolve
      })
    const controller = new RecorderController(environment.dependencies)
    const boundPlayer = bindTestPlayer(controller)

    controller.enable()
    expect(controller.getSnapshot().state).toBe('requestingMic')
    boundPlayer.player.videoUrl = 'https://www.youtube.com/watch?v=stage2_test'
    resolvePermission?.(environment.stream)

    await vi.waitFor(() => {
      expect(controller.getSnapshot().state).toBe('disabled')
      expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    })
    expect(controller.getSnapshot().playerBindingError?.message).toContain(
      'instead of stage1_test',
    )
    expect(environment.recorderFactory.recorders).toHaveLength(0)
  })

  it('finalises through an idempotent, awaitable player-change shutdown', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)

    await startPlayerDrivenAttempt(controller)
    const recorder = environment.recorderFactory.recorders[0]
    const firstShutdown = controller.shutdownForPlayerChange()
    const secondShutdown = controller.shutdownForPlayerChange()
    let shutdownResolved = false
    void firstShutdown.then(() => {
      shutdownResolved = true
    })

    expect(secondShutdown).toBe(firstShutdown)
    expect(controller.getSnapshot().state).toBe('finalising')
    expect(shutdownResolved).toBe(false)
    expect(environment.stream.tracks[0]?.stopCalls).toBe(0)

    recorder?.emitData(new Blob(['voice']))
    recorder?.emitStop()
    await firstShutdown

    expect(shutdownResolved).toBe(true)
    expect(controller.getSnapshot()).toMatchObject({
      result: { videoId: 'stage1_test' },
      state: 'disabled',
    })
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('bounds player-change shutdown with the existing finalisation watchdog', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)

    await startPlayerDrivenAttempt(controller)
    const shutdown = controller.shutdownForPlayerChange()
    environment.clock.runAll()
    await shutdown

    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: expect.stringContaining('within five seconds'),
      state: 'disabled',
    })
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('rejects stale callbacks after a newer player binding is active', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)
    const firstPlayer = bindTestPlayer(controller, 'stage1_test', 1)

    await controller.shutdownForPlayerChange()
    const secondPlayer = bindTestPlayer(controller, 'stage2_test', 2)
    expect(sendPlayerState(controller, firstPlayer, 'playing')).toEqual({
      status: 'stale',
    })

    controller.enable()
    await waitForState(controller, 'armed')
    sendPlayerState(controller, secondPlayer, 'playing')
    expect(controller.getSnapshot().state).toBe('recording')
    expect(environment.recorderFactory.recorders).toHaveLength(1)
  })
})
