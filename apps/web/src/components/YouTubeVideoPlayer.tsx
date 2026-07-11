import { useEffect, useMemo, useRef } from 'react'

import {
  browserYouTubePlayerApi,
  type YouTubePlaybackState,
  type YouTubePlayerApi,
  type YouTubePlayerError,
  type YouTubePlayerInstance,
} from '../player/youTubePlayer.js'
import { createYouTubeEmbedUrl } from '../videoEmbed.js'
import styles from './YouTubeVideoPlayer.module.css'

export interface YouTubeVideoPlayerProps {
  loadGeneration: number
  onError?:
    ((error: YouTubePlayerError, loadGeneration: number) => void) | undefined
  onPlaybackStateChange?:
    ((state: YouTubePlaybackState, loadGeneration: number) => void) | undefined
  onPlayerReady?:
    | ((player: YouTubePlayerInstance, loadGeneration: number) => void)
    | undefined
  origin?: string | undefined
  playerApi?: YouTubePlayerApi | undefined
  videoId: string
}

export function YouTubeVideoPlayer({
  loadGeneration,
  onError,
  onPlaybackStateChange,
  onPlayerReady,
  origin = window.location.origin,
  playerApi = browserYouTubePlayerApi,
  videoId,
}: YouTubeVideoPlayerProps) {
  const callbacksRef = useRef({
    onError,
    onPlaybackStateChange,
    onPlayerReady,
  })
  useEffect(() => {
    callbacksRef.current = { onError, onPlaybackStateChange, onPlayerReady }
  }, [onError, onPlaybackStateChange, onPlayerReady])
  const frameRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const embedUrl = useMemo(
    () => createYouTubeEmbedUrl(videoId, origin),
    [origin, videoId],
  )

  useEffect(() => {
    const iframe = iframeRef.current
    if (iframe === null) {
      return
    }

    const abortController = new AbortController()
    const destroyedPlayers = new Set<YouTubePlayerInstance>()
    let player: YouTubePlayerInstance | null = null
    const destroyPlayer = (target: YouTubePlayerInstance) => {
      if (destroyedPlayers.has(target)) {
        return
      }

      destroyedPlayers.add(target)
      try {
        target.destroy()
      } catch {
        // React still owns removal of the surrounding player subtree.
      }
    }

    void playerApi
      .create(
        iframe,
        {
          onError: (error) => {
            if (!abortController.signal.aborted) {
              callbacksRef.current.onError?.(error, loadGeneration)
            }
          },
          onReady: (readyPlayer) => {
            if (abortController.signal.aborted) {
              destroyPlayer(readyPlayer)
              return
            }

            callbacksRef.current.onPlayerReady?.(readyPlayer, loadGeneration)
          },
          onStateChange: (state) => {
            if (!abortController.signal.aborted) {
              // Keyboard events cannot escape the cross-origin player. Native
              // controls focus the iframe, so release it once the interaction
              // has changed playback and restore the page-level shortcuts.
              if (iframe.ownerDocument.activeElement === iframe) {
                frameRef.current?.focus({ preventScroll: true })
              }
              callbacksRef.current.onPlaybackStateChange?.(
                state,
                loadGeneration,
              )
            }
          },
        },
        abortController.signal,
      )
      .then((createdPlayer) => {
        if (abortController.signal.aborted) {
          destroyPlayer(createdPlayer)
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

        callbacksRef.current.onError?.(
          {
            code: null,
            message:
              error instanceof Error
                ? error.message
                : 'The YouTube player controls could not be loaded.',
          },
          loadGeneration,
        )
      })

    return () => {
      abortController.abort()
      if (player !== null) {
        destroyPlayer(player)
      }
    }
  }, [embedUrl, loadGeneration, playerApi])

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
