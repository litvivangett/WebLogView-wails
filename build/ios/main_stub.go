//go:build !ios

package main

// main is a stub for non-iOS builds so `go build ./...` succeeds.
// The real entry point is main_ios.go (compiled only with the ios build tag).
func main() {}
