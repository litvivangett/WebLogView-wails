package watcher

import (
	"context"
	"sync"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/session"
	"github.com/litvivangett/weblogview/internal/settings"
)

const initialChunkSize = 1000

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

func (a *FileWatcherAdapter) sendBatch(ctx context.Context, batch []string) bool {
	select {
	case a.linesCh <- batch:
		return true
	case <-ctx.Done():
		return false
	case <-a.stopCh:
		return false
	}
}

// collectLines emits initial lifecycle batches and then forwards live line batches.
func (a *FileWatcherAdapter) collectLines(ctx context.Context) {
	defer close(a.linesCh)

	if !a.sendBatch(ctx, []string{"__INITIAL_START__"}) {
		return
	}

	initialLines := a.fw.InitialLines()
	for start := 0; start < len(initialLines); start += initialChunkSize {
		end := start + initialChunkSize
		if end > len(initialLines) {
			end = len(initialLines)
		}
		chunk := append([]string(nil), initialLines[start:end]...)
		chunk[0] = "__INITIAL_CHUNK__:" + chunk[0]
		if !a.sendBatch(ctx, chunk) {
			return
		}
	}

	if !a.sendBatch(ctx, []string{"__INITIAL_COMPLETE__"}) {
		return
	}

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
			if !a.sendBatch(ctx, batch) {
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
