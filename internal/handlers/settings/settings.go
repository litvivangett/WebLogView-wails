package settings

import (
	"fmt"

	appSettings "github.com/litvivangett/weblogview/internal/settings"
)

// SettingsResponse is the data returned by GetSettings.
type SettingsResponse struct {
	TailLines            int    `json:"tailLines"`
	RenderAnsiTopPane    bool   `json:"renderAnsiTopPane"`
	RenderAnsiBottomPane bool   `json:"renderAnsiBottomPane"`
	PollingIntervalMs    int    `json:"pollingIntervalMs"`
	SourceNameFormat     string `json:"sourceNameFormat"`
}

// SettingsUpdate is the data accepted by UpdateSettings.
type SettingsUpdate struct {
	TailLines            int    `json:"tailLines"`
	RenderAnsiTopPane    *bool  `json:"renderAnsiTopPane"`
	RenderAnsiBottomPane *bool  `json:"renderAnsiBottomPane"`
	PollingIntervalMs    int    `json:"pollingIntervalMs"`
	SourceNameFormat     string `json:"sourceNameFormat"`
}

// SettingsService is a Wails service for application settings.
type SettingsService struct{}

// NewSettingsService creates a new SettingsService.
func NewSettingsService() *SettingsService {
	return &SettingsService{}
}

// GetSettings returns the current application settings.
func (s *SettingsService) GetSettings() SettingsResponse {
	settings := appSettings.GetInstance()
	return SettingsResponse{
		TailLines:            settings.GetTailLines(),
		RenderAnsiTopPane:    settings.GetRenderAnsiTopPane(),
		RenderAnsiBottomPane: settings.GetRenderAnsiBottomPane(),
		PollingIntervalMs:    settings.GetPollingIntervalMs(),
		SourceNameFormat:     settings.GetSourceNameFormat(),
	}
}

// UpdateSettings updates the application settings.
func (s *SettingsService) UpdateSettings(update SettingsUpdate) error {
	settings := appSettings.GetInstance()

	if update.TailLines > 0 {
		settings.SetTailLines(update.TailLines)
	}
	if update.RenderAnsiTopPane != nil {
		settings.SetRenderAnsiTopPane(*update.RenderAnsiTopPane)
	}
	if update.RenderAnsiBottomPane != nil {
		settings.SetRenderAnsiBottomPane(*update.RenderAnsiBottomPane)
	}
	if update.PollingIntervalMs > 0 {
		settings.SetPollingIntervalMs(update.PollingIntervalMs)
	}
	if update.SourceNameFormat != "" {
		settings.SetSourceNameFormat(update.SourceNameFormat)
	}

	if err := settings.Save(); err != nil {
		return fmt.Errorf("failed to save settings: %w", err)
	}

	return nil
}
