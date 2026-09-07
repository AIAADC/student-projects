package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
)

var (
	errPlaintext  = errors.New("E_PLAINTEXT")
	errTargetRead = errors.New("E_TARGET_READ")
)

type target struct {
	relativePath string
	page         []byte
	found        []byte
}

func canonicalPathWithinRoot(root, candidate string) bool {
	relative, err := filepath.Rel(filepath.Clean(root), filepath.Clean(candidate))
	return err == nil && relative != "." && relative != ".." &&
		!strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

func newTargetFromPage(relativePath string, source []byte) (*target, error) {
	if len(source) < pageSize {
		return nil, errTargetRead
	}
	if bytes.Equal(source[:len(sqliteHeader)], sqliteHeader[:]) {
		return nil, errPlaintext
	}
	page := make([]byte, pageSize)
	copy(page, source[:pageSize])
	return &target{relativePath: relativePath, page: page}, nil
}

func (item *target) clear() {
	clear(item.page)
	clear(item.found)
	item.found = nil
}

func collectTargets(accountRoot string) ([]*target, error) {
	rootInfo, rootErr := os.Lstat(accountRoot)
	if rootErr != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errTargetRead
	}
	canonicalRoot, rootRealErr := filepath.EvalSymlinks(accountRoot)
	if rootRealErr != nil {
		return nil, errTargetRead
	}
	storageRoot := filepath.Join(canonicalRoot, "db_storage")
	storageInfo, storageErr := os.Lstat(storageRoot)
	if storageErr != nil || !storageInfo.IsDir() || storageInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errTargetRead
	}
	canonicalStorage, storageRealErr := filepath.EvalSymlinks(storageRoot)
	if storageRealErr != nil || !canonicalPathWithinRoot(canonicalRoot, canonicalStorage) {
		return nil, errTargetRead
	}
	var paths []string
	err := filepath.WalkDir(canonicalStorage, func(filePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return errTargetRead
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errTargetRead
		}
		if entry.IsDir() {
			return nil
		}
		name := strings.ToLower(entry.Name())
		if !strings.HasSuffix(name, ".db") || strings.Contains(name, "fts") {
			return nil
		}
		info, infoErr := entry.Info()
		canonicalFile, fileRealErr := filepath.EvalSymlinks(filePath)
		if infoErr != nil || !info.Mode().IsRegular() || fileRealErr != nil ||
			!canonicalPathWithinRoot(canonicalRoot, canonicalFile) {
			return errTargetRead
		}
		paths = append(paths, canonicalFile)
		return nil
	})
	if err != nil {
		return nil, errTargetRead
	}
	sort.Strings(paths)
	targets := make([]*target, 0, len(paths))
	for _, filePath := range paths {
		relativePath, relErr := filepath.Rel(canonicalRoot, filePath)
		if relErr != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
			return nil, errTargetRead
		}
		file, openErr := os.Open(filePath)
		if openErr != nil {
			return nil, errTargetRead
		}
		page := make([]byte, pageSize)
		_, readErr := io.ReadFull(file, page)
		closeErr := file.Close()
		if readErr != nil || closeErr != nil {
			clear(page)
			return nil, errTargetRead
		}
		item, targetErr := newTargetFromPage(relativePath, page)
		clear(page)
		if errors.Is(targetErr, errPlaintext) {
			continue
		}
		if targetErr != nil {
			return nil, errTargetRead
		}
		targets = append(targets, item)
	}
	return targets, nil
}

func scanRegions(regions [][]byte, item *target) []byte {
	var stopped atomic.Bool
	var once sync.Once
	var found []byte
	jobs := make(chan []byte)
	var workers sync.WaitGroup
	workerCount := runtime.NumCPU()
	if workerCount < 1 {
		workerCount = 1
	}
	for worker := 0; worker < workerCount; worker++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for region := range jobs {
				limit := len(region) - keySize
				for offset := 0; offset <= limit && !stopped.Load(); offset += 8 {
					candidate := region[offset : offset+keySize]
					if validateCandidate(item.page, candidate) {
						once.Do(func() {
							found = make([]byte, keySize)
							copy(found, candidate)
							stopped.Store(true)
						})
					}
				}
			}
		}()
	}
	for _, region := range regions {
		if stopped.Load() {
			break
		}
		jobs <- region
	}
	close(jobs)
	workers.Wait()
	return found
}
