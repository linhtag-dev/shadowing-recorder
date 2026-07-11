import type {
  YouTubePlaybackState,
  YouTubePlayerApi,
  YouTubePlayerCallbacks,
  YouTubePlayerError,
  YouTubePlayerInstance,
} from '../player/youTubePlayer.js'

export class FakeYouTubePlayer implements YouTubePlayerInstance {
  destroyCalls = 0
  pauseVideoCalls = 0

  destroy() {
    ++this.destroyCalls
  }

  pauseVideo() {
    ++this.pauseVideoCalls
  }
}

export class FakeYouTubePlayerApi implements YouTubePlayerApi {
  callbacks: YouTubePlayerCallbacks | null = null
  createCalls = 0
  readonly player = new FakeYouTubePlayer()

  readonly create = async (
    _iframe: HTMLIFrameElement,
    callbacks: YouTubePlayerCallbacks,
    signal: AbortSignal,
  ) => {
    ++this.createCalls
    if (signal.aborted) {
      throw new DOMException('Player setup was cancelled.', 'AbortError')
    }

    this.callbacks = callbacks
    callbacks.onReady(this.player)
    return this.player
  }

  emitError(error: YouTubePlayerError) {
    this.callbacks?.onError(error)
  }

  emitState(state: YouTubePlaybackState) {
    this.callbacks?.onStateChange(state)
  }
}
