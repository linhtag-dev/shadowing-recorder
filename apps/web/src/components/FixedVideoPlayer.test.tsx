import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FakeYouTubePlayerApi } from '../test/playerFakes.js'
import { createFixedVideoEmbedUrl } from '../videoEmbed.js'
import { FixedVideoPlayer } from './FixedVideoPlayer.js'

describe('FixedVideoPlayer', () => {
  it('builds a privacy-enhanced, API-enabled URL with native controls', () => {
    const embedUrl = new URL(
      createFixedVideoEmbedUrl('stage1_test', 'https://preview.example'),
    )

    expect(embedUrl.origin).toBe('https://www.youtube-nocookie.com')
    expect(embedUrl.pathname).toBe('/embed/stage1_test')
    expect(Object.fromEntries(embedUrl.searchParams)).toEqual({
      autoplay: '0',
      controls: '1',
      enablejsapi: '1',
      origin: 'https://preview.example',
      playsinline: '1',
    })
  })

  it('connects iframe player events and destroys its player on cleanup', async () => {
    const playerApi = new FakeYouTubePlayerApi()
    const onError = vi.fn()
    const onPlaybackStateChange = vi.fn()
    const onPlayerReady = vi.fn()
    const { unmount } = render(
      <FixedVideoPlayer
        onError={onError}
        onPlaybackStateChange={onPlaybackStateChange}
        onPlayerReady={onPlayerReady}
        origin="http://127.0.0.1:3000"
        playerApi={playerApi}
        videoId="stage1_test"
      />,
    )

    const iframe = screen.getByTitle('Shadowing practice video')
    const src = new URL(iframe.getAttribute('src') ?? '')

    expect(src.searchParams.get('origin')).toBe('http://127.0.0.1:3000')
    expect(src.searchParams.get('enablejsapi')).toBe('1')
    expect(iframe).toHaveAttribute(
      'referrerpolicy',
      'strict-origin-when-cross-origin',
    )
    expect(iframe).toHaveAttribute('allowfullscreen')
    await waitFor(() => {
      expect(playerApi.createCalls).toBe(1)
      expect(onPlayerReady).toHaveBeenCalledWith(playerApi.player)
    })

    playerApi.emitState('playing')
    playerApi.emitError({ code: 153, message: 'identity missing' })
    expect(onPlaybackStateChange).toHaveBeenCalledWith('playing')
    expect(onError).toHaveBeenCalledWith({
      code: 153,
      message: 'identity missing',
    })

    unmount()
    expect(onPlayerReady).toHaveBeenLastCalledWith(null)
    expect(playerApi.player.destroyCalls).toBe(1)
  })
})
