import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const diagnostics = {
      playerPauseCalls: 0,
      playerPlayCalls: 0,
      playerSeekCalls: [] as Array<[number, boolean]>,
      requestedUnprocessedAudio: false,
      timeslices: [] as number[],
      trackStopCalls: 0,
    }
    const tracks = [
      {
        addEventListener: () => undefined,
        getSettings: () => ({
          autoGainControl: false,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 48_000,
        }),
        removeEventListener: () => undefined,
        stop: () => {
          ++diagnostics.trackStopCalls
        },
      },
    ]
    const mediaDevices = navigator.mediaDevices ?? {}

    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const audio =
          typeof constraints.audio === 'object' ? constraints.audio : null
        diagnostics.requestedUnprocessedAudio =
          audio?.autoGainControl === false &&
          audio.echoCancellation === false &&
          audio.noiseSuppression === false
        return { getTracks: () => tracks }
      },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    })

    class SyntheticMediaRecorder extends EventTarget {
      static isTypeSupported(mimeType: string) {
        return mimeType === 'audio/webm;codecs=opus'
      }

      readonly mimeType: string
      state: 'inactive' | 'paused' | 'recording' = 'inactive'

      constructor(_stream: unknown, options?: { mimeType?: string }) {
        super()
        this.mimeType = options?.mimeType ?? 'audio/webm;codecs=opus'
      }

      start(timeslice?: number) {
        this.state = 'recording'
        diagnostics.timeslices.push(timeslice ?? 0)
        this.dispatchEvent(new Event('start'))
      }

      pause() {
        this.state = 'paused'
        this.dispatchEvent(new Event('pause'))
      }

      resume() {
        this.state = 'recording'
        this.dispatchEvent(new Event('resume'))
      }

      stop() {
        this.state = 'inactive'
        queueMicrotask(() => {
          const dataEvent = new Event('dataavailable')
          Object.defineProperty(dataEvent, 'data', {
            value: new Blob(['synthetic audio'], { type: this.mimeType }),
          })
          this.dispatchEvent(dataEvent)
          this.dispatchEvent(new Event('stop'))
        })
      }
    }

    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: SyntheticMediaRecorder,
    })

    interface SyntheticPlayerEvent {
      data: number
      target: SyntheticYouTubePlayer
    }

    interface SyntheticPlayerOptions {
      events: {
        onError(event: SyntheticPlayerEvent): void
        onReady(event: {
          data: undefined
          target: SyntheticYouTubePlayer
        }): void
        onStateChange(event: SyntheticPlayerEvent): void
      }
    }

    let playerOptions: SyntheticPlayerOptions | undefined
    class SyntheticYouTubePlayer {
      constructor(_iframe: HTMLIFrameElement, options: SyntheticPlayerOptions) {
        playerOptions = options
        queueMicrotask(() => {
          options.events.onReady({ data: undefined, target: this })
        })
      }

      destroy() {
        // The application owns cleanup; no synthetic DOM work is necessary.
      }

      getCurrentTime() {
        return 23
      }

      getDuration() {
        return 32 * 60 + 38
      }

      pauseVideo() {
        ++diagnostics.playerPauseCalls
      }

      playVideo() {
        ++diagnostics.playerPlayCalls
      }

      seekTo(seconds: number, allowSeekAhead: boolean) {
        diagnostics.playerSeekCalls.push([seconds, allowSeekAhead])
      }
    }

    const player = {
      emitState: (state: number) => {
        if (playerOptions !== undefined) {
          playerOptions.events.onStateChange({
            data: state,
            target: {
              destroy: () => undefined,
              pauseVideo: () => undefined,
            } as SyntheticYouTubePlayer,
          })
        }
      },
    }

    Object.defineProperty(window, 'YT', {
      configurable: true,
      value: { Player: SyntheticYouTubePlayer },
    })
    Object.defineProperty(window, '__stageOnePlayerFake', {
      configurable: true,
      value: player,
    })
    Object.defineProperty(window, '__stageOneMediaFake', {
      configurable: true,
      value: diagnostics,
    })
  })
})

