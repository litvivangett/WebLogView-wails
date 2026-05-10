package session

import (
	"context"
	"testing"
)

type stubWatcher struct {
	lines chan []string
}

func (w *stubWatcher) Start(context.Context) error { return nil }
func (w *stubWatcher) Lines() <-chan []string      { return w.lines }
func (w *stubWatcher) Stop()                       {}

type capturedEvent struct {
	name    string
	payload any
}

func collectStreamEvents(t *testing.T, batches ...[]string) []capturedEvent {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	watcher := &stubWatcher{
		lines: make(chan []string, len(batches)),
	}

	sm := &SessionManager{
		tabs: make(map[string]*tabEntry),
	}

	var got []capturedEvent
	sm.setTestEmitter(func(name string, payload any) {
		got = append(got, capturedEvent{name: name, payload: payload})
	})

	done := make(chan struct{})
	go func() {
		defer close(done)
		sm.streamLines(ctx, "tab-1", watcher)
	}()

	for _, batch := range batches {
		watcher.lines <- batch
	}
	close(watcher.lines)
	<-done

	return got
}

func TestStreamLinesEmitsInitialLifecycleEvents(t *testing.T) {
	got := collectStreamEvents(t,
		[]string{"__INITIAL_START__"},
		[]string{"__INITIAL_CHUNK__:line-1", "line-2"},
		[]string{"__INITIAL_CHUNK__:line-3"},
		[]string{"__INITIAL_COMPLETE__"},
		[]string{"tail-1"},
	)

	wantNames := []string{
		"log-initial-start",
		"log-initial-chunk",
		"log-initial-chunk",
		"log-initial-complete",
		"log-initial",
		"log-lines",
	}

	if len(got) != len(wantNames) {
		t.Fatalf("got %d events, want %d", len(got), len(wantNames))
	}

	for i, wantName := range wantNames {
		if got[i].name != wantName {
			t.Fatalf("event %d = %q, want %q", i, got[i].name, wantName)
		}
	}

	start, ok := got[0].payload.(LogLoadEvent)
	if !ok {
		t.Fatalf("start payload type = %T, want LogLoadEvent", got[0].payload)
	}
	if start.TabId != "tab-1" {
		t.Fatalf("start tabId = %q, want %q", start.TabId, "tab-1")
	}

	chunk, ok := got[1].payload.(LogLinesEvent)
	if !ok {
		t.Fatalf("chunk payload type = %T, want LogLinesEvent", got[1].payload)
	}
	if len(chunk.Lines) != 2 || chunk.Lines[0] != "line-1" || chunk.Lines[1] != "line-2" {
		t.Fatalf("chunk lines = %#v, want []string{\"line-1\", \"line-2\"}", chunk.Lines)
	}

	secondChunk, ok := got[2].payload.(LogLinesEvent)
	if !ok {
		t.Fatalf("second chunk payload type = %T, want LogLinesEvent", got[2].payload)
	}
	if len(secondChunk.Lines) != 1 || secondChunk.Lines[0] != "line-3" {
		t.Fatalf("second chunk lines = %#v, want []string{\"line-3\"}", secondChunk.Lines)
	}

	complete, ok := got[3].payload.(LogLoadEvent)
	if !ok {
		t.Fatalf("complete payload type = %T, want LogLoadEvent", got[3].payload)
	}
	if complete.TabId != "tab-1" {
		t.Fatalf("complete tabId = %q, want %q", complete.TabId, "tab-1")
	}

	initial, ok := got[4].payload.(LogLinesEvent)
	if !ok {
		t.Fatalf("initial payload type = %T, want LogLinesEvent", got[4].payload)
	}
	if len(initial.Lines) != 3 || initial.Lines[0] != "line-1" || initial.Lines[1] != "line-2" || initial.Lines[2] != "line-3" {
		t.Fatalf("initial payload = %#v, want []string{\"line-1\", \"line-2\", \"line-3\"}", initial.Lines)
	}

	lines, ok := got[5].payload.(LogLinesEvent)
	if !ok {
		t.Fatalf("lines payload type = %T, want LogLinesEvent", got[5].payload)
	}
	if len(lines.Lines) != 1 || lines.Lines[0] != "tail-1" {
		t.Fatalf("lines payload = %#v, want []string{\"tail-1\"}", lines.Lines)
	}
}

func TestStreamLinesEmitsLegacyInitialEventOnlyForFirstNonMarkerBatch(t *testing.T) {
	got := collectStreamEvents(t,
		[]string{"first"},
		[]string{"second"},
	)

	wantNames := []string{
		"log-initial",
		"log-lines",
		"log-lines",
	}

	if len(got) != len(wantNames) {
		t.Fatalf("got %d events, want %d", len(got), len(wantNames))
	}

	for i, wantName := range wantNames {
		if got[i].name != wantName {
			t.Fatalf("event %d = %q, want %q", i, got[i].name, wantName)
		}
	}
}

func TestStreamLinesTreatsMarkerLikeLiveLinesAsRegularLinesAfterInitialComplete(t *testing.T) {
	got := collectStreamEvents(t,
		[]string{"__INITIAL_START__"},
		[]string{"__INITIAL_CHUNK__:snapshot"},
		[]string{"__INITIAL_COMPLETE__"},
		[]string{"__INITIAL_START__"},
		[]string{"__INITIAL_CHUNK__:live", "still-live"},
		[]string{"__INITIAL_COMPLETE__"},
	)

	wantNames := []string{
		"log-initial-start",
		"log-initial-chunk",
		"log-initial-complete",
		"log-initial",
		"log-lines",
		"log-lines",
		"log-lines",
	}

	if len(got) != len(wantNames) {
		t.Fatalf("got %d events, want %d", len(got), len(wantNames))
	}

	for i, wantName := range wantNames {
		if got[i].name != wantName {
			t.Fatalf("event %d = %q, want %q", i, got[i].name, wantName)
		}
	}

	initial, ok := got[3].payload.(LogLinesEvent)
	if !ok {
		t.Fatalf("initial payload type = %T, want LogLinesEvent", got[3].payload)
	}
	if len(initial.Lines) != 1 || initial.Lines[0] != "snapshot" {
		t.Fatalf("initial payload = %#v, want []string{\"snapshot\"}", initial.Lines)
	}

	for i, want := range [][]string{
		{"__INITIAL_START__"},
		{"__INITIAL_CHUNK__:live", "still-live"},
		{"__INITIAL_COMPLETE__"},
	} {
		lines, ok := got[4+i].payload.(LogLinesEvent)
		if !ok {
			t.Fatalf("lines payload %d type = %T, want LogLinesEvent", i, got[4+i].payload)
		}
		if len(lines.Lines) != len(want) {
			t.Fatalf("lines payload %d len = %d, want %d", i, len(lines.Lines), len(want))
		}
		for j := range want {
			if lines.Lines[j] != want[j] {
				t.Fatalf("lines payload %d line %d = %q, want %q", i, j, lines.Lines[j], want[j])
			}
		}
	}
}
