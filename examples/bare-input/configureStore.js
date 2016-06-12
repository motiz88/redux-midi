import setup, {reducer as midiReducer, RECEIVE_MIDI_MESSAGE} from '../../src';
import {createStore, applyMiddleware, compose, combineReducers} from 'redux';

export default function configureStore () {
  const rootReducer = combineReducers({
    midi: midiReducer,
    midiMessages: (state, action) => {
      if (!state) state = [];
      if (action.type === RECEIVE_MIDI_MESSAGE) {
        state = [action.payload, ...state];
      }
      return state;
    }
  });

  const {inputMiddleware, outputMiddleware} = setup({midiOptions: {sysex: true}});

  return createStore(rootReducer, compose(
    applyMiddleware(inputMiddleware, outputMiddleware),
    global.devToolsExtension ? global.devToolsExtension() : f => f
  ));
}
