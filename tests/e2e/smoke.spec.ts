import { expect, test } from '@playwright/test'

function isUnexpectedRuntimeRequest(rawUrl: string) {
  const url = new URL(rawUrl)
  const hostname = url.hostname.toLowerCase()
  const pathname = url.pathname.toLowerCase()
  const isFirstParty = hostname === '127.0.0.1' && url.port === '3000'
  const isYouTubeDataApi =
    hostname === 'youtube.googleapis.com' ||
    (hostname === 'www.googleapis.com' && pathname.startsWith('/youtube/'))
  const isAnalyticsOrTelemetry =
    hostname.includes('analytics') ||
    hostname.includes('telemetry') ||
    hostname === 'static.cloudflareinsights.com' ||
    /\/(?:analytics|telemetry)(?:\/|$)/u.test(pathname)

  return (
    (isFirstParty && /^\/api(?:\/|$)/u.test(pathname)) ||
    isYouTubeDataApi ||
    isAnalyticsOrTelemetry
  )
}

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

    let playerInstance: SyntheticYouTubePlayer | undefined
    let playerOptions: SyntheticPlayerOptions | undefined
    const registerPlayerInstance = (instance: SyntheticYouTubePlayer) => {
      playerInstance = instance
    }
    class SyntheticYouTubePlayer {
      readonly videoId: string
      playerState = -1

      constructor(iframe: HTMLIFrameElement, options: SyntheticPlayerOptions) {
        this.videoId =
          new URL(iframe.src).pathname.split('/').filter(Boolean).at(-1) ?? ''
        registerPlayerInstance(this)
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

      getPlayerState() {
        return this.playerState
      }

      getVideoUrl() {
        return `https://www.youtube.com/watch?v=${this.videoId}`
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
        if (playerOptions !== undefined && playerInstance !== undefined) {
          playerInstance.playerState = state
          playerOptions.events.onStateChange({
            data: state,
            target: playerInstance,
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

test('loads a URL-first recorder without application data services', async ({
  page,
}) => {
  const unexpectedRequests: string[] = []
  let iframeRequestUrl: string | undefined
  page.on('request', (request) => {
    if (isUnexpectedRuntimeRequest(request.url())) {
      unexpectedRequests.push(request.url())
    }
  })
  await page.route('https://www.youtube-nocookie.com/**', async (route) => {
    iframeRequestUrl = route.request().url()
    await route.fulfill({
      body: '<!doctype html><title>Intercepted practice video</title><button type="button">Play video</button>',
      contentType: 'text/html',
      status: 200,
    })
  })

  await page.goto('/')
  const applicationUrl = page.url()

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Listen. Shadow. Play it back.',
    }),
  ).toBeVisible()

  await expect(page.getByText('No video', { exact: true })).toBeVisible()
  await expect(page.getByTitle('Shadowing practice video')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Enable Practice Mode' }),
  ).toBeDisabled()

  await page
    .getByLabel('YouTube video URL')
    .fill('https://www.youtube.com/watch?v=stage1_test&t=23')
  await page.getByRole('button', { name: 'Load video' }).click()
  await expect(page.getByText('Video ready', { exact: true })).toBeVisible()
  expect(page.url()).toBe(applicationUrl)

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

  const inlineComparison = page.locator('[data-comparison-tray="inline"]')
  const floatingComparison = page.locator('[data-comparison-tray="floating"]')
  const recorderPanel = page
    .locator('[aria-label="Practice Mode controls"]')
    .locator('..')
  const practiceToggle = page.getByRole('button', {
    name: 'Turn Practice Mode on',
  })
  await expect(inlineComparison).toBeAttached()
  await expect(floatingComparison).toHaveCount(0)
  await expect(practiceToggle).toHaveAttribute('aria-pressed', 'false')
  await practiceToggle.click()
  await expect(recorderPanel.getByRole('status')).toContainText(
    'Play the video to start recording',
  )
  await expect(
    page.getByRole('button', { name: 'Turn Practice Mode off' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Echo cancellation').locator('..')).toContainText(
    'Off',
  )
  await expect(page.getByText('Noise suppression').locator('..')).toContainText(
    'Off',
  )
  await expect(page.getByText('Auto gain').locator('..')).toContainText('Off')

  await iframe
    .contentFrame()
    .getByRole('button', { name: 'Play video' })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement instanceof HTMLIFrameElement),
    )
    .toBe(true)
  await page.evaluate(() => {
    ;(
      window as typeof window & {
        __stageOnePlayerFake: { emitState(state: number): void }
      }
    ).__stageOnePlayerFake.emitState(1)
  })
  await expect(recorderPanel.getByRole('status')).toContainText(
    'Recording your microphone',
  )
  await expect(iframe.locator('..')).toHaveCSS('outline-style', 'none')
  await page.keyboard.press('Alt+C')
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __stageOneMediaFake: { playerPauseCalls: number }
            }
          ).__stageOneMediaFake.playerPauseCalls,
      ),
    )
    .toBe(1)
  await page.evaluate(() => {
    ;(
      window as typeof window & {
        __stageOnePlayerFake: { emitState(state: number): void }
      }
    ).__stageOnePlayerFake.emitState(3)
  })
  await expect(recorderPanel.getByRole('status')).toContainText(
    'recording paused',
  )
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

  await inlineComparison.scrollIntoViewIfNeeded()
  await expect(floatingComparison).toHaveCount(0)
  await expect(inlineComparison).not.toHaveAttribute('aria-hidden')
  await expect(inlineComparison).toHaveCSS('position', 'static')
  await expect(
    inlineComparison.getByRole('button', { name: 'Play my recording' }),
  ).toBeEnabled()
  await expect(inlineComparison.getByText('0:23 / 32:38')).toBeVisible()
  await page.keyboard.press('Alt+C')
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __stageOneMediaFake: { playerPlayCalls: number }
            }
          ).__stageOneMediaFake.playerPlayCalls,
      ),
    )
    .toBe(1)

  await page.setViewportSize({ height: 667, width: 375 })
  await page.evaluate(() => {
    const tray = document.querySelector<HTMLElement>(
      '[data-comparison-tray="inline"]',
    )
    if (tray !== null) {
      window.scrollTo(
        0,
        window.scrollY + tray.getBoundingClientRect().bottom + 32,
      )
    }
  })
  await expect(floatingComparison).toBeVisible()
  await expect(inlineComparison).toHaveAttribute('aria-hidden', 'true')
  await expect(floatingComparison).toHaveCSS('position', 'fixed')
  const mobileDockBounds = await floatingComparison.boundingBox()
  expect(mobileDockBounds).not.toBeNull()
  expect(mobileDockBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect(
    (mobileDockBounds?.x ?? 0) + (mobileDockBounds?.width ?? 0),
  ).toBeLessThanOrEqual(375)
  expect(mobileDockBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect(
    (mobileDockBounds?.y ?? 0) + (mobileDockBounds?.height ?? 0),
  ).toBeLessThanOrEqual(667)

  await floatingComparison
    .getByRole('button', { name: 'Restart reference video' })
    .click()

  await inlineComparison.scrollIntoViewIfNeeded()
  await expect(floatingComparison).toHaveCount(0)
  await expect(inlineComparison).not.toHaveAttribute('aria-hidden')

  await page.evaluate(() => {
    const tray = document.querySelector<HTMLElement>(
      '[data-comparison-tray="inline"]',
    )
    if (tray !== null) {
      window.scrollTo(
        0,
        window.scrollY + tray.getBoundingClientRect().bottom + 32,
      )
    }
  })
  await expect(floatingComparison).toBeVisible()

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await expect(floatingComparison).toHaveCount(0)
  const diagnosticsAtPageEnd = await page
    .getByRole('complementary', { name: 'Latest attempt' })
    .boundingBox()
  const footerAtPageEnd = await page.getByRole('contentinfo').boundingBox()
  expect(diagnosticsAtPageEnd).not.toBeNull()
  expect(footerAtPageEnd).not.toBeNull()
  expect(
    (diagnosticsAtPageEnd?.y ?? 0) + (diagnosticsAtPageEnd?.height ?? 0),
  ).toBeLessThanOrEqual(footerAtPageEnd?.y ?? 0)

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
    playerPauseCalls: 1,
    playerPlayCalls: 2,
    playerSeekCalls: [[0, true]],
    requestedUnprocessedAudio: true,
    timeslices: [1_000],
    trackStopCalls: 1,
  })

  expect(unexpectedRequests).toEqual([])
})
