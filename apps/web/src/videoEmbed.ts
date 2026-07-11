export function createYouTubeEmbedUrl(videoId: string, origin: string) {
  const url = new URL(
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
  )

  url.searchParams.set('autoplay', '0')
  url.searchParams.set('controls', '1')
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('origin', origin)

  return url.toString()
}
