import { createMachine } from 'xstate'

export type RecorderState =
  | 'error'
  | 'finalising'
  | 'idle'
  | 'paused'
  | 'ready'
  | 'recording'
  | 'requestingMic'

export type RecorderMachineEvent =
  | { type: 'FAILURE' }
  | { type: 'FINALISED' }
  | { type: 'MICROPHONE_GRANTED' }
  | { type: 'PAUSE' }
  | { type: 'RESET' }
  | { type: 'RESUME' }
  | { type: 'START' }
  | { type: 'STOP' }

export const recorderMachine = createMachine({
  id: 'stageOneRecorder',
  initial: 'idle',
  states: {
    error: {
      on: {
        RESET: 'idle',
        START: 'requestingMic',
      },
    },
    finalising: {
      on: {
        FAILURE: 'error',
        FINALISED: 'ready',
        RESET: 'idle',
      },
    },
    idle: {
      on: {
        START: 'requestingMic',
      },
    },
    paused: {
      on: {
        FAILURE: 'error',
        RESET: 'idle',
        RESUME: 'recording',
        STOP: 'finalising',
      },
    },
    ready: {
      on: {
        RESET: 'idle',
        START: 'requestingMic',
      },
    },
    recording: {
      on: {
        FAILURE: 'error',
        PAUSE: 'paused',
        RESET: 'idle',
        STOP: 'finalising',
      },
    },
    requestingMic: {
      on: {
        FAILURE: 'error',
        MICROPHONE_GRANTED: 'recording',
        RESET: 'idle',
      },
    },
  },
  types: {} as {
    events: RecorderMachineEvent
  },
})
