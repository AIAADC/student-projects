import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { fileIcon, type BrowsableFile, type TreeNode } from '../../utils/tree'

export function TreeView({
  node,
  selected,
  onSelect,
  filter,
}: {
  node: TreeNode
  selected?: string
  onSelect: (file: BrowsableFile) => void
  filter: string
}) {
  const [open, setOpen] = useState(!node.path)
  const q = filter.trim().toLowerCase()
  const visibleFiles = node.files.filter((file) => !q || `${file.name} ${file.archivePath} ${file.sourcePath}`.toLowerCase().includes(q))
  const hasMatchingDescendant = (child: TreeNode): boolean =>
    child.files.some((file) => `${file.name} ${file.sourcePath}`.toLowerCase().includes(q)) ||
    child.children.some(hasMatchingDescendant)
  const visibleChildren = node.children.filter((child) => {
    if (!q) return true
    const haystack = `${child.name} ${child.path}`.toLowerCase()
    return haystack.includes(q) || hasMatchingDescendant(child)
  })

  if (node.path && !visibleFiles.length && !visibleChildren.length) return null

  return (
    <div className="tree-node">
      {node.path && (
        <button className="tree-folder" onClick={() => setOpen((value) => !value)} type="button">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {open ? <FolderOpen size={16} /> : <Folder size={16} />}
          <span>{node.name}</span>
        </button>
      )}
      {(open || q) && (
        <div className={node.path ? 'tree-branch' : undefined}>
          {visibleChildren.map((child) => (
            <TreeView key={child.path} node={child} selected={selected} onSelect={onSelect} filter={filter} />
          ))}
          {visibleFiles.map((file) => (
            <button
              key={file.id}
              className={`tree-file ${selected === file.treeId ? 'selected' : ''}`}
              onClick={() => onSelect(file)}
              type="button"
              title={file.sourcePath}
            >
              {fileIcon(file)}
              <span>{file.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
