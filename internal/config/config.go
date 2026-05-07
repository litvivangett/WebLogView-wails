package config

import (
	"sync"
	"time"
)

// Config holds application configuration
type Config struct {
	MaxLinesMemory     int
	TailLines          int
	ChunkSize          int
	MaxFileSize        int64
	BufferSize         int
	MaxConcurrentFiles int
	PollingInterval    time.Duration // Fallback polling interval for file watching
}

var (
	instance *Config
	mu       sync.RWMutex
)

// New creates a new configuration with defaults
func New() *Config {
	cfg := &Config{
		MaxLinesMemory:     100000,                 // Max lines to keep in memory
		TailLines:          1000,                   // Initial lines to load
		ChunkSize:          5000,                   // Lines per chunk
		MaxFileSize:        1 << 30,                // 1GB max file size
		BufferSize:         65536,                  // 64KB file read buffer
		MaxConcurrentFiles: 10,                     // Max concurrent files
		PollingInterval:    500 * time.Millisecond, // Fallback polling interval
	}
	SetInstance(cfg)
	return cfg
}

// SetInstance sets the global config instance
func SetInstance(cfg *Config) {
	mu.Lock()
	defer mu.Unlock()
	instance = cfg
}

// GetInstance returns the global config instance
func GetInstance() *Config {
	mu.RLock()
	defer mu.RUnlock()
	return instance
}
