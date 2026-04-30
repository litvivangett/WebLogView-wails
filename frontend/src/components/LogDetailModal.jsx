import { useEffect, useRef } from 'preact/hooks';
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

export function LogDetailModal({ logLine, lineNumber, onClose, renderAnsi = false }) {
  const modalRef = useRef(null);

  // Parse prefix with color format if present
  let prefix = null;
  let prefixColor = null;
  let actualContent = logLine;
  
  const prefixMatch = logLine.match(/^\[([^\]]+)\]\|\|\|([^|]+)\|\|\|(.*)$/);
  if (prefixMatch) {
    prefix = prefixMatch[1];
    prefixColor = prefixMatch[2];
    actualContent = prefixMatch[3];
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const formatLogContent = (content) => {
    // Try to format JSON-like structures with better indentation
    let indentLevel = 0;
    let result = '';
    let i = 0;
    
    const indent = (level) => '  '.repeat(level);
    
    // Helper function to peek ahead and get content within brackets
    const getContentUntilClosingBracket = (startIndex, openChar) => {
      const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : ')';
      let depth = 1;
      let j = startIndex + 1;
      let innerContent = '';
      
      while (j < content.length && depth > 0) {
        const c = content[j];
        if (c === openChar) depth++;
        else if (c === closeChar) depth--;
        
        if (depth > 0) {
          innerContent += c;
        }
        j++;
      }
      
      return { content: innerContent, endIndex: j - 1 };
    };
    
    while (i < content.length) {
      const char = content[i];
      
      // Opening brackets - check if content is short
      if (char === '{' || char === '[' || char === '(') {
        const { content: innerContent, endIndex } = getContentUntilClosingBracket(i, char);
        
        // If content is short (< 60 chars) and doesn't contain nested brackets, keep on one line
        if (innerContent.length < 60 && !innerContent.match(/[{[(]/)) {
          const closeChar = char === '{' ? '}' : char === '[' ? ']' : ')';
          result += char + innerContent + closeChar;
          i = endIndex + 1;
          continue;
        }
        
        // Otherwise, format normally with newlines
        result += char + '\n';
        indentLevel++;
        result += indent(indentLevel);
      }
      // Closing brackets - decrease indent and add newline
      else if (char === '}' || char === ']' || char === ')') {
        indentLevel = Math.max(0, indentLevel - 1);
        result += '\n' + indent(indentLevel) + char;
      }
      // Commas - add newline for better separation
      else if (char === ',') {
        result += char + '\n' + indent(indentLevel);
      }
      // Colons - add space for readability
      else if (char === ':') {
        result += char + ' ';
      }
      // Regular characters
      else {
        result += char;
      }
      
      i++;
    }
    
    return result;
  };

  // Format first, then apply ANSI conversion if needed
 let displayContent = renderAnsi 
    ? ansiConverter.toHtml(logLine)
    : formattedContent;
  const formattedContent = formatLogContent(displayContent);
  displayContent = formattedContent;
  
  return (
    <div style={overlayStyle}>
      <div ref={modalRef} style={modalStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>
            Log Line {lineNumber}
            {prefix && (
              <span style={{ marginLeft: '12px', color: prefixColor, fontWeight: 'bold' }}>
                [{prefix}]
              </span>
            )}
          </h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>
        <div style={contentContainerStyle}>
          {renderAnsi ? (
            <pre style={contentStyle} dangerouslySetInnerHTML={{ __html: displayContent }} />
          ) : (
            <pre style={contentStyle}>{displayContent}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const modalStyle = {
  backgroundColor: '#1e1e1e',
  border: '1px solid #3c3c3c',
  borderRadius: '8px',
  width: '70vw',
  height: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  borderBottom: '1px solid #3c3c3c',
  backgroundColor: '#2d2d30',
};

const titleStyle = {
  margin: 0,
  color: '#cccccc',
  fontSize: '16px',
  fontWeight: '500',
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#cccccc',
  fontSize: '28px',
  cursor: 'pointer',
  padding: '0 8px',
  lineHeight: '1',
  transition: 'color 0.2s',
};

const contentContainerStyle = {
  flex: 1,
  overflow: 'auto',
  padding: '20px',
};

const contentStyle = {
  fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  fontSize: '13px',
  color: '#d4d4d4',
  lineHeight: '1.6',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
