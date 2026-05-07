package watcher

import (
	"context"
	"log"
	"sync"

	"github.com/litvivangett/weblogview/internal/session"
	"github.com/litvivangett/weblogview/internal/settings"
)

// K8sOpenConfig contains parameters for opening a K8s log stream.
type K8sOpenConfig struct {
	Namespace     string `json:"namespace"`
	PodName       string `json:"podName"`
	ContainerName string `json:"containerName"`
}

// K8sWatcherAdapter wraps K8sWatcher to implement session.Watcher.
type K8sWatcherAdapter struct {
	config   K8sOpenConfig
	watcher  *K8sWatcher
	linesCh  chan []string
	stopOnce sync.Once
	stopCh   chan struct{}
}

// NewK8sWatcherAdapter creates a new K8s adapter.
func NewK8sWatcherAdapter(cfg K8sOpenConfig) (*K8sWatcherAdapter, error) {
	tailLines := int64(settings.GetInstance().GetTailLines())

	k8sWatcher, err := NewK8sWatcher(K8sConfig{
		Namespace:     cfg.Namespace,
		PodName:       cfg.PodName,
		ContainerName: cfg.ContainerName,
		TailLines:     tailLines,
	})
	if err != nil {
		return nil, err
	}

	return &K8sWatcherAdapter{
		config:  cfg,
		watcher: k8sWatcher,
		linesCh: make(chan []string, 64),
		stopCh:  make(chan struct{}),
	}, nil
}

// Start begins watching K8s pod logs.
func (a *K8sWatcherAdapter) Start(ctx context.Context) error {
	// Start the K8s watcher in background, feeding lines to linesCh
	go func() {
		defer close(a.linesCh)
		err := a.watcher.Watch(ctx, func(lines []string) {
			select {
			case a.linesCh <- lines:
			case <-ctx.Done():
			case <-a.stopCh:
			}
		})
		if err != nil {
			log.Printf("K8s watcher error for %s/%s: %v", a.config.Namespace, a.config.PodName, err)
		}
	}()

	return nil
}

// Lines returns the channel of line batches.
func (a *K8sWatcherAdapter) Lines() <-chan []string {
	return a.linesCh
}

// Stop stops the K8s watcher.
func (a *K8sWatcherAdapter) Stop() {
	a.stopOnce.Do(func() {
		close(a.stopCh)
		a.watcher.Stop()
	})
}

// Ensure K8sWatcherAdapter implements session.Watcher at compile time.
var _ session.Watcher = (*K8sWatcherAdapter)(nil)
