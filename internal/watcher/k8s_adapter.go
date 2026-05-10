package watcher

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/litvivangett/weblogview/internal/session"
	"github.com/litvivangett/weblogview/internal/settings"
)

type k8sLogWatcher interface {
	Watch(context.Context, func([]string)) error
	Stop()
}

// K8sOpenConfig contains parameters for opening a K8s log stream.
type K8sOpenConfig struct {
	Namespace     string `json:"namespace"`
	PodName       string `json:"podName"`
	ContainerName string `json:"containerName"`
}

// K8sWatcherAdapter wraps K8sWatcher to implement session.Watcher.
type K8sWatcherAdapter struct {
	config   K8sOpenConfig
	watcher  k8sLogWatcher
	linesCh  chan []string
	stopOnce sync.Once
	stopCh   chan struct{}
}

const k8sInitialFlushDelay = 25 * time.Millisecond

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
	if !a.sendBatch(ctx, []string{"__INITIAL_START__"}) {
		return nil
	}

	go func() {
		defer close(a.linesCh)
		callbackCh := make(chan []string, 64)
		watchDone := make(chan error, 1)

		go func() {
			err := a.watcher.Watch(ctx, func(lines []string) {
				if len(lines) == 0 {
					return
				}

				batch := append([]string(nil), lines...)
				select {
				case callbackCh <- batch:
				case <-ctx.Done():
				case <-a.stopCh:
				}
			})
			watchDone <- err
			close(callbackCh)
		}()

		initialPending := true
		initialLimit := settings.GetInstance().GetTailLines()
		initialLines := make([]string, 0, max(initialLimit, 0))
		var flushTimer *time.Timer
		var flushTimerCh <-chan time.Time

		stopFlushTimer := func() {
			if flushTimer == nil {
				return
			}
			if !flushTimer.Stop() {
				select {
				case <-flushTimer.C:
				default:
				}
			}
			flushTimerCh = nil
		}

		resetFlushTimer := func() {
			if flushTimer == nil {
				flushTimer = time.NewTimer(k8sInitialFlushDelay)
			} else {
				if !flushTimer.Stop() {
					select {
					case <-flushTimer.C:
					default:
					}
				}
				flushTimer.Reset(k8sInitialFlushDelay)
			}
			flushTimerCh = flushTimer.C
		}

		flushInitial := func() bool {
			if !initialPending {
				return true
			}
			initialPending = false
			stopFlushTimer()
			return a.emitInitialBatches(ctx, initialLines)
		}

		for {
			select {
			case lines, ok := <-callbackCh:
				if !ok {
					if initialPending && !flushInitial() {
						return
					}
					if err := <-watchDone; err != nil {
						log.Printf("K8s watcher error for %s/%s: %v", a.config.Namespace, a.config.PodName, err)
					}
					return
				}

				if !initialPending {
					if !a.sendBatch(ctx, lines) {
						return
					}
					continue
				}

				if initialLimit <= 0 {
					if !flushInitial() || !a.sendBatch(ctx, lines) {
						return
					}
					continue
				}

				remaining := initialLimit - len(initialLines)
				if remaining <= 0 {
					if !flushInitial() || !a.sendBatch(ctx, lines) {
						return
					}
					continue
				}

				if len(lines) <= remaining {
					initialLines = append(initialLines, lines...)
					if len(initialLines) == initialLimit {
						if !flushInitial() {
							return
						}
						continue
					}
					resetFlushTimer()
					continue
				}

				initialLines = append(initialLines, lines[:remaining]...)
				if !flushInitial() || !a.sendBatch(ctx, append([]string(nil), lines[remaining:]...)) {
					return
				}

			case <-flushTimerCh:
				flushTimerCh = nil
				if initialPending && !flushInitial() {
					return
				}

			case <-ctx.Done():
				return

			case <-a.stopCh:
				return
			}
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

func (a *K8sWatcherAdapter) sendBatch(ctx context.Context, batch []string) bool {
	select {
	case a.linesCh <- batch:
		return true
	case <-ctx.Done():
		return false
	case <-a.stopCh:
		return false
	}
}

func (a *K8sWatcherAdapter) emitInitialBatches(ctx context.Context, lines []string) bool {
	for start := 0; start < len(lines); start += initialChunkSize {
		end := start + initialChunkSize
		if end > len(lines) {
			end = len(lines)
		}
		chunk := append([]string(nil), lines[start:end]...)
		chunk[0] = "__INITIAL_CHUNK__:" + chunk[0]
		if !a.sendBatch(ctx, chunk) {
			return false
		}
	}

	return a.sendBatch(ctx, []string{"__INITIAL_COMPLETE__"})
}

// Ensure K8sWatcherAdapter implements session.Watcher at compile time.
var _ session.Watcher = (*K8sWatcherAdapter)(nil)
