import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ServiceStatus } from './ServiceStatus.js'

describe('ServiceStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports a validated same-origin API connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<ServiceStatus />)

    expect(
      await screen.findByText('Web application and API are connected.'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    )
  })

  it('fails closed when the health payload is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'maybe' }), { status: 200 }),
      ),
    )

    render(<ServiceStatus />)

    expect(
      await screen.findByText(
        'The API is unavailable. Start both workspace applications.',
      ),
    ).toBeInTheDocument()
  })
})

