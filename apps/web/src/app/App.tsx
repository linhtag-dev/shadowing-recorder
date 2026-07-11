import { Link, Route, Routes } from 'react-router-dom'

import { RecorderSpike } from '../components/RecorderSpike.js'
import type { RecorderDependencies } from '../controller/browserCapabilities.js'
import type { YouTubePlayerApi } from '../player/youTubePlayer.js'
import styles from './App.module.css'

export interface AppProps {
  playerApi?: YouTubePlayerApi | undefined
  recorderDependencies?: RecorderDependencies | undefined
}

function HomePage({ playerApi, recorderDependencies }: AppProps) {
  return (
    <RecorderSpike dependencies={recorderDependencies} playerApi={playerApi} />
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

export function App({ playerApi, recorderDependencies }: AppProps = {}) {
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
        <span className={styles.stage}>Stage 2 URL loader</span>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              playerApi={playerApi}
              recorderDependencies={recorderDependencies}
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
