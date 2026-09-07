package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/binary"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func fixtureKey() []byte {
	key := make([]byte, keySize)
	for i := range key {
		key[i] = byte(i + 1)
	}
	return key
}

func encryptedFixturePage(t *testing.T, key []byte) []byte {
	t.Helper()
	page := make([]byte, pageSize)
	for i := range page {
		page[i] = byte((i*29 + 17) % 251)
	}
	for i := 0; i < saltSize; i++ {
		page[i] = byte(0xa0 + i)
	}
	ivOffset := pageSize - reserveSize
	for i := 0; i < ivSize; i++ {
		page[ivOffset+i] = byte(0x30 + i)
	}
	plain := make([]byte, aes.BlockSize)
	plain[0], plain[1] = 0x10, 0x00
	plain[5], plain[6], plain[7] = 0x40, 0x20, 0x20
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	cipher.NewCBCEncrypter(block, page[ivOffset:ivOffset+ivSize]).CryptBlocks(page[saltSize:saltSize+aes.BlockSize], plain)

	macSalt := xorSalt(page[:saltSize])
	macKey := deriveMacKey(key, macSalt)
	mac := hmac.New(sha512.New, macKey)
	dataEnd := pageSize - reserveSize + ivSize
	_, _ = mac.Write(page[saltSize:dataEnd])
	var pageNumber [4]byte
	binary.LittleEndian.PutUint32(pageNumber[:], 1)
	_, _ = mac.Write(pageNumber[:])
	copy(page[dataEnd:], mac.Sum(nil))
	clear(macSalt)
	clear(macKey)
	clear(plain)
	return page
}

func TestDeriveMacKeyMatchesPBKDF2SHA512Vector(t *testing.T) {
	got := deriveMacKey([]byte("password"), []byte("salt"))
	want, err := hex.DecodeString("e1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53c")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("PBKDF2 mismatch")
	}
	clear(got)
}

func TestScanFindsOnlyAValidatedAlignedDerivedKey(t *testing.T) {
	key := fixtureKey()
	target, err := newTargetFromPage(filepath.Join("db_storage", "message", "消息.db"), encryptedFixturePage(t, key))
	if err != nil {
		t.Fatal(err)
	}
	region := make([]byte, 8+keySize+8)
	copy(region[8:], key)
	found := scanRegions([][]byte{region}, target)
	if !bytes.Equal(found, key) {
		t.Fatal("validated key not found")
	}
	clear(found)
	target.clear()
}

func TestRunEmitsOnlyBinaryProtocolAndZeroesCopiedProcessMemory(t *testing.T) {
	root := filepath.Join(t.TempDir(), "微信账号")
	databaseDir := filepath.Join(root, "db_storage", "message")
	if err := os.MkdirAll(databaseDir, 0o700); err != nil {
		t.Fatal(err)
	}
	key := fixtureKey()
	databasePath := filepath.Join(databaseDir, "消息_0.db")
	if err := os.WriteFile(databasePath, encryptedFixturePage(t, key), 0o600); err != nil {
		t.Fatal(err)
	}
	region := make([]byte, 16+keySize+8)
	copy(region[16:], key)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := run([]string{"4321", root}, &stdout, &stderr, func(pid uint32) ([][]byte, error) {
		if pid != 4321 {
			t.Fatalf("unexpected pid: %d", pid)
		}
		return [][]byte{region}, nil
	})
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("run failed: code=%d stderr=%q", code, stderr.String())
	}
	for _, value := range region {
		if value != 0 {
			t.Fatal("process-memory copy was not zeroed")
		}
	}

	wire := stdout.Bytes()
	if len(wire) < len(protocolMagic)+4+4+keySize+4 || !bytes.Equal(wire[:len(protocolMagic)], protocolMagic[:]) {
		t.Fatal("invalid protocol header")
	}
	offset := len(protocolMagic)
	if binary.LittleEndian.Uint32(wire[offset:]) != protocolVersion {
		t.Fatal("invalid protocol version")
	}
	offset += 4
	pathLength := int(binary.LittleEndian.Uint32(wire[offset:]))
	offset += 4
	relativePath := string(wire[offset : offset+pathLength])
	offset += pathLength
	if relativePath != filepath.Join("db_storage", "message", "消息_0.db") {
		t.Fatalf("unexpected relative path")
	}
	if !bytes.Equal(wire[offset:offset+keySize], key) {
		t.Fatal("raw protocol key mismatch")
	}
	offset += keySize
	if binary.LittleEndian.Uint32(wire[offset:]) != 0 || offset+4 != len(wire) {
		t.Fatal("missing zero terminator")
	}
	if bytes.Contains(wire, []byte(hex.EncodeToString(key))) {
		t.Fatal("key was encoded as printable hexadecimal")
	}
}

func TestRunPublishesNoKeyRecordWhenAnyTargetIsMissing(t *testing.T) {
	root := t.TempDir()
	databaseDir := filepath.Join(root, "db_storage")
	if err := os.MkdirAll(databaseDir, 0o700); err != nil {
		t.Fatal(err)
	}
	key := fixtureKey()
	if err := os.WriteFile(filepath.Join(databaseDir, "message.db"), encryptedFixturePage(t, key), 0o600); err != nil {
		t.Fatal(err)
	}
	region := make([]byte, 64)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := run([]string{"7", root}, &stdout, &stderr, func(uint32) ([][]byte, error) {
		return [][]byte{region}, nil
	})
	if code == 0 || stderr.String() != "E_KEY_MISSING\n" {
		t.Fatalf("unexpected miss result: code=%d stderr=%q", code, stderr.String())
	}
	want := make([]byte, len(protocolMagic)+8)
	copy(want, protocolMagic[:])
	binary.LittleEndian.PutUint32(want[len(protocolMagic):], protocolVersion)
	if !bytes.Equal(stdout.Bytes(), want) {
		t.Fatal("missing-key run emitted a record")
	}
}

func TestCanonicalTargetContainmentRejectsEscapes(t *testing.T) {
	root := filepath.Join("C:", "chatfiles-fixture", "account")
	inside := filepath.Join(root, "db_storage", "message", "message_0.db")
	outside := filepath.Join(root, "..", "other-account", "db_storage", "message.db")

	if !canonicalPathWithinRoot(root, inside) {
		t.Fatal("expected canonical database path inside the account root")
	}
	if canonicalPathWithinRoot(root, root) {
		t.Fatal("account root itself must not be accepted as a database target")
	}
	if canonicalPathWithinRoot(root, outside) {
		t.Fatal("canonical path escape was accepted")
	}
}
