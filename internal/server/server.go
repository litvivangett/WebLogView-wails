package server

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/settings"
	"github.com/litvivangett/weblogview/internal/watcher"
	"github.com/litvivangett/weblogview/internal/websocket"
)

// Server represents the HTTP server
type Server struct {
	config *config.Config
	hub    *websocket.Hub
}

// New creates a new server instance
func New(cfg *config.Config) *Server {
	hub := websocket.NewHub()
	return &Server{
		config: cfg,
		hub:    hub,
	}
}

// Start starts the HTTP server
func (s *Server) Start() error {
	// Start the WebSocket hub
	go s.hub.Run()

	// Register HTTP handlers
	http.HandleFunc("/api/settings", s.handleSettings)
	http.HandleFunc("/api/recent-files", s.handleRecentFiles)
	http.HandleFunc("/api/recent-namespaces", s.handleRecentNamespaces)
	http.HandleFunc("/api/k8s/contexts", s.handleK8sContexts)
	http.HandleFunc("/api/k8s/switch-context", s.handleK8sSwitchContext)
	http.HandleFunc("/api/k8s/namespaces", s.handleK8sNamespaces)
	http.HandleFunc("/api/k8s/pods", s.handleK8sPods)
	http.HandleFunc("/api/k8s/containers", s.handleK8sContainers)
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.HandleWebSocket(s.hub, s.config, w, r)
	})

	// Start server
	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	return http.ListenAndServe(addr, nil)
}

// handleSettings handles settings GET/POST requests
func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	appSettings := settings.GetInstance()

	switch r.Method {
	case "GET":
		// Return current settings
		type SettingsResponse struct {
			TailLines            int    `json:"tailLines"`
			RenderAnsiTopPane    bool   `json:"renderAnsiTopPane"`
			RenderAnsiBottomPane bool   `json:"renderAnsiBottomPane"`
			PollingIntervalMs    int    `json:"pollingIntervalMs"`
			SourceNameFormat     string `json:"sourceNameFormat"`
		}
		response := SettingsResponse{
			TailLines:            appSettings.GetTailLines(),
			RenderAnsiTopPane:    appSettings.GetRenderAnsiTopPane(),
			RenderAnsiBottomPane: appSettings.GetRenderAnsiBottomPane(),
			PollingIntervalMs:    appSettings.PollingIntervalMs,
			SourceNameFormat:     appSettings.SourceNameFormat,
		}
		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}

	case "POST":
		// Update settings
		var update struct {
			TailLines            int    `json:"tailLines"`
			RenderAnsiTopPane    *bool  `json:"renderAnsiTopPane"`
			RenderAnsiBottomPane *bool  `json:"renderAnsiBottomPane"`
			PollingIntervalMs    int    `json:"pollingIntervalMs"`
			SourceNameFormat     string `json:"sourceNameFormat"`
		}
		if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if update.TailLines > 0 {
			appSettings.SetTailLines(update.TailLines)
		}
		if update.RenderAnsiTopPane != nil {
			appSettings.SetRenderAnsiTopPane(*update.RenderAnsiTopPane)
		}
		if update.RenderAnsiBottomPane != nil {
			appSettings.SetRenderAnsiBottomPane(*update.RenderAnsiBottomPane)
		}
		if update.PollingIntervalMs > 0 {
			appSettings.PollingIntervalMs = update.PollingIntervalMs
		}
		if update.SourceNameFormat != "" {
			appSettings.SourceNameFormat = update.SourceNameFormat
		}

		if err := appSettings.Save(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Write([]byte(`{"status":"ok"}`))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleRecentFiles handles recent files GET requests
func (s *Server) handleRecentFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	appSettings := settings.GetInstance()
	recentFiles := appSettings.GetRecentFiles()

	if err := json.NewEncoder(w).Encode(recentFiles); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleRecentNamespaces handles recent namespaces GET requests
func (s *Server) handleRecentNamespaces(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	appSettings := settings.GetInstance()
	recentNamespaces := appSettings.GetRecentNamespaces()

	if err := json.NewEncoder(w).Encode(recentNamespaces); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleK8sContexts handles listing Kubernetes contexts
func (s *Server) handleK8sContexts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	contexts, err := watcher.ListContexts()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list contexts: %v", err), http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(contexts); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleK8sSwitchContext handles switching Kubernetes context
func (s *Server) handleK8sSwitchContext(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Context string `json:"context"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Context == "" {
		http.Error(w, "context is required", http.StatusBadRequest)
		return
	}

	if err := watcher.SwitchContext(req.Context); err != nil {
		http.Error(w, fmt.Sprintf("Failed to switch context: %v", err), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"ok"}`))
}

// handleK8sNamespaces handles listing namespaces
func (s *Server) handleK8sNamespaces(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	namespaces, err := watcher.ListNamespaces()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list namespaces: %v", err), http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(namespaces); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleK8sPods handles listing pods in a namespace
func (s *Server) handleK8sPods(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		http.Error(w, "namespace query parameter is required", http.StatusBadRequest)
		return
	}

	pods, err := watcher.ListPodsInNamespace(namespace)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list pods: %v", err), http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(pods); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleK8sContainers handles listing containers in a pod
func (s *Server) handleK8sContainers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	podName := r.URL.Query().Get("pod")

	if namespace == "" {
		http.Error(w, "namespace query parameter is required", http.StatusBadRequest)
		return
	}
	if podName == "" {
		http.Error(w, "pod query parameter is required", http.StatusBadRequest)
		return
	}

	containers, err := watcher.ListContainersInPod(namespace, podName)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list containers: %v", err), http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(containers); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
