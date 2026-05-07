package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/litvivangett/weblogview/internal/config"
	"github.com/litvivangett/weblogview/internal/env"
	"github.com/litvivangett/weblogview/internal/handlers/file"
	"github.com/litvivangett/weblogview/internal/handlers/k8s"
	"github.com/litvivangett/weblogview/internal/handlers/recent"
	handlerSettings "github.com/litvivangett/weblogview/internal/handlers/settings"
	"github.com/litvivangett/weblogview/internal/session"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[session.LogLinesEvent]("log-initial")
	application.RegisterEvent[session.LogLinesEvent]("log-lines")
	application.RegisterEvent[session.LogErrorEvent]("log-error")
}

// main function serves as the application's entry point. It initializes the application, creates a window,
// and starts a goroutine that emits a time-based event every second. It subsequently runs the application and
// logs any error that might occur.
func main() {
	env.ExpandPath()

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	cfg := config.New()
	sessionMgr := session.NewSessionManager()

	app := application.New(application.Options{
		Name:        "WailsLogView",
		Description: "Real-time tail log viewer for Kubernetes and files",
		Services: []application.Service{
			application.NewService(file.NewFileService(sessionMgr, cfg)),
			application.NewService(k8s.NewK8sService(sessionMgr)),
			application.NewService(handlerSettings.NewSettingsService()),
			application.NewService(recent.NewRecentService()),
			application.NewService(session.NewSessionService(sessionMgr)),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	sessionMgr.SetApp(app)

	// Create a new window with the necessary options.
	// 'Title' is the title of the window.
	// 'Mac' options tailor the window when running on macOS.
	// 'BackgroundColour' is the background colour of the window.
	// 'URL' is the URL that will be loaded into the webview.
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "WailsLogView",
		EnableFileDrop: true,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarDefault,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		if len(files) > 0 {
			app.Event.Emit("file-dropped", files[0])
		}
	})

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
