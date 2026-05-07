# WailsLogView - High Level Design

## Overview
A native cross-platform desktop log viewer built with Wails v3, featuring real-time file monitoring and Kubernetes pod log streaming. Runs as a standalone desktop application on Windows, macOS, and Linux.

## Architecture

### System Components

```
┌──────────────────────────────────────────────────────────────┐
│                   Native Desktop Window (Wails v3)            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  UI Layer (Preact + Virtual Scrolling)                 │  │
│  │  - Tabbed interface for multiple sources               │  │
│  │  - Dual-pane layout (all lines + filtered)             │  │
│  │  - File selection OR Kubernetes connector              │  │
│  │  - K8s: Context/Namespace/Pod/Container dropdowns      │  │
│  │  - Filter input (regex support)                        │  │
│  │  - File drag & drop support                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                            ▲                                  │
│                            │ Wails IPC Bindings + Events      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Go Backend (Wails Services)                           │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  FileService - Open files, manage file sessions  │  │  │
│  │  │  K8sService  - K8s contexts, namespaces, pods    │  │  │
│  │  │  SettingsService - Application settings CRUD     │  │  │
│  │  │  RecentService - Recent files & namespaces       │  │  │
│  │  │  SessionService - Session lifecycle management   │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Session Manager (Event Emission)                │  │  │
│  │  │  - Emits: log-initial, log-lines, log-error      │  │  │
│  │  │  - Coordinates watcher lifecycle                  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  File Watcher (fsnotify)                         │  │  │
│  │  │  - Monitor file changes                          │  │  │
│  │  │  - Detect new lines                              │  │  │
│  │  │  - Handle file rotation                          │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Kubernetes Watcher (client-go)                  │  │  │
│  │  │  - Stream pod logs via K8s API                   │  │  │
│  │  │  - List contexts, namespaces, pods, containers   │  │  │
│  │  │  - Context switching support                     │  │  │
│  │  │  - Namespace validation                          │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
            ┌───────────────┐  ┌──────────────┐
            │   Log Files   │  │ Kubernetes   │
            │ (File System) │  │   Clusters   │
            └───────────────┘  └──────────────┘
```

## Data Flow

### Initial Load
1. User starts application (double-click binary)
2. Wails creates native window with embedded webview
3. Frontend loads from embedded assets
4. User selects log file via UI or drags file onto window
5. Frontend calls `FileService.OpenFile(path)` via Wails binding
6. Backend reads initial content (last N lines)
7. Backend emits `log-initial` event with lines
8. Frontend renders using virtual scrolling

### Real-time Monitoring (Files)
1. Backend watches file for changes (fsnotify)
2. New lines detected
3. Backend reads new content
4. Backend emits `log-lines` event with new lines
5. Frontend appends to virtual list
6. Auto-scroll if enabled

### Real-time Monitoring (Kubernetes)
1. User selects context, namespace, pod, container via UI
2. Frontend calls `K8sService.OpenK8sLogs(namespace, pod, container)` via Wails binding
3. Backend creates Kubernetes client using client-go
4. Backend validates namespace existence
5. Backend starts streaming pod logs via K8s API
6. Backend emits `log-lines` events as lines arrive
7. Frontend appends to virtual list
8. Auto-scroll if enabled
9. Namespace saved to recent history

### Filtering
1. User types filter pattern (regex) in include/exclude inputs
2. Preact state updates trigger re-render
3. useMemo recomputes filtered log lines
4. Virtual scroller re-renders with filtered results
5. (Optional: Backend-side filtering for very large files)

## Key Technical Decisions

### Backend (Go)

**Core Libraries:**
- `github.com/wailsapp/wails/v3` - Desktop application framework (IPC, events, window management)
- `fsnotify/fsnotify` - File system monitoring
- `k8s.io/client-go` - Kubernetes API client
- `k8s.io/api` - Kubernetes API types
- `embed` - Embed frontend files in binary

**Kubernetes Integration:**
- Reads `~/.kube/config` for cluster configuration
- Lists and switches between contexts (clusters)
- Discovers namespaces, pods, and containers
- Streams logs using PodLogs() API with Follow=true
- Validates namespace existence before listing pods
- Graceful handling of context switching and disconnections

**Architecture Patterns:**
- Wails services for frontend-backend communication (IPC bindings)
- Wails event system for real-time log streaming (`log-initial`, `log-lines`, `log-error`)
- Session manager for coordinating log streaming lifecycle
- Goroutine per file/K8s watcher
- Channel-based communication between watcher and session manager
- Buffered readers for efficient file I/O
- Graceful shutdown handling

**Performance Considerations:**
- Stream large files instead of loading entirely
- Configurable line buffer limits
- Efficient tail reading (seek from end)
- Handle log rotation gracefully

