import { useEffect, useMemo, useRef } from 'react'

import {
  browserYouTubePlayerApi,
  type YouTubePlaybackState,
  type YouTubePlayerApi,
  type YouTubePlayerError,
  type YouTubePlayerInstance,
} from '../player/youTubePlayer.js'
import { createFixedVideoEmbedUrl } from '../videoEmbed.js'
import styles from './FixedVideoPlayer.module.css'

export interface FixedVideoPlayerProps {
  onError?: ((error: YouTubePlayerError) => void) | undefined
  onPlaybackStateChange?: ((state: YouTubePlaybackState) => void) | undefined
  onPlayerReady?: ((player: YouTubePlayerInstance | null) => void) | undefined
  origin?: string | undefined
  playerApi?: YouTubePlayerApi | undefined
  videoId: string
}

export function FixedVideoPlayer({
  onError,
  onPlaybackStateChange,
  onPlayerReady,
  origin = window.location.origin,
  playerApi = browserYouTubePlayerApi,
  videoId,
}: FixedVideoPlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const embedUrl = useMemo(
    () => createFixedVideoEmbedUrl(videoId, origin),
    [origin, videoId],
  )

  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe === null) {
      return
    }

    const abortController = new AbortController()
    let player: YouTubePlayerInstance | null = null

    void playerApi
      .create(
        iframe,
        {
          onError: (error) => {
            if (!abortController.signal.aborted) {
              onError?.(error)
            }
          },
          onReady: (readyPlayer) => {
            if (!abortController.signal.aborted) {
              onPlayerReady?.(readyPlayer)
            }
          },
          onStateChange: (state) => {
            if (!abortController.signal.aborted) {
              // Keyboard events cannot escape the cross-origin player. Native
              // controls focus the iframe, so release it once the interaction
              // has changed playback and restore the page-level shortcuts.
              if (iframe.ownerDocument.activeElement === iframe) {
                frameRef.current?.focus({ preventScroll: true })
              }
              onPlaybackStateChange?.(state)
            }
          },
        },
        abortController.signal,
      )
      .then((createdPlayer) => {
        if (abortController.signal.aborted) {
          try {
            createdPlayer.destroy()
          } catch {
            // React already owns removal of the surrounding player subtree.
          }
          return
        }

        player = createdPlayer
      })
      .catch((error: unknown) => {
        if (
          abortController.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return
        }

        onError?.({
          code: null,
          message:
            error instanceof Error
              ? error.message
              : 'The YouTube player controls could not be loaded.',
        })
      })

    return () => {
      abortController.abort()
      onPlayerReady?.(null)
      try {
        player?.destroy()
      } catch {
        // React still owns removal of the surrounding player subtree.
      }
    }
  }, [embedUrl, onError, onPlaybackStateChange, onPlayerReady, playerApi])

  return (
    <div className={styles.frame} ref={frameRef} tabIndex={-1}>
      <iframe
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        key={embedUrl}
        ref={iframeRef}
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title="Shadowing practice video"
      />
    </div>
  )
}
