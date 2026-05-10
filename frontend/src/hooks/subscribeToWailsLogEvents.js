import { mapLogEvent } from '../logLifecycle.js';

export function subscribeToWailsLogEvents({ tabId, eventsApi, onEvent, onError }) {
  if (!tabId) {
    return () => {};
  }

  const eventNames = [
    'log-initial-start',
    'log-initial-chunk',
    'log-initial-complete',
    'log-initial',
    'log-lines',
  ];

  const cleanups = eventNames.map((eventName) =>
    eventsApi.On(eventName, (event) => {
      const mappedEvent = mapLogEvent(eventName, event.data, tabId);
      if (mappedEvent) {
        onEvent?.(mappedEvent);
      }
    })
  );

  cleanups.push(
    eventsApi.On('log-error', (event) => {
      if (event.data && event.data.tabId === tabId) {
        onError?.(event.data.error);
      }
    })
  );

  return () => {
    cleanups.forEach((cleanup) => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });
  };
}
