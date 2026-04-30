import { useState, useEffect, useMemo, useImperativeHandle, useRef } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import { ControlBar } from './ControlBar';
import { LogViewer } from './LogViewer';
import { DropZone } from './DropZone';
import { ResizablePanes } from './ResizablePanes';
import { SettingsModal } from './SettingsModal';
import { LogDetailModal } from './LogDetailModal';
import { useWebSocket } from '../hooks/useWebSocket';

// Color palette for different log sources
const SOURCE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
];

// Generate color for a source based on its name
const getSourceColor = (sourceName, sourceIndex) => {
  return SOURCE_COLORS[sourceIndex % SOURCE_COLORS.length];
};

export const LogViewerTab = forwardRef(({ tabId, onTitleChange }, ref) => {
  const [lines, setLines] = useState([]);
  const [logSources, setLogSources] = useState([]); // Array of {id, name, color}
  const [mergedTabRefs, setMergedTabRefs] = useState([]); // Refs to merged tabs
  const [currentSourceId, setCurrentSourceId] = useState(null); // Primary source
  const [includeFilter, setIncludeFilter] = useState('');
  const [excludeFilter, setExcludeFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renderAnsiTopPane, setRenderAnsiTopPane] = useState(true);
  const [renderAnsiBottomPane, setRenderAnsiBottomPane] = useState(true);
  const [highlightedLineIndex, setHighlightedLineIndex] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [modalLogLine, setModalLogLine] = useState(null);
  const [modalLineNumber, setModalLineNumber] = useState(null);
  const messageCallbacks = useRef([]); // Callbacks for other tabs to receive our messages
  const sourceColorMapRef = useRef({}); // Map source names to colors for quick lookup

  const { sendMessage, lastMessage, connectionStatus } = useWebSocket(
    `ws://${window.location.host}/ws`
  );

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getLogData: () => ({
      lines,
      fileName,
      tabId
    }),
    mergeLogsFrom: (sourceData) => {
      const sourceName = sourceData.fileName || 'Unknown';
      const sourceTabId = sourceData.tabId;
      
      // If this is the first merge, prefix existing lines too
      if (logSources.length === 0 && fileName) {
        const currentColor = getSourceColor(fileName, 0);
        const currentPrefixedLines = lines.map(line => `[${fileName}]|||${currentColor}|||${line}`);
        
        // Prefix the incoming source lines too
        const sourceColor = getSourceColor(sourceName, 1);
        const sourcePrefixedLines = sourceData.lines.map(line => `[${sourceName}]|||${sourceColor}|||${line}`);
        
        setLines([...currentPrefixedLines, ...sourcePrefixedLines]);
        
        // Store colors in ref for quick lookup
        sourceColorMapRef.current[fileName] = currentColor;
        sourceColorMapRef.current[sourceName] = sourceColor;
        
        // Mark that we're now in merged mode - track both sources
        setLogSources([
          { id: tabId, name: fileName, color: currentColor }, // Primary source
          { id: sourceTabId, name: sourceName, color: sourceColor } // Merged source
        ]);
      } else {
        // Prefix the incoming lines with the source color
        const sourceColor = getSourceColor(sourceName, logSources.length);
        const prefixedLines = sourceData.lines.map(line => `[${sourceName}]|||${sourceColor}|||${line}`);
        
        // Store color in ref
        sourceColorMapRef.current[sourceName] = sourceColor;
        
        // Just append new lines
        setLines(prev => [...prev, ...prefixedLines]);
        
        // Add source if it's new
        if (!logSources.find(s => s.id === sourceTabId)) {
          setLogSources(prev => [...prev, { id: sourceTabId, name: sourceName, color: sourceColor }]);
        }
      }
      
      // Update title only on first merge
      if (logSources.length === 0) {
        const totalSources = 2; // Current + merged
        onTitleChange(`Merged (${totalSources} sources)`);
      }
    },
    addLinesFromSource: (sourceName, newLines) => {
      // Get color from ref (set during merge)
      const color = sourceColorMapRef.current[sourceName] || getSourceColor(sourceName, 0);
      
      // Add new lines with prefix and color
      const prefixedLines = newLines.map(line => `[${sourceName}]|||${color}|||${line}`);
      setLines(prev => [...prev, ...prefixedLines]);
    },
    subscribeToMessages: (callback) => {
      // Allow another tab to subscribe to our messages
      messageCallbacks.current.push(callback);
      return () => {
        messageCallbacks.current = messageCallbacks.current.filter(cb => cb !== callback);
      };
    },
    cleanup: () => {
      // Close WebSocket connection gracefully
      // The useWebSocket cleanup will handle the actual close
    },
    getMergedSourceIds: () => {
      // Return IDs of all merged source tabs
      return logSources.filter(s => s.id !== tabId).map(s => s.id);
    }
  }), [lines, fileName, logSources, tabId]);

  const getRandomColor = () => {
    const colors = ['#007acc', '#4ec9b0', '#ce9178', '#c586c0', '#9cdcfe', '#4fc1ff'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  useEffect(() => {
    setConnected(connectionStatus === 'connected');
  }, [connectionStatus]);

  useEffect(() => {
    // Load settings on mount
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setRenderAnsiTopPane(data.renderAnsiTopPane);
        setRenderAnsiBottomPane(data.renderAnsiBottomPane);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSettingsClose = () => {
    setSettingsOpen(false);
    // Reload settings after modal closes
    loadSettings();
  };

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage]);

  const handleWebSocketMessage = (message) => {
    if (!message || !message.data) {
      console.warn('Received invalid WebSocket message:', message);
      return;
    }
    
    try {
      const data = JSON.parse(message.data);
    
    // Determine if we should prefix lines (merged mode)
    const shouldPrefix = logSources.length > 0;
    
    // Get color for this source from logSources array
    let color = null;
    if (shouldPrefix && fileName) {
      const source = logSources.find(s => s.name === fileName);
      color = source ? source.color : getSourceColor(fileName, 0);
    }
    const prefix = shouldPrefix && fileName ? `[${fileName}]|||${color}|||` : '';
    
    switch (data.type) {
      case 'lines':
        const newLines = shouldPrefix ? data.lines.map(line => `${prefix}${line}`) : data.lines;
        setLines(prev => [...prev, ...newLines]);
        
        // Notify subscribers (merged tabs) with UNPREFIXED lines
        // Let the subscriber add its own prefix
        messageCallbacks.current.forEach(callback => {
          callback(data.lines); // Send original unprefixed lines
        });
        break;
      case 'initial':
        const initialLines = shouldPrefix ? (data.lines || []).map(line => `${prefix}${line}`) : (data.lines || []);
        setLines(initialLines);
        break;
      case 'clear':
        setLines([]);
        break;
      case 'error':
        console.error('WebSocket error:', data.message || data.error);
        const errorMsg = data.message || data.error;
        setErrorMessage(errorMsg);
        // Don't show alert - the banner is enough and more visible
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
    } catch (error) {
      console.error('Error handling WebSocket message:', error, 'Raw message:', message);
    }
  };

  const handleFileOpen = (filePath) => {
    if (filePath && connected) {
      // Extract filename from path for tab title
      const fileName = filePath.split('/').pop().split('\\').pop();
      const message = {
        type: 'open',
        path: filePath,
        // tail is omitted - backend will use settings value
      };
      sendMessage(message);
      setFileName(fileName);
      onTitleChange(fileName);
    } else {
      if (!connected) {
        alert('WebSocket not connected. Please wait...');
      }
    }
  };

  const handleK8sConnect = async (k8sConfig) => {
    if (connected) {
      // Fetch settings to get sourceNameFormat
      let sourceNameFormat = 'container'; // default
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          sourceNameFormat = settings.sourceNameFormat || 'container';
        }
      } catch (err) {
        console.warn('Failed to fetch settings, using default sourceNameFormat:', err);
      }

      const message = {
        type: 'open-k8s',
        namespace: k8sConfig.namespace,
        podName: k8sConfig.podName,
        containerName: k8sConfig.containerName,
        // tail is omitted - backend will use settings value
      };
      sendMessage(message);
      
      // Determine display name based on sourceNameFormat
      let displayName;
      switch (sourceNameFormat) {
        case 'container':
          displayName = k8sConfig.containerName;
          break;
        case 'pod':
          displayName = k8sConfig.podName;
          break;
        case 'namespace/pod':
        default:
          displayName = `${k8sConfig.namespace}/${k8sConfig.podName}`;
          break;
      }
      
      setFileName(displayName);
      onTitleChange(displayName);
    } else {
      alert('WebSocket not connected. Please wait...');
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
      // Note: file.path is only available in Electron, not in browsers
      // For now, we'll just use the name and user needs to enter full path
      if (file.path) {
        handleFileOpen(file.path);
      }
    }
  };

  const filteredLines = useMemo(() => {
    let filtered = [];
    let originalIndices = [];

    if (includeFilter) {
      try {
        const regex = new RegExp(includeFilter, 'i');
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            filtered.push(line);
            originalIndices.push(index);
          }
        });
      } catch (e) {
        // Invalid regex, use all lines
        filtered = lines;
        originalIndices = lines.map((_, i) => i);
      }
    } else {
      filtered = lines;
      originalIndices = lines.map((_, i) => i);
    }

    if (excludeFilter) {
      try {
        const regex = new RegExp(excludeFilter, 'i');
        const temp = [];
        const tempIndices = [];
        filtered.forEach((line, i) => {
          if (!regex.test(line)) {
            temp.push(line);
            tempIndices.push(originalIndices[i]);
          }
        });
        filtered = temp;
        originalIndices = tempIndices;
      } catch (e) {
        // Invalid regex, skip filtering
      }
    }

    return { lines: filtered, originalIndices };
  }, [lines, includeFilter, excludeFilter]);

  const handleLineClick = (filteredIndex) => {
    const originalIndex = filteredLines.originalIndices[filteredIndex];
    setHighlightedLineIndex(originalIndex);
    setAutoScroll(false);
  };

  const handleLineDoubleClick = (index, lineContent) => {
    setModalLogLine(lineContent);
    setModalLineNumber(index + 1);
  };

  const handleCloseModal = () => {
    setModalLogLine(null);
    setModalLineNumber(null);
  };

  const hasLog = lines.length > 0;
  const hasConnection = fileName !== ''; // Check if connected to a log source
  const hasFilters = includeFilter || excludeFilter;

  return (
    <div 
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {errorMessage && (
        <div style={{
          backgroundColor: '#ff4444',
          color: 'white',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          borderBottom: '1px solid #cc0000'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0 8px'
            }}
          >
            ✕
          </button>
        </div>
      )}
      <ResizablePanes
        topPane={
          hasConnection ? (
            <LogViewer
              lines={lines}
              autoScroll={autoScroll}
              title="All Lines"
              renderAnsi={renderAnsiTopPane}
              highlightedLineIndex={highlightedLineIndex}
              onLineDoubleClick={handleLineDoubleClick}
            />
          ) : (
            <DropZone 
              isDragging={isDragging} 
              onFileSelect={handleFileOpen}
              onK8sConnect={handleK8sConnect}
            />
          )
        }
        controlBar={
          <ControlBar
            includeFilter={includeFilter}
            onIncludeFilterChange={setIncludeFilter}
            excludeFilter={excludeFilter}
            onExcludeFilterChange={setExcludeFilter}
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
            filteredLineCount={filteredLines.lines.length}
            totalLines={lines.length}
            onSettingsClick={() => setSettingsOpen(true)}
            onClearClick={() => {
              setLines([]);
              setHighlightedLineIndex(null);
              // Help garbage collection by clearing the ref
              if (Object.keys(sourceColorMapRef.current).length > 0) {
                sourceColorMapRef.current = {};
              }
            }}
          />
        }
        bottomPane={
          hasConnection ? (
            <LogViewer
              lines={filteredLines.lines}
              autoScroll={autoScroll}
              title={hasFilters ? "Filtered Lines" : "All Lines"}
              renderAnsi={renderAnsiBottomPane}
              onLineClick={handleLineClick}
              onLineDoubleClick={handleLineDoubleClick}
            />
          ) : (
            <div style={{ height: '100%', backgroundColor: '#1e1e1e' }} />
          )
        }
      />
      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={handleSettingsClose} 
      />
      {modalLogLine && (
        <LogDetailModal
          logLine={modalLogLine}
          lineNumber={modalLineNumber}
          onClose={handleCloseModal}
          renderAnsi={renderAnsiBottomPane}
        />
      )}
    </div>
  );
});
