import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeRecorderEnvironment } from '../test/recorderFakes.js'
import { parseVideoConfiguration } from '../videoConfiguration.js'
import { RecorderSpike } from './RecorderSpike.js'

const configuredVideo = parseVideoConfiguration('stage1_test')

describe('RecorderSpike', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a clear disabled state without an iframe or microphone controls', () => {
    render(
      <RecorderSpike videoConfiguration={parseVideoConfiguration('invalid')} />,
    )

    expect(
      screen.getByRole('heading', { name: 'Recorder configuration required' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'VITE_SHADOWING_VIDEO_ID',
    )
    expect(
      screen.queryByTitle('Shadowing practice video'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start recording' }),
    ).not.toBeInTheDocument()
  })

  it('announces status and exposes only state-appropriate controls', async () => {
    const environment = createFakeRecorderEnvironment()
    let resolvePermission: (() => void) | undefined
    environment.microphone.requestImplementation = () =>
      new Promise((resolve) => {
        resolvePermission = () => resolve(environment.stream)
      })

    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        origin="http://127.0.0.1:3000"
        videoConfiguration={configuredVideo}
      />,
    )

    const start = screen.getByRole('button', { name: 'Start recording' })
    const pause = screen.getByRole('button', { name: 'Pause' })
    const resume = screen.getByRole('button', { name: 'Resume' })
    const stop = screen.getByRole('button', { name: 'Stop' })

    expect(screen.getByRole('status')).toHaveTextContent('Ready to record')
    expect(start).toBeEnabled()
    expect(pause).toBeDisabled()
    expect(resume).toBeDisabled()
    expect(stop).toBeDisabled()

    fireEvent.click(start)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for microphone permission',
    )
    expect(start).toBeDisabled()

    resolvePermission?.()
    expect(
      await screen.findByText('Recording your microphone.'),
    ).toBeInTheDocument()
    expect(pause).toBeEnabled()
    expect(stop).toBeEnabled()

    fireEvent.click(pause)
    expect(screen.getByRole('status')).toHaveTextContent('Recording paused')
    expect(resume).toBeEnabled()
    expect(pause).toBeDisabled()

    fireEvent.click(resume)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Recording your microphone',
    )
  })

  it('renders diagnostics and playable output after final data and stop', async () => {
    const environment = createFakeRecorderEnvironment()
    const pausePlayback = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)
    const { unmount } = render(
      <RecorderSpike
        dependencies={environment.dependencies}
        videoConfiguration={configuredVideo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await screen.findByText('Recording your microphone.')
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()

    const recorder = environment.recorderFactory.recorders[0]
    act(() => {
      recorder?.emitData(
        new Blob(['voice'], { type: 'audio/webm;codecs=opus' }),
      )
    })
    expect(screen.getByRole('status')).toHaveTextContent('Finishing')

    act(() => {
      recorder?.emitStop()
    })

    expect(screen.getByLabelText('Latest recording playback')).toHaveAttribute(
      'src',
      'blob:recording-1',
    )
    expect(screen.getByText('audio/webm;codecs=opus')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('dataavailable (5 bytes)')).toBeInTheDocument()
    expect(screen.getByText('stop')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(pausePlayback).toHaveBeenCalledOnce()
    expect(
      screen.queryByLabelText('Latest recording playback'),
    ).not.toBeInTheDocument()

    unmount()
    await waitFor(() => {
      expect(environment.objectUrls.revokedUrls).toEqual(['blob:recording-1'])
    })
    expect(environment.recorderFactory.recorders[1]?.stopCalls).toBe(1)
    expect(environment.stream.tracks[0]?.stopCalls).toBe(2)
  })

  it('announces retryable permission and lifecycle errors', async () => {
    const environment = createFakeRecorderEnvironment()
    environment.microphone.requestImplementation = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
    render(
      <RecorderSpike
        dependencies={environment.dependencies}
        videoConfiguration={configuredVideo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Microphone permission was denied',
    )
    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toBeEnabled()

    environment.microphone.requestImplementation = async () =>
      environment.stream
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    await screen.findByText('Recording your microphone.')

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('page was hidden')
    expect(environment.stream.tracks[0]?.stopCalls).toBe(1)
    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toBeEnabled()
  })
})
