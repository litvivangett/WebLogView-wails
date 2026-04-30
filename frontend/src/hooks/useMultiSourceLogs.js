import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useWebSocket } from './useWebSocket';

export function useMultiSourceLogs() {
  const [sources, setSources] = useState([]); // Array of {id, name, wsUrl, sendMessage, lines}
  const [allLines, setAllLines] = useState([]);
  const sourceMessagesRef = useRef({});

  const addSource = useCallback((sourceData) => {
    const sourceId = Date.now() + Math.random();
    const wsUrl = `ws://${window.location.host}/ws`;
    
    setSources(prev => [
      ...prev,
      {
        id: sourceId,
        name: sourceData.name,
        wsUrl,
        lines: sourceData.lines || [],
        config: sourceData.config // K8s config or file path
      }
    ]);

    return sourceId;
  }, []);

  const removeSource = useCallback((sourceId) => {
    setSources(prev => prev.filter(s => s.id !== sourceId));
    delete sourceMessagesRef.current[sourceId];
  }, []);

  // Handle messages from a specific source
  const handleSourceMessage = useCallback((sourceId, sourceName, message) => {
    const data = JSON.parse(message.data);
    
    const prefix = `[${sourceName}] `;
    
    switch (data.type) {
      case 'lines':
        const newLines = data.lines.map(line => ({ source: sourceName, text: prefix + line }));
        setAllLines(prev => [...prev, ...newLines]);
        break;
      case 'initial':
        const initialLines = (data.lines || []).map(line => ({ source: sourceName, text: prefix + line }));
        setAllLines(prev => [...prev, ...initialLines]);
        break;
      case 'clear':
        // Clear only lines from this source
        setAllLines(prev => prev.filter(line => line.source !== sourceName));
        break;
    }
  }, []);

  return {
    sources,
    allLines,
    addSource,
    removeSource,
    handleSourceMessage
  };
}
