export function isArtifactPageRequestCurrent(
  requestScope: string,
  activeScope: string,
) {
  return requestScope === activeScope
}

export function canLoadMoreArtifacts(input: {
  loading: boolean
  loadingMore: boolean
  loadMoreError: string
  itemCount: number
  matchingTotal: number
}) {
  return !input.loading
    && !input.loadingMore
    && input.itemCount < input.matchingTotal
}
