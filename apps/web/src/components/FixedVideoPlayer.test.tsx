import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFixedVideoEmbedUrl } from '../videoEmbed.js'
import { FixedVideoPlayer } from './FixedVideoPlayer.js'

describe('FixedVideoPlayer', () => {
  it('builds a privacy-enhanced, origin-bound URL with native controls', () => {
    const embedUrl = new URL(
      createFixedVideoEmbedUrl('stage1_test', 'https://preview.example'),
    )

    expect(embedUrl.origin).toBe('https://www.youtube-nocookie.com')
    expect(embedUrl.pathname).toBe('/embed/stage1_test')
    expect(Object.fromEntries(embedUrl.searchParams)).toEqual({
      autoplay: '0',
      controls: '1',
      origin: 'https://preview.example',
      playsinline: '1',
    })
    expect(embedUrl.searchParams.has('enablejsapi')).toBe(false)
  })

  it('renders an identified inline iframe without loading the player API', () => {
    render(
      <FixedVideoPlayer origin="http://127.0.0.1:3000" videoId="stage1_test" />,
    )

    const iframe = screen.getByTitle('Shadowing practice video')
    const src = new URL(iframe.getAttribute('src') ?? '')

    expect(src.searchParams.get('origin')).toBe('http://127.0.0.1:3000')
    expect(iframe).toHaveAttribute(
      'referrerpolicy',
      'strict-origin-when-cross-origin',
    )
    expect(iframe).toHaveAttribute('allowfullscreen')
    expect(document.querySelector('script[src*="iframe_api"]')).toBeNull()
  })
})
