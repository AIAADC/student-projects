//go:build !windows || !amd64

package main

import "errors"

func readProcessRegions(uint32) ([][]byte, error) {
	return nil, errors.New("E_PROCESS_READ")
}
