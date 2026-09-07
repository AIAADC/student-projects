package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/binary"
)

const (
	pageSize    = 4096
	keySize     = 32
	saltSize    = 16
	ivSize      = 16
	hmacSize    = 64
	reserveSize = ivSize + hmacSize
)

var sqliteHeader = [16]byte{'S', 'Q', 'L', 'i', 't', 'e', ' ', 'f', 'o', 'r', 'm', 'a', 't', ' ', '3', 0}

func xorSalt(salt []byte) []byte {
	result := make([]byte, len(salt))
	for i, value := range salt {
		result[i] = value ^ 0x3a
	}
	return result
}

// SQLCipher legacy v4 derives a 32-byte MAC key with PBKDF2-HMAC-SHA512 and 2 rounds.
func deriveMacKey(password, salt []byte) []byte {
	blockInput := make([]byte, len(salt)+4)
	copy(blockInput, salt)
	binary.BigEndian.PutUint32(blockInput[len(salt):], 1)
	firstMac := hmac.New(sha512.New, password)
	_, _ = firstMac.Write(blockInput)
	first := firstMac.Sum(nil)
	secondMac := hmac.New(sha512.New, password)
	_, _ = secondMac.Write(first)
	second := secondMac.Sum(nil)
	result := make([]byte, keySize)
	for i := range result {
		result[i] = first[i] ^ second[i]
	}
	clear(blockInput)
	clear(first)
	clear(second)
	return result
}

func distinctEnough(candidate []byte) bool {
	var seen [256]bool
	count := 0
	for _, value := range candidate {
		if !seen[value] {
			seen[value] = true
			count++
			if count >= 20 {
				return true
			}
		}
	}
	return false
}

func validateCandidate(page, candidate []byte) bool {
	if len(page) != pageSize || len(candidate) != keySize || !distinctEnough(candidate) {
		return false
	}
	block, err := aes.NewCipher(candidate)
	if err != nil {
		return false
	}
	plain := make([]byte, aes.BlockSize)
	ivOffset := pageSize - reserveSize
	cipher.NewCBCDecrypter(block, page[ivOffset:ivOffset+ivSize]).CryptBlocks(plain, page[saltSize:saltSize+aes.BlockSize])
	validHeader := plain[0] == 0x10 && plain[1] == 0x00 && plain[5] == 0x40 && plain[6] == 0x20 && plain[7] == 0x20
	clear(plain)
	if !validHeader {
		return false
	}
	macSalt := xorSalt(page[:saltSize])
	macKey := deriveMacKey(candidate, macSalt)
	mac := hmac.New(sha512.New, macKey)
	dataEnd := pageSize - reserveSize + ivSize
	_, _ = mac.Write(page[saltSize:dataEnd])
	var pageNumber [4]byte
	binary.LittleEndian.PutUint32(pageNumber[:], 1)
	_, _ = mac.Write(pageNumber[:])
	actual := mac.Sum(nil)
	valid := hmac.Equal(actual, page[dataEnd:dataEnd+hmacSize])
	clear(macSalt)
	clear(macKey)
	clear(actual)
	return valid
}
