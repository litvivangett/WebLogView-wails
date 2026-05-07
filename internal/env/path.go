package env

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ExpandPath enriches the process PATH so that credential plugins (e.g. `aws`
// for EKS) can be found by child processes spawned by client-go.
//
// Strategy:
//  1. (macOS/Linux) Query the user's login shell for its full PATH — this
//     sources .zshrc / .bash_profile / etc. and handles any custom setup.
//  2. Append well-known fallback directories that are commonly missed when a
//     GUI app is launched outside a terminal.
//  3. (Windows) The system PATH is already inherited by GUI apps, so only
//     fallback dirs are added.
func ExpandPath() {
	applyShellEnvironment()

	current := os.Getenv("PATH")
	extra := shellPath()
	extra = append(extra, fallbackDirs()...)

	merged := mergePaths(current, extra)
	if merged != current {
		os.Setenv("PATH", merged)
	}
}

// applyShellEnvironment imports auth/tooling-related variables from the user's
// login shell to align GUI app process env with terminal sessions.
func applyShellEnvironment() {
	env := shellEnv()
	if len(env) == 0 {
		return
	}

	for key, value := range env {
		if shouldImportEnvVar(key) {
			_ = os.Setenv(key, value)
		}
	}
}

// shellPath asks the user's login shell to print its PATH. This is the most
// reliable way to pick up any tool installed via Homebrew, asdf, nvm, etc.
func shellPath() []string {
	if runtime.GOOS == "windows" {
		return nil
	}

	shell := os.Getenv("SHELL")
	if shell == "" {
		for _, s := range []string{"/bin/zsh", "/bin/bash", "/bin/sh"} {
			if _, err := os.Stat(s); err == nil {
				shell = s
				break
			}
		}
	}
	if shell == "" {
		return nil
	}

	out, err := exec.Command(shell, "-l", "-c", "echo $PATH").Output()
	if err != nil {
		return nil
	}

	raw := strings.TrimSpace(string(out))
	if raw == "" {
		return nil
	}
	return strings.Split(raw, ":")
}

// shellEnv asks the login shell for its full environment in a null-separated
// form, so values with newlines are handled safely.
func shellEnv() map[string]string {
	if runtime.GOOS == "windows" {
		return nil
	}

	shell := os.Getenv("SHELL")
	if shell == "" {
		for _, s := range []string{"/bin/zsh", "/bin/bash", "/bin/sh"} {
			if _, err := os.Stat(s); err == nil {
				shell = s
				break
			}
		}
	}
	if shell == "" {
		return nil
	}

	out, err := exec.Command(shell, "-l", "-c", "env -0").Output()
	if err != nil {
		return nil
	}

	result := make(map[string]string)
	for _, entry := range bytes.Split(out, []byte{0}) {
		if len(entry) == 0 {
			continue
		}
		parts := strings.SplitN(string(entry), "=", 2)
		if len(parts) != 2 || parts[0] == "" {
			continue
		}
		result[parts[0]] = parts[1]
	}
	return result
}

func shouldImportEnvVar(key string) bool {
	switch key {
	case "PATH", "HOME", "KUBECONFIG", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY":
		return true
	}
	return strings.HasPrefix(key, "AWS_")
}

// fallbackDirs returns well-known binary directories that GUI apps commonly
// miss because they are added only by interactive shell configs.
func fallbackDirs() []string {
	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "darwin":
		return []string{
			"/opt/homebrew/bin",  // Apple Silicon Homebrew
			"/opt/homebrew/sbin", // Apple Silicon Homebrew (sbin)
			"/usr/local/bin",     // Intel Homebrew / manual installs
			"/usr/local/sbin",    // Intel Homebrew (sbin)
			filepath.Join(home, ".local", "bin"),
		}
	case "linux":
		return []string{
			"/usr/local/bin",
			filepath.Join(home, ".local", "bin"),
			"/home/linuxbrew/.linuxbrew/bin", // Linux Homebrew
		}
	case "windows":
		localApp := os.Getenv("LOCALAPPDATA")
		return []string{
			filepath.Join(localApp, "Programs", "Python"),
			filepath.Join(localApp, "Programs", "Amazon", "AWSCLI"),
		}
	}
	return nil
}

// mergePaths combines the current PATH with extra dirs, deduplicating and
// preserving order (extra dirs that already exist are skipped).
func mergePaths(current string, extra []string) string {
	sep := string(os.PathListSeparator)
	existing := make(map[string]bool)
	for _, p := range strings.Split(current, sep) {
		existing[p] = true
	}

	var additions []string
	for _, p := range extra {
		if p != "" && !existing[p] {
			additions = append(additions, p)
			existing[p] = true
		}
	}

	if len(additions) == 0 {
		return current
	}
	if current == "" {
		return strings.Join(additions, sep)
	}
	return strings.Join(additions, sep) + sep + current
}
