const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'cd desktop && npx tsc -p tsconfig.json'], { stdio: 'pipe' });

function readRenderer() {
  return [
    path.join('desktop', 'src', 'renderer', 'App.tsx'),
    path.join('desktop', 'src', 'renderer', 'codex-shell', 'CodexShell.tsx'),
    path.join('desktop', 'src', 'renderer', 'codex-shell', 'useConversationState.ts'),
    path.join('desktop', 'src', 'renderer', 'codex-shell', 'useInspectorState.ts'),
    path.join('desktop', 'src', 'renderer', 'codex-shell', 'InspectorPane.tsx'),
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

test('release asset allowlist is populated only from latest release assets', () => {
  const {
    createReleaseAssetAllowlist,
    rememberReleaseAssetUrls,
    isAllowedReleaseAssetUrl,
  } = require('../desktop/dist/main/release-assets');

  const allowlist = createReleaseAssetAllowlist();
  const firstUrl = 'https://github.com/AIMFllyYS/0-1-CLI/releases/download/v1/Zero-One.exe';
  const secondUrl = 'https://github.com/AIMFllyYS/0-1-CLI/releases/download/v2/Zero-One.dmg';

  rememberReleaseAssetUrls(allowlist, {
    ok: true,
    assets: [
      { name: 'Zero-One.exe', browserDownloadUrl: firstUrl, size: 1024 },
      { name: 'empty-url.zip', browserDownloadUrl: '', size: 0 },
    ],
  });

  assert.equal(isAllowedReleaseAssetUrl(allowlist, firstUrl), true);
  assert.equal(isAllowedReleaseAssetUrl(allowlist, secondUrl), false);
  assert.equal(isAllowedReleaseAssetUrl(allowlist, 42), false);

  rememberReleaseAssetUrls(allowlist, {
    ok: true,
    assets: [{ name: 'Zero-One.dmg', browserDownloadUrl: secondUrl, size: 2048 }],
  });

  assert.equal(isAllowedReleaseAssetUrl(allowlist, firstUrl), false);
  assert.equal(isAllowedReleaseAssetUrl(allowlist, secondUrl), true);

  rememberReleaseAssetUrls(allowlist, { ok: false, error: 'GitHub API 404' });
  assert.equal(isAllowedReleaseAssetUrl(allowlist, secondUrl), false);
});

test('desktop release workflow installs deps and publishes release assets', () => {
  const workflow = fs.readFileSync(path.join('.github', 'workflows', 'desktop-release.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /release:\s*\r?\n\s*types: \[created\]/);
  assert.match(workflow, /npm install/);
  assert.doesNotMatch(workflow, /npm ci/);
  assert.match(workflow, /desktop:dist:win/);
  assert.match(workflow, /desktop:dist:mac/);
  assert.match(workflow, /upload-artifact/);
  assert.match(workflow, /softprops\/action-gh-release/);
  assert.match(workflow, /if: github\.event_name == 'release'/);
  assert.match(workflow, /fail_on_unmatched_files: false/);
  assert.match(workflow, /desktop\/release\/\*\.exe/);
  assert.match(workflow, /desktop\/release\/\*\.dmg/);
  assert.match(workflow, /desktop\/release\/\*\.zip/);
  assert.match(workflow, /desktop\/release\/latest\*\.yml/);
});

test('copy-cli bundles runtime dependencies for packaged desktop', () => {
  const copyScript = fs.readFileSync(path.join('desktop', 'scripts', 'copy-cli.cjs'), 'utf8');

  assert.match(copyScript, /Root CLI dist\/index\.js is missing/);
  assert.match(copyScript, /0-1-cli-runtime/);
  assert.match(copyScript, /--omit=dev/);
  assert.match(copyScript, /--ignore-scripts/);
  assert.match(copyScript, /Bundled CLI runtime index\.js is missing after copy/);
  assert.match(copyScript, /Bundled CLI runtime dependencies are missing after npm install/);
});

test('electron-builder targets github release output', () => {
  const builder = fs.readFileSync(path.join('desktop', 'electron-builder.yml'), 'utf8');

  assert.match(builder, /provider: github/);
  assert.match(builder, /releaseType: release/);
  assert.match(builder, /nsis/);
  assert.match(builder, /dmg/);
  assert.match(builder, /zip/);
  assert.match(builder, /artifactName:/);
});

test('github release reader maps downloadable assets without hardcoded tokens', () => {
  const release = fs.readFileSync(path.join('desktop', 'src', 'main', 'github-release.ts'), 'utf8');
  const main = fs.readFileSync(path.join('desktop', 'src', 'main', 'main.ts'), 'utf8');
  const renderer = readRenderer();

  assert.match(release, /browser_download_url/);
  assert.match(release, /releases\/latest/);
  assert.doesNotMatch(release, /ghp_[A-Za-z0-9_]+/);
  assert.match(main, /release:getLatest/);
  assert.match(main, /rememberReleaseAssetUrls/);
  assert.match(renderer, /getLatestRelease/);
  assert.match(renderer, /openReleaseAsset/);
  assert.match(renderer, /browserDownloadUrl/);
});
