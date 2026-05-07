package recent

import (
	"github.com/litvivangett/weblogview/internal/settings"
)

// RecentService handles recent files and namespaces
type RecentService struct{}

// NewRecentService creates a new RecentService instance
func NewRecentService() *RecentService {
	return &RecentService{}
}

// GetRecentFiles returns the list of recently opened files
func (s *RecentService) GetRecentFiles() []string {
	return settings.GetInstance().GetRecentFiles()
}

// AddRecentFile adds a file path to the recent files list
func (s *RecentService) AddRecentFile(path string) error {
	return settings.GetInstance().AddRecentFile(path)
}

// GetRecentNamespaces returns the list of recently used Kubernetes namespaces
func (s *RecentService) GetRecentNamespaces() []string {
	return settings.GetInstance().GetRecentNamespaces()
}

// AddRecentNamespace adds a namespace to the recent namespaces list
func (s *RecentService) AddRecentNamespace(namespace string) error {
	return settings.GetInstance().AddRecentNamespace(namespace)
}