test('serves the fixed-video recorder and API from one origin', async ({
  page,
}) => {
  let iframeRequestUrl: string | undefined
  await page.route('https://www.youtube-nocookie.com/**', async (route) => {
    iframeRequestUrl = route.request().url()
    await route.fulfill({
      body: '<!doctype html><title>Intercepted fixed video</title>',
      contentType: 'text/html',
      status: 200,
    })
  })

  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Listen. Shadow. Play it back.',
    }),
  ).toBeVisible()

  const iframe = page.getByTitle('Shadowing practice video')
  await expect(iframe).toBeVisible()
  await expect(iframe).toHaveAttribute(
    'referrerpolicy',
    'strict-origin-when-cross-origin',
  )
  const iframeSource = await iframe.getAttribute('src')
  expect(iframeSource).not.toBeNull()
  expect(new URL(iframeSource ?? '').origin).toBe(
    'https://www.youtube-nocookie.com',
  )
  expect(new URL(iframeSource ?? '').searchParams.get('origin')).toBe(
    'http://127.0.0.1:3000',
  )
  expect(new URL(iframeSource ?? '').searchParams.get('enablejsapi')).toBe('1')
  await expect.poll(() => iframeRequestUrl).toContain('/embed/stage1_test')

  const comparisonDock = page.getByRole('region', {
    name: 'Playback comparison',
  })
  const practiceToggle = comparisonDock.getByRole('button', {
    name: 'Turn Practice Mode on',
  })
  await expect(practiceToggle).toHaveAttribute('aria-pressed', 'false')
  await practiceToggle.click()
  await expect(page.getByRole('status')).toContainText(
    'Play the video to start recording',
  )
  await expect(
    comparisonDock.getByRole('button', { name: 'Turn Practice Mode off' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Echo cancellation').locator('..')).toContainText(
    'Off',
  )
  await expect(page.getByText('Noise suppression').locator('..')).toContainText(
    'Off',
  )
  await expect(page.getByText('Auto gain').locator('..')).toContainText('Off')
  await page.evaluate(() => {
    ;(
      window as typeof window & {
        __stageOnePlayerFake: { emitState(state: number): void }
      }
    ).__stageOnePlayerFake.emitState(1)
  })
  await expect(page.getByRole('status')).toContainText(
    'Recording your microphone',
  )
  await page.evaluate(() => {
    ;(
      window as typeof window & {
        __stageOnePlayerFake: { emitState(state: number): void }
      }
    ).__stageOnePlayerFake.emitState(3)
  })
  await expect(page.getByRole('status')).toContainText('recording paused')
  await page.evaluate(() => {
    ;(
      window as typeof window & {
        __stageOnePlayerFake: { emitState(state: number): void }
      }
    ).__stageOnePlayerFake.emitState(1)
  })
  await page.evaluate(() => {
    ;(
      window as typeof window & {
        __stageOnePlayerFake: { emitState(state: number): void }
      }
    ).__stageOnePlayerFake.emitState(2)
  })

  const playback = page.getByLabel('Latest recording playback')
  await expect(playback).toBeVisible()
  await expect(playback).toHaveAttribute('src', /^blob:/)
  await playback.scrollIntoViewIfNeeded()

  await expect(
    comparisonDock.getByRole('button', { name: 'Play my recording' }),
  ).toBeEnabled()
  await expect(comparisonDock.getByText('0:23 / 32:38')).toBeVisible()
  const dockBounds = await comparisonDock.boundingBox()
  const viewportHeight = page.viewportSize()?.height
  await expect(comparisonDock).toHaveCSS('position', 'fixed')
  expect(dockBounds).not.toBeNull()
  expect(viewportHeight).toBeDefined()
  expect(dockBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((dockBounds?.y ?? 0) + (dockBounds?.height ?? 0)).toBeLessThanOrEqual(
    viewportHeight ?? 0,
  )

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  const dockAtPageEnd = await comparisonDock.boundingBox()
  const diagnosticsAtPageEnd = await page
    .getByRole('complementary', { name: 'Latest attempt' })
    .boundingBox()
  const footerAtPageEnd = await page.getByRole('contentinfo').boundingBox()
  expect(dockAtPageEnd).not.toBeNull()
  expect(diagnosticsAtPageEnd).not.toBeNull()
  expect(footerAtPageEnd).not.toBeNull()
  expect(
    (diagnosticsAtPageEnd?.y ?? 0) + (diagnosticsAtPageEnd?.height ?? 0),
  ).toBeLessThanOrEqual(dockAtPageEnd?.y ?? 0)
  const footerToDockGap =
    (dockAtPageEnd?.y ?? 0) -
    ((footerAtPageEnd?.y ?? 0) + (footerAtPageEnd?.height ?? 0))
  expect(footerToDockGap).toBeGreaterThanOrEqual(-1)
  expect(footerToDockGap).toBeLessThanOrEqual(32)

  await page.setViewportSize({ height: 667, width: 375 })
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  const mobileDockBounds = await comparisonDock.boundingBox()
  expect(mobileDockBounds).not.toBeNull()
  expect(mobileDockBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect(
    (mobileDockBounds?.x ?? 0) + (mobileDockBounds?.width ?? 0),
  ).toBeLessThanOrEqual(375)
  expect(mobileDockBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect(
    (mobileDockBounds?.y ?? 0) + (mobileDockBounds?.height ?? 0),
  ).toBeLessThanOrEqual(667)

  await comparisonDock
    .getByRole('button', { name: 'Restart reference video' })
    .click()
  await expect(page.getByText('audio/webm;codecs=opus')).toBeVisible()
  await expect(page.getByText('dataavailable (15 bytes)')).toBeVisible()
  await expect(page.getByText('stop', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Disable Practice Mode' }).click()

  const mediaDiagnostics = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __stageOneMediaFake: {
            playerPauseCalls: number
            playerPlayCalls: number
            playerSeekCalls: Array<[number, boolean]>
            requestedUnprocessedAudio: boolean
            timeslices: number[]
            trackStopCalls: number
          }
        }
      ).__stageOneMediaFake,
  )
  expect(mediaDiagnostics).toEqual({
    playerPauseCalls: 0,
    playerPlayCalls: 1,
    playerSeekCalls: [[0, true]],
    requestedUnprocessedAudio: true,
    timeslices: [1_000],
    trackStopCalls: 1,
  })

  const healthResponse = await page.request.get('/api/health')

  expect(healthResponse.ok()).toBe(true)
  await expect(healthResponse.json()).resolves.toEqual({ status: 'ok' })
})
