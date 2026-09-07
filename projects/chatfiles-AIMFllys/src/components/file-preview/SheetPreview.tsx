import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { fileUrl, type BrowsableFile } from '../../utils/tree'
import { readBlob, readText } from '../../shared/api/client'

type SpreadsheetSheet = {
  name: string
  rows: unknown[][]
}

function xmlChildren(node: ParentNode, localName: string) {
  return Array.from(node.querySelectorAll('*')).filter((item) => item.localName === localName)
}

function xmlDirectChildren(node: Element, localName: string) {
  return Array.from(node.children).filter((item) => item.localName === localName)
}

function xmlText(node: ParentNode, localName: string) {
  return xmlChildren(node, localName)[0]?.textContent ?? ''
}

function columnIndex(cellRef: string) {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A'
  return letters.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function workbookTarget(target: string) {
  const clean = target.replace(/^\/+/, '')
  if (clean.startsWith('xl/')) return clean
  return `xl/${clean}`
}

async function parseXlsxWorkbook(blob: Blob): Promise<SpreadsheetSheet[]> {
  const zip = await JSZip.loadAsync(blob)
  const workbookXml = await zip.file('xl/workbook.xml')?.async('text')
  const relationsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')
  if (!workbookXml || !relationsXml) return []

  const parser = new DOMParser()
  const workbook = parser.parseFromString(workbookXml, 'application/xml')
  const relations = parser.parseFromString(relationsXml, 'application/xml')
  const relationshipTargets = new Map<string, string>()
  xmlChildren(relations, 'Relationship').forEach((relation) => {
    const id = relation.getAttribute('Id')
    const target = relation.getAttribute('Target')
    if (id && target) relationshipTargets.set(id, workbookTarget(target))
  })

  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('text')
  const sharedStrings = sharedStringsXml
    ? xmlChildren(parser.parseFromString(sharedStringsXml, 'application/xml'), 'si').map((item) => xmlChildren(item, 't').map((part) => part.textContent ?? '').join(''))
    : []

  const sheets = await Promise.all(xmlChildren(workbook, 'sheet').map(async (sheet, index) => {
    const relationId = sheet.getAttribute('r:id')
    const sheetPath = relationId ? relationshipTargets.get(relationId) : undefined
    const sheetXml = sheetPath ? await zip.file(sheetPath)?.async('text') : undefined
    if (!sheetXml) return { name: sheet.getAttribute('name') || `Sheet ${index + 1}`, rows: [] }
    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml')
    const rows = xmlChildren(sheetDoc, 'row').map((row) => {
      const values: unknown[] = []
      xmlDirectChildren(row, 'c').forEach((cell) => {
        const type = cell.getAttribute('t')
        const raw = xmlText(cell, 'v')
        let value = raw
        if (type === 'inlineStr') value = xmlChildren(cell, 't').map((part) => part.textContent ?? '').join('')
        if (type === 's') value = sharedStrings[Number(raw)] ?? raw
        values[columnIndex(cell.getAttribute('r') ?? 'A1')] = value
      })
      return values.map((value) => value ?? null)
    })
    return { name: sheet.getAttribute('name') || `Sheet ${index + 1}`, rows }
  }))

  return sheets
}

export function SheetPreview({ file }: { file: BrowsableFile }) {
  const [sheetState, setSheetState] = useState<{ fileId: string; sheets: SpreadsheetSheet[] }>()
  const [activeSheet, setActiveSheet] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    Promise.resolve().then(async () => {
      if (file.ext === '.csv') {
        const text = await readText(fileUrl(file), { signal: controller.signal })
        if (!cancelled) {
          setActiveSheet(0)
          setSheetState({ fileId: file.id, sheets: [{ name: 'CSV', rows: text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',')) }] })
        }
        return
      }
      const blob = await readBlob(fileUrl(file), { signal: controller.signal })
      const workbook = await parseXlsxWorkbook(blob)
      if (!cancelled) {
        setActiveSheet(0)
        setSheetState({ fileId: file.id, sheets: workbook })
      }
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      if (!cancelled) {
        setActiveSheet(0)
        setSheetState({ fileId: file.id, sheets: [{ name: '预览失败', rows: [['表格预览失败，可下载查看。']] }] })
      }
    })
    return () => {
      controller.abort()
      cancelled = true
    }
  }, [file])
  const sheets = sheetState?.fileId === file.id ? sheetState.sheets : []
  const sheet = sheets[activeSheet] ?? sheets[0]
  if (!sheet) return <div className="empty-preview">读取表格中...</div>
  const maxColumns = Math.max(...sheet.rows.map((row) => row.length), 0)
  const visibleRows = sheet.rows.slice(0, 200)
  const visibleColumns = Math.min(maxColumns, 80)
  const isTruncated = sheet.rows.length > visibleRows.length || maxColumns > visibleColumns
  return (
    <div className="sheet-host">
      <header className="sheet-toolbar">
        <div className="sheet-tabs" role="tablist" aria-label="工作表">
          {sheets.map((item, index) => (
            <button
              aria-selected={index === activeSheet}
              className={index === activeSheet ? 'active' : ''}
              key={`${item.name}-${index}`}
              onClick={() => setActiveSheet(index)}
              role="tab"
              type="button"
            >
              {item.name || `Sheet ${index + 1}`}
            </button>
          ))}
        </div>
        <span>{sheet.rows.length.toLocaleString()} 行 · {maxColumns.toLocaleString()} 列</span>
      </header>
      <div className="sheet-table-wrap">
        <table>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row">{rowIndex + 1}</th>
                {Array.from({ length: visibleColumns }).map((_, cellIndex) => (
                  <td key={cellIndex}>{row[cellIndex] == null ? '' : String(row[cellIndex])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isTruncated && (
        <p className="sheet-note">
          为保持浏览流畅，当前预览前 {visibleRows.length.toLocaleString()} 行、前 {visibleColumns.toLocaleString()} 列；完整文件可用右上角下载打开。
        </p>
      )}
    </div>
  )
}
