/* eslint-env mocha */

import { makeMidiEnhancer } from '../../src';
import { createStore } from 'redux';

describe('makeMidiEnhancer', () => {
  it('should be a function', () => {
    makeMidiEnhancer.should.be.a('function');
  });
  it('should be callable with no arguments', () => {
    (() => makeMidiEnhancer()).should.not.throw;
  });
  it('should work as a store enhancer', () => {
    createStore(x => (x || {}), makeMidiEnhancer());
  });
});
