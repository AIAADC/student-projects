import type { LibraryManifest, SourceFileManifest } from '../../../shared/contracts/files.js'
import { createArchiveFileProvider } from '../../infrastructure/files/archiveFileProvider.js'
import { readBoundedUtf8Text } from '../../infrastructure/files/boundedTextReader.js'
import { createRuntimeArtifactFileProvider } from '../../infrastructure/files/runtimeArtifactFileProvider.js'
import { createSourceFileProvider } from '../../infrastructure/files/sourceFileProvider.js'
import { imageThumb, videoPoster } from '../../utils/thumbs.js'
import { inspectArchive, inspectFile, inspectSqlite } from '../../utils/inspect.js'
import { library, sourceLibrary } from '../../utils/helpers.js'
import { inspectVoice, transcodeVoice } from '../../utils/voice.js'
import { createFileApplicationService, type FileProvider } from './fileApplicationService.js'

type RuntimeFileAdapters = {
  loadArchiveManifest: (projectRoot: string) => LibraryManifest
  loadSourceManifest: (projectRoot: string) => SourceFileManifest
}

const defaults: RuntimeFileAdapters = {
  loadArchiveManifest: library,
  loadSourceManifest: sourceLibrary,
}

function lazyProvider(factory: () => FileProvider): FileProvider {
  return {
    async describe(id) {
      try { return await factory().describe(id) } catch { return null }
    },
    async open(id, operation) {
      try { return await factory().open(id, operation) }
      catch { return { status: 'unavailable' } }
    },
  }
}

export function createRuntimeFileApplicationService(
  projectRoot: string,
  adapters: Partial<RuntimeFileAdapters> & { artifactProvider?: FileProvider } = {},
) {
  const runtime = { ...defaults, ...adapters }
  const archive = lazyProvider(() => (
    createArchiveFileProvider(projectRoot, runtime.loadArchiveManifest(projectRoot))
  ))
  const source = lazyProvider(() => createSourceFileProvider(runtime.loadSourceManifest(projectRoot)))
  const artifact = adapters.artifactProvider ?? createRuntimeArtifactFileProvider(projectRoot)
  return createFileApplicationService({
    providers: { archive, source, artifact },
    limits: { maxArchiveBytes: 512 * 1024 * 1024, maxTextBytes: 5 * 1024 * 1024 },
    adapters: {
      readText: readBoundedUtf8Text,
      inspectFile,
      inspectArchive,
      inspectDatabase: inspectSqlite,
      inspectVoice,
      thumbnail: (target, width, preview) => (
        preview === 'video' ? videoPoster(target, width) : imageThumb(target, width)
      ),
      transcodeVoice,
    },
  })
}
