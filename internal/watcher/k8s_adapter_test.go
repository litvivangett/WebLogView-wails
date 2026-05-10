package watcher

import (
	"context"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/litvivangett/weblogview/internal/settings"
)

func TestK8sAdapterEmitsInitialStartChunkComplete(t *testing.T) {
	initialLines := numberedLines(initialChunkSize + 5)
	liveBatch := []string{"live-1006", "live-1007"}
	liveReady := make(chan struct{})

	s := settings.GetInstance()
	oldTailLines := s.GetTailLines()
	s.SetTailLines(len(initialLines))
	defer s.SetTailLines(oldTailLines)

	adapter := &K8sWatcherAdapter{
		watcher: &fakeK8sAdapterWatcher{
			initialLines: initialLines,
			liveBatch:    liveBatch,
			liveReady:    liveReady,
			stopped:      make(chan struct{}),
		},
		linesCh: make(chan []string, 8),
		stopCh:  make(chan struct{}),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer adapter.Stop()

	if err := adapter.Start(ctx); err != nil {
		t.Fatal(err)
	}

	var batches [][]string
	for {
		batch := receiveK8sBatch(t, adapter.Lines(), "initial batch")
		batches = append(batches, batch)
		if len(batch) == 1 && batch[0] == "__INITIAL_COMPLETE__" {
			break
		}
	}

	if len(batches) != 4 {
		t.Fatalf("expected start, 2 chunks, and complete before live forwarding; got %#v", batches)
	}
	if !reflect.DeepEqual(batches[0], []string{"__INITIAL_START__"}) {
		t.Fatalf("bad start marker: %#v", batches[0])
	}
	if !reflect.DeepEqual(batches[3], []string{"__INITIAL_COMPLETE__"}) {
		t.Fatalf("bad complete marker: %#v", batches[3])
	}

	var gotInitial []string
	for i, batch := range batches[1:3] {
		if len(batch) == 0 || !strings.HasPrefix(batch[0], "__INITIAL_CHUNK__:") {
			t.Fatalf("chunk %d missing initial marker: %#v", i, batch)
		}
		chunk := append([]string(nil), batch...)
		chunk[0] = strings.TrimPrefix(chunk[0], "__INITIAL_CHUNK__:")
		gotInitial = append(gotInitial, chunk...)
	}

	if !reflect.DeepEqual(gotInitial, initialLines) {
		t.Fatalf("initial lines = %#v, want %#v", gotInitial[:min(len(gotInitial), 5)], initialLines[:5])
	}

	select {
	case batch := <-adapter.Lines():
		t.Fatalf("got batch before live release: %#v", batch)
	case <-time.After(50 * time.Millisecond):
	}

	close(liveReady)

	if got := receiveK8sBatch(t, adapter.Lines(), "live batch"); !reflect.DeepEqual(got, liveBatch) {
		t.Fatalf("live batch = %#v, want %#v", got, liveBatch)
	}
}

func TestK8sAdapterEmitsStartBeforeInitialLines(t *testing.T) {
	initialReady := make(chan struct{})

	adapter := &K8sWatcherAdapter{
		watcher: &fakeK8sAdapterWatcher{
			initialLines: numberedLines(3),
			initialReady: initialReady,
			stopped:      make(chan struct{}),
		},
		linesCh: make(chan []string, 8),
		stopCh:  make(chan struct{}),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer adapter.Stop()

	if err := adapter.Start(ctx); err != nil {
		t.Fatal(err)
	}

	if got := receiveK8sBatch(t, adapter.Lines(), "initial start"); !reflect.DeepEqual(got, []string{"__INITIAL_START__"}) {
		t.Fatalf("start batch = %#v, want %#v", got, []string{"__INITIAL_START__"})
	}

	select {
	case batch := <-adapter.Lines():
		t.Fatalf("unexpected batch before initial release: %#v", batch)
	case <-time.After(5 * time.Millisecond):
	}

	close(initialReady)

	var batches [][]string
	for {
		batch := receiveK8sBatch(t, adapter.Lines(), "initial batch")
		batches = append(batches, batch)
		if len(batch) == 1 && batch[0] == "__INITIAL_COMPLETE__" {
			break
		}
	}

	if len(batches) != 2 {
		t.Fatalf("expected chunk and complete after start, got %#v", batches)
	}
	if len(batches[0]) == 0 || !strings.HasPrefix(batches[0][0], "__INITIAL_CHUNK__:") {
		t.Fatalf("bad initial chunk: %#v", batches[0])
	}
}

type fakeK8sAdapterWatcher struct {
	initialLines []string
	initialReady <-chan struct{}
	liveBatch    []string
	liveReady    chan struct{}
	stopped      chan struct{}
	stopOnce     sync.Once
}

func (w *fakeK8sAdapterWatcher) Watch(_ context.Context, callback func([]string)) error {
	if w.initialReady != nil {
		select {
		case <-w.initialReady:
		case <-w.stopped:
			return nil
		}
	}

	for _, line := range w.initialLines {
		callback([]string{line})
	}

	select {
	case <-w.liveReady:
	case <-w.stopped:
		return nil
	}

	callback(w.liveBatch)
	return nil
}

func (w *fakeK8sAdapterWatcher) Stop() {
	w.stopOnce.Do(func() {
		close(w.stopped)
	})
}

func receiveK8sBatch(t *testing.T, ch <-chan []string, label string) []string {
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
