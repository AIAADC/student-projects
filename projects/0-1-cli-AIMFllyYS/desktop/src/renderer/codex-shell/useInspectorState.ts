import { useState } from 'react';
import { desktopActions } from '../action-catalog';
import type {
  ActiveActionId,
  ClearProcess,
  InspectorTab,
  InstallCategory,
  InstallTarget,
  Mode,
  ReleaseAsset,
  ReleaseInfo,
  SkillPackage,
  SkillTarget,
} from './types';

export function useInspectorState(mode: Mode) {
  const [tab, setTab] = useState<InspectorTab>('tools');
  const [activeAction, setActiveAction] = useState<ActiveActionId>(null);
  const [installTargets, setInstallTargets] = useState<InstallTarget[]>([]);
  const [installCategory, setInstallCategory] = useState<InstallCategory>('cli');
  const [selectedInstallKey, setSelectedInstallKey] = useState<string | null>(null);
  const [installLatest, setInstallLatest] = useState(false);
  const [skillPackages, setSkillPackages] = useState<SkillPackage[]>([]);
  const [skillTargets, setSkillTargets] = useState<SkillTarget[]>([]);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
  const [selectedSkillTargets, setSelectedSkillTargets] = useState<string[]>([]);
  const [clearProcesses, setClearProcesses] = useState<ClearProcess[]>([]);
  const [selectedClearPids, setSelectedClearPids] = useState<number[]>([]);
  const [output, setOutput] = useState('Ready.');
  const [copyStatus, setCopyStatus] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState('Release status not checked.');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);

  async function runCommand(command: string): Promise<void> {
    if (commandBusy || !window.zeroOneCli) return;
    setCommandBusy(true);
    setCopyStatus('');
    try {
      const result = await window.zeroOneCli.runCommand(command);
      setOutput(result.output || (result.ok ? 'Done.' : 'Command failed.'));
    } finally {
      setCommandBusy(false);
    }
  }

  async function openAction(id: string): Promise<void> {
    const action = desktopActions.find((item) => item.id === id);
    if (!action) return;
    setActiveAction(action.id);
    if (!window.zeroOneCli) {
      setOutput('Desktop bridge is unavailable in browser preview.');
      return;
    }
    if (action.kind === 'cli-command') {
      await runCommand(action.command);
      return;
    }
    if (action.kind === 'native-clear') {
      const scan = await window.zeroOneCli.scanClearProcesses();
      setClearProcesses(scan.processes);
      setSelectedClearPids([]);
      setOutput(scan.output || (scan.ok ? 'Process scan completed.' : 'Process scan failed.'));
      return;
    }
    if (action.kind === 'native-skills') {
      const catalog = await window.zeroOneCli.listSkillPackages();
      setSkillPackages(catalog.packages);
      setSkillTargets(catalog.targets);
      setSelectedSkillKey(catalog.packages[0]?.key || null);
      setSelectedSkillTargets(catalog.targets.filter((item) => item.detected).map((item) => item.key).slice(0, 2));
      setOutput('Choose a skill package and targets, then confirm installation.');
      return;
    }
    const targets = await window.zeroOneCli.listInstallTargets();
    setInstallTargets(targets);
    setSelectedInstallKey(targets.find((item) => item.category === installCategory)?.key || null);
    setOutput('Choose an install target, then confirm from the desktop panel.');
  }

  async function refreshClearProcesses(): Promise<void> {
    if (!window.zeroOneCli) return;
    const scan = await window.zeroOneCli.scanClearProcesses();
    setClearProcesses(scan.processes);
    setSelectedClearPids((current) => current.filter((pid) => scan.processes.some((item) => item.pid === pid)));
    setOutput(scan.output || (scan.ok ? 'Process scan completed.' : 'Process scan failed.'));
  }

  function copyOutput(): void {
    void navigator.clipboard.writeText(output);
    setCopyStatus('Copied to clipboard.');
  }

  function openReleaseAsset(asset: ReleaseAsset): void {
    if (!window.zeroOneCli) return;
    void window.zeroOneCli.openReleaseAsset(asset.browserDownloadUrl).then((result) => {
      setReleaseStatus(result.ok ? `Opened ${asset.name}` : (result.error || 'Unable to open release asset.'));
    });
  }

  return {
    activeAction,
    clearProcesses,
    commandBusy,
    copyStatus,
    installCategory,
    installLatest,
    installTargets,
    mode,
    output,
    releaseInfo,
    releaseStatus,
    selectedClearPids,
    selectedInstallKey,
    selectedSkillKey,
    selectedSkillTargets,
    skillPackages,
    skillTargets,
    tab,
    onBack: () => setActiveAction(null),
    onCheckRelease: () => {
      if (!window.zeroOneCli) return;
      void window.zeroOneCli.getLatestRelease().then((release) => {
        setReleaseInfo(release);
        setReleaseStatus(release.ok ? `${release.tagName || release.name || 'Latest release'} - ${(release.assets || []).length} assets` : (release.error || 'Unable to read latest release.'));
      });
    },
    onCopy: copyOutput,
    onInstallCategory: (category: InstallCategory) => {
      setInstallCategory(category);
      setSelectedInstallKey(installTargets.find((item) => item.category === category)?.key || null);
    },
    onInstallLatest: setInstallLatest,
    onKillClear: () => {
      if (!window.zeroOneCli) return;
      void window.zeroOneCli.killClearProcesses({ pids: selectedClearPids, confirm: true }).then((result) => {
        setOutput(result.output);
        void refreshClearProcesses();
      });
    },
    onLaunchAi: () => {
      if (!window.zeroOneCli) return;
      void window.zeroOneCli.launchAiSession({ mode }).then((result) => setOutput(result.output));
    },
    onOpenAction: (id: string) => void openAction(id),
    onOpenAsset: openReleaseAsset,
    onOpenRelease: () => {
      if (!window.zeroOneCli) return;
      void window.zeroOneCli.openLatestRelease().then((result) => setReleaseStatus(result.ok ? `Opened ${result.url}` : (result.error || 'Unable to open release page.')));
    },
    onRefreshClear: () => void refreshClearProcesses(),
    onRunInstall: () => {
      if (!window.zeroOneCli || !selectedInstallKey) return;
      void window.zeroOneCli.runInstallTarget({ key: selectedInstallKey, latest: installLatest, confirm: true }).then((result) => setOutput(result.output));
    },
    onRunSkillInstall: () => {
      if (!window.zeroOneCli || !selectedSkillKey) return;
      void window.zeroOneCli.installSkillPackage({ skillKey: selectedSkillKey, targetKeys: selectedSkillTargets, confirm: true }).then((result) => setOutput(result.output));
    },
    onSelectInstall: setSelectedInstallKey,
    onSelectSkill: setSelectedSkillKey,
    onTab: setTab,
    onToggleClearPid: (pid: number) => setSelectedClearPids((current) => current.includes(pid) ? current.filter((item) => item !== pid) : [...current, pid]),
    onToggleSkillTarget: (key: string) => setSelectedSkillTargets((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]),
  };
}
