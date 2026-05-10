import test from 'node:test';
import assert from 'node:assert/strict';

import { mapLogEvent, reduceLogViewerState } from '../logLifecycle.js';
import { subscribeToWailsLogEvents } from './subscribeToWailsLogEvents.js';

test('mapLogEvent maps progressive lifecycle events for the active tab', () => {
  assert.deepEqual(
    mapLogEvent('log-initial-start', { tabId: 'tab-1' }, 'tab-1'),
    { type: 'initial-start' }
  );
  assert.deepEqual(
    mapLogEvent('log-initial-chunk', { tabId: 'tab-1', lines: ['a', 'b'] }, 'tab-1'),
    { type: 'initial-chunk', lines: ['a', 'b'] }
  );
  assert.deepEqual(
    mapLogEvent('log-initial-complete', { tabId: 'tab-1' }, 'tab-1'),
    { type: 'initial-complete' }
  );
});

test('mapLogEvent preserves legacy initial payload compatibility', () => {
  assert.deepEqual(
    mapLogEvent('log-initial', { tabId: 'tab-1', lines: ['legacy'] }, 'tab-1'),
    { type: 'initial', lines: ['legacy'] }
  );
});

test('mapLogEvent ignores unrelated tabs and unknown lifecycle events', () => {
  assert.equal(mapLogEvent('log-initial-start', { tabId: 'tab-2' }, 'tab-1'), null);
  assert.equal(mapLogEvent('log-unknown', { tabId: 'tab-1' }, 'tab-1'), null);
  assert.equal(mapLogEvent('log-initial-start', null, 'tab-1'), null);
});

test('reduceLogViewerState tracks progressive initial loading until complete', () => {
  let state = { lines: ['existing'], isLoadingInitial: false };

  state = reduceLogViewerState(state, { type: 'initial-start' });
  assert.deepEqual(state, {
    lines: ['existing'],
    isLoadingInitial: true,
  });

  state = reduceLogViewerState(state, { type: 'initial-chunk', lines: ['chunk-1'] });
  state = reduceLogViewerState(state, { type: 'initial-chunk', lines: ['chunk-2'] });
  assert.deepEqual(state, {
    lines: ['existing', 'chunk-1', 'chunk-2'],
    isLoadingInitial: true,
  });

  state = reduceLogViewerState(state, { type: 'initial-complete' });
  assert.deepEqual(state, {
    lines: ['existing', 'chunk-1', 'chunk-2'],
    isLoadingInitial: false,
  });
});

test('reduceLogViewerState applies legacy initial payload as a complete snapshot', () => {
  const nextState = reduceLogViewerState(
    { lines: ['stale'], isLoadingInitial: true },
    { type: 'initial', lines: ['legacy-1', 'legacy-2'] }
  );

  assert.deepEqual(nextState, {
    lines: ['legacy-1', 'legacy-2'],
    isLoadingInitial: false,
  });
});

test('subscribeToWailsLogEvents forwards every matching event in order', () => {
  const listeners = new Map();
  const eventsApi = {
    On(eventName, callback) {
      listeners.set(eventName, callback);
      return () => listeners.delete(eventName);
    },
  };

  const received = [];
  const cleanup = subscribeToWailsLogEvents({
    tabId: 'tab-1',
    eventsApi,
    onEvent: (event) => received.push(event),
  });

  listeners.get('log-initial-start')({ data: { tabId: 'tab-1' } });
  listeners.get('log-initial-chunk')({ data: { tabId: 'tab-1', lines: ['a'] } });
  listeners.get('log-lines')({ data: { tabId: 'tab-1', lines: ['b'] } });

  assert.deepEqual(received, [
    { type: 'initial-start' },
    { type: 'initial-chunk', lines: ['a'] },
    { type: 'lines', lines: ['b'] },
  ]);

  cleanup();
});

test('subscribeToWailsLogEvents cleans up lifecycle subscriptions', () => {
  const activeSubscriptions = new Set();
  const eventsApi = {
    On(eventName, callback) {
      const token = { eventName, callback };
      activeSubscriptions.add(token);
      return () => activeSubscriptions.delete(token);
    },
  };

  const cleanup = subscribeToWailsLogEvents({
    tabId: 'tab-1',
    eventsApi,
    onEvent: () => {},
    onError: () => {},
  });

  assert.equal(activeSubscriptions.size, 6);

  cleanup();

  assert.equal(activeSubscriptions.size, 0);
});
