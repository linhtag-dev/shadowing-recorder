import type {
  YouTubePlaybackState,
  YouTubePlayerApi,
  YouTubePlayerCallbacks,
  YouTubePlayerError,
  YouTubePlayerInstance,
} from '../player/youTubePlayer.js'

export class FakeYouTubePlayer implements YouTubePlayerInstance {
  currentTime = 0
  destroyCalls = 0
  duration = 32 * 60 + 38
  pauseVideoCalls = 0
  playVideoCalls = 0
  readonly seekToCalls: Array<[number, boolean]> = []

  destroy() {
    ++this.destroyCalls
  }

  getCurrentTime() {
    return this.currentTime
  }

  getDuration() {
    return this.duration
  }

  pauseVideo() {
    ++this.pauseVideoCalls
  }

  playVideo() {
    ++this.playVideoCalls
  }

  seekTo(seconds: number, allowSeekAhead: boolean) {
    this.currentTime = seconds
    this.seekToCalls.push([seconds, allowSeekAhead])
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
