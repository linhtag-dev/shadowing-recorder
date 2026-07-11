export type RecorderEventType =
  'dataavailable' | 'error' | 'pause' | 'resume' | 'start' | 'stop'

export interface RecorderEvent {
  data?: Blob
  error?: unknown
}

export interface AppliedMicrophoneSettings {
  autoGainControl: boolean | null
  channelCount: number | null
  echoCancellation: boolean | string | null
  latency: number | null
  noiseSuppression: boolean | null
  sampleRate: number | null
  sampleSize: number | null
}

export interface MicrophoneTrackSettings {
  autoGainControl?: boolean | undefined
  channelCount?: number | undefined
  echoCancellation?: boolean | string | undefined
  latency?: number | undefined
  noiseSuppression?: boolean | undefined
  sampleRate?: number | undefined
  sampleSize?: number | undefined
}

export interface MicrophoneTrack {
  addEventListener?: (type: 'ended', listener: EventListener) => void
  getSettings?: () => MicrophoneTrackSettings
  removeEventListener?: (type: 'ended', listener: EventListener) => void
  stop: () => void
}

export interface MicrophoneStream {
  getTracks: () => readonly MicrophoneTrack[]
}

export interface MicrophoneProvider {
  isAvailable: () => boolean
  request: () => Promise<MicrophoneStream>
}

export interface RecorderAdapter {
  readonly mimeType: string
  readonly state: 'inactive' | 'paused' | 'recording'
  on: (
    type: RecorderEventType,
    listener: (event: RecorderEvent) => void,
  ) => () => void
  pause: () => void
  resume: () => void
  start: (timeslice: number) => void
  stop: () => void
}

export interface RecorderFactory {
  create: (stream: MicrophoneStream, mimeType?: string) => RecorderAdapter
  isAvailable: () => boolean
  isTypeSupported: (mimeType: string) => boolean
}

export interface ObjectUrlProvider {
  create: (blob: Blob) => string
  revoke: (url: string) => void
}

export interface Clock {
  clearTimeout: (handle: unknown) => void
  setTimeout: (callback: () => void, delayMilliseconds: number) => unknown
}

export interface RecorderDependencies {
  clock: Clock
  microphone: MicrophoneProvider
  objectUrls: ObjectUrlProvider
  recorders: RecorderFactory
}

export const unprocessedMicrophoneConstraints = {
  autoGainControl: false,
  echoCancellation: false,
  noiseSuppression: false,
} as const satisfies MediaTrackConstraints

export const recorderMimeTypeCandidates = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const

export function selectRecorderMimeType(
  recorderFactory: RecorderFactory,
): string | undefined {
  for (const mimeType of recorderMimeTypeCandidates) {
    try {
      if (recorderFactory.isTypeSupported(mimeType)) {
        return mimeType
      }
    } catch {
      // A browser-default recorder is still worth trying.
    }
  }

  return undefined
}

export function readAppliedMicrophoneSettings(
  stream: MicrophoneStream,
): AppliedMicrophoneSettings | null {
  const track = stream.getTracks()[0]
  if (track?.getSettings === undefined) {
    return null
  }

  try {
    const settings = track.getSettings()
    return {
      autoGainControl: settings.autoGainControl ?? null,
      channelCount: settings.channelCount ?? null,
      echoCancellation: settings.echoCancellation ?? null,
      latency: settings.latency ?? null,
      noiseSuppression: settings.noiseSuppression ?? null,
      sampleRate: settings.sampleRate ?? null,
      sampleSize: settings.sampleSize ?? null,
    }
  } catch {
    return null
  }
}

class NativeRecorderAdapter implements RecorderAdapter {
  readonly #recorder: MediaRecorder

  constructor(recorder: MediaRecorder) {
    this.#recorder = recorder
  }

  get mimeType() {
    return this.#recorder.mimeType
  }

  get state() {
    return this.#recorder.state
  }

  on(type: RecorderEventType, listener: (event: RecorderEvent) => void) {
    const nativeListener: EventListener = (event) => {
      if (type === 'dataavailable') {
        listener({ data: (event as BlobEvent).data })
        return
      }

      if (type === 'error') {
        listener({
          error:
            'error' in event
              ? (event as Event & { error?: unknown }).error
              : undefined,
        })
        return
      }

      listener({})
    }

    this.#recorder.addEventListener(type, nativeListener)

    return () => {
      this.#recorder.removeEventListener(type, nativeListener)
    }
  }

  pause() {
    this.#recorder.pause()
  }

  resume() {
    this.#recorder.resume()
  }

  start(timeslice: number) {
    this.#recorder.start(timeslice)
  }

  stop() {
    this.#recorder.stop()
  }
}

export function createBrowserRecorderDependencies(): RecorderDependencies {
  return {
    clock: {
      clearTimeout: (handle) => {
        globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
      },
      setTimeout: (callback, delayMilliseconds) =>
        globalThis.setTimeout(callback, delayMilliseconds),
    },
    microphone: {
      isAvailable: () =>
        typeof navigator.mediaDevices?.getUserMedia === 'function',
      request: () =>
        navigator.mediaDevices.getUserMedia({
          audio: unprocessedMicrophoneConstraints,
        }),
    },
    objectUrls: {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => URL.revokeObjectURL(url),
    },
    recorders: {
      create: (stream, mimeType) => {
        const recorder =
          mimeType === undefined
            ? new MediaRecorder(stream as MediaStream)
            : new MediaRecorder(stream as MediaStream, { mimeType })

        return new NativeRecorderAdapter(recorder)
      },
      isAvailable: () => typeof MediaRecorder !== 'undefined',
      isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    },
  }
}
