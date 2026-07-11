import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  YouTubePlayerApi,
  YouTubePlayerCallbacks,
} from '../player/youTubePlayer.js'
import { FakeYouTubePlayer, FakeYouTubePlayerApi } from '../test/playerFakes.js'
import { createYouTubeEmbedUrl } from '../videoEmbed.js'
import { YouTubeVideoPlayer } from './YouTubeVideoPlayer.js'

describe('YouTubeVideoPlayer', () => {
  it('builds a privacy-enhanced, API-enabled URL with native controls', () => {
    const embedUrl = new URL(
      createYouTubeEmbedUrl('stage1_test', 'https://preview.example'),
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

  it('connects generation-scoped events and destroys its player on cleanup', async () => {
    const playerApi = new FakeYouTubePlayerApi()
    const onError = vi.fn()
    const onPlaybackStateChange = vi.fn()
    const onPlayerReady = vi.fn()
    const { unmount } = render(
      <YouTubeVideoPlayer
        loadGeneration={4}
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
      expect(onPlayerReady).toHaveBeenCalledWith(playerApi.player, 4)
    })

    playerApi.emitState('playing')
    playerApi.emitError({ code: 153, message: 'identity missing' })
    expect(onPlaybackStateChange).toHaveBeenCalledWith('playing', 4)
    expect(onError).toHaveBeenCalledWith(
      { code: 153, message: 'identity missing' },
      4,
    )

    unmount()
    expect(playerApi.player.destroyCalls).toBe(1)
  })

  it('releases iframe focus when native controls change playback', async () => {
    const playerApi = new FakeYouTubePlayerApi()
    render(
      <YouTubeVideoPlayer
        loadGeneration={1}
        origin="http://127.0.0.1:3000"
        playerApi={playerApi}
        videoId="stage1_test"
      />,
    )

    const iframe = screen.getByTitle('Shadowing practice video')
    await waitFor(() => {
      expect(playerApi.callbacks).not.toBeNull()
    })

    iframe.focus()
    expect(document.activeElement).toBe(iframe)
    playerApi.emitState('playing')
    expect(document.activeElement).not.toBe(iframe)
  })

  it('destroys a player that resolves after its generation was unmounted', async () => {
    let callbacks: YouTubePlayerCallbacks | undefined
    let resolvePlayer: ((player: FakeYouTubePlayer) => void) | undefined
    const playerApi: YouTubePlayerApi = {
      create: async (_iframe, nextCallbacks) => {
        callbacks = nextCallbacks
        return new Promise((resolve) => {
          resolvePlayer = resolve
        })
      },
    }
    const { unmount } = render(
      <YouTubeVideoPlayer
        loadGeneration={1}
        playerApi={playerApi}
        videoId="stage1_test"
      />,
    )
    const stalePlayer = new FakeYouTubePlayer()

    unmount()
    callbacks?.onReady(stalePlayer)
    resolvePlayer?.(stalePlayer)

    await waitFor(() => {
      expect(stalePlayer.destroyCalls).toBe(1)
    })
  })
})
