import { describe, expect, it } from 'vitest'

import { createApp } from './app.js'
import { parseServerEnvironment } from './config.js'

describe('application server', () => {
  it('returns the same-origin health response', async () => {
    const response = await createApp().request('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('does not route unknown API requests to the web application', async () => {
    const response = await createApp().request('/api/not-found')

    expect(response.status).toBe(404)
  })

  it('fails fast when server configuration is invalid', () => {
    expect(() => parseServerEnvironment({ PORT: 'not-a-port' })).toThrow(
      'Invalid server environment',
    )
  })
})
