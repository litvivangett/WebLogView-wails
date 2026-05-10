package session

import (
	"context"
	"fmt"
	"log"
	"strings"
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

// LogLoadEvent is emitted for log load lifecycle markers.
type LogLoadEvent struct {
	TabId string `json:"tabId"`
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

type streamLifecycleState int

const (
	streamStateUndetermined streamLifecycleState = iota
	streamStateInitial
	streamStateLive
)

func classifyInitialLifecycleBatch(lines []string) (eventType string, payload []string) {
	if len(lines) == 1 && lines[0] == "__INITIAL_START__" {
		return "initial-start", nil
	}
	if len(lines) == 1 && lines[0] == "__INITIAL_COMPLETE__" {
		return "initial-complete", nil
	}
	if len(lines) > 0 && strings.HasPrefix(lines[0], "__INITIAL_CHUNK__:") {
		payload := append([]string(nil), lines...)
		payload[0] = strings.TrimPrefix(payload[0], "__INITIAL_CHUNK__:")
		return "initial-chunk", payload
	}
	return "lines", lines
}

// SessionManager manages active log streaming tabs.
type SessionManager struct {
	app  *application.App
	tabs map[string]*tabEntry
	mu   sync.Mutex
	emit func(name string, payload any)
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

func (sm *SessionManager) setTestEmitter(fn func(name string, payload any)) {
	sm.emit = fn
}

func (sm *SessionManager) emitEvent(name string, payload any) bool {
	if sm.emit != nil {
		sm.emit(name, payload)
		return true
	}
	if sm.app == nil {
		return false
	}
	sm.app.Event.Emit(name, payload)
	return true
}

func (sm *SessionManager) emitInitialStart(tabId string) bool {
	return sm.emitEvent("log-initial-start", LogLoadEvent{TabId: tabId})
}

func (sm *SessionManager) emitInitialChunk(tabId string, lines []string) bool {
	return sm.emitEvent("log-initial-chunk", LogLinesEvent{
		TabId: tabId,
		Lines: lines,
	})
}

func (sm *SessionManager) emitInitialComplete(tabId string) bool {
	return sm.emitEvent("log-initial-complete", LogLoadEvent{TabId: tabId})
}

func (sm *SessionManager) emitLegacyInitial(tabId string, lines []string) bool {
	return sm.emitEvent("log-initial", LogLinesEvent{
		TabId: tabId,
		Lines: lines,
	})
}

func (sm *SessionManager) emitLines(tabId string, lines []string) bool {
	return sm.emitEvent("log-lines", LogLinesEvent{
		TabId: tabId,
		Lines: lines,
	})
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
	emittedLegacyInitial := false
	state := streamStateUndetermined
	var initialSnapshot []string

	for {
		select {
		case <-ctx.Done():
			return
		case lines, ok := <-linesCh:
			if !ok {
				return
			}
			if sm.emit == nil && sm.app == nil {
				log.Printf("[session] WARNING: app not set, dropping %d lines for tab %s", len(lines), tabId)
				continue
			}

			switch state {
			case streamStateUndetermined:
				eventType, _ := classifyInitialLifecycleBatch(lines)
				if eventType == "initial-start" {
					sm.emitInitialStart(tabId)
					state = streamStateInitial
					continue
				}
				if !emittedLegacyInitial {
					sm.emitLegacyInitial(tabId, lines)
					emittedLegacyInitial = true
				}
				sm.emitLines(tabId, lines)
				state = streamStateLive
			case streamStateInitial:
				eventType, payload := classifyInitialLifecycleBatch(lines)
				switch eventType {
				case "initial-chunk":
					initialSnapshot = append(initialSnapshot, payload...)
					sm.emitInitialChunk(tabId, payload)
				case "initial-complete":
					sm.emitInitialComplete(tabId)
					if !emittedLegacyInitial {
						sm.emitLegacyInitial(tabId, append([]string(nil), initialSnapshot...))
						emittedLegacyInitial = true
					}
					state = streamStateLive
				case "initial-start":
					sm.emitInitialStart(tabId)
				default:
					sm.emitInitialChunk(tabId, lines)
					initialSnapshot = append(initialSnapshot, lines...)
				}
			default:
				sm.emitLines(tabId, lines)
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
	sm.emitEvent("log-error", LogErrorEvent{
		TabId: tabId,
		Error: errMsg,
	})
}
