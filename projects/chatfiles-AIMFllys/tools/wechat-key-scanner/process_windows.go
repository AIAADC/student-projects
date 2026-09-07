//go:build windows && amd64

package main

import (
	"errors"
	"unsafe"

	"golang.org/x/sys/windows"
)

var errProcessRead = errors.New("E_PROCESS_READ")

const memPrivate = 0x00020000

func readableProtection(protection uint32) bool {
	if protection&windows.PAGE_GUARD != 0 || protection&windows.PAGE_NOACCESS != 0 {
		return false
	}
	const readable = windows.PAGE_READONLY | windows.PAGE_READWRITE | windows.PAGE_WRITECOPY |
		windows.PAGE_EXECUTE_READ | windows.PAGE_EXECUTE_READWRITE | windows.PAGE_EXECUTE_WRITECOPY
	return protection&readable != 0
}

func readProcessRegions(pid uint32) ([][]byte, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_VM_READ|windows.PROCESS_QUERY_INFORMATION, false, pid)
	if err != nil {
		return nil, errProcessRead
	}
	defer windows.CloseHandle(handle)
	var regions [][]byte
	var address uintptr
	for {
		var information windows.MemoryBasicInformation
		if queryErr := windows.VirtualQueryEx(handle, address, &information, unsafe.Sizeof(information)); queryErr != nil {
			break
		}
		next := information.BaseAddress + information.RegionSize
		if next <= address {
			break
		}
		address = next
		if information.State != windows.MEM_COMMIT || information.Type != memPrivate || !readableProtection(information.Protect) {
			continue
		}
		region := make([]byte, information.RegionSize)
		var bytesRead uintptr
		readErr := windows.ReadProcessMemory(handle, information.BaseAddress, &region[0], information.RegionSize, &bytesRead)
		if readErr != nil || bytesRead < keySize {
			clear(region)
			continue
		}
		regions = append(regions, region[:bytesRead])
	}
	if len(regions) == 0 {
		return nil, errProcessRead
	}
	return regions, nil
}
