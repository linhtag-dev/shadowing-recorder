import { z } from 'zod'

const ServerEnvironmentSchema = z.strictObject({
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_DIST_PATH: z.string().min(1).optional(),
})

export interface ServerEnvironment {
  host: string
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  webDistPath?: string
}

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
): ServerEnvironment {
  const relevantEnvironment = {
    HOST: environment.HOST,
    NODE_ENV: environment.NODE_ENV,
    PORT: environment.PORT,
    WEB_DIST_PATH: environment.WEB_DIST_PATH,
  }
  const result = ServerEnvironmentSchema.safeParse(relevantEnvironment)

  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid server environment: ${summary}`)
  }

  return {
    host: result.data.HOST,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    ...(result.data.WEB_DIST_PATH === undefined
      ? {}
      : { webDistPath: result.data.WEB_DIST_PATH }),
  }
}
