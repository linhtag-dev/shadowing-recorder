import { Link, Route, Routes } from 'react-router-dom'

import { ServiceStatus } from '../components/ServiceStatus.js'
import styles from './App.module.css'

function HomePage() {
  return (
    <main id="main-content" className={styles.main}>
      <section className={styles.hero} aria-labelledby="page-title">
        <p className={styles.eyebrow}>A focused listening practice tool</p>
        <h1 id="page-title">Hear it. Shadow it. Hear yourself.</h1>
        <p className={styles.intro}>
          Shadowing Recorder is taking shape. This foundation keeps the browser
          experience and its small API on one origin, with learner recordings
          reserved for local browser handling in the upcoming proof of concept.
        </p>
      </section>

      <div className={styles.grid}>
        <ServiceStatus />

        <section className={styles.card} aria-labelledby="next-milestone-title">
          <p className={styles.cardLabel}>Next milestone</p>
          <h2 id="next-milestone-title">Fixed-video browser validation</h2>
          <p>
            The next non-public build will exercise a prechecked embedded video
            and microphone recording on the supported browser matrix. It will
            not need a YouTube Data API credential.
          </p>
        </section>

        <section className={styles.card} aria-labelledby="privacy-boundary-title">
          <p className={styles.cardLabel}>Architecture boundary</p>
          <h2 id="privacy-boundary-title">Audio stays out of the API</h2>
          <p>
            The server boundary is intentionally narrow. Future eligibility
            requests may carry only a candidate video ID; learner audio has no
            server route or shared contract.
          </p>
        </section>
      </div>
    </main>
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

export function App() {
  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label="Shadowing Recorder home">
          <span className={styles.brandMark} aria-hidden="true">
            SR
          </span>
          <span>Shadowing Recorder</span>
        </Link>
        <span className={styles.stage}>Foundation preview</span>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <footer className={styles.footer}>
        <p>Built around a local-first learner-audio boundary.</p>
      </footer>
    </div>
  )
}

