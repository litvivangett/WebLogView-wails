import { useState, useRef } from 'preact/hooks';
import { LogViewerTab } from './LogViewerTab';

export function App() {
  const [tabs, setTabs] = useState([{ id: 1, title: 'New Tab' }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [nextId, setNextId] = useState(2);
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dropTargetTabId, setDropTargetTabId] = useState(null);
  const tabRefsMap = useRef({});

  const addTab = () => {
    const newTab = { id: nextId, title: 'New Tab' };
    setTabs([...tabs, newTab]);
    setActiveTabId(nextId);
    setNextId(nextId + 1);
  };

  const closeTab = (tabId) => {
    // Get the tab reference before removing
    const tabRef = tabRefsMap.current[tabId];
    
    // If this tab has merged sources, get their IDs to close them too
    let mergedSourceIds = [];
    if (tabRef && tabRef.getMergedSourceIds) {
      mergedSourceIds = tabRef.getMergedSourceIds();
    }
    
    // Clean up the tab being closed
    if (tabRef && tabRef.cleanup) {
      tabRef.cleanup();
    }
    
    // Also close all hidden merged source tabs
    mergedSourceIds.forEach(sourceId => {
      const sourceRef = tabRefsMap.current[sourceId];
      if (sourceRef && sourceRef.cleanup) {
        sourceRef.cleanup();
      }
    });
    
    // Remove the tab and all its merged sources
    const idsToRemove = [tabId, ...mergedSourceIds];
    const newTabs = tabs.filter(tab => !idsToRemove.includes(tab.id));
    
    // If we're closing the active tab, switch to another tab
    if (activeTabId === tabId && newTabs.length > 0) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
    
    // Always keep at least one tab
    if (newTabs.length === 0) {
      const newTab = { id: nextId, title: 'New Tab' };
      setTabs([newTab]);
      setActiveTabId(nextId);
      setNextId(nextId + 1);
    } else {
      setTabs(newTabs);
    }
  };

  const updateTabTitle = (tabId, title) => {
    setTabs(tabs.map(tab => 
      tab.id === tabId ? { ...tab, title } : tab
    ));
  };

  const mergeTabs = (sourceTabId, targetTabId) => {
    if (sourceTabId === targetTabId) return;
    
    const sourceTabRef = tabRefsMap.current[sourceTabId];
    const targetTabRef = tabRefsMap.current[targetTabId];
    
    if (!sourceTabRef || !targetTabRef) {
      console.warn('Tab refs not found for merge');
      return;
    }
    
    // Get log data from source tab
    const sourceData = sourceTabRef.getLogData();
    
    if (sourceData) {
      // Merge existing logs into target tab (this adds prefixes to existing lines)
      targetTabRef.mergeLogsFrom(sourceData);
      
      // Subscribe target tab to future messages from source tab
      sourceTabRef.subscribeToMessages((newLines) => {
        // newLines come WITHOUT prefix from source, we need to add it
        targetTabRef.addLinesFromSource(sourceData.fileName, newLines);
      });
      
      // Hide the source tab from UI but keep it running
      setTabs(tabs.map(tab => 
        tab.id === sourceTabId ? { ...tab, hidden: true } : tab
      ));
      
      // Switch to the target tab
      setActiveTabId(targetTabId);
    } else {
      console.warn('Source tab has no logs to merge');
    }
  };

  const handleDragStart = (e, tabId) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, tabId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTabId !== tabId) {
      setDropTargetTabId(tabId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetTabId(null);
  };

  const handleDrop = (e, targetTabId) => {
    e.preventDefault();
    if (draggedTabId && draggedTabId !== targetTabId) {
      mergeTabs(draggedTabId, targetTabId);
    }
    setDraggedTabId(null);
    setDropTargetTabId(null);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
    setDropTargetTabId(null);
  };



  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        <div style={styles.tabsContainer}>
          {tabs.filter(tab => !tab.hidden).map(tab => (
            <div
              key={tab.id}
              draggable="true"
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              style={{
                ...styles.tab,
                ...(activeTabId === tab.id ? styles.activeTab : {}),
                ...(dropTargetTabId === tab.id && draggedTabId !== tab.id ? styles.dropTarget : {}),
                ...(draggedTabId === tab.id ? styles.dragging : {})
              }}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span style={styles.tabTitle}>{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  style={styles.closeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button style={styles.addTabButton} onClick={addTab}>
            +
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {tabs.map(tab => (
        <div
          key={tab.id}
          style={{
            display: activeTabId === tab.id ? 'flex' : 'none',
            flex: 1,
            flexDirection: 'column',
          }}
        >
          <LogViewerTab
            ref={(ref) => {
              if (ref) {
                tabRefsMap.current[tab.id] = ref;
              } else {
                delete tabRefsMap.current[tab.id];
              }
            }}
            tabId={tab.id}
            onTitleChange={(title) => updateTabTitle(tab.id, title)}
          />
        </div>
      ))}
    </div>
  );
}

const styles = {
  tabBar: {
    backgroundColor: '#2d2d30',
    borderBottom: '1px solid #3c3c3c',
    display: 'flex',
    alignItems: 'flex-end',
    minHeight: '24px',
  },
  tabsContainer: {
    display: 'flex',
    gap: '1px',
    paddingLeft: '3px',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: '#252526',
    borderTop: '2px solid transparent',
    borderLeft: '1px solid #3c3c3c',
    borderRight: '1px solid #3c3c3c',
    borderTopLeftRadius: '2px',
    borderTopRightRadius: '2px',
    color: '#969696',
    cursor: 'pointer',
    fontSize: '11px',
    minWidth: '80px',
    maxWidth: '140px',
    transition: 'all 0.1s ease',
  },
  activeTab: {
    backgroundColor: '#1e1e1e',
    borderTopColor: '#007acc',
    color: '#ffffff',
  },
  tabTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: '1',
    opacity: 0.6,
    transition: 'opacity 0.1s ease',
  },
  addTabButton: {
    background: 'none',
    border: 'none',
    color: '#969696',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '3px 8px',
    transition: 'color 0.1s ease',
  },
  dropTarget: {
    backgroundColor: '#094771',
    borderTopColor: '#0e639c',
  },
  dragging: {
    opacity: 0.5,
  },
};
