package watcher

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/settings"
)

func TestReadTailLinesBoundedReturnsLastLinesInOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tail.log")
	lines := numberedLines(12)
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	fw, err := NewFileWatcher(path, 4, &config.Config{BufferSize: 9, PollingInterval: 10 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	defer fw.watcher.Close()

	fw.file, err = os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer fw.file.Close()

	got, err := fw.readTailLinesBounded()
	if err != nil {
		t.Fatal(err)
	}

	want := lines[len(lines)-4:]
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("readTailLinesBounded() = %#v, want %#v", got, want)
	}
}

func TestReadTailLinesBoundedNormalizesCRLF(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tail-crlf.log")
	lines := numberedLines(12)
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\r\n")+"\r\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	fw, err := NewFileWatcher(path, 4, &config.Config{BufferSize: 9, PollingInterval: 10 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	defer fw.watcher.Close()

	fw.file, err = os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer fw.file.Close()

	got, err := fw.readTailLinesBounded()
	if err != nil {
		t.Fatal(err)
	}

	want := lines[len(lines)-4:]
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("readTailLinesBounded() = %#v, want %#v", got, want)
	}
}

func TestFileAdapterEmitsInitialStartChunkComplete(t *testing.T) {
	cfg := &config.Config{BufferSize: 64 * 1024, PollingInterval: 10 * time.Millisecond}
	path := filepath.Join(t.TempDir(), "app.log")
	allLines := numberedLines(3000)
	if err := os.WriteFile(path, []byte(strings.Join(allLines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	s := settings.GetInstance()
	oldTailLines := s.GetTailLines()
	s.SetTailLines(2005)
	defer s.SetTailLines(oldTailLines)

	adapter, err := NewFileWatcherAdapter(path, cfg)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer adapter.Stop()

	if err := adapter.Start(ctx); err != nil {
		t.Fatal(err)
	}

	var batches [][]string
	for {
		batch := receiveBatch(t, adapter.Lines(), "initial batch")
		batches = append(batches, batch)
		if len(batch) == 1 && batch[0] == "__INITIAL_COMPLETE__" {
			break
		}
	}

	if len(batches) < 3 {
		t.Fatalf("expected at least start, chunk and complete batches, got %#v", batches)
	}
	if !reflect.DeepEqual(batches[0], []string{"__INITIAL_START__"}) {
		t.Fatalf("bad start marker: %#v", batches[0])
	}
	if !reflect.DeepEqual(batches[len(batches)-1], []string{"__INITIAL_COMPLETE__"}) {
		t.Fatalf("bad complete marker: %#v", batches[len(batches)-1])
	}

	var gotInitial []string
	for i, batch := range batches[1 : len(batches)-1] {
		if len(batch) == 0 || !strings.HasPrefix(batch[0], "__INITIAL_CHUNK__:") {
			t.Fatalf("batch %d missing chunk marker: %#v", i+1, batch)
		}
		chunk := append([]string(nil), batch...)
		chunk[0] = strings.TrimPrefix(chunk[0], "__INITIAL_CHUNK__:")
		gotInitial = append(gotInitial, chunk...)
	}

	wantInitial := allLines[len(allLines)-2005:]
	if !reflect.DeepEqual(gotInitial, wantInitial) {
		t.Fatalf("initial lines = %#v, want %#v", gotInitial[:min(len(gotInitial), 5)], wantInitial[:5])
	}

	appendLiveLine(t, path, "live-3001")
	liveBatch := receiveBatch(t, adapter.Lines(), "live batch")
	if !reflect.DeepEqual(liveBatch, []string{"live-3001"}) {
		t.Fatalf("live batch = %#v, want %#v", liveBatch, []string{"live-3001"})
	}
}

func numberedLines(count int) []string {
	lines := make([]string, count)
	for i := 0; i < count; i++ {
		lines[i] = fmt.Sprintf("line-%04d", i+1)
	}
	return lines
}

func receiveBatch(t *testing.T, ch <-chan []string, label string) []string {
	t.Helper()

	select {
	case batch, ok := <-ch:
		if !ok {
			t.Fatalf("%s channel closed", label)
		}
		return batch
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
		return nil
	}
}

func appendLiveLine(t *testing.T, path string, line string) {
	t.Helper()

	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if _, err := f.WriteString(line + "\n"); err != nil {
		t.Fatal(err)
	}

	if err := f.Sync(); err != nil {
		t.Fatal(err)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
