import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  YouTubePlaybackState,
  YouTubePlayerApi,
  YouTubePlayerCallbacks,
} from '../player/youTubePlayer.js'
import { createFakeRecorderEnvironment } from '../test/recorderFakes.js'
import { FakeYouTubePlayer, FakeYouTubePlayerApi } from '../test/playerFakes.js'
import { RecorderSpike } from './RecorderSpike.js'

const videoAUrl = 'https://www.youtube.com/watch?v=stage1_test'
const videoBUrl = 'https://youtu.be/stage2_test'

interface ControlledPlayerRequest {
  callbacks: YouTubePlayerCallbacks
  player: FakeYouTubePlayer
  resolve: (player: FakeYouTubePlayer) => void
  signal: AbortSignal
}

class ControlledYouTubePlayerApi implements YouTubePlayerApi {
  readonly requests: ControlledPlayerRequest[] = []

  readonly create: YouTubePlayerApi['create'] = (iframe, callbacks, signal) => {
    const videoId = new URL(iframe.src).pathname
      .split('/')
      .filter(Boolean)
      .at(-1)
    const player = new FakeYouTubePlayer(videoId)
    return new Promise((resolve) => {
      this.requests.push({ callbacks, player, resolve, signal })
    })
  }

  ready(index: number) {
    const request = this.requests[index]
    if (request === undefined) {
      throw new Error(`Player request ${index} does not exist`)
    }
    request.callbacks.onReady(request.player)
    request.resolve(request.player)
  }

  emitState(index: number, state: YouTubePlaybackState) {
    const request = this.requests[index]
    if (request === undefined) {
      throw new Error(`Player request ${index} does not exist`)
    }
    request.player.playerState = {
      buffering: 3,
      cued: 5,
      ended: 0,
      paused: 2,
      playing: 1,
      unstarted: -1,
    }[state]
    request.callbacks.onStateChange(state)
  }
}

