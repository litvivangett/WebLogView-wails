import { useState, useEffect, useMemo, useImperativeHandle, useRef, useCallback } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import { ControlBar } from './ControlBar';
import { LogViewer } from './LogViewer';
import { DropZone } from './DropZone';
import { ResizablePanes } from './ResizablePanes';
import { SettingsModal } from './SettingsModal';
import { LogDetailModal } from './LogDetailModal';
import { useWailsLogs } from '../hooks/useWailsLogs';
import { Events } from '@wailsio/runtime';
import * as FileService from '../../bindings/github.com/litvivangett/weblogview/internal/handlers/file/fileservice';
import * as K8sService from '../../bindings/github.com/litvivangett/weblogview/internal/handlers/k8s/k8sservice';
import * as SettingsService from '../../bindings/github.com/litvivangett/weblogview/internal/handlers/settings/settingsservice';
import * as SessionManager from '../../bindings/github.com/litvivangett/weblogview/internal/session/sessionservice';

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

export const LogViewerTab = forwardRef(({ tabId, onTitleChange, isActive }, ref) => {
  const [lines, setLines] = useState([]);
  const [logSources, setLogSources] = useState([]); // Array of {id, name, color}
  const [mergedTabRefs, setMergedTabRefs] = useState([]); // Refs to merged tabs
  const [currentSourceId, setCurrentSourceId] = useState(null); // Primary source
  const [includeFilter, setIncludeFilter] = useState('');
  const [excludeFilter, setExcludeFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
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
  const onTitleChangeRef = useRef(onTitleChange);

  const { lastEvent, error: wailsError } = useWailsLogs(tabId);

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
      // Cleanup is now handled by useEffect unmount
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

  // In Wails, we're always "connected" - bindings are in-process
  useEffect(() => {
    setConnected(true);
  }, []);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  });

  useEffect(() => {
    // Load settings on mount
    loadSettings();
  }, []);

  useEffect(() => {
    return () => {
      SessionManager.CloseTab(tabId).catch(() => {});
    };
  }, [tabId]);

  const loadSettings = async () => {
    try {
      const data = await SettingsService.GetSettings();
      setRenderAnsiTopPane(data.renderAnsiTopPane);
      setRenderAnsiBottomPane(data.renderAnsiBottomPane);
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
    if (lastEvent) {
      handleWailsEvent(lastEvent);
    }
  }, [lastEvent]);

  useEffect(() => {
    if (wailsError) {
      setErrorMessage(wailsError);
    }
  }, [wailsError]);

  const hasConnection = fileName !== '';

  const handleFileOpen = useCallback(async (filePath) => {
    if (!filePath) return;
    try {
      const name = filePath.split('/').pop().split('\\').pop();
      await FileService.OpenFile(tabId, filePath);
      setFileName(name);
      onTitleChangeRef.current(name);
    } catch (err) {
      setErrorMessage('Failed to open file: ' + (err.message || err));
    }
  }, [tabId]);

  useEffect(() => {
    const unsubscribe = Events.On('file-dropped', (event) => {
      if (isActive && !hasConnection) {
        handleFileOpen(event.data);
      }
    });
    return unsubscribe;
  }, [isActive, hasConnection, handleFileOpen]);

  const handleWailsEvent = (event) => {
    if (!event) return;

    const shouldPrefix = logSources.length > 0;
    let color = null;
    if (shouldPrefix && fileName) {
      const source = logSources.find(s => s.name === fileName);
      color = source ? source.color : getSourceColor(fileName, 0);
    }
    const prefix = shouldPrefix && fileName ? `[${fileName}]|||${color}|||` : '';

    switch (event.type) {
      case 'lines': {
        const newLines = shouldPrefix ? event.lines.map(line => `${prefix}${line}`) : event.lines;
        setLines(prev => [...prev, ...newLines]);
        messageCallbacks.current.forEach(callback => {
          callback(event.lines);
        });
        break;
      }
      case 'initial': {
        const initialLines = shouldPrefix ? (event.lines || []).map(line => `${prefix}${line}`) : (event.lines || []);
        setLines(initialLines);
        break;
      }
      case 'clear':
        setLines([]);
        break;
    }
  };

  const handleK8sConnect = async (k8sConfig) => {
    try {
      let sourceNameFormat = 'container';
      try {
        const settings = await SettingsService.GetSettings();
        sourceNameFormat = settings.sourceNameFormat || 'container';
      } catch (err) {
        console.warn('Failed to fetch settings, using default sourceNameFormat:', err);
      }

      await K8sService.OpenK8s(tabId, {
        namespace: k8sConfig.namespace,
        podName: k8sConfig.podName,
        containerName: k8sConfig.containerName,
      });

      let displayName;
      switch (sourceNameFormat) {
        case 'container':
          displayName = k8sConfig.containerName || k8sConfig.podName;
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
    } catch (err) {
      setErrorMessage('Failed to connect to Kubernetes: ' + (err.message || err));
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
  const hasFilters = includeFilter || excludeFilter;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
