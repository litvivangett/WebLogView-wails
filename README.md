# WailsLogView

A native desktop log viewer built with Wails v3, featuring real-time file monitoring and Kubernetes pod log streaming.

## Features

- 🔄 Real-time log file monitoring
- ☸️ **Kubernetes pod log streaming** (connect directly to pods)
- 🌐 **Multi-cluster support** (switch between Kubernetes contexts)
- 🎯 **Smart namespace & pod discovery** (autocomplete with live filtering)
- 🎨 ANSI color rendering (terminal colors displayed properly)
- 🔍 Regex filtering (include/exclude patterns)
- 📑 Tabbed interface for multiple log sources
- 📊 Dual-pane layout (all lines + filtered lines)
- 🖱️ Click-to-highlight line navigation
- ⚙️ Persistent settings with recent namespaces
- 🎯 Native desktop app (built with Wails v3)
- 📦 Single executable (no dependencies)

## Quick Start

### Download Pre-built Binary

Download the latest release for your platform from the [Releases](../../releases) page.

### First-time Setup (macOS only)

macOS may block the application because it's not signed. To run it:

```bash
# Remove macOS quarantine attribute (for downloaded files)
xattr -c bin/WailsLogview.app
```

Alternatively, after the first run attempt, go to **System Preferences → Security & Privacy** and click **"Open Anyway"**.

### Run

The application will launch as a native desktop window.

## Usage

### Viewing Log Files

1. Drag and drop a log file onto the interface, or
2. Click "Choose File" and enter the file path
3. Logs will stream in real-time as the file is updated

### Kubernetes Pod Logs

1. Click the "Kubernetes" option on the landing page
2. Select your cluster context (switches between multiple clusters)
3. Enter or select a namespace (autocomplete with validation):
   - ✓ Green checkmark: namespace exists with pods
   - ⚠ Orange warning: namespace exists but no pods running
   - ✕ Red X: namespace not found
4. Select a pod from the autocomplete dropdown (live filtering)
5. Optionally select a specific container (for multi-container pods)
6. Click "Connect" to start streaming logs

**Kubernetes Features:**
- Recent namespaces are saved and suggested
- All namespaces are available via dropdown with live filtering
- Pod discovery with autocomplete search
- Container selection for multi-container pods
- Context switching for multi-cluster environments

### Command Line Options
The application runs as a native desktop window with no command-line options required.

## Prerequisites

### For File Watching
- No additional dependencies required

### For Kubernetes Integration
- `kubectl` configured with access to your clusters
- Valid `~/.kube/config` file with cluster contexts
- Appropriate RBAC permissions to list namespaces, pods, and read logs

