# Kubernetes Integration

WailsLogView supports streaming logs directly from Kubernetes pods via the native desktop app.

## Features

- **Side-by-side UI**: Choose between file source or Kubernetes pod
- **Real-time streaming**: Live log updates from pods
- **Multi-cluster support**: Switch between Kubernetes contexts
- **Smart discovery**: Namespace/pod/container autocomplete with validation
- **All existing features work**: Filtering, ANSI colors, line highlighting, etc.

## Usage

### 1. Start WailsLogView

Double-click the application or run from terminal:
```bash
./WailsLogView-darwin-arm64
```

### 2. Choose Source

On the initial screen, you'll see two options:

**📄 Open Log File** (left side)
- Enter file path or drag & drop a file
- Works with local files

**☸️ Connect to Kubernetes** (right side)
- Select cluster context
- Enter or select a namespace (autocomplete with validation):
  - ✓ Green checkmark: namespace exists with pods
  - ⚠ Orange warning: namespace exists but no pods running
  - ✕ Red X: namespace not found
- Select a pod from the autocomplete dropdown
- Optionally select a specific container (for multi-container pods)

### 3. Connect to Pod

Fill in the Kubernetes connection details and click "Connect".

The app will:
- Connect to your Kubernetes cluster using `~/.kube/config`
- Stream logs in real-time
- Display them with all log viewer features (filtering, ANSI colors, etc.)

## Requirements

- Kubernetes cluster access
- `~/.kube/config` configured
- Permissions to read pod logs (RBAC)

## How It Works

```
K8s Pod → client-go → K8sWatcher → Wails Events → Frontend
```

1. **Frontend** calls `K8sService.OpenK8sLogs()` via Wails binding
2. **K8sService** creates a K8s watcher via session manager
3. **K8sWatcher** streams logs using `PodLogs()` API (client-go)
4. **Session Manager** emits `log-lines` events to the frontend
5. **Frontend** receives events and displays lines with all existing features

## Wails Bindings (API)

### List Contexts
```typescript
import { GetContexts } from '../bindings/github.com/litvivangett/weblogview/internal/handlers/k8s';
const contexts = await GetContexts();
```

### Switch Context
```typescript
import { SwitchContext } from '../bindings/...';
await SwitchContext("my-cluster");
```

### Connect to Pod Logs
```typescript
import { OpenK8sLogs } from '../bindings/...';
await OpenK8sLogs("production", "my-app-pod-abc123", "app", 1000);
```

## Code Structure

**Backend:**
- `internal/handlers/k8s/` - K8s service (Wails bindings for contexts, namespaces, pods, containers, log streaming)
- `internal/watcher/k8s_watcher.go` - Kubernetes log streaming
- `internal/watcher/k8s_contexts.go` - Context management
- `internal/watcher/k8s_namespaces.go` - Namespace listing
- `internal/watcher/k8s_pods.go` - Pod and container discovery

**Frontend:**
- `frontend/src/components/K8sConnector.jsx` - K8s connection form with autocomplete
- `frontend/src/components/DropZone.jsx` - Side-by-side source selector
- `frontend/src/components/LogViewerTab.jsx` - Handles both file and K8s sources

## Example: Viewing Pod Logs

1. Deploy an app to Kubernetes:
```bash
kubectl run nginx --image=nginx
```

2. Open WailsLogView and connect:
- Context: (select your cluster)
- Namespace: `default`
- Pod Name: `nginx`
- Container: (leave empty)

3. See logs in real-time!

## Troubleshooting

**"Failed to connect to Kubernetes"**
- Check `~/.kube/config` exists and is valid
- Run `kubectl get pods` to verify cluster access

**"Error reading log stream"**
- Pod might have terminated
- Check pod exists: `kubectl get pod <podname> -n <namespace>`

**"Permission denied"**
- Your Kubernetes user needs permissions:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-log-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "namespaces"]
  verbs: ["get", "list"]
```

## Future Enhancements

- [ ] Multi-pod aggregated view
- [ ] Label selectors (all pods with `app=myapp`)
- [ ] Historical logs with date range
- [ ] Save favorite pod connections
- [ ] Pod status indicators in UI
