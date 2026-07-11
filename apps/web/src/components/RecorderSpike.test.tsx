import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeRecorderEnvironment } from '../test/recorderFakes.js'
import { FakeYouTubePlayerApi } from '../test/playerFakes.js'
import { parseVideoConfiguration } from '../videoConfiguration.js'
import { RecorderSpike } from './RecorderSpike.js'

const configuredVideo = parseVideoConfiguration('stage1_test')

describe('RecorderSpike', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders a clear disabled state without an iframe or practice controls', () => {
    render(
      <RecorderSpike videoConfiguration={parseVideoConfiguration('invalid')} />,
    )

    expect(
      screen.getByRole('heading', { name: 'Recorder configuration required' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'VITE_SHADOWING_VIDEO_ID',
    )
    expect(
      screen.queryByTitle('Shadowing practice video'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Enable Practice Mode' }),
    ).not.toBeInTheDocument()
  })

  it('starts, buffers, resumes, and finalises recording from player events', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new FakeYouTubePlayerApi()
    let resolvePermission: (() => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = () => resolve(environment.stream)
      })

    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        origin="http://127.0.0.1:3000"
        playerApi={playerApi}
        videoConfiguration={configuredVideo}
      />,
    )

    await waitFor(() => {
      expect(playerApi.callbacks).not.toBeNull()
    })
    const enable = screen.getByRole('button', {
      name: 'Enable Practice Mode',
    })
    const disable = screen.getByRole('button', {
      name: 'Disable Practice Mode',
    })

    expect(screen.getByRole('status')).toHaveTextContent('Practice Mode is off')
    expect(enable).toBeEnabled()
    expect(disable).toBeDisabled()

    act(() => {
      playerApi.emitState('playing')
    })
    fireEvent.click(enable)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for microphone permission',
    )
    expect(environment.recorderFactory.recorders).toHaveLength(0)

    resolvePermission?.()
    expect(
      await screen.findByText(
        'Recording your microphone while the video plays.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Echo cancellation').parentElement,
    ).toHaveTextContent('Off')
    expect(
      screen.getByText('Noise suppression').parentElement,
    ).toHaveTextContent('Off')
    expect(screen.getByText('Auto gain').parentElement).toHaveTextContent('Off')
    expect(screen.getByText('Sample rate').parentElement).toHaveTextContent(
      '48,000 Hz',
    )
    const recorder = environment.recorderFactory.recorders[0]
    expect(recorder?.startCalls).toEqual([1_000])

    act(() => {
      playerApi.emitState('buffering')
    })
    expect(screen.getByRole('status')).toHaveTextContent('recording paused')
    expect(recorder?.pauseCalls).toBe(1)

    act(() => {
      playerApi.emitState('playing')
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Recording your microphone',
    )
    expect(recorder?.resumeCalls).toBe(1)

    act(() => {
      playerApi.emitState('paused')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Finishing')
    expect(recorder?.stopCalls).toBe(1)

    act(() => {
      recorder?.emitData(
        new Blob(['voice'], { type: 'audio/webm;codecs=opus' }),
      )
      recorder?.emitStop()
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Play the video to start recording',
    )
    expect(screen.getByLabelText('Latest recording playback')).toHaveAttribute(
      'src',
      'blob:recording-1',
    )
    expect(environment.stream.tracks[0]?.stopCalls).toBe(0)

    fireEvent.click(disable)
    expect(screen.getByRole('status')).toHaveTextContent('Practice Mode is off')
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('switches and restarts both sources from the comparison dock', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new FakeYouTubePlayerApi()
    const playPlayback = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined)
    const pausePlayback = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)

    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
        videoConfiguration={configuredVideo}
      />,
    )

    const playReference = await screen.findByRole('button', {
      name: 'Play reference video',
    })
    expect(playReference).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Play my recording' }),
    ).toBeDisabled()

    fireEvent.click(playReference)
    expect(playerApi.player.playVideoCalls).toBe(1)

    fireEvent.click(
      screen.getByRole('button', { name: 'Restart reference video' }),
    )
    expect(playerApi.player.seekToCalls).toEqual([[0, true]])
    expect(playerApi.player.playVideoCalls).toBe(2)

    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')
    act(() => {
      playerApi.emitState('playing')
    })
    await screen.findByText('Recording your microphone while the video plays.')

    const recorder = environment.recorderFactory.recorders[0]
    act(() => {
      playerApi.emitState('paused')
      recorder?.emitData(
        new Blob(['voice'], { type: 'audio/webm;codecs=opus' }),
      )
      recorder?.emitStop()
    })

    const playback = screen.getByLabelText('Latest recording playback')
    Object.defineProperty(playback, 'duration', {
      configurable: true,
      value: 20,
    })
    playback.currentTime = 5
    fireEvent.loadedMetadata(playback)
    fireEvent.timeUpdate(playback)
    expect(screen.getByText('0:05 / 0:20')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play my recording' }))
    expect(playerApi.player.pauseVideoCalls).toBe(1)
    expect(playPlayback).toHaveBeenCalledTimes(1)

    fireEvent.play(playback)
    expect(
      screen.getByRole('button', { name: 'Pause my recording' }),
    ).toHaveAttribute('aria-pressed', 'true')

    playback.currentTime = 5
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart my recording' }),
    )
    expect(playback.currentTime).toBe(0)
    expect(playPlayback).toHaveBeenCalledTimes(2)

    act(() => {
      playerApi.emitState('playing')
    })
    expect(pausePlayback).toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Pause reference video' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles Practice Mode from the setup gate', async () => {
    const environment = createFakeRecorderEnvironment()

    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={new FakeYouTubePlayerApi()}
        videoConfiguration={configuredVideo}
      />,
    )

    const enableToggle = screen.getByRole('button', {
      name: 'Turn Practice Mode on',
    })
    expect(enableToggle).toHaveAttribute('aria-pressed', 'false')
    expect(enableToggle).toHaveTextContent('Enable Practice Mode')
    expect(
      screen.getByText('Turn on Practice Mode to record and compare'),
    ).toBeInTheDocument()

    fireEvent.click(enableToggle)
    await screen.findByText('Ready. Play the video to start recording.')
    expect(environment.microphone.requestCalls).toBe(1)
    const disableToggle = screen.getByRole('button', {
      name: 'Turn Practice Mode off',
    })
    expect(disableToggle).toHaveAttribute('aria-pressed', 'true')
    expect(disableToggle).toHaveTextContent('Practice Mode on')
    expect(screen.getByText('Practice Mode is ready')).toBeInTheDocument()

    fireEvent.click(disableToggle)
    expect(screen.getByRole('status')).toHaveTextContent('Practice Mode is off')
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    expect(
      screen.getByRole('button', { name: 'Turn Practice Mode on' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('floats comparison controls only after their inline tray has passed', async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined
    const observe = vi.fn()
    class FakeIntersectionObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = '0px'
      readonly thresholds = [0]
      disconnect = vi.fn()
      observe = observe
      takeRecords = vi.fn(() => [])
      unobserve = vi.fn()

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }
    }

    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    const environment = createFakeRecorderEnvironment()
    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={new FakeYouTubePlayerApi()}
        videoConfiguration={configuredVideo}
      />,
    )

    const inlineTray = screen.getByRole('region', {
      name: 'Playback comparison',
    })
    const boundary = document.querySelector('[data-comparison-dock-boundary]')
    expect(boundary).not.toBeNull()
    expect(observe).toHaveBeenCalledWith(inlineTray)
    expect(observe).toHaveBeenCalledWith(boundary)

    const emitIntersection = (
      target: Element,
      isIntersecting: boolean,
      bottom: number,
    ) => {
      act(() => {
        intersectionCallback?.(
          [
            {
              boundingClientRect: { bottom },
              isIntersecting,
              target,
            } as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver,
        )
      })
    }

    emitIntersection(inlineTray, false, 500)
    expect(
      document.querySelector('[data-comparison-tray="floating"]'),
    ).not.toBeInTheDocument()

    emitIntersection(inlineTray, false, -1)
    expect(
      document.querySelector('[data-comparison-tray="floating"]'),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Turn Practice Mode on' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')

    expect(
      screen.getByRole('region', { name: 'Playback comparison' }),
    ).toHaveAttribute('data-comparison-tray', 'floating')
    expect(inlineTray).toHaveAttribute('aria-hidden', 'true')

    emitIntersection(boundary as Element, true, 600)
    expect(
      document.querySelector('[data-comparison-tray="floating"]'),
    ).not.toBeInTheDocument()
    expect(inlineTray).not.toHaveAttribute('aria-hidden')
  })

  it('cycles from reference capture to recording playback with Alt+C', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new FakeYouTubePlayerApi()
    const playPlayback = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined)
    const pausePlayback = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)

    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
        videoConfiguration={configuredVideo}
      />,
    )

    const comparisonDock = screen.getByRole('region', {
      name: 'Playback comparison',
    })
    expect(comparisonDock).toHaveAttribute('aria-keyshortcuts', 'Alt+C')

    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { altKey: true, code: 'KeyC', key: 'c' })
    expect(playerApi.player.playVideoCalls).toBe(0)
    input.remove()

    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')

    fireEvent.keyDown(document, { altKey: true, code: 'KeyC', key: 'c' })
    expect(playerApi.player.playVideoCalls).toBe(1)
    act(() => {
      playerApi.emitState('playing')
    })
    await screen.findByText('Recording your microphone while the video plays.')

    fireEvent.keyDown(document, { altKey: true, code: 'KeyC', key: 'c' })
    expect(playerApi.player.pauseVideoCalls).toBe(1)
    act(() => {
      playerApi.emitState('paused')
    })
    expect(comparisonDock).toHaveTextContent('Finishing your recording')

    const recorder = environment.recorderFactory.recorders[0]
    act(() => {
      recorder?.emitData(
        new Blob(['voice'], { type: 'audio/webm;codecs=opus' }),
      )
      recorder?.emitStop()
    })
    await waitFor(() => {
      expect(playPlayback).toHaveBeenCalledTimes(1)
    })

    const playback = screen.getByLabelText('Latest recording playback')
    fireEvent.play(playback)
    fireEvent.keyDown(document, { altKey: true, code: 'KeyC', key: 'c' })
    expect(pausePlayback).toHaveBeenCalled()
    expect(playerApi.player.playVideoCalls).toBe(2)
  })

  it('stops learner playback before a new player-driven attempt', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new FakeYouTubePlayerApi()
    const pausePlayback = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)
    const { unmount } = render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
        videoConfiguration={configuredVideo}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')
    act(() => {
      playerApi.emitState('playing')
    })
    await screen.findByText('Recording your microphone while the video plays.')

    const firstRecorder = environment.recorderFactory.recorders[0]
    act(() => {
      playerApi.emitState('ended')
      firstRecorder?.emitData(
        new Blob(['first'], { type: 'audio/webm;codecs=opus' }),
      )
      firstRecorder?.emitStop()
    })

    const playback = screen.getByLabelText('Latest recording playback')
    fireEvent.play(playback)
    expect(playerApi.player.pauseVideoCalls).toBe(1)

    act(() => {
      playerApi.emitState('playing')
    })
    expect(pausePlayback).toHaveBeenCalled()
    expect(environment.recorderFactory.recorders).toHaveLength(2)
    expect(
      screen.queryByLabelText('Latest recording playback'),
    ).not.toBeInTheDocument()

    unmount()
    await waitFor(() => {
      expect(environment.objectUrls.revokedUrls).toEqual(['blob:recording-1'])
    })
    expect(environment.recorderFactory.recorders[1]?.stopCalls).toBe(1)
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
  })

  it('announces retryable permission and lifecycle errors', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new FakeYouTubePlayerApi()
    environment.microphone.requestImplementation = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
        videoConfiguration={configuredVideo}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Microphone permission was denied',
    )
    expect(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    ).toBeEnabled()

    environment.microphone.requestImplementation = async () =>
      environment.stream
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')
    act(() => {
      playerApi.emitState('playing')
    })
    await screen.findByText('Recording your microphone while the video plays.')

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('page was hidden')
    expect(playerApi.player.pauseVideoCalls).toBe(1)
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    expect(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    ).toBeEnabled()
  })
})
