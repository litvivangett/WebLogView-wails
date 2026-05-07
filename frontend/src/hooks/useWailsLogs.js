import { useState, useEffect, useRef } from 'preact/hooks';
import { Events } from '@wailsio/runtime';

/**
 * Hook that listens to Wails events for log streaming on a specific tab.
 * Replaces useWebSocket for the Wails desktop app.
 *
 * @param {string} tabId - Unique identifier for this tab's log stream
 * @returns {{ lastEvent: object|null, error: string|null }}
 */
export function useWailsLogs(tabId) {
  const [lastEvent, setLastEvent] = useState(null);
  const [error, setError] = useState(null);
  const cleanupRef = useRef([]);

  useEffect(() => {
    if (!tabId) return;
    setError(null);

    const unsubInitial = Events.On("log-initial", (event) => {
      if (event.data && event.data.tabId === tabId) {
        setLastEvent({ type: 'initial', lines: event.data.lines });
      }
    });

    const unsubLines = Events.On("log-lines", (event) => {
      if (event.data && event.data.tabId === tabId) {
        setLastEvent({ type: 'lines', lines: event.data.lines });
      }
    });

    const unsubError = Events.On("log-error", (event) => {
      if (event.data && event.data.tabId === tabId) {
        setError(event.data.error);
      }
    });

    cleanupRef.current = [unsubInitial, unsubLines, unsubError];

    return () => {
      cleanupRef.current.forEach(unsub => {
        if (unsub && typeof unsub === 'function') unsub();
      });
    };
  }, [tabId]);

  return { lastEvent, error };
}
