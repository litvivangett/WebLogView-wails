package file

import (
	"fmt"
	"log"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/session"
	"github.com/litvivangett/weblogview/internal/settings"
	"github.com/litvivangett/weblogview/internal/watcher"
)

// FileService is a Wails service for file log streaming.
type FileService struct {
	sessionManager *session.SessionManager
	config         *config.Config
}

// NewFileService creates a new FileService.
func NewFileService(sm *session.SessionManager, cfg *config.Config) *FileService {
	return &FileService{sessionManager: sm, config: cfg}
}

// OpenFile opens a file for streaming in the given tab.
// Called from the frontend when the user opens a file.
func (s *FileService) OpenFile(tabId string, path string) error {
	if tabId == "" {
		return fmt.Errorf("tabId is required")
	}
	if path == "" {
		return fmt.Errorf("path is required")
	}

	adapter, err := watcher.NewFileWatcherAdapter(path, s.config)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}

	if err := s.sessionManager.RegisterTab(tabId, adapter); err != nil {
		return fmt.Errorf("failed to register tab: %w", err)
	}

	if err := settings.GetInstance().AddRecentFile(path); err != nil {
		log.Printf("warn: failed to save recent file: %v", err)
	}

	return nil
}

// CloseFile stops the log stream for the given tabId.
func (s *FileService) CloseFile(tabId string) error {
	return s.sessionManager.CloseTab(tabId)
}
