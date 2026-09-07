/**
 * Unified versioned-file migration (#169).
 *
 * All six data files (index/links/groups/stats/manifest/backup-manifest)
 * have a `version` field. Before this module each reader handled version
 * mismatch differently (throw, silent-reset, ignore). This module
 * provides a single chain-migration helper so every reader behaves the
 * same way:
 *   - version < current → walk the migration chain upward
 *   - version === current → pass through
 *   - version > current → throw (downgrade not supported)
 *   - structure invalid → throw
 */

export interface MigrationStep<T> {
  from: number;
  to: number;
  up: (data: T) => T;
}

export interface MigrateOptions<T> {
  current: number;
  chain: MigrationStep<T>[];
  label: string;
}

/**
 * Apply forward migrations to bring `data` from its declared version
 * to `opts.current`. Returns the migrated data with `version` set to
 * `opts.current`.
 *
 * @throws if `data.version > opts.current` (downgrade)
 * @throws if a required migration step is missing from the chain
 */
export function migrateVersionedData<T extends { version: number }>(
  data: T,
  opts: MigrateOptions<T>,
): T {
  if (data.version === opts.current) return data;

  if (data.version > opts.current) {
    throw new Error(
      `${opts.label} 版本过高: ${data.version} (当前支持 ${opts.current})，请升级 skills-hub`,
    );
  }

  let current = { ...data };
  while (current.version < opts.current) {
    const step = opts.chain.find((s) => s.from === current.version);
    if (!step) {
      throw new Error(
        `${opts.label} 缺少从 v${current.version} 到 v${current.version + 1} 的迁移路径`,
      );
    }
    current = step.up(current);
    current = { ...current, version: step.to };
  }
  return current;
}
