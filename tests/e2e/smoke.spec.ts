import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const diagnostics = {
      timeslices: [] as number[],
      trackStopCalls: 0,
    }
    const tracks = [
      {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        stop: () => {
          ++diagnostics.trackStopCalls
        },
      },
    ]
    const mediaDevices = navigator.mediaDevices ?? {}

    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => ({ getTracks: () => tracks }),
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
  await expect.poll(() => iframeRequestUrl).toContain('/embed/stage1_test')

  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByRole('status')).toContainText(
    'Recording your microphone',
  )
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('status')).toContainText('Recording paused')
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.getByRole('button', { name: 'Stop' }).click()

  const playback = page.getByLabel('Latest recording playback')
  await expect(playback).toBeVisible()
  await expect(playback).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText('audio/webm;codecs=opus')).toBeVisible()
  await expect(page.getByText('dataavailable (15 bytes)')).toBeVisible()
  await expect(page.getByText('stop', { exact: true })).toBeVisible()

  const mediaDiagnostics = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __stageOneMediaFake: {
            timeslices: number[]
            trackStopCalls: number
          }
        }
      ).__stageOneMediaFake,
  )
  expect(mediaDiagnostics).toEqual({
    timeslices: [1_000],
    trackStopCalls: 1,
  })

  const healthResponse = await page.request.get('/api/health')

  expect(healthResponse.ok()).toBe(true)
  await expect(healthResponse.json()).resolves.toEqual({ status: 'ok' })
})
