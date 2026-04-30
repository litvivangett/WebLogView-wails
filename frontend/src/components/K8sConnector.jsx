import { useState, useEffect } from 'preact/hooks';

export function K8sConnector({ onConnect }) {
  const [namespace, setNamespace] = useState('default');
  const [podName, setPodName] = useState('');
  const [containerName, setContainerName] = useState('');
  const [availablePods, setAvailablePods] = useState([]);
  const [showPods, setShowPods] = useState(false);
  const [filteredPods, setFilteredPods] = useState([]);
  const [availableContainers, setAvailableContainers] = useState([]);
  const [showContainers, setShowContainers] = useState(false);
  const [filteredContainers, setFilteredContainers] = useState([]);
  const [namespaceStatus, setNamespaceStatus] = useState(null); // 'valid', 'error', 'checking'
  const [namespaceError, setNamespaceError] = useState('');
  const [contexts, setContexts] = useState([]);
  const [currentContext, setCurrentContext] = useState('');
  const [showContexts, setShowContexts] = useState(false);
  const [availableNamespaces, setAvailableNamespaces] = useState([]);
  const [filteredNamespaces, setFilteredNamespaces] = useState([]);
  const [showNamespaces, setShowNamespaces] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Load contexts
    fetch('/api/k8s/contexts')
      .then(async res => {
        if (!res.ok) {
          const errorText = await res.text();
          if (res.status === 401 || errorText.includes('authentication') || errorText.includes('Unauthorized')) {
            setAuthError('Authentication required: Please authenticate with kubectl (e.g., gcloud auth login, aws eks update-kubeconfig, etc.)');
          } else {
            setAuthError(`Failed to load Kubernetes contexts: ${errorText}`);
          }
          return [];
        }
        setAuthError(null);
        return res.json();
      })
      .then(ctxs => {
        setContexts(ctxs || []);
        const current = ctxs.find(c => c.isCurrent);
        if (current) {
          setCurrentContext(current.name);
        }
      })
      .catch(err => {
        console.error('Failed to load contexts:', err);
        setAuthError('Failed to connect to Kubernetes: ' + err.message);
      });
  }, []);

  // Auto-fetch containers when pod name changes (with debounce)
  useEffect(() => {
    if (podName && namespace) {
      // Debounce the fetch to avoid too many requests while typing
      const timer = setTimeout(() => {
        fetchContainers(namespace, podName);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [podName, namespace]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!podName.trim()) {
      alert('Pod name is required');
      return;
    }
    onConnect({
      namespace: namespace.trim() || 'default',
      podName: podName.trim(),
      containerName: containerName.trim(),
    });
  };

  const fetchNamespaces = async () => {
    try {
      const response = await fetch('/api/k8s/namespaces');
      if (response.ok) {
        const namespaces = await response.json();
        // Reverse the order (descending)
        const reversedNamespaces = (namespaces || []).reverse();
        setAvailableNamespaces(reversedNamespaces);
        setFilteredNamespaces(reversedNamespaces);
        setAuthError(null);
      } else {
        const errorText = await response.text();
        if (response.status === 401 || errorText.includes('authentication') || errorText.includes('Unauthorized')) {
          setAuthError('Authentication expired: Please re-authenticate with your cluster');
        } else {
          setAuthError('Failed to fetch namespaces: ' + errorText);
        }
        setAvailableNamespaces([]);
        setFilteredNamespaces([]);
      }
    } catch (err) {
      console.error('Failed to fetch namespaces:', err);
      setAuthError('Failed to connect to Kubernetes: ' + err.message);
      setAvailableNamespaces([]);
      setFilteredNamespaces([]);
    }
  };

  const handleNamespaceChange = (value) => {
    setNamespace(value);
    // Filter namespaces based on input
    if (value.trim() === '') {
      setFilteredNamespaces(availableNamespaces);
      setNamespaceStatus(null);
      setNamespaceError('');
    } else {
      const filtered = availableNamespaces.filter(ns => 
        ns.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredNamespaces(filtered);
    }
    // Note: Validation is only done on selection or blur, not on every keystroke
  };

  const handleNamespaceFocus = () => {
    fetchNamespaces();
    setShowNamespaces(true);
  };

  const handleNamespaceClick = (ns) => {
    setNamespace(ns);
    setShowNamespaces(false);
    fetchPods(ns);
  };

  const fetchPods = async (ns) => {
    if (!ns || ns.trim() === '') {
      setNamespaceStatus(null);
      setNamespaceError('');
      return;
    }
    
    setNamespaceStatus('checking');
    setNamespaceError('');
    
    try {
      const response = await fetch(`/api/k8s/pods?namespace=${encodeURIComponent(ns)}`);
      if (response.ok) {
        const pods = await response.json();
        setAvailablePods(pods || []);
        setFilteredPods(pods || []);
        
        // Only show valid status if there are pods, otherwise show warning
        if (pods && pods.length > 0) {
          setNamespaceStatus('valid');
          setNamespaceError('');
        } else {
          setNamespaceStatus('warning');
          setNamespaceError('Namespace is valid but contains no pods');
        }
      } else {
        setAvailablePods([]);
        setFilteredPods([]);
        setNamespaceStatus('error');
        const errorText = await response.text();
        setNamespaceError(errorText || `Failed to fetch pods (${response.status})`);
      }
    } catch (err) {
      console.error('Failed to fetch pods:', err);
      setAvailablePods([]);
      setFilteredPods([]);
      setNamespaceStatus('error');
      setNamespaceError(err.message || 'Network error');
    }
  };

  const handlePodNameChange = (value) => {
    setPodName(value);
    
    // Filter pods based on input
    if (value.trim() === '') {
      setFilteredPods(availablePods);
    } else {
      const filtered = availablePods.filter(pod => 
        pod.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredPods(filtered);
    }
  };

  const handlePodNameFocus = () => {
    fetchPods(namespace);
    setShowPods(true);
  };

  const handlePodClick = (pod) => {
    setPodName(pod);
    setShowPods(false);
  };

  const fetchContainers = async (ns, pod) => {
    if (!ns || ns.trim() === '' || !pod || pod.trim() === '') return;
    
    try {
      const response = await fetch(`/api/k8s/containers?namespace=${encodeURIComponent(ns)}&pod=${encodeURIComponent(pod)}`);
      if (response.ok) {
        const containers = await response.json();
        setAvailableContainers(containers || []);
        setFilteredContainers(containers || []);
        // Auto-populate container name with the first container if available
        if (containers && containers.length > 0 && !containerName) {
          setContainerName(containers[0]);
        }
      } else {
        setAvailableContainers([]);
        setFilteredContainers([]);
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
      setAvailableContainers([]);
      setFilteredContainers([]);
    }
  };

  const handleContainerNameChange = (value) => {
    setContainerName(value);
    
    // Filter containers based on input
    if (value.trim() === '') {
      setFilteredContainers(availableContainers);
    } else {
      const filtered = availableContainers.filter(container => 
        container.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredContainers(filtered);
    }
  };

  const handleContainerNameFocus = () => {
    fetchContainers(namespace, podName);
    setShowContainers(true);
  };

  const handleContainerClick = (container) => {
    setContainerName(container);
    setShowContainers(false);
  };

  const handleContextSwitch = async (contextName) => {
    setShowContexts(false);
    try {
      const response = await fetch('/api/k8s/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: contextName })
      });
      
      if (response.ok) {
        setCurrentContext(contextName);
        // Update contexts to reflect new current
        setContexts(prev => prev.map(c => ({
          ...c,
          isCurrent: c.name === contextName
        })));
        // Reset namespace validation when switching contexts
        setNamespaceStatus(null);
        setNamespaceError('');
      } else {
        alert('Failed to switch context');
      }
    } catch (err) {
      console.error('Failed to switch context:', err);
      alert('Failed to switch context');
    }
  };

  return (
    <div className="k8s-connector">
      <h3>Connect to Kubernetes Pod</h3>
      {authError && (
        <div style={{
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#c00', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>{authError}</span>
          </span>
          <button 
            type="button"
            onClick={() => setAuthError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#c00',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0 4px'
            }}
          >
            ×
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="context">Cluster Context:</label>
          <div className="context-selector" onClick={() => setShowContexts(!showContexts)}>
            <span className="context-display">☸️ {currentContext || 'default'}</span>
            <span className="context-arrow">▼</span>
          </div>
          {showContexts && contexts.length > 0 && (
            <div className="contexts-dropdown">
              {contexts.map((ctx, index) => (
                <div
                  key={index}
                  className={`context-item ${ctx.isCurrent ? 'current' : ''}`}
                  onClick={() => handleContextSwitch(ctx.name)}
                >
                  {ctx.isCurrent && '✓ '}
                  <strong>{ctx.name}</strong>
                  <span className="context-meta"> ({ctx.cluster})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="namespace">Namespace:</label>
          <div className="input-with-status">
            <input
              id="namespace"
              type="text"
              value={namespace}
              onChange={(e) => handleNamespaceChange(e.target.value)}
              onFocus={handleNamespaceFocus}
              onBlur={() => setTimeout(() => setShowNamespaces(false), 200)}
              placeholder="default"
              autoComplete="off"
            />
            {namespaceStatus === 'checking' && (
              <span className="status-icon checking" title="Checking namespace...">
                ⏳
              </span>
            )}
            {namespaceStatus === 'valid' && (
              <span className="status-icon valid" title="Namespace is valid and has pods">
                ✓
              </span>
            )}
            {namespaceStatus === 'warning' && (
              <span className="status-icon warning" title={namespaceError}>
                ⚠
              </span>
            )}
            {namespaceStatus === 'error' && (
              <span className="status-icon error" title={namespaceError}>
                ✕
              </span>
            )}
          </div>
          {showNamespaces && filteredNamespaces.length > 0 && (
            <div className="namespaces-dropdown">
              <div className="dropdown-header">All Namespaces</div>
              {filteredNamespaces.map((ns, index) => (
                <div
                  key={index}
                  className="namespace-item"
                  onClick={() => handleNamespaceClick(ns)}
                >
                  📁 {ns}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="podName">Pod Name: *</label>
          <input
            id="podName"
            type="text"
            value={podName}
            onChange={(e) => handlePodNameChange(e.target.value)}
            onFocus={handlePodNameFocus}
            onBlur={() => setTimeout(() => setShowPods(false), 200)}
            placeholder="my-app-pod-12345"
            autoComplete="off"
            required
          />
          {showPods && filteredPods.length > 0 && (
            <div className="pods-dropdown">
              {filteredPods.map((pod, index) => (
                <div
                  key={index}
                  className="pod-item"
                  onClick={() => handlePodClick(pod)}
                >
                  📦 {pod}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="containerName">Container Name:</label>
          <input
            id="containerName"
            type="text"
            value={containerName}
            onChange={(e) => handleContainerNameChange(e.target.value)}
            onFocus={handleContainerNameFocus}
            onBlur={() => setTimeout(() => setShowContainers(false), 200)}
            placeholder="(optional - first container)"
            autoComplete="off"
          />
          {showContainers && filteredContainers.length > 0 && (
            <div className="containers-dropdown">
              {filteredContainers.map((container, index) => (
                <div
                  key={index}
                  className="container-item"
                  onClick={() => handleContainerClick(container)}
                >
                  🔧 {container}
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className="connect-button">
          Connect to Pod
        </button>
      </form>

      <style jsx>{`
        .k8s-connector {
          padding: 0;
          background: transparent;
          width: 100%;
          max-width: 500px;
        }

        h3 {
          margin-top: 0;
          color: #cccccc;
          fontSize: 16px;
          margin-bottom: 20px;
          display: none;
        }

        .form-group {
          margin-bottom: 15px;
        }

        label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #cccccc;
          font-size: 13px;
        }

        input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #555;
          border-radius: 4px;
          font-size: 13px;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
          box-sizing: border-box;
          background-color: #3c3c3c;
          color: #d4d4d4;
        }

        input:focus {
          outline: none;
          border-color: #007acc;
          box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
        }

        .connect-button {
          width: 100%;
          padding: 10px;
          background: #0e639c;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .connect-button:hover {
          background: #1177bb;
        }

        .connect-button:active {
          background: #0d5689;
        }

        .recent-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #2d2d30;
          border: 1px solid #555;
          border-radius: 4px;
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .dropdown-header {
          padding: 6px 12px;
          font-size: 11px;
          font-weight: bold;
          color: #858585;
          background: #252526;
          border-bottom: 1px solid #3c3c3c;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .recent-item {
          padding: 8px 12px;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 13px;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
          border-bottom: 1px solid #3c3c3c;
        }

        .recent-item:last-child {
          border-bottom: none;
        }

        .recent-item:hover {
          background: #3c3c3c;
        }

        .namespaces-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #2d2d30;
          border: 1px solid #555;
          border-radius: 4px;
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .namespace-item {
          padding: 8px 12px;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 13px;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
          border-bottom: 1px solid #3c3c3c;
        }

        .namespace-item:last-child {
          border-bottom: none;
        }

        .namespace-item:hover {
          background: #3c3c3c;
        }

        .pods-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #2d2d30;
          border: 1px solid #555;
          border-radius: 4px;
          margin-top: 4px;
          max-height: 250px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .pod-item {
          padding: 8px 12px;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 13px;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
          border-bottom: 1px solid #3c3c3c;
        }

        .pod-item:last-child {
          border-bottom: none;
        }

        .pod-item:hover {
          background: #3c3c3c;
        }

        .containers-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #2d2d30;
          border: 1px solid #555;
          border-radius: 4px;
          margin-top: 4px;
          max-height: 150px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .container-item {
          padding: 8px 12px;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 13px;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
          border-bottom: 1px solid #3c3c3c;
        }

        .container-item:last-child {
          border-bottom: none;
        }

        .container-item:hover {
          background: #3c3c3c;
        }

        .form-group {
          position: relative;
        }

        .input-with-status {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-with-status input {
          flex: 1;
          padding-right: 35px;
        }

        .status-icon {
          position: absolute;
          right: 10px;
          font-size: 16px;
          pointer-events: none;
          cursor: help;
        }

        .status-icon.checking {
          color: #ffa500;
          animation: pulse 1s ease-in-out infinite;
        }

        .status-icon.valid {
          color: #4ec9b0;
          font-weight: bold;
        }

        .status-icon.warning {
          color: #ffa500;
          font-weight: bold;
          pointer-events: auto;
        }

        .status-icon.error {
          color: #f48771;
          font-weight: bold;
          pointer-events: auto;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .context-selector {
          background: #3c3c3c;
          border: 1px solid #555;
          border-radius: 4px;
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }

        .context-selector:hover {
          background: #454545;
          border-color: #007acc;
        }

        .context-display {
          color: #d4d4d4;
          font-size: 13px;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
        }

        .context-arrow {
          color: #858585;
          font-size: 10px;
        }

        .contexts-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #2d2d30;
          border: 1px solid #555;
          border-radius: 4px;
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .context-item {
          padding: 10px 12px;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 13px;
          border-bottom: 1px solid #3c3c3c;
          transition: background 0.15s;
        }

        .context-item:last-child {
          border-bottom: none;
        }

        .context-item:hover {
          background: #3c3c3c;
        }

        .context-item.current {
          background: #2d4a5e;
          color: #4ec9b0;
        }

        .context-meta {
          color: #858585;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}
