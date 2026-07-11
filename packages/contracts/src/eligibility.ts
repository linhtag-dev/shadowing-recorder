import { z } from 'zod'

export const YouTubeVideoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, 'Expected an 11-character YouTube video ID')

export const VideoEligibilityRequestSchema = z.strictObject({
  videoId: YouTubeVideoIdSchema,
})

export const EligibleVideoSchema = z.strictObject({
  status: z.literal('eligible'),
  videoId: YouTubeVideoIdSchema,
})

export const IneligibleVideoSchema = z.strictObject({
  status: z.enum(['madeForKids', 'liveOrUpcoming', 'unavailable']),
  videoId: YouTubeVideoIdSchema,
})

export const EligibilityServiceErrorSchema = z.strictObject({
  status: z.literal('unknown'),
  videoId: YouTubeVideoIdSchema,
  reason: z.enum([
    'timeout',
    'networkFailure',
    'malformedUpstreamResponse',
    'upstreamError',
    'rateLimited',
    'quotaExhausted',
  ]),
  retryable: z.boolean(),
})

export const VideoEligibilityResponseSchema = z.union([
  EligibleVideoSchema,
  IneligibleVideoSchema,
  EligibilityServiceErrorSchema,
])

export type VideoEligibilityRequest = z.infer<
  typeof VideoEligibilityRequestSchema
>
export type VideoEligibilityResponse = z.infer<
  typeof VideoEligibilityResponseSchema
>

