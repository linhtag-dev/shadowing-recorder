import { describe, expect, it } from 'vitest'

import {
  VideoEligibilityRequestSchema,
  VideoEligibilityResponseSchema,
} from './eligibility.js'

describe('eligibility contracts', () => {
  it('accepts a narrow eligible response for an exact video ID', () => {
    expect(
      VideoEligibilityResponseSchema.parse({
        status: 'eligible',
        videoId: 'M7lc1UVf-VE',
      }),
    ).toEqual({
      status: 'eligible',
      videoId: 'M7lc1UVf-VE',
    })
  })

  it('rejects a malformed response that omits the checked video ID', () => {
    expect(
      VideoEligibilityResponseSchema.safeParse({ status: 'eligible' }).success,
    ).toBe(false)
  })

  it('rejects fields outside the candidate-video request boundary', () => {
    expect(
      VideoEligibilityRequestSchema.safeParse({
        videoId: 'M7lc1UVf-VE',
        learnerAudio: 'must never cross this boundary',
      }).success,
    ).toBe(false)
  })
})

