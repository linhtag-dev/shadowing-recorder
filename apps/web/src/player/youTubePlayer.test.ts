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
  it('provides a configuration-specific explanation for error 153', () => {
    expect(describeYouTubePlayerError(153)).toEqual({
      code: 153,
      message:
        'The YouTube player could not identify this application. Check the production origin and referrer configuration.',
    })
  })
})
