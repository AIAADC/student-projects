import type { FileDescriptor, FileOperation } from './fileCapabilityPolicy.js'

export type FileProviderOpenResult =
  | { status: 'available'; target: string }
  | { status: 'invalid' | 'not_found' | 'unavailable' | 'unsupported'; state?: string }

export type FileProvider = {
  describe: (id: string) => FileDescriptor | null | Promise<FileDescriptor | null>
  open: (id: string, operation: FileOperation) => FileProviderOpenResult | Promise<FileProviderOpenResult>
}
