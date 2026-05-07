package k8s

import (
	"fmt"
	"log"

	"github.com/litvivangett/weblogview/internal/session"
	"github.com/litvivangett/weblogview/internal/settings"
	"github.com/litvivangett/weblogview/internal/watcher"
)

// K8sService is a Wails service for Kubernetes operations.
type K8sService struct {
	sessionManager *session.SessionManager
}

// NewK8sService creates a new K8sService.
func NewK8sService(sm *session.SessionManager) *K8sService {
	return &K8sService{
		sessionManager: sm,
	}
}

// OpenK8s opens a K8s pod log stream in the given tab.
func (s *K8sService) OpenK8s(tabId string, config watcher.K8sOpenConfig) error {
	if tabId == "" {
		return fmt.Errorf("tabId is required")
	}
	if config.Namespace == "" {
		return fmt.Errorf("namespace is required")
	}
	if config.PodName == "" {
		return fmt.Errorf("pod name is required")
	}

	adapter, err := watcher.NewK8sWatcherAdapter(config)
	if err != nil {
		return fmt.Errorf("failed to initialise Kubernetes client: %w", err)
	}

	if err := s.sessionManager.RegisterTab(tabId, adapter); err != nil {
		return fmt.Errorf("failed to register tab: %w", err)
	}

	// Save namespace to recent list
	if err := settings.GetInstance().AddRecentNamespace(config.Namespace); err != nil {
		log.Printf("[k8s] failed to save recent namespace %q: %v", config.Namespace, err)
	}

	return nil
}

// ListContexts returns available Kubernetes contexts.
func (s *K8sService) ListContexts() ([]watcher.K8sContext, error) {
	return watcher.ListContexts()
}

// SwitchContext changes the active Kubernetes context.
func (s *K8sService) SwitchContext(contextName string) error {
	if contextName == "" {
		return fmt.Errorf("context name is required")
	}
	return watcher.SwitchContext(contextName)
}

// ListNamespaces returns all namespaces in the current context.
func (s *K8sService) ListNamespaces() ([]string, error) {
	return watcher.ListNamespaces()
}

// ListPods returns pod names in the given namespace.
func (s *K8sService) ListPods(namespace string) ([]string, error) {
	if namespace == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	return watcher.ListPodsInNamespace(namespace)
}

// ListContainers returns container names in the given pod.
func (s *K8sService) ListContainers(namespace string, pod string) ([]string, error) {
	if namespace == "" {
		return nil, fmt.Errorf("namespace is required")
	}
	if pod == "" {
		return nil, fmt.Errorf("pod name is required")
	}
	return watcher.ListContainersInPod(namespace, pod)
}
