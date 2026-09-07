import type { SourceInventoryUnit } from './sourceDatabaseAdapter.js'

type SourceEvidence = { sourceDb: string; sourceTable: string }

function key(value: SourceEvidence) {
  return `${value.sourceDb}\u0000${value.sourceTable}`
}

export function createInventoryLedger(units: readonly SourceInventoryUnit[]) {
  const rows = units.map((unit) => ({ ...unit }))
  const byEvidence = new Map(rows.map((row) => [key(row), row]))

  function increment(field: 'deduplicatedRows' | 'parsedRows', messages: readonly SourceEvidence[]) {
    for (const message of messages) {
      const unit = byEvidence.get(key(message))
      if (!unit) throw new Error(`Source inventory is missing ${message.sourceDb}/${message.sourceTable}`)
      unit[field] += 1
    }
  }

  return {
    recordDeduplicated: (messages: readonly SourceEvidence[]) => increment('deduplicatedRows', messages),
    recordParsed: (messages: readonly SourceEvidence[]) => increment('parsedRows', messages),
    finish() {
      for (const row of rows) {
        const accounted = row.parsedRows + row.deduplicatedRows + row.excludedRows
        if (accounted < row.discoveredRows) {
          row.excludedRows += row.discoveredRows - accounted
          row.exclusionReason ??= 'conversation_unresolved_or_unselected'
        }
        if (row.discoveredRows !== row.parsedRows + row.deduplicatedRows + row.excludedRows) {
          throw new Error(`Source inventory count mismatch for ${row.sourceDb}/${row.sourceTable}`)
        }
      }
      return rows
    },
  }
}
