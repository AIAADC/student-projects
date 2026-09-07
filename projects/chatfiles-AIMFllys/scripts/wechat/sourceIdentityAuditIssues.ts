import type {
  MutableIssue,
  OutputMessage,
  SourceIdentityAuditIssue,
  SourceIdentityAuditResult,
} from './sourceIdentityAuditTypes.js'

const issueDetails: Readonly<Record<string, string>> = {
  'source-output-schema-missing-column': 'The output database is missing columns required for source alignment.',
  'source-conversation-missing': 'An output message does not resolve to its conversation metadata.',
  'source-conversation-id-mismatch': 'The output conversation id is not the canonical owner/username identity.',
  'source-conversation-snapshot-mismatch': 'A message source snapshot differs from its conversation snapshot.',
  'source-conversation-display-mismatch': 'The conversation display differs from the source snapshot contact display.',
  'source-contact-unreadable': 'The source snapshot contact database cannot be read for display verification.',
  'source-path-invalid': 'Output provenance contains a snapshot or shard name that is not one path segment.',
  'source-shard-missing': 'The source message database named by output provenance does not exist.',
  'source-shard-unreadable': 'The source message database or its shard-local Name2Id table cannot be read.',
  'source-table-missing': 'The message table named by output provenance is absent from its source shard.',
  'source-message-table-mismatch': 'The output message table is not the UTF-8 username-derived source table.',
  'source-table-unreadable': 'The message table named by output provenance cannot be read as a batch.',
  'source-row-missing': 'No source row has the local_id named by the output message.',
  'source-row-ambiguous': 'More than one source row has the same local_id in one source table.',
  'source-server-id-mismatch': 'The output server_id differs from the exact source value.',
  'source-raw-type-mismatch': 'The output raw_type differs from the exact 64-bit source value.',
  'source-time-mismatch': 'The output time differs from the source create_time.',
  'source-sort-seq-mismatch': 'The output sort_seq differs from the source sort_seq.',
  'source-sender-mismatch': 'The output sender differs from the sender resolved in the same source shard.',
  'source-sender-name-mismatch': 'The output sender_name differs from the source snapshot contact display.',
  'source-group-prefix-mismatch': 'The output group sender_prefix differs from the prefix in the source body.',
  'source-text-mismatch': 'The output text differs from text normalized from the exact source content.',
  'source-content-decode-failed': 'Source message bytes cannot be decoded as strict UTF-8 for prefix verification.',
}

export function emptyMetrics(): SourceIdentityAuditResult['metrics'] {
  return {
    outputConversations: 0,
    matchedConversationDisplays: 0,
    outputMessages: 0,
    matchedMessages: 0,
    sourceShards: 0,
    sourceTables: 0,
    sourceRowsScanned: 0,
    outputReplacementCharacters: 0,
    sourceVerifiedReplacementCharacters: 0,
  }
}

export function addIssue(
  issues: Map<string, MutableIssue>,
  code: string,
  count: number,
  sample?: string,
) {
  if (count <= 0) return
  const issue = issues.get(code) ?? {
    count: 0,
    detail: issueDetails[code] ?? code,
    samples: [],
  }
  issue.count += count
  if (sample && issue.samples.length < 5 && !issue.samples.includes(sample)) issue.samples.push(sample)
  issues.set(code, issue)
}

export function finalIssues(issues: ReadonlyMap<string, MutableIssue>): SourceIdentityAuditIssue[] {
  return [...issues].map(([code, issue]) => ({ code, ...issue }))
}

export function evidence(message: OutputMessage) {
  return `${message.sourceSnapshot}/${message.sourceDb}/${message.sourceTable}/${message.localId} (${message.messageUid})`
}

export function fieldSample(message: OutputMessage, output: string | number, source: string | number) {
  return `${evidence(message)} output=${String(output)} source=${String(source)}`
}

export function countReplacementCharacters(value: string) {
  let count = 0
  for (const character of value) {
    if (character === '\uFFFD') count++
  }
  return count
}
