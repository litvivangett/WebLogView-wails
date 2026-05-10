import { useState, useEffect, useRef } from 'preact/hooks';
import { Events } from '@wailsio/runtime';
import { subscribeToWailsLogEvents } from './subscribeToWailsLogEvents.js';

/**
 * Hook that listens to Wails events for log streaming on a specific tab.
 * Replaces useWebSocket for the Wails desktop app.
 *
 * @param {string} tabId - Unique identifier for this tab's log stream
 * @param {{ onEvent?: ((event: object) => void), onError?: ((error: string) => void) }} [options]
 * @returns {{ lastEvent: object|null, error: string|null }}
 */
export function useWailsLogs(tabId, options = {}) {
  const [lastEvent, setLastEvent] = useState(null);
  const [error, setError] = useState(null);
  const onEventRef = useRef(options.onEvent);
  const onErrorRef = useRef(options.onError);

  useEffect(() => {
    onEventRef.current = options.onEvent;
    onErrorRef.current = options.onError;
  });

  useEffect(() => {
    setError(null);
    setLastEvent(null);

    return subscribeToWailsLogEvents({
      tabId,
      eventsApi: Events,
      onEvent: (event) => {
        setLastEvent(event);
        onEventRef.current?.(event);
      },
      onError: (nextError) => {
        setError(nextError);
        onErrorRef.current?.(nextError);
      },
    });
  }, [tabId]);

  return { lastEvent, error };
}
