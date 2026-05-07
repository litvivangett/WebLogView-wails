package watcher

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"path/filepath"
	"strings"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

// K8sWatcher watches Kubernetes pod logs
type K8sWatcher struct {
	clientset     *kubernetes.Clientset
	namespace     string
	podName       string
	containerName string
	tailLines     int64
	cancel        context.CancelFunc
	stream        io.ReadCloser
	mu            sync.Mutex
}

// K8sConfig contains configuration for Kubernetes connection
type K8sConfig struct {
	Namespace     string
	PodName       string
	ContainerName string
	TailLines     int64
}

// NewK8sWatcher creates a new Kubernetes log watcher
func NewK8sWatcher(cfg K8sConfig) (*K8sWatcher, error) {
	// Build kubeconfig
	clientset, err := getKubernetesClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	_ = ctx // ctx is held only for cancellation via cancel()

	return &K8sWatcher{
		clientset:     clientset,
		namespace:     cfg.Namespace,
		podName:       cfg.PodName,
		containerName: cfg.ContainerName,
		tailLines:     cfg.TailLines,
		cancel:        cancel,
	}, nil
}

// Watch streams logs from the Kubernetes pod using the provided context.
func (w *K8sWatcher) Watch(ctx context.Context, callback func([]string)) error {
	opts := &corev1.PodLogOptions{
		Follow:     true,
		Timestamps: false,
		TailLines:  &w.tailLines,
	}

	// Add container name if specified
	if w.containerName != "" {
		opts.Container = w.containerName
	}

	// Get log stream
	req := w.clientset.CoreV1().Pods(w.namespace).GetLogs(w.podName, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		// Check for authentication errors
		errMsg := err.Error()
		if strings.Contains(errMsg, "Unauthorized") || strings.Contains(errMsg, "authentication") || strings.Contains(errMsg, "forbidden") {
			return fmt.Errorf("authentication expired or insufficient permissions - please re-authenticate with your cluster: %w", err)
		}
		return fmt.Errorf("failed to open log stream: %w", err)
	}
	w.mu.Lock()
	w.stream = stream
	w.mu.Unlock()
	defer stream.Close()

	log.Printf("Started watching pod %s/%s", w.namespace, w.podName)

	// Read logs line by line
	reader := bufio.NewReader(stream)
	for {
		select {
		case <-ctx.Done():
			log.Println("K8s watcher stopped")
			return nil
		default:
			line, err := reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					// Stream ended - could be pod termination or auth expiry
					log.Printf("K8s stream ended for pod %s/%s", w.namespace, w.podName)
					return fmt.Errorf("log stream ended - pod may have terminated or authentication expired")
				}
				// Check for auth errors in stream errors
				errMsg := err.Error()
				if strings.Contains(errMsg, "Unauthorized") || strings.Contains(errMsg, "authentication") || strings.Contains(errMsg, "forbidden") {
					return fmt.Errorf("authentication expired - please re-authenticate with your cluster: %w", err)
				}
				return fmt.Errorf("error reading log stream: %w", err)
			}

			if line != "" {
				// Remove trailing newline
				if line[len(line)-1] == '\n' {
					line = line[:len(line)-1]
				}
				callback([]string{line})
			}
		}
	}
}

// Stop stops watching the pod logs
func (w *K8sWatcher) Stop() {
	w.mu.Lock()
	s := w.stream
	w.mu.Unlock()
	if s != nil {
		s.Close() // unblocks ReadString() immediately
	}
	if w.cancel != nil {
		w.cancel() // belt-and-suspenders: cancel internal ctx too
	}
}

// getKubernetesClient creates a Kubernetes client
func getKubernetesClient() (*kubernetes.Clientset, error) {
	// Try in-cluster config first
	config, err := rest.InClusterConfig()
	if err != nil {
		// Fall back to kubeconfig
		var kubeconfig string
		if home := homedir.HomeDir(); home != "" {
			kubeconfig = filepath.Join(home, ".kube", "config")
		}

		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build config: %w", err)
		}
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	return clientset, nil
}
