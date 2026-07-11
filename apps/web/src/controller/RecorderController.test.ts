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

function finishRecording(
  controller: RecorderController,
  recorder: ReturnType<
    typeof createFakeRecorderEnvironment
  >['recorderFactory']['recorders'][number],
  contents = 'voice',
) {
  controller.stop()
  recorder.emitData(new Blob([contents], { type: recorder.mimeType }))
  recorder.emitStop()
}

describe('recorderMachine', () => {
  it('serialises every Stage 1 controller state', () => {
    const actor = createActor(recorderMachine).start()

    expect(actor.getSnapshot().value).toBe('idle')
    actor.send({ type: 'START' })
    expect(actor.getSnapshot().value).toBe('requestingMic')
    actor.send({ type: 'MICROPHONE_GRANTED' })
    expect(actor.getSnapshot().value).toBe('recording')
    actor.send({ type: 'PAUSE' })
    expect(actor.getSnapshot().value).toBe('paused')
    actor.send({ type: 'RESUME' })
    expect(actor.getSnapshot().value).toBe('recording')
    actor.send({ type: 'STOP' })
    expect(actor.getSnapshot().value).toBe('finalising')
    actor.send({ type: 'FINALISED' })
    expect(actor.getSnapshot().value).toBe('ready')
    actor.send({ type: 'START' })
    actor.send({ type: 'FAILURE' })
    expect(actor.getSnapshot().value).toBe('error')
    actor.send({ type: 'RESET' })
    expect(actor.getSnapshot().value).toBe('idle')
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
  it('records with a one-second timeslice and preserves asynchronous stop ordering', async () => {
    const environment = createFakeRecorderEnvironment(
      new FakeStream([new FakeTrack(), new FakeTrack()]),
    )
    const controller = new RecorderController(environment.dependencies)

    controller.start()
    await waitForState(controller, 'recording')

    const recorder = environment.recorderFactory.recorders[0]
    expect(recorder?.startCalls).toEqual([1_000])
    expect(environment.recorderFactory.createCalls).toEqual([
      'audio/webm;codecs=opus',
    ])

    controller.pause()
    expect(controller.getSnapshot().state).toBe('paused')
    controller.resume()
    expect(controller.getSnapshot().state).toBe('recording')
    controller.stop()
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
      recorderMimeType: 'audio/webm;codecs=opus',
      result: {
        byteLength: 5,
        mimeType: 'audio/webm;codecs=opus',
        objectUrl: 'blob:recording-1',
      },
      state: 'ready',
    })
    expect(environment.stream.tracks.map((track) => track.stopCalls)).toEqual([
      1, 1,
    ])
    expect(environment.clock.tasks.size).toBe(0)
  })

  it('reports permission denial and allows an explicit retry', async () => {
    const environment = createFakeRecorderEnvironment()
    environment.microphone.requestImplementation = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
    const controller = new RecorderController(environment.dependencies)

    controller.start()
    await waitForState(controller, 'error')
    expect(controller.getSnapshot().errorMessage).toContain(
      'Microphone permission was denied',
    )

    environment.microphone.requestImplementation = async () =>
      environment.stream
    controller.start()
    await waitForState(controller, 'recording')
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

      controller.start()

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

    controller.start()
    await waitForState(controller, 'recording')

    expect(environment.recorderFactory.createCalls).toEqual([undefined])
    expect(controller.getSnapshot().recorderMimeType).toBe('audio/mp4')
  })

  it('rejects empty output only after the final stop event and stops every track', async () => {
    const firstTrack = new FakeTrack()
    const secondTrack = new FakeTrack()
    firstTrack.throwOnStop = true
    const environment = createFakeRecorderEnvironment(
      new FakeStream([firstTrack, secondTrack]),
    )
    const controller = new RecorderController(environment.dependencies)

    controller.start()
    await waitForState(controller, 'recording')
    const recorder = environment.recorderFactory.recorders[0]
    controller.stop()
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

    controller.start()
    await waitForState(controller, 'recording')
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
    controller.start()
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

    controller.start()
    await waitForState(controller, 'recording')
    const recorder = environment.recorderFactory.recorders[0]
    controller.stop()
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

    controller.start()
    expect(controller.getSnapshot().state).toBe('requestingMic')
    controller.interrupt(
      'Recording stopped because the page was hidden. Try again.',
    )
    expect(controller.getSnapshot().state).toBe('error')

    resolvePermission?.(environment.stream)
    await vi.waitFor(() => {
      expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    })
    expect(environment.recorderFactory.recorders).toHaveLength(0)
  })

  it('revokes replaced and disposed object URLs while retaining only the latest result', async () => {
    const environment = createFakeRecorderEnvironment()
    const controller = new RecorderController(environment.dependencies)

    controller.start()
    await waitForState(controller, 'recording')
    const firstRecorder = environment.recorderFactory.recorders[0]
    if (firstRecorder === undefined) {
      throw new Error('first recorder was not created')
    }
    finishRecording(controller, firstRecorder, 'first')
    expect(controller.getSnapshot().result?.objectUrl).toBe('blob:recording-1')

    controller.start()
    await waitForState(controller, 'recording')
    expect(environment.objectUrls.revokedUrls).toEqual([])
    const secondRecorder = environment.recorderFactory.recorders[1]
    if (secondRecorder === undefined) {
      throw new Error('second recorder was not created')
    }
    finishRecording(controller, secondRecorder, 'second')

    expect(controller.getSnapshot().result?.objectUrl).toBe('blob:recording-2')
    expect(environment.objectUrls.revokedUrls).toEqual(['blob:recording-1'])

    controller.dispose()
    expect(environment.objectUrls.revokedUrls).toEqual([
      'blob:recording-1',
      'blob:recording-2',
    ])
  })
})
