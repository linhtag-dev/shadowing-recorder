import { Link, Route, Routes } from 'react-router-dom'

import { RecorderSpike } from '../components/RecorderSpike.js'
import type { RecorderDependencies } from '../controller/browserCapabilities.js'
import type { YouTubePlayerApi } from '../player/youTubePlayer.js'
import { parseVideoConfiguration } from '../videoConfiguration.js'
import styles from './App.module.css'

export interface AppProps {
  playerApi?: YouTubePlayerApi | undefined
  recorderDependencies?: RecorderDependencies | undefined
  videoId?: string | undefined
}

function HomePage({ playerApi, recorderDependencies, videoId }: AppProps) {
  const configuredVideoId =
    videoId === undefined ? import.meta.env.VITE_SHADOWING_VIDEO_ID : videoId

  return (
    <RecorderSpike
      dependencies={recorderDependencies}
      playerApi={playerApi}
      videoConfiguration={parseVideoConfiguration(configuredVideoId)}
    />
  )
}

function NotFoundPage() {
  return (
    <main id="main-content" className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>404</p>
        <h1>That page is not part of this recording.</h1>
        <p>
          <Link to="/">Return to Shadowing Recorder</Link>
        </p>
      </section>
    </main>
  )
}

export function App({
  playerApi,
  recorderDependencies,
  videoId,
}: AppProps = {}) {
  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <header className={styles.header}>
        <Link
          className={styles.brand}
          to="/"
          aria-label="Shadowing Recorder home"
        >
          <span className={styles.brandMark} aria-hidden="true">
            SR
          </span>
          <span>Shadowing Recorder</span>
        </Link>
        <span className={styles.stage}>Stage 1 browser spike</span>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              playerApi={playerApi}
              recorderDependencies={recorderDependencies}
              videoId={videoId}
            />
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <footer className={styles.footer}>
        <p>
          Non-public validation build · learner audio stays in this browser.
        </p>
      </footer>
    </div>
  )
}
