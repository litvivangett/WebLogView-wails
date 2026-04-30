package watcher

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/litvivangett/weblogview/internal/config"
)

// FileWatcher watches a file for changes and streams new lines
type FileWatcher struct {
	path          string
	tailLines     int
	config        *config.Config
	watcher       *fsnotify.Watcher
	file          *os.File
	offset        int64     // Track current file position
	lastEventTime time.Time // Track last fsnotify event
	Lines         chan string
	stopChan      chan struct{}
	wg            sync.WaitGroup
}

// NewFileWatcher creates a new file watcher
func NewFileWatcher(path string, tailLines int, cfg *config.Config) (*FileWatcher, error) {
	// Check if file exists
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("file not found: %s", path)
	}

	// Create fsnotify watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create watcher: %w", err)
	}

	fw := &FileWatcher{
		path:          path,
		tailLines:     tailLines,
		config:        cfg,
		watcher:       watcher,
		Lines:         make(chan string, 256),
		stopChan:      make(chan struct{}),
		lastEventTime: time.Now(), // Initialize to now
	}

	return fw, nil
}

// Start begins watching the file
func (fw *FileWatcher) Start() error {
	// Open file
	file, err := os.Open(fw.path)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	fw.file = file

	// Read initial tail lines
	if err := fw.readTail(); err != nil {
		fw.file.Close()
		return fmt.Errorf("failed to read tail: %w", err)
	}

	// Add file to watcher
	if err := fw.watcher.Add(fw.path); err != nil {
		fw.file.Close()
		return fmt.Errorf("failed to watch file: %w", err)
	}

	// Start watching for changes
	fw.wg.Add(1)
	go fw.watch()

	return nil
}

// Stop stops watching the file
func (fw *FileWatcher) Stop() {
	close(fw.stopChan)
	fw.wg.Wait()

	if fw.file != nil {
		fw.file.Close()
	}

	if fw.watcher != nil {
		fw.watcher.Close()
	}

	close(fw.Lines)
}

// readTail reads the last N lines from the file
func (fw *FileWatcher) readTail() error {
	// For simplicity, we'll read the entire file and take last N lines
	// TODO: Optimize for large files by seeking from the end
	lines := []string{}
	scanner := bufio.NewScanner(fw.file)

	// Set a larger buffer for long lines - max 10MB per line
	buf := make([]byte, 0, fw.config.BufferSize)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	// Send last N lines
	startIdx := 0
	if len(lines) > fw.tailLines {
		startIdx = len(lines) - fw.tailLines
	}

	for i := startIdx; i < len(lines); i++ {
		select {
		case fw.Lines <- lines[i]:
		case <-fw.stopChan:
			return nil
		}
	}

	// Store current file position
	fw.offset, _ = fw.file.Seek(0, io.SeekCurrent)

	return nil
}

// watch monitors the file for changes
func (fw *FileWatcher) watch() {
	defer fw.wg.Done()

	// Use a ticker for polling as fallback (only when fsnotify is silent)
	ticker := time.NewTicker(fw.config.PollingInterval)
	defer ticker.Stop()

	for {
		select {
		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}

			// Update last event time
			fw.lastEventTime = time.Now()

			// Handle write events
			if event.Op&fsnotify.Write == fsnotify.Write {
				fw.readNewLines()
			}

			// Handle file truncation (log rotation)
			if event.Op&fsnotify.Remove == fsnotify.Remove || event.Op&fsnotify.Rename == fsnotify.Rename {
				return
			}

		case <-ticker.C:
			// Only poll if we haven't received fsnotify events recently
			// This prevents redundant polling when events are working
			timeSinceLastEvent := time.Since(fw.lastEventTime)
			if timeSinceLastEvent > fw.config.PollingInterval {
				fw.checkFileGrowth()
			}

		case err, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
			fmt.Printf("Watcher error: %v\n", err)

		case <-fw.stopChan:
			return
		}
	}
}

// checkFileGrowth checks if file has grown and reads new content
func (fw *FileWatcher) checkFileGrowth() {
	fileInfo, err := os.Stat(fw.path)
	if err != nil {
		return
	}

	currentSize := fileInfo.Size()
	if currentSize > fw.offset {
		fw.readNewLines()
	}
}

// readNewLines reads new lines that have been appended to the file
func (fw *FileWatcher) readNewLines() {
	// Seek to the last known position
	_, err := fw.file.Seek(fw.offset, io.SeekStart)
	if err != nil {
		fmt.Printf("Error seeking file: %v\n", err)
		return
	}

	scanner := bufio.NewScanner(fw.file)

	// Set a larger buffer for long lines - max 10MB per line
	buf := make([]byte, 0, fw.config.BufferSize)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		select {
		case fw.Lines <- scanner.Text():
		case <-fw.stopChan:
			return
		}
	}

	// Update offset to current position
	fw.offset, _ = fw.file.Seek(0, io.SeekCurrent)
}

// ReadFile reads a file and returns all lines
func ReadFile(path string, maxLines int) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	lines := []string{}
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if maxLines > 0 && len(lines) >= maxLines {
			break
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		return nil, err
	}

	return lines, nil
}
