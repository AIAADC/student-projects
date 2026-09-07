import { useState } from 'react'
import { fileUrl, type BrowsableFile } from '../../utils/tree'
import { GenericFileInspector } from './GenericInspector'

export function ImageFilePreview({ file }: { file: BrowsableFile }) {
  const [failedFileId, setFailedFileId] = useState('')
  if (failedFileId === file.id) return <GenericFileInspector file={file} />
  return <img className="image-preview" src={fileUrl(file)} alt={file.name} onError={() => setFailedFileId(file.id)} />
}
