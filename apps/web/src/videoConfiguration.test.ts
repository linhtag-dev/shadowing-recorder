import { describe, expect, it } from 'vitest'

import { parseVideoConfiguration } from './videoConfiguration.js'

describe('parseVideoConfiguration', () => {
  it.each([undefined, '', '   '])(
    'disables the spike when the value is missing (%s)',
    (value) => {
      expect(parseVideoConfiguration(value)).toEqual(
        expect.objectContaining({ status: 'missing' }),
      )
    },
  )

  it('trims and accepts the supported video ID alphabet', () => {
    expect(parseVideoConfiguration('  abCD09_-xyz  ')).toEqual({
      status: 'configured',
      videoId: 'abCD09_-xyz',
    })
  })

  it.each(['too-short', 'abcdefghijkl', 'abcde!ghijk', 'abc defghij'])(
    'disables the spike for an invalid value (%s)',
    (value) => {
      expect(parseVideoConfiguration(value)).toEqual(
        expect.objectContaining({ status: 'invalid' }),
      )
    },
  )
})
