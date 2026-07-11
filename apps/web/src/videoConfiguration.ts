const videoIdPattern = /^[A-Za-z0-9_-]{11}$/

export type VideoConfiguration =
  | {
      status: 'configured'
      videoId: string
    }
  | {
      status: 'missing' | 'invalid'
      message: string
    }

export function parseVideoConfiguration(
  configuredVideoId: string | undefined,
): VideoConfiguration {
  const videoId = configuredVideoId?.trim()

  if (videoId === undefined || videoId.length === 0) {
    return {
      status: 'missing',
      message:
        'This recorder spike is disabled. Set VITE_SHADOWING_VIDEO_ID to a developer-prechecked 11-character video ID when building the web application.',
    }
  }

  if (!videoIdPattern.test(videoId)) {
    return {
      status: 'invalid',
      message:
        'This recorder spike is disabled because VITE_SHADOWING_VIDEO_ID is not a valid 11-character video ID.',
    }
  }

  return { status: 'configured', videoId }
}
