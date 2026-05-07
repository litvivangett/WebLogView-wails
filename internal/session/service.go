package session

// SessionService is the Wails-registered service that exposes session
// management to the frontend. It wraps SessionManager and only exposes
// methods with concrete-type parameters, avoiding binding generator warnings
// from interface-typed parameters (Watcher, error).
type SessionService struct {
	sm *SessionManager
}

// NewSessionService creates a SessionService wrapping the given SessionManager.
func NewSessionService(sm *SessionManager) *SessionService {
	return &SessionService{sm: sm}
}

// CloseTab stops the log stream for a tab. Called from the frontend.
func (s *SessionService) CloseTab(tabId string) error {
	return s.sm.CloseTab(tabId)
}

// ServiceShutdown is called by Wails on application shutdown.
func (s *SessionService) ServiceShutdown() error {
	return s.sm.ServiceShutdown()
}
