import type { DesktopReleaseInfo } from './github-release';

export type ReleaseAssetAllowlist = Set<string>;

export function createReleaseAssetAllowlist(): ReleaseAssetAllowlist {
  return new Set<string>();
}

export function rememberReleaseAssetUrls(allowlist: ReleaseAssetAllowlist, release: Pick<DesktopReleaseInfo, 'ok' | 'assets'>): void {
  allowlist.clear();
  if (!release.ok) return;
  for (const asset of release.assets || []) {
    if (asset.browserDownloadUrl) allowlist.add(asset.browserDownloadUrl);
  }
}

export function isAllowedReleaseAssetUrl(allowlist: ReleaseAssetAllowlist, url: unknown): url is string {
  return typeof url === 'string' && allowlist.has(url);
}
