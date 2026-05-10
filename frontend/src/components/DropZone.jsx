import { useState, useEffect } from 'preact/hooks';
import { Dialogs } from '@wailsio/runtime';
import { K8sConnector } from './K8sConnector';
import * as RecentService from '../../bindings/github.com/litvivangett/weblogview/internal/handlers/recent/recentservice';

export function DropZone({ onFileSelect, onK8sConnect }) {
  const [recentFiles, setRecentFiles] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const files = await RecentService.GetRecentFiles();
        setRecentFiles(files || []);
      } catch (err) {
        console.error('Failed to load recent files:', err);
      }
    })();
  }, []);

  const handleDropZoneClick = async () => {
    try {
      const selected = await Dialogs.OpenFile({
        Title: 'Open Log File',
        Filters: [
          { DisplayName: 'Log Files', Pattern: '*.log;*.txt;*.out' },
          { DisplayName: 'All Files', Pattern: '*.*' },
        ],
        CanChooseFiles: true,
        CanChooseDirectories: false,
      });
      if (selected) {
        onFileSelect(selected);
        RecentService.AddRecentFile(selected).catch(err =>
          console.warn('Failed to add recent file:', err)
        );
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
    }
  };

  const handleRecentFileClick = (e, path) => {
    e.stopPropagation(); // prevent triggering the drop zone click
    onFileSelect(path);
    RecentService.AddRecentFile(path).catch(err =>
      console.warn('Failed to add recent file:', err)
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.sideBySide}>
        {/* File Source */}
        <div style={styles.sourceCard}>
          <div
            style={styles.dropZoneClickable}
            data-file-drop-target
            role="button"
            tabIndex={0}
            onClick={handleDropZoneClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleDropZoneClick()}
          >
            <div style={styles.icon}>📄</div>
            <div style={styles.message}>Open Log File</div>
            <div style={styles.subMessage}>Click to browse or drag & drop a file here</div>

            {recentFiles.length > 0 && (
              <div style={styles.recentContainer} onClick={e => e.stopPropagation()}>
                <div style={styles.recentHeader}>Recent Files:</div>
                {recentFiles.map((file, index) => (
                  <div
                    key={index}
                    style={{
                      ...styles.recentItem,
                      ...(hoveredIndex === index ? { backgroundColor: '#3c3c3c' } : {}),
                    }}
                    onClick={e => handleRecentFileClick(e, file)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    📄 {file}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* OR Divider */}
        <div style={styles.divider}>
          <div style={styles.orText}>OR</div>
        </div>

        {/* K8s Source */}
        <div style={styles.sourceCard}>
          <div style={styles.dropZone}>
            <div style={styles.icon}>☸️</div>
            <div style={styles.message}>Connect to Kubernetes</div>
            <K8sConnector onConnect={onK8sConnect} />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    padding: '40px',
    boxSizing: 'border-box',
  },
  sideBySide: {
    display: 'flex',
    gap: '40px',
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '1400px',
  },
  sourceCard: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  orText: {
    color: '#858585',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#1e1e1e',
    padding: '8px 12px',
    borderRadius: '20px',
    border: '2px solid #3c3c3c',
  },
  dropZone: {
    width: '100%',
    padding: '40px 30px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    border: '3px dashed #3c3c3c',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    minHeight: '400px',
  },
  dropZoneClickable: {
    width: '100%',
    padding: '40px 30px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    border: '3px dashed #3c3c3c',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    minHeight: '400px',
    cursor: 'pointer',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
    opacity: 0.5,
  },
  message: {
    fontSize: '20px',
    color: '#cccccc',
    marginBottom: '8px',
    fontWeight: '500',
  },
  subMessage: {
    fontSize: '13px',
    color: '#858585',
    textAlign: 'center',
    marginBottom: '20px',
  },
  recentContainer: {
    width: '100%',
    maxWidth: '500px',
    marginTop: '10px',
    maxHeight: '200px',
    overflowY: 'auto',
    backgroundColor: '#2d2d30',
    border: '1px solid #3c3c3c',
    borderRadius: '4px',
  },
  recentHeader: {
    padding: '8px 12px',
    fontSize: '12px',
    color: '#858585',
    borderBottom: '1px solid #3c3c3c',
    fontWeight: '500',
  },
  recentItem: {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#d4d4d4',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'background-color 0.1s',
  },
};