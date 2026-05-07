package watcher

import (
	"context"
	"sync"
	"time"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/session"
	"github.com/litvivangett/weblogview/internal/settings"
)

const initialBurstTimeout = 150 * time.Millisecond

// FileWatcherAdapter wraps FileWatcher to implement session.Watcher.
type FileWatcherAdapter struct {
	fw       *FileWatcher
	linesCh  chan []string
	stopCh   chan struct{}
	stopOnce sync.Once
}

// NewFileWatcherAdapter creates a new adapter.
func NewFileWatcherAdapter(path string, cfg *config.Config) (*FileWatcherAdapter, error) {
	tailLines := settings.GetInstance().GetTailLines()

	fw, err := NewFileWatcher(path, tailLines, cfg)
	if err != nil {
		return nil, err
	}

	return &FileWatcherAdapter{
		fw:      fw,
		linesCh: make(chan []string, 64),
		stopCh:  make(chan struct{}),
	}, nil
}

// Start starts the file watcher and begins collecting lines.
func (a *FileWatcherAdapter) Start(ctx context.Context) error {
	if err := a.fw.Start(); err != nil {
		return err
	}

	// Goroutine that reads individual lines and batches them for the channel
	go a.collectLines(ctx)

	return nil
}

// Lines returns the channel of batched lines.
func (a *FileWatcherAdapter) Lines() <-chan []string {
	return a.linesCh
}

// Stop stops the file watcher.
func (a *FileWatcherAdapter) Stop() {
	a.stopOnce.Do(func() {
		close(a.stopCh)
		a.fw.Stop()
	})
}

// collectLines reads from fw.Lines (individual) and sends batches.
// The first batch is sent as the "initial" payload (all initial tail lines).
// Subsequent lines are sent as small batches with a short debounce.
func (a *FileWatcherAdapter) collectLines(ctx context.Context) {
	defer close(a.linesCh)

	// Collect initial lines (wait briefly for the initial burst)
	initialLines := []string{}
	initialTimer := time.NewTimer(initialBurstTimeout)

	// Collect initial burst
collectInitial:
	for {
		select {
		case line, ok := <-a.fw.Lines:
			if !ok {
				break collectInitial
			}
			initialLines = append(initialLines, line)
		case <-initialTimer.C:
			break collectInitial
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		}
	}
	initialTimer.Stop()

	// Send initial batch
	if len(initialLines) > 0 {
		select {
		case a.linesCh <- initialLines:
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		}
	}

	// Stream subsequent lines (batch with short debounce)
	for {
		select {
		case line, ok := <-a.fw.Lines:
			if !ok {
				return
			}
			batch := []string{line}
			// Drain any immediately available lines into this batch
		drain:
			for {
				select {
				case l, ok := <-a.fw.Lines:
					if !ok {
						break drain
					}
					batch = append(batch, l)
				default:
					break drain
				}
			}
			select {
			case a.linesCh <- batch:
			case <-ctx.Done():
				return
			case <-a.stopCh:
				return
			}
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		}
	}
}

// Ensure FileWatcherAdapter implements session.Watcher at compile time.
var _ session.Watcher = (*FileWatcherAdapter)(nil)
