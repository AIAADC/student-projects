export type ResourceFileCandidate = {
  relativePath: string
  name: string
  size: number
  absolutePath?: string
}

export type ResourceFileIndex = {
  byLookupEvidence: ReadonlyMap<string, readonly ResourceFileCandidate[]>
  byName: ReadonlyMap<string, readonly ResourceFileCandidate[]>
}

export type ResourceFileMatch =
  | {
      status: 'lookup_exact' | 'filename_only'
      candidate: ResourceFileCandidate
      candidates: ResourceFileCandidate[]
    }
  | {
      status: 'ambiguous' | 'missing' | 'size_mismatch'
      candidate: null
      candidates: ResourceFileCandidate[]
    }

const HASH_PATTERN = /(?:^|[^0-9a-f])([0-9a-f]{32})(?=$|[^0-9a-f])/giu

function compareCandidate(left: ResourceFileCandidate, right: ResourceFileCandidate) {
  return left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0
}

function appendIndex(
  index: Map<string, ResourceFileCandidate[]>,
  key: string,
  candidate: ResourceFileCandidate,
) {
  const values = index.get(key) ?? []
  if (!values.some((item) => item.relativePath === candidate.relativePath)) {
    values.push(candidate)
    values.sort(compareCandidate)
  }
  index.set(key, values)
}

export function createResourceFileIndex(
  candidates: readonly ResourceFileCandidate[],
): ResourceFileIndex {
  const byLookupEvidence = new Map<string, ResourceFileCandidate[]>()
  const byName = new Map<string, ResourceFileCandidate[]>()
  for (const candidate of candidates) {
    appendIndex(byName, candidate.name.toLowerCase(), candidate)
    for (const match of candidate.name.matchAll(HASH_PATTERN)) {
      const hash = match[1]
      if (hash) appendIndex(byLookupEvidence, hash.toLowerCase(), candidate)
    }
  }
  return { byLookupEvidence, byName }
}

function collectCandidates(
  index: ReadonlyMap<string, readonly ResourceFileCandidate[]>,
  keys: readonly string[],
) {
  const candidates = new Map<string, ResourceFileCandidate>()
  for (const key of keys) {
    for (const candidate of index.get(key.toLowerCase()) ?? []) {
      candidates.set(candidate.relativePath, candidate)
    }
  }
  return [...candidates.values()].sort(compareCandidate)
}

function matchBySize(candidates: ResourceFileCandidate[], expectedSize: number) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) return candidates
  return candidates.filter((candidate) => candidate.size === expectedSize)
}

export function matchResourceFile(
  index: ResourceFileIndex,
  evidence: {
    lookupEvidence: readonly string[]
    filenames: readonly string[]
    expectedSize: number
  },
): ResourceFileMatch {
  const source = evidence.lookupEvidence.length > 0 ? 'lookup' : 'filename'
  const candidates = source === 'lookup'
    ? collectCandidates(index.byLookupEvidence, evidence.lookupEvidence)
    : collectCandidates(index.byName, evidence.filenames)
  if (candidates.length === 0) {
    return { status: 'missing', candidate: null, candidates: [] }
  }

  const sized = matchBySize(candidates, evidence.expectedSize)
  if (sized.length === 0) {
    return { status: 'size_mismatch', candidate: null, candidates }
  }
  if (sized.length > 1) {
    return { status: 'ambiguous', candidate: null, candidates: sized }
  }
  const candidate = sized[0]
  if (!candidate) return { status: 'missing', candidate: null, candidates: [] }
  return {
    status: source === 'lookup' ? 'lookup_exact' : 'filename_only',
    candidate,
    candidates: [candidate],
  }
}
