import { createFixedVideoEmbedUrl } from '../videoEmbed.js'
import styles from './FixedVideoPlayer.module.css'

export interface FixedVideoPlayerProps {
  origin?: string | undefined
  videoId: string
}

export function FixedVideoPlayer({
  origin = window.location.origin,
  videoId,
}: FixedVideoPlayerProps) {
  return (
    <div className={styles.frame}>
      <iframe
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        src={createFixedVideoEmbedUrl(videoId, origin)}
        title="Shadowing practice video"
      />
    </div>
  )
}
