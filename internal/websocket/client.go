package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/settings"
	"github.com/litvivangett/weblogview/internal/watcher"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 8192
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all connections for now (local only)
		return true
	},
}

// Client represents a WebSocket client connection
type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	send       chan []byte
	watcher    *watcher.FileWatcher
	k8sWatcher *watcher.K8sWatcher
	config     *config.Config
}

// Message represents a WebSocket message
type Message struct {
	Type string `json:"type"`
	// File source fields
	Path string `json:"path,omitempty"`
	Tail int    `json:"tail,omitempty"`
	// K8s source fields
	Namespace     string `json:"namespace,omitempty"`
	PodName       string `json:"podName,omitempty"`
	ContainerName string `json:"containerName,omitempty"`
	// Common fields
	Lines   []string `json:"lines,omitempty"`
	Message string   `json:"message,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// HandleWebSocket handles WebSocket connection requests
func HandleWebSocket(hub *Hub, cfg *config.Config, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan []byte, 256),
		config: cfg,
	}

	client.hub.register <- client

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		if c.watcher != nil {
			c.watcher.Stop()
		}
		if c.k8sWatcher != nil {
			c.k8sWatcher.Stop()
		}
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Parse message
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error parsing message: %v", err)
			c.sendError("Invalid message format")
			continue
		}

		// Handle message based on type
		c.handleMessage(&msg)
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage processes incoming messages from the client
func (c *Client) handleMessage(msg *Message) {
	switch msg.Type {
	case "open":
		c.handleOpenFile(msg)
	case "open-k8s":
		c.handleOpenK8s(msg)
	case "close":
		c.handleCloseFile()
	default:
		c.sendError("Unknown message type: " + msg.Type)
	}
}

// handleOpenFile handles file open requests
func (c *Client) handleOpenFile(msg *Message) {
	// Stop existing watcher if any
	if c.watcher != nil {
		c.watcher.Stop()
		c.watcher = nil
	}

	// Determine tail lines (use default if not specified)
	tailLines := msg.Tail
	if tailLines == 0 {
		tailLines = settings.GetInstance().GetTailLines()
	}

	// Create file watcher
	fw, err := watcher.NewFileWatcher(msg.Path, tailLines, c.config)
	if err != nil {
		c.sendError("Failed to open file: " + err.Error())
		return
	}

	c.watcher = fw

	// Add to recent files
	settings.GetInstance().AddRecentFile(msg.Path)

	// Collect initial lines before starting the watcher
	initialLines := []string{}
	initialDone := make(chan struct{})

	// Start collecting initial lines in a goroutine
	go func() {
		for line := range fw.Lines {
			select {
			case <-initialDone:
				// After initial load, send lines as they come
				c.sendNewLines([]string{line})
			default:
				// During initial load, collect lines
				initialLines = append(initialLines, line)
			}
		}
	}()

	// Start watching (this sends initial lines to fw.Lines channel)
	if err := fw.Start(); err != nil {
		c.sendError("Failed to start watching: " + err.Error())
		return
	}

	// Give a moment for initial lines to be collected
	time.Sleep(100 * time.Millisecond)
	close(initialDone)

	// Send initial lines to client
	if len(initialLines) > 0 {
		c.sendInitialLines(initialLines)
	}
}

// handleCloseFile handles file close requests
func (c *Client) handleCloseFile() {
	if c.watcher != nil {
		c.watcher.Stop()
		c.watcher = nil
	}
	if c.k8sWatcher != nil {
		c.k8sWatcher.Stop()
		c.k8sWatcher = nil
	}
}

// handleOpenK8s handles Kubernetes pod log requests
func (c *Client) handleOpenK8s(msg *Message) {
	// Stop any existing watcher
	c.handleCloseFile()

	// Validate required fields
	if msg.Namespace == "" {
		c.sendError("Namespace is required")
		return
	}
	if msg.PodName == "" {
		c.sendError("Pod name is required")
		return
	}

	// Get tail lines from settings or message
	tailLines := int64(msg.Tail)
	if tailLines == 0 {
		appSettings := settings.GetInstance()
		tailLines = int64(appSettings.TailLines)
	}

	// Create K8s watcher
	k8sWatcher, err := watcher.NewK8sWatcher(watcher.K8sConfig{
		Namespace:     msg.Namespace,
		PodName:       msg.PodName,
		ContainerName: msg.ContainerName,
		TailLines:     tailLines,
	})

	if err != nil {
		c.sendError("Failed to connect to Kubernetes: " + err.Error())
		return
	}

	c.k8sWatcher = k8sWatcher

	// Save namespace to recent list
	appSettings := settings.GetInstance()
	appSettings.AddRecentNamespace(msg.Namespace)

	// Start watching in background
	go func() {
		err := k8sWatcher.Watch(func(lines []string) {
			c.sendNewLines(lines)
		})
		if err != nil {
			c.sendError("Kubernetes watch error: " + err.Error())
			// Give time for error message to be sent before connection closes
			time.Sleep(100 * time.Millisecond)
		}
	}()
}

// sendInitialLines sends initial log lines to the client
func (c *Client) sendInitialLines(lines []string) {
	msg := Message{
		Type:  "initial",
		Lines: lines,
	}
	data, _ := json.Marshal(msg)
	c.safeSend(data)
}

// sendNewLines sends new log lines to the client
func (c *Client) sendNewLines(lines []string) {
	msg := Message{
		Type:  "lines",
		Lines: lines,
	}
	data, _ := json.Marshal(msg)
	c.safeSend(data)
}

// sendError sends an error message to the client
func (c *Client) sendError(errMsg string) {
	msg := Message{
		Type:  "error",
		Error: errMsg,
	}
	data, _ := json.Marshal(msg)
	c.safeSend(data)
}

// safeSend safely sends data to the client, ignoring if channel is closed
func (c *Client) safeSend(data []byte) {
	defer func() {
		if r := recover(); r != nil {
			// Channel was closed, ignore
		}
	}()
	select {
	case c.send <- data:
		// Successfully sent
	default:
		// Channel full or closed, drop message
	}
}
