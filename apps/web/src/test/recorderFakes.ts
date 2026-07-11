import type {
  Clock,
  MicrophoneProvider,
  MicrophoneStream,
  MicrophoneTrack,
  MicrophoneTrackSettings,
  ObjectUrlProvider,
  RecorderAdapter,
  RecorderDependencies,
  RecorderEvent,
  RecorderEventType,
  RecorderFactory,
} from '../controller/browserCapabilities.js'

export class FakeClock implements Clock {
  readonly delays: number[] = []
  readonly tasks = new Map<number, () => void>()
  #nextHandle = 1

  readonly clearTimeout = (handle: unknown) => {
    if (typeof handle === 'number') {
      this.tasks.delete(handle)
    }
  }

  readonly setTimeout = (callback: () => void, delayMilliseconds: number) => {
    const handle = this.#nextHandle++
    this.delays.push(delayMilliseconds)
    this.tasks.set(handle, callback)
    return handle
  }

  runAll() {
    const callbacks = [...this.tasks.values()]
    this.tasks.clear()
    for (const callback of callbacks) {
      callback()
    }
  }
}

export class FakeTrack implements MicrophoneTrack {
  readonly endedListeners = new Set<EventListener>()
  stopCalls = 0
  throwOnStop = false

  constructor(
    readonly settings: MicrophoneTrackSettings = {
      autoGainControl: false,
      channelCount: 1,
      echoCancellation: false,
      latency: 0.01,
      noiseSuppression: false,
      sampleRate: 48_000,
      sampleSize: 16,
    },
  ) {}

  readonly addEventListener = (_type: 'ended', listener: EventListener) => {
    this.endedListeners.add(listener)
  }

  readonly removeEventListener = (_type: 'ended', listener: EventListener) => {
    this.endedListeners.delete(listener)
  }

  readonly getSettings = () => this.settings

  stop() {
    ++this.stopCalls
    if (this.throwOnStop) {
      throw new Error('track stop failed')
    }
  }

  endUnexpectedly() {
    for (const listener of this.endedListeners) {
      listener(new Event('ended'))
    }
  }
}

export class FakeStream implements MicrophoneStream {
  constructor(readonly tracks: FakeTrack[] = [new FakeTrack()]) {}

  getTracks() {
    return this.tracks
  }
}

type RecorderListener = (event: RecorderEvent) => void

export class FakeRecorder implements RecorderAdapter {
  readonly listeners = new Map<RecorderEventType, Set<RecorderListener>>()
  pauseCalls = 0
  resumeCalls = 0
  startCalls: number[] = []
  state: 'inactive' | 'paused' | 'recording' = 'inactive'
  stopCalls = 0
  throwOnPause = false
  throwOnResume = false
  throwOnStart = false
  throwOnStop = false

  constructor(readonly mimeType: string) {}

  readonly on = (type: RecorderEventType, listener: RecorderListener) => {
    const listeners = this.listeners.get(type) ?? new Set<RecorderListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)

    return () => {
      listeners.delete(listener)
    }
  }

  pause() {
    ++this.pauseCalls
    if (this.throwOnPause) {
      throw new Error('pause failed')
    }
    this.state = 'paused'
    this.emit('pause')
  }

  resume() {
    ++this.resumeCalls
    if (this.throwOnResume) {
      throw new Error('resume failed')
    }
    this.state = 'recording'
    this.emit('resume')
  }

  start(timeslice: number) {
    this.startCalls.push(timeslice)
    if (this.throwOnStart) {
      throw new Error('start failed')
    }
    this.state = 'recording'
    this.emit('start')
  }

  stop() {
    ++this.stopCalls
    if (this.throwOnStop) {
      throw new Error('stop failed')
    }
    this.state = 'inactive'
  }

  emit(type: RecorderEventType, event: RecorderEvent = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  emitData(data: Blob) {
    this.emit('dataavailable', { data })
  }

  emitError(error: unknown) {
    this.emit('error', { error })
  }

  emitStop() {
    this.state = 'inactive'
    this.emit('stop')
  }
}

export class FakeMicrophoneProvider implements MicrophoneProvider {
  available = true
  requestCalls = 0
  requestImplementation: () => Promise<MicrophoneStream>

  constructor(stream: MicrophoneStream) {
    this.requestImplementation = async () => stream
  }

  readonly isAvailable = () => this.available

  readonly request = () => {
    ++this.requestCalls
    return this.requestImplementation()
  }
}

export class FakeRecorderFactory implements RecorderFactory {
  available = true
  createCalls: Array<string | undefined> = []
  defaultMimeType = 'audio/browser-default'
  readonly recorders: FakeRecorder[] = []
  supportedMimeTypes = new Set<string>(['audio/webm;codecs=opus'])

  readonly create = (_stream: MicrophoneStream, mimeType?: string) => {
    this.createCalls.push(mimeType)
    const recorder = new FakeRecorder(mimeType ?? this.defaultMimeType)
    this.recorders.push(recorder)
    return recorder
  }

  readonly isAvailable = () => this.available

  readonly isTypeSupported = (mimeType: string) =>
    this.supportedMimeTypes.has(mimeType)
}

export class FakeObjectUrlProvider implements ObjectUrlProvider {
  readonly blobs: Blob[] = []
  readonly revokedUrls: string[] = []

  readonly create = (blob: Blob) => {
    this.blobs.push(blob)
    return `blob:recording-${this.blobs.length}`
  }

  readonly revoke = (url: string) => {
    this.revokedUrls.push(url)
  }
}

export interface FakeRecorderEnvironment {
  clock: FakeClock
  dependencies: RecorderDependencies
  microphone: FakeMicrophoneProvider
  objectUrls: FakeObjectUrlProvider
  recorderFactory: FakeRecorderFactory
  stream: FakeStream
}

export function createFakeRecorderEnvironment(
  stream = new FakeStream(),
): FakeRecorderEnvironment {
  const clock = new FakeClock()
  const microphone = new FakeMicrophoneProvider(stream)
  const objectUrls = new FakeObjectUrlProvider()
  const recorderFactory = new FakeRecorderFactory()

  return {
    clock,
    dependencies: {
      clock,
      microphone,
      objectUrls,
      recorders: recorderFactory,
    },
    microphone,
    objectUrls,
    recorderFactory,
    stream,
  }
}
