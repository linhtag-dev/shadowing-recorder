import { createActor } from 'xstate'
import { describe, expect, it, vi } from 'vitest'

import {
  createFakeRecorderEnvironment,
  FakeRecorderFactory,
  FakeStream,
  FakeTrack,
} from '../test/recorderFakes.js'
import { selectRecorderMimeType } from './browserCapabilities.js'
import { RecorderController } from './RecorderController.js'
import { recorderMachine } from './recorderMachine.js'

async function waitForState(
  controller: RecorderController,
  state: ReturnType<RecorderController['getSnapshot']>['state'],
) {
  await vi.waitFor(() => {
    expect(controller.getSnapshot().state).toBe(state)
  })
}

async function enablePracticeMode(controller: RecorderController) {
  controller.enable()
  await waitForState(controller, 'armed')
}

async function startPlayerDrivenAttempt(controller: RecorderController) {
  await enablePracticeMode(controller)
  controller.playerPlaying()
  await waitForState(controller, 'recording')
}

function finishRecording(
  controller: RecorderController,
  recorder: ReturnType<
    typeof createFakeRecorderEnvironment
  >['recorderFactory']['recorders'][number],
  contents = 'voice',
) {
  controller.playerStopped()
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

    await enablePracticeMode(controller)
    expect(environment.recorderFactory.recorders).toHaveLength(0)

    controller.playerPlaying()
    await waitForState(controller, 'recording')

    const recorder = environment.recorderFactory.recorders[0]
    expect(recorder?.startCalls).toEqual([1_000])
    expect(environment.recorderFactory.createCalls).toEqual([
      'audio/webm;codecs=opus',
    ])

    controller.playerBuffering()
    expect(controller.getSnapshot().state).toBe('buffering')
    controller.playerPlaying()
    expect(controller.getSnapshot().state).toBe('recording')
    controller.playerStopped()
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

    controller.playerPlaying()
    controller.enable()
    expect(controller.getSnapshot().state).toBe('requestingMic')
    controller.playerStopped()
    resolvePermission?.(environment.stream)
    await waitForState(controller, 'armed')
    expect(environment.recorderFactory.recorders).toHaveLength(0)

    controller.playerPlaying()
    expect(controller.getSnapshot().state).toBe('recording')
  })

  it('reports permission denial and allows an explicit retry', async () => {
    const environment = createFakeRecorderEnvironment()
    environment.microphone.requestImplementation = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
    const controller = new RecorderController(environment.dependencies)

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

    await startPlayerDrivenAttempt(controller)
    const recorder = environment.recorderFactory.recorders[0]
    controller.playerStopped()
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

    await startPlayerDrivenAttempt(controller)
    const recorder = environment.recorderFactory.recorders[0]
    controller.playerStopped()
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

    await startPlayerDrivenAttempt(controller)
    const firstRecorder = environment.recorderFactory.recorders[0]
    controller.playerStopped()
    controller.playerPlaying()
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

    await startPlayerDrivenAttempt(controller)
    const firstRecorder = environment.recorderFactory.recorders[0]
    if (firstRecorder === undefined) {
      throw new Error('first recorder was not created')
    }
    finishRecording(controller, firstRecorder, 'first')
    expect(controller.getSnapshot().result?.objectUrl).toBe('blob:recording-1')

    controller.playerPlaying()
    await waitForState(controller, 'recording')
    const secondRecorder = environment.recorderFactory.recorders[1]
    if (secondRecorder === undefined) {
      throw new Error('second recorder was not created')
    }
    finishRecording(controller, secondRecorder, 'second')

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
})