### Frontend (Preact)

**Core Technologies:**
- Preact (~3KB) - Lightweight React alternative
- Preact Hooks - State management (useState, useEffect, useMemo)
- preact/compat - 100% React API compatibility
- react-window - Virtual scrolling
- @wailsio/runtime - Wails event system and application bridge
- ansi-to-html - ANSI color code rendering

**State Management:**
- Component state for UI (filters, auto-scroll, connection status)
- Ring buffer for log lines (configurable max lines in memory)
- Memoized filtering with useMemo
- Reactive updates on state changes

**Communication:**
- Wails bindings (auto-generated TypeScript) for calling Go functions
- Wails event listeners for receiving real-time log data
- No HTTP requests or WebSocket connections needed

**Data Management:**
- Incremental filtering with include/exclude regex
- Lazy loading for historical data
- Efficient re-renders with Preact's diffing

**Performance Optimizations:**
- Virtual scrolling for millions of lines
- Debounced filter input
- Memoized filter computations
- Code splitting for production build
- Web Workers for heavy filtering (optional)

## API Design

### Wails Services (IPC Bindings)

Frontend calls Go functions directly via auto-generated TypeScript bindings (in-memory IPC, no HTTP/network overhead):

**FileService** (`internal/handlers/file/`)
```go
OpenFile(path string, tail int) error    // Open file and start streaming
```

**K8sService** (`internal/handlers/k8s/`)
```go
GetContexts() ([]string, error)                                      // List available K8s contexts
SwitchContext(context string) error                                   // Switch active K8s context
GetNamespaces() ([]string, error)                                     // List namespaces in current context
GetPods(namespace string) ([]string, error)                           // List pods in namespace
GetContainers(namespace, pod string) ([]string, error)                // List containers in pod
OpenK8sLogs(namespace, pod, container string, tail int) error         // Start streaming pod logs
```

**SettingsService** (`internal/handlers/settings/`)
```go
GetSettings() (Settings, error)          // Get current settings
UpdateSettings(s Settings) error         // Update and persist settings
```

**RecentService** (`internal/handlers/recent/`)
```go
GetRecentFiles() ([]string, error)           // Get recently opened files
GetRecentNamespaces() ([]string, error)      // Get recently used K8s namespaces
```

**SessionService** (`internal/session/`)
```go
CloseSession(sessionID string) error         // Close and cleanup a log session
```

### Wails Event System (Real-time Streaming)

Backend emits events to frontend via Wails in-process event bus (no WebSocket):

**Backend → Frontend Events:**
```
"log-initial"  → LogLinesEvent{ Lines []string }     // Initial batch of log lines
"log-lines"    → LogLinesEvent{ Lines []string }     // New log lines as they arrive
"log-error"    → LogErrorEvent{ Message string }     // Error notifications
```

**Window Events:**
```
"file-dropped" → string                              // File path from native drag & drop
```

Bindings are auto-generated via `wails3 generate bindings -ts` and stored in `frontend/bindings/`.

## File Handling Strategy

