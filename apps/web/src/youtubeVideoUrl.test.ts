import { describe, expect, it } from 'vitest'

import { parseYouTubeVideoUrl } from './youtubeVideoUrl.js'

const videoId = 'abCD09_-xyz'

describe('parseYouTubeVideoUrl', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${videoId}`, 'watch URL'],
    [`https://youtube.com/watch?v=${videoId}`, 'bare YouTube host'],
    [`https://m.youtube.com/watch?v=${videoId}`, 'mobile watch URL'],
    [`https://youtu.be/${videoId}`, 'short URL'],
    [`https://www.youtube.com/shorts/${videoId}`, 'Shorts URL'],
    [`https://www.youtube.com/embed/${videoId}`, 'embed URL'],
    [`  https://youtu.be/${videoId}  `, 'surrounding whitespace'],
    [
      `https://www.youtube.com/watch?v=${videoId}&t=42&list=PL123`,
      'unrelated query parameters',
    ],
    [`https://youtu.be/${videoId}/?si=tracking`, 'trailing slash'],
  ])('accepts a supported %s (%s)', (value) => {
    expect(parseYouTubeVideoUrl(value)).toEqual({
      status: 'valid',
      videoId,
    })
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    [videoId, 'raw-video-id'],
    ['not a URL', 'invalid-url'],
    [`http://youtu.be/${videoId}`, 'unsupported-protocol'],
    [`ftp://www.youtube.com/watch?v=${videoId}`, 'unsupported-protocol'],
    [`https://youtube.example/watch?v=${videoId}`, 'unsupported-host'],
    [`https://youtube.com.evil.example/watch?v=${videoId}`, 'unsupported-host'],
    [`https://www.youtube.com:444/watch?v=${videoId}`, 'unsupported-host'],
    ['https://www.youtube.com/playlist?list=PL123', 'playlist-only'],
    ['https://www.youtube.com/watch?list=PL123', 'playlist-only'],
    ['https://www.youtube.com/', 'unsupported-route'],
    [`https://www.youtube.com/live/${videoId}`, 'unsupported-route'],
    [`https://youtu.be/${videoId}/extra`, 'unsupported-route'],
    ['https://www.youtube.com/watch?v=too-short', 'invalid-video-id'],
    ['https://www.youtube.com/shorts/abcde!ghijk', 'invalid-video-id'],
    [
      `https://www.youtube.com/watch?v=${videoId}&v=ZYXwvutsr_1`,
      'ambiguous-video-id',
    ],
    [`https://youtu.be/${videoId}?v=ZYXwvutsr_1`, 'ambiguous-video-id'],
  ])('rejects %s as %s', (value, errorKind) => {
    expect(parseYouTubeVideoUrl(value)).toEqual(
      expect.objectContaining({ status: 'invalid', errorKind }),
    )
  })
})
