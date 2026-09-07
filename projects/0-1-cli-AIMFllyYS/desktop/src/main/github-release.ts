import * as https from 'https';

export interface DesktopReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface DesktopReleaseInfo {
  ok: boolean;
  repo: 'AIMFllyYS/0-1-CLI';
  tagName?: string;
  name?: string;
  htmlUrl?: string;
  publishedAt?: string;
  assets?: DesktopReleaseAsset[];
  error?: string;
}

const REPO = 'AIMFllyYS/0-1-CLI' as const;
const LATEST_RELEASE_API = 'https://api.github.com/repos/AIMFllyYS/0-1-CLI/releases/latest';
const RELEASE_PAGE = 'https://github.com/AIMFllyYS/0-1-CLI/releases/latest';

function requestJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': '0-1-cli-desktop',
    };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GitHub API ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('GitHub response parse failed'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('GitHub request timed out'));
    });
  });
}

export function getReleasePageUrl(): string {
  return RELEASE_PAGE;
}

export async function getLatestRelease(): Promise<DesktopReleaseInfo> {
  try {
    const release = await requestJson(LATEST_RELEASE_API);
    return {
      ok: true,
      repo: REPO,
      tagName: release.tag_name,
      name: release.name,
      htmlUrl: release.html_url || RELEASE_PAGE,
      publishedAt: release.published_at,
      assets: Array.isArray(release.assets)
        ? release.assets.map((asset: any) => ({
            name: String(asset.name || ''),
            browserDownloadUrl: String(asset.browser_download_url || ''),
            size: Number(asset.size || 0),
          }))
        : [],
    };
  } catch (error: any) {
    return {
      ok: false,
      repo: REPO,
      htmlUrl: RELEASE_PAGE,
      error: error?.message || 'Unable to read latest release',
    };
  }
}
