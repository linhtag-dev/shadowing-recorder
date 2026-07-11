import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MicrophoneStream } from './browserCapabilities.js'
import {
  createBrowserRecorderDependencies,
  unprocessedMicrophoneConstraints,
} from './browserCapabilities.js'

describe('browser microphone capture', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests microphone audio without voice-call processing', async () => {
    const stream: MicrophoneStream = { getTracks: () => [] }
    const getUserMedia = vi.fn(async () => stream)
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    })

    const dependencies = createBrowserRecorderDependencies()
    await dependencies.microphone.request()

    expect(unprocessedMicrophoneConstraints).toEqual({
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    })
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: unprocessedMicrophoneConstraints,
    })
  })
})
