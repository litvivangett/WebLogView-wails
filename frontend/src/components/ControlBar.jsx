export function ControlBar({
  includeFilter,
  onIncludeFilterChange,
  excludeFilter,
  onExcludeFilterChange,
  autoScroll,
  onAutoScrollChange,
  filteredLineCount,
  totalLines,
  onSettingsClick,
  onClearClick,
}) {
  return (
    <div style={styles.controlBar}>
      <div style={styles.controls}>
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
          {includeFilter || excludeFilter ? (
            <>
              Filtered: {filteredLineCount.toLocaleString()} / {totalLines.toLocaleString()} lines
            </>
          ) : (
            <>
              Total: {totalLines.toLocaleString()} lines
            </>
          )}
        </div>
        <button 
          type="button"
          style={styles.clearButton}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClearClick();
          }}
          title="Clear logs"
        >
          🗑️
        </button>
        <button 
          style={styles.settingsButton}
          onClick={onSettingsClick}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

const styles = {
  controlBar: {
    backgroundColor: '#252526',
    borderTop: '2px solid #007acc',
    borderBottom: '2px solid #007acc',
    padding: '12px 16px',
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
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
    color: '#888888',
    whiteSpace: 'nowrap',
  },
  clearButton: {
    background: 'none',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    padding: '6px 12px',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  },
  settingsButton: {
    background: 'none',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    padding: '6px 12px',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
  },
};