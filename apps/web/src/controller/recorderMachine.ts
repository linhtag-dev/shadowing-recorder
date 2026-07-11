import { createMachine } from 'xstate'

export type RecorderState =
  | 'armed'
  | 'buffering'
  | 'disabled'
  | 'error'
  | 'finalising'
  | 'recording'
  | 'requestingMic'

export type RecorderMachineEvent =
  | { type: 'DISABLE' }
  | { type: 'ENABLE' }
  | { type: 'FAILURE' }
  | { type: 'FINALISED' }
  | { type: 'FINALISED_DISABLED' }
  | { type: 'MICROPHONE_GRANTED' }
  | { type: 'PLAYER_BUFFERING' }
  | { type: 'PLAYER_PLAYING' }
  | { type: 'PLAYER_STOPPED' }

export const recorderMachine = createMachine({
  id: 'practiceRecorder',
  initial: 'disabled',
  states: {
    armed: {
      on: {
        DISABLE: 'disabled',
        FAILURE: 'error',
        PLAYER_PLAYING: 'recording',
      },
    },
    buffering: {
      on: {
        FAILURE: 'error',
        PLAYER_PLAYING: 'recording',
        PLAYER_STOPPED: 'finalising',
      },
    },
    disabled: {
      on: {
        ENABLE: 'requestingMic',
      },
    },
    error: {
      on: {
        DISABLE: 'disabled',
        ENABLE: 'requestingMic',
      },
    },
    finalising: {
      on: {
        FAILURE: 'error',
        FINALISED: 'armed',
        FINALISED_DISABLED: 'disabled',
      },
    },
    recording: {
      on: {
        FAILURE: 'error',
        PLAYER_BUFFERING: 'buffering',
        PLAYER_STOPPED: 'finalising',
      },
    },
    requestingMic: {
      on: {
        DISABLE: 'disabled',
        FAILURE: 'error',
        MICROPHONE_GRANTED: 'armed',
      },
    },
  },
  types: {} as {
    events: RecorderMachineEvent
  },
})
