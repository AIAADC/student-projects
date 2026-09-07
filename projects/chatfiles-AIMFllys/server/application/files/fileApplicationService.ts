import path from 'node:path'

import type {
  ArchivePreview,
  DatabasePreview,
  FileInspection,
  VoicePreview,
} from '../../../shared/contracts/files.js'
import {
  decideFileCapability,
  type FileDescriptor,
  type FileOperation,
  type FileRef,
  type FileScope,
} from '../../domain/files/fileCapabilityPolicy.js'
import type { FileProvider, FileProviderOpenResult } from '../../domain/files/fileProvider.js'

export type { FileProvider, FileProviderOpenResult } from '../../domain/files/fileProvider.js'

export type FileApplicationAdapters = {
  readText: (target: string, maximumBytes: number) => Promise<string>
  inspectFile: (target: string) => FileInspection
  inspectArchive: (target: string) => Promise<ArchivePreview>
  inspectDatabase: (target: string) => DatabasePreview
  inspectVoice: (target: string, audioUrl: string) => VoicePreview
  thumbnail: (target: string, width: number, preview: string) => string
  transcodeVoice: (target: string) => string
}

export type FileApplicationOptions = {
  providers: Partial<Record<FileScope, FileProvider>>
  limits: { maxArchiveBytes: number; maxTextBytes: number }
  adapters: FileApplicationAdapters
}

export class FileApplicationError extends Error {
  constructor(
    public readonly code:
      | 'invalid_file_reference'
      | 'file_not_found'
      | 'file_unavailable'
      | 'unsupported_file_capability'
      | 'preview_blocked'
      | 'file_operation_failed',
    public readonly state?: string,
  ) {
    super(code)
    this.name = 'FileApplicationError'
  }
}

function publicPath<T extends { path: string; error?: string }>(value: T, descriptor: FileDescriptor): T {
  return {
    ...value,
    path: descriptor.name,
    ...(value.error ? { error: 'preview_unavailable' } : {}),
  }
}

function blockedArchive(descriptor: FileDescriptor, blockedReason: 'archive_file_too_large'): ArchivePreview {
  return {
    path: descriptor.name,
    size: descriptor.size,
    modified: new Date(0).toISOString(),
    format: path.extname(descriptor.name).toLowerCase() || '[none]',
    readable: false,
    blockedReason,
    entries: [],
  }
}

function mapOpenError(result: Exclude<FileProviderOpenResult, { status: 'available' }>): never {
  if (result.status === 'invalid') throw new FileApplicationError('invalid_file_reference', result.state)
  if (result.status === 'not_found') throw new FileApplicationError('file_not_found', result.state)
  if (result.status === 'unsupported') throw new FileApplicationError('unsupported_file_capability', result.state)
  throw new FileApplicationError('file_unavailable', result.state)
}

export function createFileApplicationService(options: FileApplicationOptions) {
  const describe = async (ref: FileRef) => {
    const provider = options.providers[ref.scope]
    if (!provider) throw new FileApplicationError('file_not_found')
    const descriptor = await provider.describe(ref.id)
    if (!descriptor || descriptor.ref.scope !== ref.scope || descriptor.ref.id !== ref.id) {
      throw new FileApplicationError('file_not_found')
    }
    return { provider, descriptor }
  }

  const prepare = async (
    ref: FileRef,
    operation: FileOperation,
    described?: Awaited<ReturnType<typeof describe>>,
  ) => {
    const { provider, descriptor } = described ?? await describe(ref)
    const decision = decideFileCapability(descriptor, operation, {
      maxArchiveBytes: options.limits.maxArchiveBytes,
    })
    if (!decision.allowed) {
      if (decision.code === 'preview_blocked') {
        throw new FileApplicationError('preview_blocked', decision.blockedReason)
      }
      throw new FileApplicationError('unsupported_file_capability')
    }
    const opened = await provider.open(ref.id, operation)
    if (opened.status !== 'available') mapOpenError(opened)
    return { descriptor, target: opened.target }
  }

  return {
    describe: async (ref: FileRef) => (await describe(ref)).descriptor,
    async openContent(ref: FileRef) {
      return await prepare(ref, 'content')
    },
    async readText(ref: FileRef) {
      const described = await describe(ref)
      const { descriptor } = described
      if (descriptor.size > options.limits.maxTextBytes) throw new FileApplicationError('preview_blocked')
      const opened = await prepare(ref, 'textPreview', described)
      return { ...opened, text: await options.adapters.readText(opened.target, options.limits.maxTextBytes) }
    },
    async readArchive(ref: FileRef): Promise<ArchivePreview> {
      const described = await describe(ref)
      const { descriptor } = described
      const decision = decideFileCapability(descriptor, 'archivePreview', {
        maxArchiveBytes: options.limits.maxArchiveBytes,
      })
      if (!decision.allowed && decision.blockedReason === 'archive_file_too_large') {
        return blockedArchive(descriptor, decision.blockedReason)
      }
      const opened = await prepare(ref, 'archivePreview', described)
      return publicPath(await options.adapters.inspectArchive(opened.target), descriptor)
    },
    async readDatabase(ref: FileRef): Promise<DatabasePreview> {
      const { descriptor, target } = await prepare(ref, 'databasePreview')
      return publicPath(options.adapters.inspectDatabase(target), descriptor)
    },
    async inspect(ref: FileRef): Promise<FileInspection> {
      const { descriptor, target } = await prepare(ref, 'inspectPreview')
      return publicPath(options.adapters.inspectFile(target), descriptor)
    },
    async openThumbnail(ref: FileRef, width: number) {
      const opened = await prepare(ref, 'thumbnail')
      return { ...opened, target: options.adapters.thumbnail(opened.target, width, opened.descriptor.preview) }
    },
    async readVoice(ref: FileRef, audioUrl: string): Promise<VoicePreview> {
      const { descriptor, target } = await prepare(ref, 'voicePreview')
      return publicPath(options.adapters.inspectVoice(target, audioUrl), descriptor)
    },
    async openVoiceAudio(ref: FileRef) {
      const opened = await prepare(ref, 'voiceAudio')
      return { ...opened, target: options.adapters.transcodeVoice(opened.target) }
    },
  }
}

export type FileApplicationService = ReturnType<typeof createFileApplicationService>
