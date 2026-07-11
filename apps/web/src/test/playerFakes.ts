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
  playerState = -1
  playVideoCalls = 0
  readonly seekToCalls: Array<[number, boolean]> = []
  videoUrl: string

  constructor(videoId = 'stage1_test') {
    this.videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  }

  destroy() {
    ++this.destroyCalls
  }

  getCurrentTime() {
    return this.currentTime
  }

  getDuration() {
    return this.duration
  }

  getPlayerState() {
    return this.playerState
  }

  getVideoUrl() {
    return this.videoUrl
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
    iframe: HTMLIFrameElement,
    callbacks: YouTubePlayerCallbacks,
    signal: AbortSignal,
  ) => {
    ++this.createCalls
    if (signal.aborted) {
      throw new DOMException('Player setup was cancelled.', 'AbortError')
    }

    const videoId = new URL(iframe.src).pathname
      .split('/')
      .filter(Boolean)
      .at(-1)
    if (videoId !== undefined) {
      this.player.videoUrl = `https://www.youtube.com/watch?v=${videoId}`
      this.player.playerState = -1
    }
    this.callbacks = callbacks
    callbacks.onReady(this.player)
    return this.player
  }

  emitError(error: YouTubePlayerError) {
    this.callbacks?.onError(error)
  }

  emitState(state: YouTubePlaybackState) {
    this.player.playerState = {
      buffering: 3,
      cued: 5,
      ended: 0,
      paused: 2,
      playing: 1,
      unstarted: -1,
    }[state]
    this.callbacks?.onStateChange(state)
  }
}
