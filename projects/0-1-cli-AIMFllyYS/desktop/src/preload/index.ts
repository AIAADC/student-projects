import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { validateDesktopCommand } from '../main/permissions';

contextBridge.exposeInMainWorld('zeroOneCli', {
  runCommand: (command: string) => {
    const validation = validateDesktopCommand(command);
    if (!validation.allowed) {
      return Promise.resolve({ ok: false, output: validation.reason || `Command not allowed: ${command}` });
    }
    return ipcRenderer.invoke('cli:run', command);
  },
  launchAiSession: (request?: { mode?: 'chat' | 'agent' | 'plan' }) => ipcRenderer.invoke('ai:launch', request || {}),
  sendAiMessage: (request: {
    sessionId: string;
    mode: 'chat' | 'agent' | 'plan';
    text: string;
  }) => ipcRenderer.invoke('ai:message', request),
  // Subscribe to live agent progress streamed during an ai:message turn.
  // Returns an unsubscribe function. ipcRenderer itself is never exposed.
  onAiEvent: (callback: (payload: { sessionId: string; event: unknown; file?: unknown }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: { sessionId: string; event: unknown; file?: unknown }) => {
      callback(payload);
    };
    ipcRenderer.on('ai:event', listener);
    return () => {
      ipcRenderer.removeListener('ai:event', listener);
    };
  },
  getLatestRelease: () => ipcRenderer.invoke('release:getLatest'),
  openLatestRelease: () => ipcRenderer.invoke('release:openLatest'),
  openReleaseAsset: (url: string) => ipcRenderer.invoke('release:openAsset', url),
  listInstallTargets: () => ipcRenderer.invoke('desktop-install:list'),
  runInstallTarget: (request: { key: string; latest?: boolean; confirm?: boolean }) => ipcRenderer.invoke('desktop-install:run', request),
  listSkillPackages: () => ipcRenderer.invoke('desktop-skills:list'),
  installSkillPackage: (request: { skillKey: string; targetKeys: string[]; confirm?: boolean }) => ipcRenderer.invoke('desktop-skills:install', request),
  scanClearProcesses: () => ipcRenderer.invoke('desktop-clear:scan'),
  killClearProcesses: (request: { pids: number[]; confirm?: boolean }) => ipcRenderer.invoke('desktop-clear:kill', request),
});
