import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export function SettingsModal({ isOpen, onClose }) {
  const [tailLines, setTailLines] = useState(1000);
  const [renderAnsiTopPane, setRenderAnsiTopPane] = useState(false);
  const [renderAnsiBottomPane, setRenderAnsiBottomPane] = useState(true);
  const [pollingIntervalMs, setPollingIntervalMs] = useState(500);
  const [sourceNameFormat, setSourceNameFormat] = useState('container');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to load settings');
      const data = await response.json();
      setTailLines(data.tailLines);
      setRenderAnsiTopPane(data.renderAnsiTopPane);
      setRenderAnsiBottomPane(data.renderAnsiBottomPane);
      setPollingIntervalMs(data.pollingIntervalMs || 500);
      setSourceNameFormat(data.sourceNameFormat || 'container');
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(err.message);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tailLines: parseInt(tailLines),
          renderAnsiTopPane,
          renderAnsiBottomPane,
          pollingIntervalMs: parseInt(pollingIntervalMs),
          sourceNameFormat
        })
      });
      if (!response.ok) throw new Error('Failed to save settings');
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <div style={styles.content}>
          {error && <div style={styles.error}>{error}</div>}
          
          <div style={styles.field}>
            <label style={styles.label}>
              Initial Window Size (Lines)
              <input
                type="number"
                min="100"
                max="100000"
                step="100"
                value={tailLines}
                onChange={(e) => setTailLines(e.target.value)}
                style={styles.input}
              />
            </label>
            <div style={styles.helpText}>
              Number of lines to load initially when opening a log file. 
              Higher values may impact performance.
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Polling Interval (milliseconds)
              <input
                type="number"
                min="100"
                max="5000"
                step="100"
                value={pollingIntervalMs}
                onChange={(e) => setPollingIntervalMs(e.target.value)}
                style={styles.input}
              />
            </label>
            <div style={styles.helpText}>
              Fallback interval for checking file changes when live events aren't detected. 
              Lower values = faster updates but more CPU usage. Requires restart to apply.
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Merged Logs</h3>
            <div style={styles.helpText}>
              Configure how merged log sources are displayed.
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Source Name Format
              <select
                value={sourceNameFormat}
                onChange={(e) => setSourceNameFormat(e.target.value)}
                style={styles.input}
              >
                <option value="container">Container Name</option>
                <option value="pod">Pod Name</option>
                <option value="namespace/pod">Namespace/Pod</option>
              </select>
            </label>
            <div style={styles.helpText}>
              Choose what identifier to use for merged log sources. Default is Container Name.
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>ANSI Color Rendering</h3>
            <div style={styles.helpText}>
              Terminal color codes can be displayed as colors or shown as raw text.
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={renderAnsiTopPane}
                onChange={(e) => setRenderAnsiTopPane(e.target.checked)}
              />
              Render colors in Top Pane (All Lines)
            </label>
            <div style={styles.helpText}>
              When enabled, ANSI escape codes will be rendered as colors. 
              When disabled, codes will appear as raw text.
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={renderAnsiBottomPane}
                onChange={(e) => setRenderAnsiBottomPane(e.target.checked)}
              />
              Render colors in Bottom Pane (Filtered Lines)
            </label>
            <div style={styles.helpText}>
              When enabled, ANSI escape codes will be rendered as colors in the filtered view.
            </div>
          </div>
        </div>
        
        <div style={styles.footer}>
          <button 
            style={styles.cancelButton} 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            style={styles.saveButton} 
            onClick={saveSettings}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#2d2d2d',
    borderRadius: '8px',
    width: '500px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #444'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#e0e0e0'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    color: '#999',
    cursor: 'pointer',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px'
  },
  content: {
    padding: '20px',
    flex: 1,
    overflowY: 'auto'
  },
  field: {
    marginBottom: '20px'
  },
  section: {
    marginTop: '24px',
    marginBottom: '12px'
  },
  sectionTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '8px'
  },
  label: {
    display: 'block',
    color: '#e0e0e0',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '8px'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#e0e0e0',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '14px',
    marginTop: '8px'
  },
  helpText: {
    fontSize: '12px',
    color: '#999',
    marginTop: '6px'
  },
  error: {
    backgroundColor: '#3d1f1f',
    color: '#ff6b6b',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '13px'
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid #444',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px'
  },
  cancelButton: {
    padding: '8px 16px',
    backgroundColor: '#3d3d3d',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '14px'
  },
  saveButton: {
    padding: '8px 16px',
    backgroundColor: '#0e639c',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px'
  }
};