function submitVideoUrl(url: string) {
  fireEvent.change(screen.getByLabelText('YouTube video URL'), {
    target: { value: url },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Load video' }))
}

async function loadVideo(url = videoAUrl) {
  submitVideoUrl(url)
  await screen.findByText('Video ready')
}

async function renderLoadedRecorder(
  props: ComponentProps<typeof RecorderSpike> = {},
) {
  const result = render(<RecorderSpike {...props} />)
  await loadVideo()
  return result
}

function getRecorderStatus() {
  const panel = screen
    .getByRole('heading', { name: 'Connect the microphone' })
    .closest('section')
  const status = panel?.querySelector<HTMLElement>(
    '[role="status"], [role="alert"]',
  )
  if (status === null || status === undefined) {
    throw new Error('Recorder status was not rendered')
  }
  return status
}

describe('RecorderSpike', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts empty and reports an invalid submission without mounting an iframe', () => {
    render(<RecorderSpike />)

    expect(screen.getByText('No video')).toBeInTheDocument()
    expect(
      screen.queryByTitle('Shadowing practice video'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('YouTube video URL'), {
      target: { value: 'stage1_test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load video' }))

    expect(screen.getByRole('alert')).toHaveTextContent('full HTTPS')
    expect(
      screen.queryByTitle('Shadowing practice video'),
    ).not.toBeInTheDocument()
  })

  it('loads a verified video without changing the application URL', async () => {
    const originalUrl = window.location.href
    const playerApi = new FakeYouTubePlayerApi()
    render(<RecorderSpike playerApi={playerApi} />)

    await loadVideo()

    expect(screen.getByText('Video ready')).toBeInTheDocument()
    expect(screen.getByTitle('Shadowing practice video')).toHaveAttribute(
      'src',
      expect.stringContaining('/embed/stage1_test'),
    )
    expect(window.location.href).toBe(originalUrl)
    expect(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    ).toBeEnabled()
  })

  it('treats a repeated ID as a fresh player generation', async () => {
    const playerApi = new ControlledYouTubePlayerApi()
    render(<RecorderSpike playerApi={playerApi} />)

    submitVideoUrl(videoAUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(1))
    await act(async () => playerApi.ready(0))
    await screen.findByText('Video ready')

    submitVideoUrl(videoAUrl)
    expect(screen.getByText('Loading video')).toBeInTheDocument()
    await waitFor(() => expect(playerApi.requests).toHaveLength(2))
    expect(playerApi.requests[0]?.player.destroyCalls).toBe(1)
    await act(async () => playerApi.ready(1))

    expect(screen.getByText('Video ready')).toBeInTheDocument()
    expect(playerApi.requests[1]?.player).not.toBe(
      playerApi.requests[0]?.player,
    )
  })

  it('keeps only B when A resolves after a rapid A-to-B replacement', async () => {
    const playerApi = new ControlledYouTubePlayerApi()
    render(<RecorderSpike playerApi={playerApi} />)

    submitVideoUrl(videoAUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(1))
    submitVideoUrl(videoBUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(2))

    await act(async () => playerApi.ready(1))
    expect(
      screen.getByText('Verified source ID stage2_test.'),
    ).toBeInTheDocument()
    await act(async () => playerApi.ready(0))

    expect(
      screen.getByText('Verified source ID stage2_test.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Verified source ID stage1_test.')).toBeNull()
    expect(playerApi.requests[0]?.player.destroyCalls).toBe(1)
    expect(playerApi.requests[1]?.player.destroyCalls).toBe(0)
  })

  it('starts, buffers, resumes, and finalises recording from player events', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new FakeYouTubePlayerApi()
    let resolvePermission: (() => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = () => resolve(environment.stream)
      })

    await renderLoadedRecorder({
      dependencies: environment.dependencies,
      origin: 'http://127.0.0.1:3000',
      playerApi,
    })

    await waitFor(() => {
      expect(playerApi.callbacks).not.toBeNull()
    })
    const enable = screen.getByRole('button', {
      name: 'Enable Practice Mode',
    })
    const disable = screen.getByRole('button', {
      name: 'Disable Practice Mode',
    })

    expect(getRecorderStatus()).toHaveTextContent('Practice Mode is off.')
    expect(enable).toBeEnabled()
    expect(disable).toBeDisabled()

    act(() => {
      playerApi.emitState('playing')
    })
    fireEvent.click(enable)
    expect(getRecorderStatus()).toHaveTextContent(
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
    expect(getRecorderStatus()).toHaveTextContent('recording paused')
    expect(recorder?.pauseCalls).toBe(1)

    act(() => {
      playerApi.emitState('playing')
    })
    expect(getRecorderStatus()).toHaveTextContent('Recording your microphone')
    expect(recorder?.resumeCalls).toBe(1)

    act(() => {
      playerApi.emitState('paused')
    })
    expect(getRecorderStatus()).toHaveTextContent('Finishing')
    expect(recorder?.stopCalls).toBe(1)

    act(() => {
      recorder?.emitData(
        new Blob(['voice'], { type: 'audio/webm;codecs=opus' }),
      )
      recorder?.emitStop()
    })

    expect(getRecorderStatus()).toHaveTextContent(
      'Play the video to start recording',
    )
    expect(screen.getByLabelText('Latest recording playback')).toHaveAttribute(
      'src',
      'blob:recording-1',
    )
    expect(environment.stream.tracks[0]?.stopCalls).toBe(0)

    fireEvent.click(disable)
    expect(getRecorderStatus()).toHaveTextContent('Practice Mode is off.')
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

    await renderLoadedRecorder({
      dependencies: environment.dependencies,
      playerApi,
    })

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

    await renderLoadedRecorder({
      dependencies: environment.dependencies,
      playerApi: new FakeYouTubePlayerApi(),
    })

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
    expect(getRecorderStatus()).toHaveTextContent('Practice Mode is off.')
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
    await renderLoadedRecorder({
      dependencies: environment.dependencies,
      playerApi: new FakeYouTubePlayerApi(),
    })

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

    await renderLoadedRecorder({
      dependencies: environment.dependencies,
      playerApi,
    })

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
    const { unmount } = await renderLoadedRecorder({
      dependencies: environment.dependencies,
      playerApi,
    })

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
    await renderLoadedRecorder({
      dependencies: environment.dependencies,
      playerApi,
    })

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

  it('replaces safely while microphone permission is still pending', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new ControlledYouTubePlayerApi()
    let resolvePermission: (() => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = () => resolve(environment.stream)
      })
    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
      />,
    )

    submitVideoUrl(videoAUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(1))
    await act(async () => playerApi.ready(0))
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    expect(getRecorderStatus()).toHaveTextContent(
      'Waiting for microphone permission',
    )

    submitVideoUrl(videoBUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(2))
    await act(async () => playerApi.ready(1))
    expect(
      screen.getByText('Verified source ID stage2_test.'),
    ).toBeInTheDocument()

    resolvePermission?.()
    await waitFor(() => {
      expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    })
    expect(environment.recorderFactory.recorders).toHaveLength(0)
    expect(getRecorderStatus()).toHaveTextContent('Practice Mode is off')
  })

  it('lets a newer load supersede replacement finalisation and preserves the recording source', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new ControlledYouTubePlayerApi()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    )
    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
      />,
    )

    submitVideoUrl(videoAUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(1))
    await act(async () => playerApi.ready(0))
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')
    act(() => playerApi.emitState(0, 'playing'))
    await screen.findByText('Recording your microphone while the video plays.')
    const firstRecorder = environment.recorderFactory.recorders[0]

    submitVideoUrl(videoBUrl)
    expect(getRecorderStatus()).toHaveTextContent('Finishing')
    expect(firstRecorder?.stopCalls).toBe(1)
    expect(playerApi.requests).toHaveLength(1)

    submitVideoUrl('https://www.youtube.com/shorts/stage3_test')
    expect(screen.getByText('Verifying stage3_test…')).toBeInTheDocument()
    expect(playerApi.requests).toHaveLength(1)

    act(() => {
      firstRecorder?.emitData(new Blob(['voice']))
      firstRecorder?.emitStop()
    })
    await waitFor(() => expect(playerApi.requests).toHaveLength(2))
    expect(playerApi.requests[1]?.player.videoUrl).toContain('stage3_test')
    await act(async () => playerApi.ready(1))

    expect(
      screen.getByText('Verified source ID stage3_test.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Latest recording playback')).toHaveAttribute(
      'src',
      'blob:recording-1',
    )
    expect(screen.getByText(/Source video ID:/)).toHaveTextContent(
      'stage1_test',
    )
    expect(
      screen.getByRole('button', { name: 'Play my recording' }),
    ).toBeDisabled()
    fireEvent.play(screen.getByLabelText('Latest recording playback'))
    expect(playerApi.requests[1]?.player.pauseVideoCalls).toBe(1)

    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    )
    await screen.findByText('Ready. Play the video to start recording.')
    act(() => playerApi.emitState(1, 'playing'))
    const secondRecorder = environment.recorderFactory.recorders[1]
    act(() => {
      playerApi.emitState(1, 'paused')
      secondRecorder?.emitData(new Blob(['second']))
      secondRecorder?.emitStop()
    })

    expect(screen.getByText(/Source video ID:/)).toHaveTextContent(
      'stage3_test',
    )
    expect(environment.objectUrls.revokedUrls).toEqual(['blob:recording-1'])
  })

  it('removes the iframe and disables Practice Mode when identity drifts', async () => {
    const environment = createFakeRecorderEnvironment()
    const playerApi = new ControlledYouTubePlayerApi()
    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        playerApi={playerApi}
      />,
    )

    submitVideoUrl(videoAUrl)
    await waitFor(() => expect(playerApi.requests).toHaveLength(1))
    await act(async () => playerApi.ready(0))
    playerApi.requests[0]!.player.videoUrl = videoBUrl
    act(() => playerApi.emitState(0, 'playing'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'instead of stage1_test',
    )
    expect(screen.queryByTitle('Shadowing practice video')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    ).toBeDisabled()
    expect(playerApi.requests[0]?.player.destroyCalls).toBe(1)
  })

  it('maps a player failure to a retryable loader error and removes the iframe', async () => {
    const playerApi = new FakeYouTubePlayerApi()
    await renderLoadedRecorder({ playerApi })

    act(() => {
      playerApi.emitError({
        code: 101,
        message: 'The video owner does not allow embedded playback.',
      })
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'does not allow embedded playback',
    )
    expect(screen.queryByTitle('Shadowing practice video')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Enable Practice Mode' }),
    ).toBeDisabled()
    expect(playerApi.player.destroyCalls).toBe(1)
  })
})
