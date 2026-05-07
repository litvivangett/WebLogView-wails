package session

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Watcher is the interface that file and K8s watchers must implement.
type Watcher interface {
	Start(ctx context.Context) error
	Lines() <-chan []string
	Stop()
}

// LogLinesEvent is emitted when new log lines arrive for a tab.
type LogLinesEvent struct {
	TabId string   `json:"tabId"`
	Lines []string `json:"lines"`
}

// LogErrorEvent is emitted when an error occurs for a tab.
type LogErrorEvent struct {
	TabId string `json:"tabId"`
	Error string `json:"error"`
}

type tabEntry struct {
	watcher Watcher
	cancel  context.CancelFunc
}

// SessionManager manages active log streaming tabs.
type SessionManager struct {
	app  *application.App
	tabs map[string]*tabEntry
	mu   sync.Mutex
}

// NewSessionManager creates a new SessionManager.
func NewSessionManager() *SessionManager {
	return &SessionManager{
		tabs: make(map[string]*tabEntry),
	}
}

// SetApp sets the Wails application reference for event emission.
func (sm *SessionManager) SetApp(app *application.App) {
	sm.app = app
}

// RegisterTab registers a watcher for a tab and starts streaming.
func (sm *SessionManager) RegisterTab(tabId string, w Watcher) error {
	sm.mu.Lock()
	var existingEntry *tabEntry
	if entry, exists := sm.tabs[tabId]; exists {
		existingEntry = entry
		delete(sm.tabs, tabId)
	}
	sm.mu.Unlock()

	if existingEntry != nil {
		existingEntry.watcher.Stop()
		existingEntry.cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())

	// Start the watcher
	if err := w.Start(ctx); err != nil {
		cancel()
		return fmt.Errorf("failed to start watcher: %w", err)
	}

	sm.mu.Lock()
	entry := &tabEntry{watcher: w, cancel: cancel}
	sm.tabs[tabId] = entry
	sm.mu.Unlock()

	log.Printf("Tab %s registered", tabId)

	// Start streaming goroutine
	go sm.streamLines(ctx, tabId, w)

	return nil
}

// CloseTab stops the watcher for a tab and removes it.
func (sm *SessionManager) CloseTab(tabId string) error {
	sm.mu.Lock()
	entry, exists := sm.tabs[tabId]
	if !exists {
		sm.mu.Unlock()
		return nil // Already closed, not an error
	}
	delete(sm.tabs, tabId)
	sm.mu.Unlock()

	entry.cancel()
	entry.watcher.Stop()
	log.Printf("Tab %s closed", tabId)
	return nil
}

// streamLines reads from watcher.Lines() and emits events.
func (sm *SessionManager) streamLines(ctx context.Context, tabId string, w Watcher) {
	linesCh := w.Lines()
	isFirst := true

	for {
		select {
		case <-ctx.Done():
			return
		case lines, ok := <-linesCh:
			if !ok {
				return
			}
			if sm.app == nil {
				log.Printf("[session] WARNING: app not set, dropping %d lines for tab %s", len(lines), tabId)
				continue
			}

			if isFirst {
				sm.app.Event.Emit("log-initial", LogLinesEvent{
					TabId: tabId,
					Lines: lines,
				})
				isFirst = false
			} else {
				sm.app.Event.Emit("log-lines", LogLinesEvent{
					TabId: tabId,
					Lines: lines,
				})
			}
		}
	}
}

// CloseAll stops all active tab watchers. Call on application exit.
func (sm *SessionManager) CloseAll() {
	sm.mu.Lock()
	entries := make(map[string]*tabEntry, len(sm.tabs))
	for id, e := range sm.tabs {
		entries[id] = e
	}
	sm.tabs = make(map[string]*tabEntry)
	sm.mu.Unlock()

	for _, e := range entries {
		e.cancel()
		e.watcher.Stop()
	}
}

// ServiceShutdown is called by Wails when the application is shutting down.
// It closes all active tab sessions to prevent goroutine leaks.
func (sm *SessionManager) ServiceShutdown() error {
	sm.CloseAll()
	return nil
}

// EmitError emits a log error event for a tab.
func (sm *SessionManager) EmitError(tabId string, errMsg string) {
	if sm.app == nil {
		return
	}
	sm.app.Event.Emit("log-error", LogErrorEvent{
		TabId: tabId,
		Error: errMsg,
	})
}
