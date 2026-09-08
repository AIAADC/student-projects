import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { killDesktopClearProcesses, scanDesktopClearProcesses } from './clear-actions';
import { sendDesktopAiMessage } from './ai-session';
import { runDesktopCli, launchDesktopAiSession } from './cli-runner';
import { getLatestRelease, getReleasePageUrl } from './github-release';
import { listDesktopInstallTargets, runDesktopInstallTarget } from './install-actions';
import { createReleaseAssetAllowlist, isAllowedReleaseAssetUrl, rememberReleaseAssetUrls } from './release-assets';
import { installDesktopSkillPackage, listDesktopSkillCatalog } from './skills-actions';

const releaseAssetUrls = createReleaseAssetAllowlist();

function isAllowedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: '0-1 CLI',
    backgroundColor: '#101113',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    if (!isAllowedRendererUrl(devUrl)) throw new Error('VITE_DEV_SERVER_URL must point to localhost.');
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
}

function isTrustedSender(value: string): boolean {
  return value.startsWith('file:') || isAllowedRendererUrl(value);
}

app.whenReady().then(() => {
  ipcMain.handle('cli:run', (event, command: string) => {
    const senderUrl = event.senderFrame?.url || '';
    if (isTrustedSender(senderUrl)) {
      return runDesktopCli(command);
    }
    return { ok: false, output: 'IPC sender is not trusted.' };
  });
  ipcMain.handle('ai:launch', (event, request?: { mode?: string }) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, output: 'IPC sender is not trusted.' };
    }
    return launchDesktopAiSession(request);
  });
  ipcMain.handle('ai:message', (event, request) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, error: 'IPC sender is not trusted.' };
    }
    // Pass the requesting WebContents so the embedded turn can stream live
    // AgentTurnEvents back over the 'ai:event' channel.
    return sendDesktopAiMessage(request, event.sender);
  });
  ipcMain.handle('release:getLatest', async (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, repo: 'AIMFllyYS/0-1-CLI', error: 'IPC sender is not trusted.' };
    }
    const release = await getLatestRelease();
    rememberReleaseAssetUrls(releaseAssetUrls, release);
    return release;
  });
  ipcMain.handle('release:openLatest', async (event) => {
    const senderUrl = event.senderFrame?.url || '';
    const url = getReleasePageUrl();
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, url, error: 'IPC sender is not trusted.' };
    }
    await shell.openExternal(url);
    return { ok: true, url };
  });
  ipcMain.handle('release:openAsset', async (event, url: string) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, url: typeof url === 'string' ? url : '', error: 'IPC sender is not trusted.' };
    }
    if (!isAllowedReleaseAssetUrl(releaseAssetUrls, url)) {
      return { ok: false, url: typeof url === 'string' ? url : '', error: 'Release asset is not from the latest GitHub release.' };
    }
    await shell.openExternal(url);
    return { ok: true, url };
  });
  ipcMain.handle('desktop-install:list', (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) return [];
    return listDesktopInstallTargets();
  });
  ipcMain.handle('desktop-install:run', (event, request) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, output: 'IPC sender is not trusted.' };
    }
    return runDesktopInstallTarget(request);
  });
  ipcMain.handle('desktop-skills:list', (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) return { packages: [], targets: [] };
    return listDesktopSkillCatalog();
  });
  ipcMain.handle('desktop-skills:install', (event, request) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, output: 'IPC sender is not trusted.' };
    }
    return installDesktopSkillPackage(request);
  });
  ipcMain.handle('desktop-clear:scan', (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, processes: [], total: 0, filtered: 0, output: 'IPC sender is not trusted.' };
    }
    return scanDesktopClearProcesses();
  });
  ipcMain.handle('desktop-clear:kill', (event, request) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, output: 'IPC sender is not trusted.' };
    }
    return killDesktopClearProcesses(request);
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
