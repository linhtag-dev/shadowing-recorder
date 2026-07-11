import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { HealthResponse } from '@shadowing-recorder/contracts'
import { Hono } from 'hono'

const defaultWebRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url))

export interface AppOptions {
  webRoot?: string
}

export function createApp({ webRoot = defaultWebRoot }: AppOptions = {}) {
  const app = new Hono()

  app.get('/api/health', (context) => {
    const response: HealthResponse = { status: 'ok' }

    return context.json(response)
  })

  app.all('/api/*', (context) =>
    context.json({ error: 'API route not found' }, 404),
  )

  app.use('*', serveStatic({ root: webRoot }))

  app.get('*', async (context) => {
    try {
      const html = await readFile(`${webRoot}/index.html`, 'utf8')

      return context.html(html)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return context.json(
          { error: 'The web application has not been built.' },
          503,
        )
      }

      throw error
    }
  })

  return app
}

