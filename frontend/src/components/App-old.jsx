import { useState, useEffect, useMemo } from 'preact/hooks';
import { ControlBar } from './ControlBar';
import { LogViewer } from './LogViewer';
import { DropZone } from './DropZone';
import { useWebSocket } from '../hooks/useWebSocket';

export function App() {
  const [lines, setLines] = useState([]);
  const [includeFilter, setIncludeFilter] = useState('');
  const [excludeFilter, setExcludeFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { sendMessage, lastMessage, connectionStatus } = useWebSocket(
    `ws://${window.location.host}/ws`
  );

  useEffect(() => {
    setConnected(connectionStatus === 'connected');
  }, [connectionStatus]);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage]);

  const handleWebSocketMessage = (message) => {
    const data = JSON.parse(message.data);
    
    switch (data.type) {
      case 'lines':
        setLines(prev => [...prev, ...data.lines]);
        break;
      case 'initial':
        setLines(data.lines || []);
        break;
      case 'clear':
        setLines([]);
        break;
      case 'error':
        console.error('WebSocket error:', data.message);
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
  };

  const handleFileDrop = (filePath) => {
    if (filePath && connected) {
      sendMessage({
        type: 'open',
        path: filePath,
        tail: 1000,
      });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // For now, we'll use the file name - in production we'd need the full path
      // This will require backend support for file browser or path resolution
      handleFileDrop(file.path || file.name);
    }
  };

  const filteredLines = useMemo(() => {
    let filtered = lines;

    if (includeFilter) {
      try {
        const regex = new RegExp(includeFilter, 'i');
        filtered = filtered.filter(line => regex.test(line));
      } catch (e) {
        // Invalid regex, skip filtering
      }
    }

    if (excludeFilter) {
      try {
        const regex = new RegExp(excludeFilter, 'i');
        filtered = filtered.filter(line => !regex.test(line));
      } catch (e) {
        // Invalid regex, skip filtering
      }
    }

    return filtered;
  }, [lines, includeFilter, excludeFilter]);

  const hasLog = lines.length > 0;
  const hasFilters = includeFilter || excludeFilter;

  return (
    <div 
      style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Main Log Area A (always shows full log) */}
      <div style={{ flex: 1, position: 'relative' }}>
        {hasLog ? (
          <LogViewer
            lines={lines}
            autoScroll={autoScroll}
            title="All Lines"
          />
        ) : (
          <DropZone isDragging={isDragging} />
        )}
      </div>

      {/* Control Bar */}
      <ControlBar
        includeFilter={includeFilter}
        onIncludeFilterChange={setIncludeFilter}
        excludeFilter={excludeFilter}
        onExcludeFilterChange={setExcludeFilter}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        filteredLineCount={filteredLines.length}
        totalLines={lines.length}
      />

      {/* Main Log Area B (filtered results - always visible) */}
      <div style={{ flex: 1, borderTop: '1px solid #3c3c3c' }}>
        {hasLog ? (
          <LogViewer
            lines={filteredLines}
            autoScroll={autoScroll}
            title={hasFilters ? "Filtered Lines" : "All Lines"}
          />
        ) : (
          <div style={{ height: '100%', backgroundColor: '#1e1e1e' }} />
        )}
      </div>
    </div>
  );
}
