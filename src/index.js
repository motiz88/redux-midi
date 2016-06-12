import { createDuck } from 'redux-duck';

const myDuck = createDuck('midi', 'redux-midi');

export const RECEIVE_DEVICE_LIST = myDuck.defineType('RECEIVE_DEVICE_LIST');
export const SET_LISTENING_DEVICES = myDuck.defineType('SET_LISTENING_DEVICES');
export const RECEIVE_MIDI_MESSAGE = myDuck.defineType('RECEIVE_MIDI_MESSAGE');
export const SEND_MIDI_MESSAGE = myDuck.defineType('SEND_MIDI_MESSAGE');

/**
 * Creates a `RECEIVE_DEVICE_LIST` action.
 * This action is dispatched by the MIDI enhancer at initialization, when devices are connected/disconnected and when devices change state.
 * @param {Array<MIDIDevice>} devices
 */
export const receiveDeviceList = myDuck.createAction(RECEIVE_DEVICE_LIST);

/**
 * Creates a `SET_LISTENING_DEVICES` action. Dispatch this action with the `id`s of MIDI input devices you would like to receive messages from.
 * @param {Array<string>} listeningDevices
 */
export const setListeningDevices = myDuck.createAction(SET_LISTENING_DEVICES);

/**
 * Creates a `RECEIVE_MIDI_MESSAGE` action. This action is dispatched by the MIDI enhancer when a message received from a device you're listening to.
 * @param {MIDIMessage} message
 * @param {Uint8Array} message.data
 * @param {DOMHighResTimeStamp} message.timestamp
 * @param {string} message.device - ID of the source device
 */
export const receiveMidiMessage = myDuck.createAction(RECEIVE_MIDI_MESSAGE);

/**
 * Creates a `SEND_MIDI_MESSAGE` action. Dispatch this action to send a MIDI message to a specified device.
 * @param {MIDIMessage} message
 * @param {Uint8Array} message.data
 * @param {DOMHighResTimeStamp} message.timestamp
 * @param {string} message.device - ID of the destination device
 */
export const sendMidiMessage = myDuck.createAction(SEND_MIDI_MESSAGE);

const initialState = {
  devices: [],
  listeningDevices: []
};
/**
 * Reduces MIDI I/O and device discovery actions to state changes.
 * Maintains state in two keys: devices (an array of device objects straight from the underlying Web MIDI API) and `listeningDevices` (an array of device IDs being listened to).
 * @example
 * import { createStore, applyMiddleware, combineReducers } from 'redux';
 * import setup, { reducer } from 'redux-midi';
 * const {inputMiddleware, outputMiddleware} = setup();
 * const store = createStore(combineReducers({midi: reducer}), initialState, applyMiddleware(inputMiddleware, outputMiddleware));
 */
export const reducer = myDuck.createReducer({
  [RECEIVE_DEVICE_LIST]: (state, action) => ({
    ...state,
    devices: action.payload
  }),
  [SET_LISTENING_DEVICES]: (state, action) => ({
    ...state,
    listeningDevices: action.payload
  })
}, initialState);

import sortBy from 'lodash.sortby';
import deepEqual from 'deep-equal';

const defaultRequestMIDIAccess = (global && global.navigator && global.navigator.requestMIDIAccess.bind(global.navigator)) || (
  () => Promise.reject(new Error('Web MIDI API not available'))
);

