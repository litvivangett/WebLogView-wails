# Migration to Wails (v3)

## Goal
Migrate existing Go + React application from web application with Go web server to a desktop application using Wails v3, while maintaining the same functionality and user experience.

## Important Notes
- The application should run as a desktop application on Windows, macOS, and Linux - which is supported by default in Wails.
- The existing React frontend can be reused with minimal changes, as Wails supports any frontend framework.
- The Go backend logic can be reused with minimal changes, as Wails allows you to call Go functions directly from the frontend.
- Instead of WebSockets, we must use Wails' built-in event system to communicate between the frontend and backend.
- Instead of frontend making HTTP requests to the Go server, it will call Go functions directly using Wails' bindings (promises).

## Agent rules
1. The agent must analyze the existing codebase to identify all frontend-backend interactions, including WebSocket communication and HTTP requests.
2. The agent must refactor the frontend code to replace WebSocket communication with Wails' event system, ensuring that all events are properly emitted and handled in the backend.
3. The agent must refactor the frontend code to replace HTTP requests with direct calls to Go functions using Wails' bindings, ensuring that all necessary data is passed correctly and responses are handled appropriately.
4. The agent must NOT write bindings manually; instead, it should leverage Wails' automatic binding generation to expose Go functions to the frontend using CLI command `wails3 generate bindings -ts`.
5. The agent must NOT touch any business logic or UI related code (components, styles, etc.) and MUST ensure that the application maintains the same functionality and user experience after migration.

## Documentation for reference
- Wails v3 bindings generation command: `wails3 generate bindings -ts`
- [Wails v3 event system](https://v3.wails.io/features/events/system/) - Wails provides a unified event system for pub/sub communication. Emit events from anywhere, listen from anywhere—Go to JavaScript, JavaScript to Go, window to window—enabling decoupled architecture with typed events and lifecycle hooks.
- [Wails v3 CLI Reference](https://v3.wails.io/reference/cli/) - The Wails CLI (wails3) provides commands for creating, developing, building, and managing Wails applications.
- [Wails v3 Go-frontend bridge](https://v3.wails.io/concepts/bridge/) - Wails provides a direct, in-memory bridge between Go and JavaScript, enabling seamless communication without HTTP overhead, process boundaries, or serialisation bottlenecks.
- [Wails v3 application lifecycle](https://v3.wails.io/concepts/lifecycle/) - Desktop applications have a lifecycle from startup to shutdown. Wails v3 provides services, events, and hooks to manage this lifecycle effectively.
- [Wails v3 Manager API](https://v3.wails.io/concepts/manager-api/) - The Wails v3 Manager API provides an organized and discoverable way to access application functionality through focused manager structs. This new API structure groups related methods together while maintaining full backward compatibility with the traditional App API.

## Steps for migration
1. Create handlers (Wails Services) in `internal/handlers` for all backend endpoints implemented in `internal/server/server.go`. Implement them 1-to-1 but using Wails methodology, style and approaches. Those handlers (services) are same as endpoints - infrastructural level that calls logic, but doesn't implement logic itself. They are responsible for receiving calls from frontend, calling the appropriate logic functions and returning results back to frontend. As example, use `greetservice.go`.
2. Configure application creation and window initialization in `main.go` 
3. Generate ts bindings for those handlers using `wails3 generate bindings -ts` and import them in the frontend code where needed. Don't write bindings manually, use the CLI command to generate them automatically.
4. Refactor the frontend code to replace http calls with direct calls to the generated bindings. For example, if there was an HTTP call to `/api/orders` to fetch orders, replace it with a call to the corresponding Go function via the generated bindings.
5. Refactor the frontend code to replace WebSocket communication with Wails' event system.
6. Test the application thoroughly to ensure that all functionality works as expected and that there are no regressions in the user experience. Pay special attention to any areas where the frontend and backend interact, as these are the most likely places for issues to arise during migration.
7. Update documentation to reflect the changes made during migration, including any new setup instructions or dependencies required to run the application as a desktop app using Wails.
8. Clean up old backend server, frontend API calls, and WebSocket code that are no longer needed after migration to Wails. Also remove example greetservice and its usage from the codebase, as it was only meant to serve as an example for creating handlers and generating bindings.