import { useEffect, useState } from 'react'

import { HealthResponseSchema } from '@shadowing-recorder/contracts'

import styles from './ServiceStatus.module.css'

type ConnectionState = 'checking' | 'connected' | 'unavailable'

const messages: Record<ConnectionState, string> = {
  checking: 'Checking the same-origin API…',
  connected: 'Web application and API are connected.',
  unavailable: 'The API is unavailable. Start both workspace applications.',
}

export function ServiceStatus() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('checking')

  useEffect(() => {
    const abortController = new AbortController()

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', {
          headers: { Accept: 'application/json' },
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`Health request failed with status ${response.status}`)
        }

        HealthResponseSchema.parse(await response.json())

        if (!abortController.signal.aborted) {
          setConnectionState('connected')
        }
      } catch (error) {
        if (
          !abortController.signal.aborted &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setConnectionState('unavailable')
        }
      }
    }

    void checkHealth()

    return () => {
      abortController.abort()
    }
  }, [])

  return (
    <section className={styles.card} aria-labelledby="service-status-title">
      <p className={styles.label}>Walking skeleton</p>
      <h2 id="service-status-title">Single-service health</h2>
      <p className={styles.status} role="status" aria-live="polite">
        <span
          className={styles.indicator}
          data-state={connectionState}
          aria-hidden="true"
        />
        {messages[connectionState]}
      </p>
    </section>
  )
}