/**
 * Create a pair of Redux {@link https://github.com/reactjs/redux/blob/master/docs/Glossary.md#middleware|middleware} functions wrapping MIDI I/O and device discovery.
 * The input middleware dispatches RECEIVE_DEVICE_LIST whenever the list of MIDI devices changes and RECEIVE_MIDI_MESSAGE when MIDI messages are received on devices that are being listened to.
 * The output middleware sends MIDI messages to output devices as a side effect of SEND_MIDI_MESSAGE actions.
 * @param {MIDIOptions} [$0.midiOptions] - Options with which to invoke `requestMIDIAccess`.
 * @param {string} [$0.stateKey='midi'] - The state key at which redux-midi's reducer is mounted.
 * @param {function(MIDIOptions): Promise<MIDIAccess>} [$0.requestMIDIAccess=navigator.requestMIDIAccess] - Web MIDI API entry point.
 * @example
 * import { createStore, applyMiddleware, combineReducers } from 'redux';
 * import setup, { reducer } from 'redux-midi';
 * const {inputMiddleware, outputMiddleware} = setup();
 * const store = createStore(combineReducers({midi: reducer}), initialState, applyMiddleware(inputMiddleware, outputMiddleware));
 */
export default function setup ({midiOptions, stateKey = 'midi', requestMIDIAccess = defaultRequestMIDIAccess}) {
  let midiAccess;
  const requestMIDIAccessOnce = () => {
    if (midiAccess) return Promise.resolve(midiAccess);

    midiAccess = requestMIDIAccess(midiOptions)
      .then(receivedMidiAccess => {
        midiAccess = receivedMidiAccess;
        return midiAccess;
      });
    return midiAccess;
  };

  const inputMiddleware = ({dispatch, getState}) => {
    return next => {
      requestMIDIAccessOnce().then(() => {
        const sendDeviceList = () => {
          const devices = sortBy([...midiAccess.inputs.values(), ...midiAccess.outputs.values()].map(device => ({
            id: device.id,
            manufacturer: device.manufacturer,
            name: device.name,
            type: device.type,
            version: device.version,
            state: device.state,
            connection: device.connection
          })), 'id');
          if (!deepEqual(devices, getState()[stateKey].devices)) {
            dispatch(receiveDeviceList(devices));
          }
        };

        midiAccess.onstatechange = () => sendDeviceList();
        Promise.resolve()
          .then(sendDeviceList);
      });

      return action => {
        const toListen = [];
        const toUnlisten = [];
        const prevState = getState()[stateKey] || initialState;
        action = next(action);
        const state = getState()[stateKey];

        if (state.listeningDevices !== prevState.listeningDevices) {
          let prev = new Set(prevState ? prevState.listeningDevices : []);
          let next = new Set(state.listeningDevices);
          toUnlisten.push(...prevState.listeningDevices.filter(dev => !next.has(dev)));
          toListen.push(...state.listeningDevices.filter(dev => !prev.has(dev)));
        }

        if (state.devices !== prevState.devices) {
          let prev = new Set(prevState.devices.map(device => device.id));
          let next = new Set(state.devices.map(device => device.id));
          toListen.push(...state.listeningDevices.filter(device => midiAccess.inputs.has(device) && next.has(device) && !prev.has(device)));
        }

        for (let device of toUnlisten) {
          if (midiAccess.inputs.has(device)) {
            midiAccess.inputs.get(device).onmidimessage = null;
          }
        }

        for (let device of toListen) {
          if (midiAccess.inputs.has(device)) {
            midiAccess.inputs.get(device).onmidimessage = ({receivedTime, timeStamp, timestamp, data}) => {
              timestamp = [receivedTime, timeStamp, timestamp].filter(x => x !== undefined)[0];
              dispatch(receiveMidiMessage({ timestamp, data, device }));
            };
          }
        }
        return action;
      };
    };
  };

  const outputMiddleware = () => next => action => {
    action = next(action);
    if (action.type === SEND_MIDI_MESSAGE) {
      const {payload} = action;
      const {timestamp, data, device} = payload;
      const send = () => {
        const {outputs} = midiAccess;
        if (outputs.has(device)) {
          outputs.get(device).send(data, timestamp);
        }
      };
      if (midiAccess && !midiAccess.then) send();
      else requestMIDIAccessOnce().then(send);
    }
    return action;
  };

  return { inputMiddleware, outputMiddleware };
}
