import { spawn } from 'node:child_process'

import type { ArchivePreviewBlockedReason } from '../../../shared/contracts/archivePreview.js'
import { isSafeArchiveEntryName } from '../../domain/files/archiveEntryName.js'

export type TarDirectoryLimits = {
  maxEntries: number
  maxDirectoryBytes: number
  maxDirectoryReadMs: number
  killGraceMs: number
}

export type TarDirectoryEntry = { name: string; directory: boolean }
export type TarDirectoryResult =
  | { readable: true; entries: TarDirectoryEntry[] }
  | { readable: false; entries: []; blockedReason?: ArchivePreviewBlockedReason; error?: string }

export type TarProcess = {
  stdout: { on: (event: 'data', listener: (chunk: Uint8Array) => void) => unknown }
  kill: (signal?: NodeJS.Signals) => boolean
  once: {
    (event: 'error', listener: (error: Error) => void): unknown
    (event: 'close', listener: (code: number | null) => void): unknown
  }
}

export type TarProcessFactory = (filePath: string) => TarProcess

const spawnTar: TarProcessFactory = (filePath) => spawn('tar', ['-tf', filePath], {
  shell: false,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'ignore'],
})

function blocked(blockedReason: ArchivePreviewBlockedReason): TarDirectoryResult {
  return { readable: false, entries: [], blockedReason }
}

function failed(): TarDirectoryResult {
  return { readable: false, entries: [], error: 'archive_listing_failed' }
}

function validLimits(limits: TarDirectoryLimits) {
  return Object.values(limits).every((value) => Number.isSafeInteger(value) && value > 0)
}

export function readTarDirectory(
  filePath: string,
  limits: TarDirectoryLimits,
  createProcess: TarProcessFactory = spawnTar,
): Promise<TarDirectoryResult> {
  if (!validLimits(limits)) return Promise.resolve(failed())

  return new Promise((resolve) => {
    let child: TarProcess
    try {
      child = createProcess(filePath)
    } catch {
      resolve(failed())
      return
    }

    const decoder = new TextDecoder('utf-8', { fatal: true })
    const entries: TarDirectoryEntry[] = []
    let buffered = ''
    let directoryBytes = 0
    let settled = false
    let pending: TarDirectoryResult | undefined
    let forceTimer: NodeJS.Timeout | undefined
    let finalTimer: NodeJS.Timeout | undefined

    const deadline = setTimeout(() => stop(blocked('archive_directory_timeout')), limits.maxDirectoryReadMs)

    function finish(result: TarDirectoryResult) {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (forceTimer) clearTimeout(forceTimer)
      if (finalTimer) clearTimeout(finalTimer)
      resolve(result)
    }

    function stop(result: TarDirectoryResult) {
      if (pending || settled) return
      pending = result
      try { child.kill() } catch { /* The hard-stop timer remains authoritative. */ }
      forceTimer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* The bounded result still completes below. */ }
        finalTimer = setTimeout(() => finish(result), limits.killGraceMs)
      }, limits.killGraceMs)
    }

    type AppendResult = 'ok' | 'invalid' | 'entry_limit'

    function appendName(rawName: string): AppendResult {
      const name = rawName.endsWith('\r') ? rawName.slice(0, -1) : rawName
      if (!name) return 'ok'
      if (!isSafeArchiveEntryName(name)) return 'invalid'
      if (entries.length >= limits.maxEntries) return 'entry_limit'
      entries.push({ name, directory: name.endsWith('/') })
      return 'ok'
    }

    function appendText(text: string): AppendResult {
      buffered += text
      for (;;) {
        const newline = buffered.indexOf('\n')
        if (newline < 0) return 'ok'
        const name = buffered.slice(0, newline)
        buffered = buffered.slice(newline + 1)
        const appended = appendName(name)
        if (appended !== 'ok') return appended
      }
    }

    child.stdout.on('data', (chunk) => {
      if (pending || settled) return
      directoryBytes += chunk.byteLength
      if (!Number.isSafeInteger(directoryBytes) || directoryBytes > limits.maxDirectoryBytes) {
        stop(blocked('archive_directory_too_large'))
        return
      }
      try {
        const appended = appendText(decoder.decode(chunk, { stream: true }))
        if (appended === 'entry_limit') stop(blocked('archive_entry_limit_exceeded'))
        if (appended === 'invalid') stop(failed())
      } catch {
        stop(failed())
      }
    })

    child.once('error', () => finish(pending ?? failed()))
    child.once('close', (code) => {
      if (pending) {
        finish(pending)
        return
      }
      if (code !== 0) {
        finish(failed())
        return
      }
      try {
        let appended = appendText(decoder.decode())
        if (appended === 'ok' && buffered) appended = appendName(buffered)
        if (appended === 'entry_limit') finish(blocked('archive_entry_limit_exceeded'))
        else if (appended === 'invalid') finish(failed())
        else finish({ readable: true, entries })
      } catch {
        finish(failed())
      }
    })
  })
}
