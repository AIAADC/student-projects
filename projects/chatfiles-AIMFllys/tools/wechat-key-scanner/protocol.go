package main

import (
	"encoding/binary"
	"errors"
	"io"
	"math"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

var protocolMagic = [8]byte{'C', 'F', 'W', 'K', 'S', 'C', 'A', 'N'}

const protocolVersion uint32 = 1

var errPipe = errors.New("E_PIPE")

func writeAll(writer io.Writer, value []byte) error {
	for len(value) > 0 {
		written, err := writer.Write(value)
		if err != nil || written <= 0 {
			return errPipe
		}
		value = value[written:]
	}
	return nil
}

func writeProtocolHeader(writer io.Writer) error {
	var version [4]byte
	binary.LittleEndian.PutUint32(version[:], protocolVersion)
	if err := writeAll(writer, protocolMagic[:]); err != nil {
		return err
	}
	return writeAll(writer, version[:])
}

func safeRelativePath(relativePath string) bool {
	clean := filepath.Clean(relativePath)
	return relativePath != "" && utf8.ValidString(relativePath) && !strings.ContainsRune(relativePath, 0) &&
		!filepath.IsAbs(relativePath) && clean != ".." && !strings.HasPrefix(clean, ".."+string(filepath.Separator))
}

func writeProtocolRecord(writer io.Writer, relativePath string, key []byte) error {
	pathBytes := []byte(relativePath)
	if len(key) != keySize || len(pathBytes) > math.MaxUint32 || !safeRelativePath(relativePath) {
		return errPipe
	}
	var length [4]byte
	binary.LittleEndian.PutUint32(length[:], uint32(len(pathBytes)))
	if err := writeAll(writer, length[:]); err != nil {
		return err
	}
	if err := writeAll(writer, pathBytes); err != nil {
		return err
	}
	return writeAll(writer, key)
}

func writeProtocolTerminator(writer io.Writer) error {
	return writeAll(writer, []byte{0, 0, 0, 0})
}