### Large File Support
- Stream-based reading (don't load entire file)
- Configurable chunk size (e.g., 10,000 lines)
- Seek support for jumping to specific positions
- Progressive loading (infinite scroll up/down)

### File Rotation Handling
- Detect when file is truncated (size decrease)
- Detect when file is renamed/deleted
- Automatically reload on rotation
- Notify user of file changes

### Multi-File Support (Future)
- Tab-based interface
- One watcher goroutine per file
- One WebSocket connection, multiplexed channels
- Resource limits (max files, max memory)

## Configuration

### Application Settings
```yaml
log_viewer:
  max_lines_memory: 100000    # Max lines to keep in memory
  tail_lines: 1000            # Initial lines to load
  chunk_size: 5000            # Lines per chunk
  max_file_size: 1073741824   # 1GB max file size
  
performance:
  buffer_size: 65536          # File read buffer
  max_concurrent_files: 10
```

## Project Structure

```
WailsLogView/
├── main.go                      # Wails app entry point (services, window, events)
├── internal/
│   ├── config/
│   │   └── config.go            # Configuration management
│   ├── env/
│   │   └── env.go               # Environment/path expansion utilities
│   ├── handlers/
│   │   ├── file/                # FileService - file operations
│   │   ├── k8s/                 # K8sService - Kubernetes operations
│   │   ├── recent/              # RecentService - recent files/namespaces
│   │   └── settings/            # SettingsService - application settings
│   ├── session/
│   │   ├── manager.go           # Session lifecycle and event emission
│   │   └── service.go           # SessionService - session cleanup
│   ├── settings/
│   │   └── settings.go          # Persistent settings storage
│   └── watcher/
│       ├── watcher.go           # File watching logic (fsnotify)
│       ├── k8s_watcher.go       # Kubernetes log streaming
│       ├── k8s_contexts.go      # K8s context management
│       ├── k8s_namespaces.go    # Namespace listing
│       └── k8s_pods.go          # Pod and container discovery
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.jsx              # Main application (tabs)
│   │   │   ├── LogViewerTab.jsx     # Individual tab component
│   │   │   ├── LogViewer.jsx        # Log display with virtual scrolling
│   │   │   ├── ControlBar.jsx       # Include/exclude filter inputs
│   │   │   ├── DropZone.jsx         # File vs K8s source selector
│   │   │   ├── K8sConnector.jsx     # K8s connection form with autocomplete
│   │   │   ├── Header.jsx           # Application header
│   │   │   ├── LogDetailModal.jsx   # Log line detail view
│   │   │   ├── ResizablePanes.jsx   # Dual-pane layout with resize
│   │   │   └── SettingsModal.jsx    # Application settings
│   │   ├── hooks/                   # Custom hooks (Wails event listeners)
│   │   └── main.jsx                 # Preact app bootstrap
│   ├── bindings/                    # Auto-generated Wails TypeScript bindings
│   ├── index.html                   # HTML entry point
│   ├── vite.config.js               # Vite build configuration
│   └── package.json                 # Frontend dependencies
├── build/                           # Wails build output (production executables)
├── vendor/                          # Vendored Go dependencies
├── go.mod
├── go.sum
├── Taskfile.yml                     # Task runner configuration
├── Makefile                         # Build automation
├── README.md
└── DESIGN.md                        # This file
```

## Development Phases

### Phase 1: Core Functionality (MVP)
- [x] Go backend with file watching
- [x] File watcher implementation
- [x] Basic frontend with virtual scrolling
- [x] Open single file
- [x] Real-time tail functionality
- [x] Regex filtering (include/exclude)
- [x] Tabbed interface
- [x] Dual-pane layout
- [x] ANSI color rendering
- [x] Persistent settings

### Phase 2: Kubernetes Integration
- [x] Kubernetes client-go integration
- [x] Pod log streaming via K8s API
- [x] Context listing and switching
- [x] Namespace discovery and validation
- [x] Pod discovery with autocomplete
- [x] Container selection for multi-container pods
- [x] Recent namespaces persistence
- [x] Smart UI indicators (namespace validation)
- [x] Side-by-side source selection (File vs K8s)

### Phase 3: Native Desktop App (Wails v3 Migration)
- [x] Migrate from web app to native desktop (Wails v3)
- [x] Replace HTTP server with Wails services
- [x] Replace WebSocket with Wails event system
- [x] Replace frontend API calls with Wails bindings
- [x] Add file drag & drop support
- [x] Session management for log streaming
- [x] Auto-generated TypeScript bindings

### Phase 3: Advanced Features
- [ ] Large file optimization (streaming)
- [ ] Historical data loading (scroll up)
- [ ] File rotation handling
- [ ] Search/jump to line
- [ ] Bookmarks/highlights
- [ ] Export filtered results
- [ ] Multi-pod log aggregation

### Phase 4: Polish & Distribution
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts
- [ ] Multi-platform builds
- [ ] Installer/package creation
- [ ] Comprehensive documentation

## Non-Functional Requirements

### Performance Targets
- Handle files up to 1GB
- Support millions of lines in memory
- < 100ms latency for new log lines
- < 16ms frame time for smooth scrolling
- < 50MB memory overhead (excluding log data)

### Compatibility
- Windows 10+
- macOS 10.15+
- Linux (major distributions)
- WebKit/WebView2 (embedded in Wails)

### Reliability
- Graceful handling of file access errors
- Session cleanup on disconnect
- No crashes on malformed log files
- Proper cleanup on application exit

## Security Considerations

### Local-Only Access
- Native desktop app (no network server)
- All communication is in-process IPC (no network exposure)
- No authentication needed (native app trust model)

### File System Access
- Validate file paths (prevent directory traversal)
- Read-only access to log files
- Configurable allowed directories (optional)

### Input Validation
- Sanitize regex patterns (prevent ReDoS)
- Limit event payload size
- Rate limiting on file operations

## Future Enhancements

### Possible Features
- Multi-pod log aggregation (stream from multiple pods)
- Log level filtering (parse structured logs)
- SSH/remote file support
- Log parsing plugins
- Alert/notification rules
- Statistics dashboard
- Compare two log files/pods
- Session persistence
- Saved filter patterns
- Color coding by log level
- Timestamp parsing and time-range filtering
- Label-based pod selection
- Recent pods history (like recent files/namespaces)
- Pod status indicators in UI

### Plugin System (Long-term)
- Custom log parsers
- Custom syntax highlighting
- Export formats
- Integration with external tools
