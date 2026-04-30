import { useState, useRef, useEffect } from 'preact/hooks';

export function ResizablePanes({ topPane, controlBar, bottomPane }) {
  const [topHeight, setTopHeight] = useState(60); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const percentage = (y / rect.height) * 100;

      // Clamp between 20% and 80%
      const clampedPercentage = Math.max(20, Math.min(80, percentage));
      setTopHeight(clampedPercentage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top Pane */}
      <div style={{ height: `${topHeight}%`, minHeight: 0, flexShrink: 0 }}>
        {topPane}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          ...styles.resizeHandle,
          ...(isDragging ? styles.resizeHandleActive : {}),
          flexShrink: 0,
        }}
      >
        <div style={styles.resizeHandleLine} />
      </div>

      {/* Control Bar */}
      <div style={{ flexShrink: 0 }}>
        {controlBar}
      </div>

      {/* Bottom Pane */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {bottomPane}
      </div>
    </div>
  );
}

const styles = {
  resizeHandle: {
    height: '8px',
    background: '#2d2d30',
    cursor: 'ns-resize',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.1s ease',
    userSelect: 'none',
  },
  resizeHandleActive: {
    background: '#007acc',
  },
  resizeHandleLine: {
    width: '40px',
    height: '2px',
    background: '#555',
    borderRadius: '1px',
  },
};
