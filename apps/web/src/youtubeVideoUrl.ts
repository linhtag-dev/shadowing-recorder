const videoIdPattern = /^[A-Za-z0-9_-]{11}$/

const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
])

export type YouTubeVideoUrlErrorKind =
  | 'ambiguous-video-id'
  | 'empty'
  | 'invalid-url'
  | 'invalid-video-id'
  | 'playlist-only'
  | 'raw-video-id'
  | 'unsupported-host'
  | 'unsupported-protocol'
  | 'unsupported-route'

export type YouTubeVideoUrlParseResult =
  | {
      status: 'valid'
      videoId: string
    }
  | {
      status: 'invalid'
      errorKind: YouTubeVideoUrlErrorKind
      message: string
    }

function invalid(
  errorKind: YouTubeVideoUrlErrorKind,
  message: string,
): YouTubeVideoUrlParseResult {
  return { status: 'invalid', errorKind, message }
}

function validateCandidates(candidates: string[]): YouTubeVideoUrlParseResult {
  if (candidates.length > 1) {
    return invalid(
      'ambiguous-video-id',
      'This URL contains more than one video ID. Paste a URL for one specific video.',
    )
  }

  const [videoId] = candidates
  if (videoId === undefined || !videoIdPattern.test(videoId)) {
    return invalid(
      'invalid-video-id',
      'The YouTube video ID must be exactly 11 letters, numbers, underscores, or hyphens.',
    )
  }

  return { status: 'valid', videoId }
}

function pathSegments(url: URL) {
  return url.pathname.split('/').filter((segment) => segment.length > 0)
}

export function parseYouTubeVideoUrl(
  input: string,
): YouTubeVideoUrlParseResult {
  const value = input.trim()

  if (value.length === 0) {
    return invalid('empty', 'Enter a YouTube video URL.')
  }

  if (videoIdPattern.test(value)) {
    return invalid(
      'raw-video-id',
      'Paste the full HTTPS YouTube URL, not only the video ID.',
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return invalid(
      'invalid-url',
      'Enter a complete YouTube URL, such as https://www.youtube.com/watch?v=VIDEO_ID.',
    )
  }

  if (url.protocol !== 'https:') {
    return invalid('unsupported-protocol', 'Use an HTTPS YouTube URL.')
  }

  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    (!youtubeHosts.has(url.hostname) && url.hostname !== 'youtu.be')
  ) {
    return invalid(
      'unsupported-host',
      'Use a URL from youtube.com or youtu.be.',
    )
  }

  const segments = pathSegments(url)
  const queryVideoIds = url.searchParams.getAll('v')

  if (url.hostname === 'youtu.be') {
    if (segments.length !== 1) {
      return invalid(
        'unsupported-route',
        'Use a YouTube watch, short, embed, or youtu.be video URL.',
      )
    }

    return validateCandidates([segments[0] ?? '', ...queryVideoIds])
  }

  const [route, pathVideoId, ...remainingSegments] = segments
  if (route === 'watch' && pathVideoId === undefined) {
    if (queryVideoIds.length === 0 && url.searchParams.has('list')) {
      return invalid(
        'playlist-only',
        'This URL points to a playlist. Open a specific video and paste its URL.',
      )
    }

    return validateCandidates(queryVideoIds)
  }

  if (
    (route === 'shorts' || route === 'embed') &&
    pathVideoId !== undefined &&
    remainingSegments.length === 0
  ) {
    return validateCandidates([pathVideoId, ...queryVideoIds])
  }

  if (route === 'playlist' && url.searchParams.has('list')) {
    return invalid(
      'playlist-only',
      'This URL points to a playlist. Open a specific video and paste its URL.',
    )
  }

  return invalid(
    'unsupported-route',
    'Use a YouTube watch, short, embed, or youtu.be video URL.',
  )
}
