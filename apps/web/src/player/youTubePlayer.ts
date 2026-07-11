export type YouTubePlaybackState =
  'buffering' | 'cued' | 'ended' | 'paused' | 'playing' | 'unstarted'

export interface YouTubePlayerInstance {
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
  pauseVideo(): void
  playVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
}

export interface YouTubePlayerCallbacks {
  onError(error: YouTubePlayerError): void
  onReady(player: YouTubePlayerInstance): void
  onStateChange(state: YouTubePlaybackState): void
}

export interface YouTubePlayerError {
  code: number | null
  message: string
}

export interface YouTubePlayerApi {
  create(
    iframe: HTMLIFrameElement,
    callbacks: YouTubePlayerCallbacks,
    signal: AbortSignal,
  ): Promise<YouTubePlayerInstance>
}

type NativeYouTubePlayer = YouTubePlayerInstance

interface NativeYouTubeEvent<T> {
  data: T
  target: NativeYouTubePlayer
}

interface NativeYouTubePlayerOptions {
  events: {
    onError(event: NativeYouTubeEvent<number>): void
    onReady(event: NativeYouTubeEvent<undefined>): void
    onStateChange(event: NativeYouTubeEvent<number>): void
  }
}

interface YouTubeNamespace {
  Player: new (
    iframe: HTMLIFrameElement,
    options: NativeYouTubePlayerOptions,
  ) => NativeYouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeNamespace | undefined
    onYouTubeIframeAPIReady?: (() => void) | undefined
  }
}

const iframeApiUrl = 'https://www.youtube.com/iframe_api'
let apiPromise: Promise<YouTubeNamespace> | null = null

function readYouTubeNamespace() {
  return typeof window.YT?.Player === 'function' ? window.YT : null
}

function loadYouTubeIframeApi() {
  const loadedNamespace = readYouTubeNamespace()
  if (loadedNamespace !== null) {
    return Promise.resolve(loadedNamespace)
  }

  if (apiPromise !== null) {
    return apiPromise
  }

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReadyCallback = window.onYouTubeIframeAPIReady
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${iframeApiUrl}"]`,
    )
    let ownsScript = false

    const restoreReadyCallback = () => {
      if (window.onYouTubeIframeAPIReady === handleReady) {
        window.onYouTubeIframeAPIReady = previousReadyCallback
      }
    }
    const handleError = () => {
      script?.removeEventListener('error', handleError)
      restoreReadyCallback()
      if (ownsScript) {
        script?.remove()
      }
      apiPromise = null
      reject(new Error('The YouTube player controls could not be loaded.'))
    }
    const handleReady = () => {
      try {
        previousReadyCallback?.()
      } catch {
        // Another player integration cannot block this loader from settling.
      } finally {
        script?.removeEventListener('error', handleError)
        restoreReadyCallback()
      }

      const namespace = readYouTubeNamespace()
      if (namespace === null) {
        apiPromise = null
        reject(new Error('The YouTube player controls did not initialise.'))
        return
      }

      resolve(namespace)
    }

    window.onYouTubeIframeAPIReady = handleReady

    if (script === null) {
      script = document.createElement('script')
      ownsScript = true
      script.async = true
      script.src = iframeApiUrl
      document.head.append(script)
    }

    script.addEventListener('error', handleError, { once: true })
  })

  return apiPromise
}

export function parseYouTubePlaybackState(
  state: number,
): YouTubePlaybackState | null {
  switch (state) {
    case -1:
      return 'unstarted'
    case 0:
      return 'ended'
    case 1:
      return 'playing'
    case 2:
      return 'paused'
    case 3:
      return 'buffering'
    case 5:
      return 'cued'
    default:
      return null
  }
}

export function describeYouTubePlayerError(code: number): YouTubePlayerError {
  switch (code) {
    case 2:
      return {
        code,
        message: 'The configured video ID is not valid for the YouTube player.',
      }
    case 5:
      return {
        code,
        message: 'This video could not be played in the browser player.',
      }
    case 100:
      return {
        code,
        message: 'This video is unavailable or private.',
      }
    case 101:
    case 150:
      return {
        code,
        message: 'The video owner does not allow embedded playback.',
      }
    case 153:
      return {
        code,
        message:
          'The YouTube player could not identify this application. Check the production origin and referrer configuration.',
      }
    default:
      return {
        code,
        message: `The YouTube player reported error ${code}.`,
      }
  }
}

export const browserYouTubePlayerApi: YouTubePlayerApi = {
  async create(iframe, callbacks, signal) {
    const namespace = await loadYouTubeIframeApi()

    if (signal.aborted) {
      throw new DOMException('Player setup was cancelled.', 'AbortError')
    }

    return new namespace.Player(iframe, {
      events: {
        onError: (event) => {
          callbacks.onError(describeYouTubePlayerError(event.data))
        },
        onReady: (event) => {
          callbacks.onReady(event.target)
        },
        onStateChange: (event) => {
          const state = parseYouTubePlaybackState(event.data)
          if (state !== null) {
            callbacks.onStateChange(state)
          }
        },
      },
    })
  },
}
