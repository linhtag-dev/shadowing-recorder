import { describe, expect, it } from 'vitest'

import {
  describeYouTubePlayerError,
  parseYouTubePlaybackState,
} from './youTubePlayer.js'

describe('parseYouTubePlaybackState', () => {
  it.each([
    [-1, 'unstarted'],
    [0, 'ended'],
    [1, 'playing'],
    [2, 'paused'],
    [3, 'buffering'],
    [5, 'cued'],
    [99, null],
  ] as const)('maps player state %s to %s', (value, expected) => {
    expect(parseYouTubePlaybackState(value)).toBe(expected)
  })
})

describe('describeYouTubePlayerError', () => {
  it.each([
    [2, 'invalid or unavailable'],
    [5, 'browser player'],
    [100, 'unavailable or private'],
    [101, 'does not allow embedded playback'],
    [150, 'does not allow embedded playback'],
  ] as const)('maps player error %s to %s guidance', (code, message) => {
    expect(describeYouTubePlayerError(code)).toEqual({
      code,
      message: expect.stringContaining(message),
    })
  })

  it('provides a deployment-identity explanation for error 153', () => {
    expect(describeYouTubePlayerError(153)).toEqual({
      code: 153,
      message:
        'The YouTube player could not identify this application. Check the production origin and referrer configuration.',
    })
  })
})
