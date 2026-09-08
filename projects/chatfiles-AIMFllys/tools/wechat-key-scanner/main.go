// wechat-key-scanner discovers derived SQLCipher keys in a live Weixin process.
// It never decrypts a database and emits keys only as raw bytes over stdout.
package main

import (
	"fmt"
	"io"
	"os"
	"strconv"
)

type regionReader func(pid uint32) ([][]byte, error)

func sanitizedFailure(stderr io.Writer, code string) {
	_, _ = fmt.Fprintln(stderr, code)
}

func zeroRegions(regions [][]byte) {
	for _, region := range regions {
		clear(region)
	}
}

func run(args []string, stdout, stderr io.Writer, read regionReader) int {
	if err := writeProtocolHeader(stdout); err != nil {
		sanitizedFailure(stderr, "E_PIPE")
		return 2
	}
	terminated := false
	defer func() {
		if !terminated {
			_ = writeProtocolTerminator(stdout)
		}
	}()
	if len(args) != 2 {
		sanitizedFailure(stderr, "E_USAGE")
		return 2
	}
	parsedPID, err := strconv.ParseUint(args[0], 10, 32)
	if err != nil || parsedPID == 0 {
		sanitizedFailure(stderr, "E_PID")
		return 2
	}
	targets, err := collectTargets(args[1])
	if err != nil {
		sanitizedFailure(stderr, "E_TARGET_READ")
		return 2
	}
	defer func() {
		for _, item := range targets {
			item.clear()
		}
	}()
	if len(targets) == 0 {
		sanitizedFailure(stderr, "E_NO_TARGETS")
		return 3
	}
	regions, err := read(uint32(parsedPID))
	if err != nil || len(regions) == 0 {
		zeroRegions(regions)
		sanitizedFailure(stderr, "E_PROCESS_READ")
		return 2
	}
	defer zeroRegions(regions)

	for _, item := range targets {
		item.found = scanRegions(regions, item)
		if item.found == nil {
			sanitizedFailure(stderr, "E_KEY_MISSING")
			return 3
		}
	}
	for _, item := range targets {
		if err := writeProtocolRecord(stdout, item.relativePath, item.found); err != nil {
			sanitizedFailure(stderr, "E_PIPE")
			return 2
		}
		clear(item.found)
		item.found = nil
	}
	if err := writeProtocolTerminator(stdout); err != nil {
		sanitizedFailure(stderr, "E_PIPE")
		return 2
	}
	terminated = true
	return 0
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, readProcessRegions))
}
