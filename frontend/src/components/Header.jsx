export function Header({
  filePath,
  onFilePathChange,
  onOpenFile,
  includeFilter,
  onIncludeFilterChange,
  excludeFilter,
  onExcludeFilterChange,
  autoScroll,
  onAutoScrollChange,
  connected,
  lineCount,
  totalLines,
}) {
  return (
    <div style={styles.header}>
      <div style={styles.row}>
        <div style={styles.fileSection}>
          <input
            type="text"
            placeholder="Enter file path..."
            value={filePath}
            onInput={(e) => onFilePathChange(e.target.value)}
            style={styles.input}
          />
          <button
            onClick={onOpenFile}
            disabled={!connected || !filePath}
            style={styles.button}
          >
            Open File
          </button>
          <div style={styles.status}>
            <span style={{
              ...styles.statusDot,
              backgroundColor: connected ? '#4caf50' : '#f44336'
            }} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>
      
      <div style={styles.row}>
        <div style={styles.filterSection}>
          <input
            type="text"
            placeholder="Include filter (regex)..."
            value={includeFilter}
            onInput={(e) => onIncludeFilterChange(e.target.value)}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="Exclude filter (regex)..."
            value={excludeFilter}
            onInput={(e) => onExcludeFilterChange(e.target.value)}
            style={styles.input}
          />
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => onAutoScrollChange(e.target.checked)}
            />
            Auto-scroll
          </label>
          <div style={styles.stats}>
            Showing {lineCount.toLocaleString()} / {totalLines.toLocaleString()} lines
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    backgroundColor: '#252526',
    borderBottom: '1px solid #3c3c3c',
    padding: '12px 16px',
  },
  row: {
    display: 'flex',
    gap: '12px',
    marginBottom: '8px',
  },
  fileSection: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flex: 1,
  },
  filterSection: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flex: 1,
  },
  input: {
    flex: 1,
    padding: '6px 12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #555',
    color: '#d4d4d4',
    borderRadius: '4px',
    fontSize: '14px',
  },
  button: {
    padding: '6px 16px',
    backgroundColor: '#0e639c',
    border: 'none',
    color: 'white',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#cccccc',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#cccccc',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  stats: {
    fontSize: '13px',
    color: '#858585',
    whiteSpace: 'nowrap',
  },
};
