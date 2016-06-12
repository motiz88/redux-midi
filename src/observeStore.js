export default function observeStore ({getState, subscribe}, select, onChange) {
  let currentState;

  function handleChange () {
    const nextState = select(getState());
    if (nextState !== currentState) {
      const prevState = currentState;
      currentState = nextState;
      onChange(currentState, prevState);
    }
  }

  let unsubscribe = subscribe(handleChange);
  handleChange();
  return unsubscribe;
}
