package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Settings represents application settings
type Settings struct {
	TailLines            int      `json:"tailLines"`            // Number of lines to load initially
	RenderAnsiTopPane    bool     `json:"renderAnsiTopPane"`    // Render ANSI codes in top pane (default: true - prettified)
	RenderAnsiBottomPane bool     `json:"renderAnsiBottomPane"` // Render ANSI codes in bottom pane (default: true - prettified)
	PollingIntervalMs    int      `json:"pollingIntervalMs"`    // Polling interval in milliseconds (default: 500ms)
	SourceNameFormat     string   `json:"sourceNameFormat"`     // Format for merged log source names: "container", "pod", or "namespace/pod"
	RecentFiles          []string `json:"recentFiles"`          // Recently opened files (max 10)
	RecentNamespaces     []string `json:"recentNamespaces"`     // Recently used K8s namespaces (max 10)
	mu                   sync.RWMutex
}

var (
	instance *Settings
	once     sync.Once
)

// GetInstance returns the singleton settings instance
func GetInstance() *Settings {
	once.Do(func() {
		instance = &Settings{
			TailLines:            1000,        // Default
			RenderAnsiTopPane:    true,        // Prettified by default
			RenderAnsiBottomPane: true,        // Prettified by default
			PollingIntervalMs:    500,         // 500ms default
			SourceNameFormat:     "container", // Default to container name
			RecentFiles:          []string{},  // Empty list
			RecentNamespaces:     []string{},  // Empty list
		}
		instance.Load()
	})
	return instance
}

// Load loads settings from file
func (s *Settings) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	settingsPath := getSettingsPath()
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			// File doesn't exist, use defaults
			return nil
		}
		return err
	}

	return json.Unmarshal(data, s)
}

// Save saves settings to file
func (s *Settings) Save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	settingsPath := getSettingsPath()

	// Ensure directory exists
	dir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, data, 0644)
}

// GetTailLines returns the tail lines setting
func (s *Settings) GetTailLines() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.TailLines
}

// SetTailLines sets the tail lines setting
func (s *Settings) SetTailLines(lines int) {
	s.mu.Lock()
	s.TailLines = lines
	s.mu.Unlock()
}

// GetRenderAnsiTopPane returns the render ANSI setting for top pane
func (s *Settings) GetRenderAnsiTopPane() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.RenderAnsiTopPane
}

// SetRenderAnsiTopPane sets the render ANSI setting for top pane
func (s *Settings) SetRenderAnsiTopPane(render bool) {
	s.mu.Lock()
	s.RenderAnsiTopPane = render
	s.mu.Unlock()
}

// GetRenderAnsiBottomPane returns the render ANSI setting for bottom pane
func (s *Settings) GetRenderAnsiBottomPane() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.RenderAnsiBottomPane
}

// SetRenderAnsiBottomPane sets the render ANSI setting for bottom pane
func (s *Settings) SetRenderAnsiBottomPane(render bool) {
	s.mu.Lock()
	s.RenderAnsiBottomPane = render
	s.mu.Unlock()
}

// AddRecentFile adds a file to the recent files list (max 10, most recent first)
func (s *Settings) AddRecentFile(filePath string) error {
	if filePath == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove if already exists
	for i, f := range s.RecentFiles {
		if f == filePath {
			s.RecentFiles = append(s.RecentFiles[:i], s.RecentFiles[i+1:]...)
			break
		}
	}

	// Add to front
	s.RecentFiles = append([]string{filePath}, s.RecentFiles...)

	// Keep only last 10
	if len(s.RecentFiles) > 10 {
		s.RecentFiles = s.RecentFiles[:10]
	}

	// Save to disk
	return s.saveUnlocked()
}

// GetRecentFiles returns the list of recent files
func (s *Settings) GetRecentFiles() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a copy to prevent external modification
	result := make([]string, len(s.RecentFiles))
	copy(result, s.RecentFiles)
	return result
}

// AddRecentNamespace adds a namespace to the recent list
func (s *Settings) AddRecentNamespace(namespace string) error {
	if namespace == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove if already exists
	for i, ns := range s.RecentNamespaces {
		if ns == namespace {
			s.RecentNamespaces = append(s.RecentNamespaces[:i], s.RecentNamespaces[i+1:]...)
			break
		}
	}

	// Add to front
	s.RecentNamespaces = append([]string{namespace}, s.RecentNamespaces...)

	// Keep only last 10
	if len(s.RecentNamespaces) > 10 {
		s.RecentNamespaces = s.RecentNamespaces[:10]
	}

	// Save to disk
	return s.saveUnlocked()
}

// GetRecentNamespaces returns the list of recent namespaces
func (s *Settings) GetRecentNamespaces() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a copy to prevent external modification
	result := make([]string, len(s.RecentNamespaces))
	copy(result, s.RecentNamespaces)
	return result
}

// GetPollingIntervalMs returns the polling interval in milliseconds
func (s *Settings) GetPollingIntervalMs() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.PollingIntervalMs
}

// SetPollingIntervalMs sets the polling interval in milliseconds
func (s *Settings) SetPollingIntervalMs(interval int) {
	s.mu.Lock()
	s.PollingIntervalMs = interval
	s.mu.Unlock()
}

// GetSourceNameFormat returns the source name format
func (s *Settings) GetSourceNameFormat() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.SourceNameFormat
}

// SetSourceNameFormat sets the source name format
func (s *Settings) SetSourceNameFormat(format string) {
	s.mu.Lock()
	s.SourceNameFormat = format
	s.mu.Unlock()
}

// saveUnlocked saves settings without locking (internal use only)
func (s *Settings) saveUnlocked() error {
	settingsPath := getSettingsPath()

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, data, 0644)
}

// getSettingsPath returns the path to the settings file
func getSettingsPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	return filepath.Join(homeDir, ".weblogview", "settings.json")
}
