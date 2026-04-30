import { useEffect, useRef, useState } from 'preact/hooks';
import { FixedSizeList as List } from 'react-window';
import AnsiToHtml from 'ansi-to-html';

const ansiConverter = new AnsiToHtml({
  fg: '#d4d4d4',
  bg: '#1e1e1e',
  newline: false,
  escapeXML: true,
  colors: {
    0: '#000000',  // black
    1: '#cd3131',  // red
    2: '#0dbc79',  // green
    3: '#e5e510',  // yellow
    4: '#2472c8',  // blue
    5: '#bc3fbc',  // magenta
    6: '#11a8cd',  // cyan
    7: '#e5e5e5',  // white
  }
});

export function LogViewer({ lines, autoScroll, title, renderAnsi = false, highlightedLineIndex = null, onLineClick = null, onLineDoubleClick = null }) {
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    if (autoScroll && listRef.current && lines.length > 0) {
      listRef.current.scrollToItem(lines.length - 1, 'end');
    }
  }, [lines, autoScroll]);

  useEffect(() => {
    // Scroll to highlighted line
    if (highlightedLineIndex !== null && listRef.current) {
      listRef.current.scrollToItem(highlightedLineIndex, 'center');
    }
  }, [highlightedLineIndex]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const titleHeight = title ? 30 : 0;
        setHeight(Math.max(100, rect.height - titleHeight));
      }
    };

    updateHeight();
    
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [title]);

  const Row = ({ index, style }) => {
    const lineContent = lines[index];
    
    // Parse prefix with color format: [sourceName]|||#color|||actual log content
    let prefix = null;
    let prefixColor = null;
    let actualContent = lineContent;
    
    const prefixMatch = lineContent.match(/^\[([^\]]+)\]\|\|\|([^|]+)\|\|\|(.*)$/);
    if (prefixMatch) {
      prefix = prefixMatch[1];
      prefixColor = prefixMatch[2];
      actualContent = prefixMatch[3];
    }
    
    const displayContent = renderAnsi ? ansiConverter.toHtml(actualContent) : actualContent;
    const isHighlighted = highlightedLineIndex === index;
    
    return (
      <div 
        style={{ 
          ...style, 
          ...rowStyle,
          backgroundColor: isHighlighted ? '#3a3d41' : 'transparent'
        }}
        onDblClick={() => onLineDoubleClick && onLineDoubleClick(index, lineContent)}
      >
        <span 
          style={{
            ...lineNumberStyle,
            cursor: onLineClick ? 'pointer' : 'default',
            color: isHighlighted ? '#4fc1ff' : '#858585'
          }}
          onClick={() => onLineClick && onLineClick(index)}
        >
          {index + 1}
        </span>
        {prefix && (
          <span style={{ 
            ...prefixStyle, 
            color: prefixColor,
            fontWeight: 'bold'
          }}>
            [{prefix}]{' '}
          </span>
        )}
        {renderAnsi ? (
          <span 
            style={lineContentStyle} 
            dangerouslySetInnerHTML={{ __html: displayContent }}
          />
        ) : (
          <span style={lineContentStyle}>{displayContent}</span>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%', backgroundColor: '#1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {title && (
        <div style={titleBarStyle}>
          {title}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <List
          ref={listRef}
          height={height}
          itemCount={lines.length}
          itemSize={20}
          width="100%"
        >
          {Row}
        </List>
      </div>
    </div>
  );
}

const titleBarStyle = {
  backgroundColor: '#2d2d30',
  color: '#cccccc',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: '500',
  borderBottom: '1px solid #3c3c3c',
};

const rowStyle = {
  display: 'flex',
  fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  fontSize: '13px',
  lineHeight: '20px',
  borderBottom: '1px solid #2d2d2d',
  padding: '0 8px',
  minWidth: 'max-content',
};

const lineNumberStyle = {
  color: '#858585',
  marginRight: '16px',
  minWidth: '60px',
  textAlign: 'right',
  userSelect: 'none',
};

const prefixStyle = {
  marginRight: '8px',
  userSelect: 'none',
};

const lineContentStyle = {
  color: '#d4d4d4',
  whiteSpace: 'pre',
  flex: 1,
  overflow: 'visible',
};
