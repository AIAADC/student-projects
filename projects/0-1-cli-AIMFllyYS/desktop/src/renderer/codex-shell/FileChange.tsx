import React from 'react';
import type { FileChange as FileChangeData } from './types';

function operationLabel(op: string): string {
  switch (op) {
    case 'create':
      return 'New file';
    case 'delete':
      return 'Deleted';
    case 'rename':
      return 'Renamed';
    default:
      return 'Edited';
  }
}

/**
 * Claude-style file change card: path header, operation badge, +/- counts,
 * and, when per-line hunks are present, a diff grid with
 * [marker][right-aligned lineno][code] rows tinted by the diff palette.
 */
export function FileChangeCard(props: { file: FileChangeData }): React.ReactElement {
  const { file } = props;
  const added = file.added ?? 0;
  const removed = file.removed ?? 0;

  return (
    <div className="fileChange">
      <header className="fileChangeHeader">
        <span className={`fileChangeBadge op-${file.operation}`}>{operationLabel(file.operation)}</span>
        <code className="fileChangePath" title={file.path}>
          {file.path}
        </code>
        <span className="fileChangeCounts">
          {added > 0 && <em className="added">+{added}</em>}
          {removed > 0 && <em className="removed">-{removed}</em>}
          {added === 0 && removed === 0 && file.changed ? <em className="changed">~{file.changed}</em> : null}
        </span>
      </header>
      {file.hunks && file.hunks.length > 0 && (
        <div className="diffGrid" role="table" aria-label={`Diff for ${file.path}`}>
          {file.hunks.map((line, index) => (
            <div
              key={index}
              role="row"
              className={
                line.marker === '+'
                  ? 'diffRow diffAdded'
                  : line.marker === '-'
                    ? 'diffRow diffRemoved'
                    : 'diffRow'
              }
            >
              <span className="diffMarker" role="cell">
                {line.marker === ' ' ? '' : line.marker}
              </span>
              <span className="diffLineNo" role="cell">
                {line.lineNo ?? ''}
              </span>
              <span className="diffCode" role="cell">
                {line.code}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