### For Development
- Go 1.25 or later
- [Wails v3 CLI](https://v3.wails.io/quick-start/first-app/): `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`
- Node.js 18+ and npm
- (Optional) [Task](https://taskfile.dev/) runner — or use `wails3 task` as a wrapper

### Getting Started

```bash
# Install dependencies
go mod download
cd frontend && npm install && cd ..

# Run in development mode (hot reload for Go + Vite frontend)
wails3 dev
```

### Task Commands

All tasks are defined in `Taskfile.yml` and platform-specific files under `build/`. Run with `wails3 task <name>` or `task <name>` if Task is installed directly.

#### Development

| Command | Description |
|---|---|
| `wails3 dev` | Run app with hot reload (Go + frontend) |
| `wails3 task go:test` | Run Go tests |
| `wails3 task go:fmt` | Format Go code |
| `wails3 task go:lint` | Run golangci-lint |

#### Build & Package

| Command | Description |
|---|---|
| `wails3 build` | Build production binary for current platform → `bin/` |
| `wails3 build GOOS=darwin GOARCH=arm64` | Cross-compile for a specific platform |
| `wails3 task darwin:build:universal` | Build macOS universal binary (arm64 + amd64) |
| `wails3 package` | Package for distribution (`.app` / installer / AppImage) |

#### Signing & Release

| Command | Description |
|---|---|
| `wails3 task darwin:sign` | Sign macOS `.app` with Developer ID |
| `wails3 task darwin:sign:notarize` | Sign + notarize for macOS distribution |
| `wails3 task windows:sign` | Sign Windows executable |

Configure signing in `build/darwin/Taskfile.yml` (macOS) or `build/windows/Taskfile.yml` (Windows). See [Wails signing guide](https://v3.wails.io/guides/build/signing/).

#### Bindings & Assets

| Command | Description |
|---|---|
| `wails3 generate bindings -ts` | Regenerate TypeScript bindings after changing Go services |
| `wails3 task generate:icons` | Regenerate app icons from `build/appicon.png` |

#### Utilities

| Command | Description |
|---|---|
| `wails3 task clean` | Remove build artifacts (`bin/`, `frontend/dist/`, `frontend/bindings/`) |
| `wails3 task release:all` | Build all platforms locally (requires Docker — run `wails3 task setup:docker` first) |
| `wails3 task bump:patch` | Bump patch version (e.g., 1.0.0 → 1.0.1) |
| `wails3 task bump:minor` | Bump minor version |
| `wails3 task bump:major` | Bump major version |

### Releasing

Releases are automated via GitHub Actions. Push a version tag to trigger:

```bash
wails3 task bump:patch            # 1.0.0 → 1.0.1
git add VERSION && git commit -m "Bump version to 1.0.1"
git tag v1.0.1
git push origin main --tags
```

The [release workflow](.github/workflows/release.yml) will:
1. Build native binaries on macOS, Linux, and Windows runners
2. Sign and notarize the macOS `.app` with the corporate Apple certificate
3. Package archives (`.tar.gz` for macOS/Linux, `.zip` for Windows)
4. Create a GitHub Release with all assets attached

### How It Works (Wails Architecture)

[Wails v3](https://v3.wails.io/) creates a native desktop window with an embedded webview. The Go backend and Preact frontend communicate directly in-process — no HTTP server, no WebSocket, no network overhead.

- **Bindings (request/response):** Frontend calls Go functions via auto-generated TypeScript bindings in `frontend/bindings/`. Wails generates these from Go service methods — never write them manually. Regenerate with `wails3 generate bindings -ts`.
- **Events (real-time streaming):** Backend emits events (`log-initial`, `log-lines`, `log-error`) that frontend listens to via `@wailsio/runtime`. This replaces WebSocket-based streaming.
- **Assets:** Frontend is built by Vite to `frontend/dist/` and embedded into the Go binary via `//go:embed`. The result is a single executable with no external dependencies.

## Project Structure

```
WailsLogView/
├── main.go                      # Wails app entry point (services, window, events)
├── internal/
│   ├── config/                  # Application configuration
│   ├── env/                     # Environment/path utilities
│   ├── handlers/                # Wails services (frontend-callable Go functions)
│   │   ├── file/                # FileService — open files, start streaming
│   │   ├── k8s/                 # K8sService — contexts, namespaces, pods, logs
│   │   ├── recent/              # RecentService — recent files & namespaces
│   │   └── settings/            # SettingsService — app settings CRUD
│   ├── session/                 # Session manager — streaming lifecycle & event emission
│   ├── settings/                # Persistent settings storage (~/.weblogview/)
│   └── watcher/                 # File system & K8s log streaming
│       ├── watcher.go           # File watcher (fsnotify)
│       ├── k8s_watcher.go       # Kubernetes pod log streaming
│       ├── k8s_pods.go          # Pod discovery
│       ├── k8s_contexts.go      # Context management
│       └── k8s_namespaces.go    # Namespace listing
├── frontend/                    # Preact frontend (Vite)
│   ├── src/
│   │   ├── components/          # UI components (App, LogViewer, K8sConnector, etc.)
│   │   ├── hooks/               # Custom hooks (Wails event listeners)
│   │   └── main.jsx
│   ├── bindings/                # Auto-generated Wails TypeScript bindings
│   ├── vite.config.js
│   └── package.json
├── build/                       # Wails build config, icons, platform Taskfiles
│   ├── config.yml               # App metadata, dev mode config
│   ├── darwin/                  # macOS: Info.plist, signing config, icons
│   ├── windows/                 # Windows: manifest, icon, signing config
│   └── linux/                   # Linux: .desktop file, packaging config
├── vendor/                      # Vendored Go dependencies
├── go.mod
├── Taskfile.yml                 # Root task definitions
├── DESIGN.md
└── README.md
```

## Settings

Settings are stored in `~/.weblogview/settings.json` and persist across sessions:

- **Initial Window Size**: Number of lines to load initially (default: 1000)
- **ANSI Rendering**: Toggle colored log display per pane (default: enabled)
- **Recent Files**: Last 10 opened log files
- **Recent Namespaces**: Last 10 used Kubernetes namespaces

Access settings via the ⚙️ button in the control bar.

## API Bindings

The frontend communicates with the Go backend via Wails bindings (IPC). Key functions:

### File Operations
- `OpenFile(path)` - Open a log file for streaming
- `GetRecentFiles()` - Get recently opened files

### Kubernetes Operations
- `GetContexts()` - List available Kubernetes contexts
- `SwitchContext(context)` - Switch active context
- `GetNamespaces()` - List all namespaces in current context
- `GetPods(namespace)` - List pods in namespace
- `GetContainers(namespace, pod)` - List containers in pod
- `GetRecentNamespaces()` - Get recently used namespaces
- `OpenK8sLogs(namespace, pod, container)` - Start streaming pod logs

For a complete list, see the generated Wails bindings in `frontend/bindings/`.

## Architecture

See [DESIGN.md](DESIGN.md) for detailed architecture and design documentation.

## License

MIT
