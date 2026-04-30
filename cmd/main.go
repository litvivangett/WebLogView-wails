package main

import (
	"flag"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"time"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/server"
	"github.com/litvivangett/weblogview/internal/settings"
)

func main() {
	// Command line flags
	port := flag.Int("port", 8080, "Port to run the server on")
	host := flag.String("host", "localhost", "Host to bind the server to")
	noBrowser := flag.Bool("no-browser", false, "Don't automatically open browser")
	flag.Parse()

	// Load settings to get polling interval
	appSettings := settings.GetInstance()

	// Create configuration
	cfg := config.New(*host, *port)
	cfg.PollingInterval = time.Duration(appSettings.PollingIntervalMs) * time.Millisecond

	// Print startup info
	url := fmt.Sprintf("http://%s:%d", *host, *port)
	log.Printf("Starting WebLogView on %s", url)

	// Open browser unless disabled
	if !*noBrowser {
		go openBrowser(url)
	}

	// Create and start server
	srv := server.New(cfg)
	if err := srv.Start(); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// openBrowser opens the default browser to the given URL
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}
	if err != nil {
		log.Printf("Failed to open browser: %v", err)
	}
}
