import { createMachine } from 'xstate'

export type RecorderState =
  | 'armed'
  | 'buffering'
  | 'disabled'
  | 'error'
  | 'finalising'
  | 'recording'
  | 'requestingMic'
  | 'standby'

export type RecorderMachineEvent =
  | { type: 'DISABLE' }
  | { type: 'ENABLE' }
  | { type: 'ENABLE_MANUAL' }
  | { type: 'START_RECORDING' }
  | { type: 'FAILURE' }
  | { type: 'FINALISED' }
  | { type: 'FINALISED_DISABLED' }
  | { type: 'MICROPHONE_GRANTED' }
  | { type: 'MICROPHONE_NOT_NEEDED' }
  | { type: 'PLAYER_BUFFERING' }
  | { type: 'PLAYER_PLAYING' }
  | { type: 'PLAYER_STOPPED' }
  | { type: 'RELEASE_MICROPHONE' }
  | { type: 'REQUEST_MICROPHONE' }

export const recorderMachine = createMachine({
  id: 'practiceRecorder',
  initial: 'disabled',
  states: {
    armed: {
      on: {
        DISABLE: 'disabled',
        FAILURE: 'error',
        PLAYER_PLAYING: 'recording',
        START_RECORDING: 'recording',
        RELEASE_MICROPHONE: 'standby',
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
        ENABLE_MANUAL: 'standby',
      },
    },
    error: {
      on: {
        DISABLE: 'disabled',
        ENABLE: 'requestingMic',
        ENABLE_MANUAL: 'standby',
      },
    },
    finalising: {
      on: {
        FAILURE: 'error',
        FINALISED: 'standby',
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
        MICROPHONE_NOT_NEEDED: 'standby',
      },
    },
    standby: {
      on: {
        DISABLE: 'disabled',
        FAILURE: 'error',
        REQUEST_MICROPHONE: 'requestingMic',
      },
    },
  },
  types: {} as {
    events: RecorderMachineEvent
  },
})
