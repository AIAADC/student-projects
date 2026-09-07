import React from 'react';
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

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'size unknown';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function InspectorPane(props: {
  tab: InspectorTab;
  activeAction: ActiveActionId;
  output: string;
  copyStatus: string;
  commandBusy: boolean;
  mode: Mode;
  releaseStatus: string;
  releaseInfo: ReleaseInfo | null;
  installTargets: InstallTarget[];
  installCategory: InstallCategory;
  selectedInstallKey: string | null;
  installLatest: boolean;
  skillPackages: SkillPackage[];
  skillTargets: SkillTarget[];
  selectedSkillKey: string | null;
  selectedSkillTargets: string[];
  clearProcesses: ClearProcess[];
  selectedClearPids: number[];
  onTab: (tab: InspectorTab) => void;
  onOpenAction: (id: string) => void;
  onCopy: () => void;
  onBack: () => void;
  onInstallCategory: (category: InstallCategory) => void;
  onSelectInstall: (key: string) => void;
  onInstallLatest: (latest: boolean) => void;
  onRunInstall: () => void;
  onSelectSkill: (key: string) => void;
  onToggleSkillTarget: (key: string) => void;
  onRunSkillInstall: () => void;
  onRefreshClear: () => void;
  onToggleClearPid: (pid: number) => void;
  onKillClear: () => void;
  onLaunchAi: () => void;
  onCheckRelease: () => void;
  onOpenRelease: () => void;
  onOpenAsset: (asset: ReleaseAsset) => void;
}): React.ReactElement {
  return (
    <aside className="inspectorPane">
      <nav className="inspectorTabs">
        {(['plan', 'tools', 'diff', 'preview', 'settings'] as InspectorTab[]).map((tab) => (
          <button key={tab} type="button" className={props.tab === tab ? 'selected' : ''} onClick={() => props.onTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>
      <section className="inspectorContent">
        {props.tab === 'tools' && props.activeAction === null && (
          <div className="commandGrid">
            {desktopActions.map((action) => (
              <button key={action.id} type="button" className="commandCard" disabled={props.commandBusy} onClick={() => props.onOpenAction(action.id)}>
                <strong>{action.title}</strong>
                <code>{action.command}</code>
                <span>{action.description}</span>
              </button>
            ))}
          </div>
        )}
        {props.tab === 'tools' && props.activeAction === 'install' && (
          <InstallPanel
            category={props.installCategory}
            targets={props.installTargets}
            selectedKey={props.selectedInstallKey}
            latest={props.installLatest}
            onBack={props.onBack}
            onCategory={props.onInstallCategory}
            onSelect={props.onSelectInstall}
            onLatest={props.onInstallLatest}
            onInstall={props.onRunInstall}
          />
        )}
        {props.tab === 'tools' && props.activeAction === 'skills' && (
          <SkillsPanel
            packages={props.skillPackages}
            targets={props.skillTargets}
            selectedSkillKey={props.selectedSkillKey}
            selectedTargetKeys={props.selectedSkillTargets}
            onBack={props.onBack}
            onSelectSkill={props.onSelectSkill}
            onToggleTarget={props.onToggleSkillTarget}
            onInstall={props.onRunSkillInstall}
          />
        )}
        {props.tab === 'tools' && props.activeAction === 'clear' && (
          <ClearPanel
            processes={props.clearProcesses}
            selectedPids={props.selectedClearPids}
            onBack={props.onBack}
            onRefresh={props.onRefreshClear}
            onToggle={props.onToggleClearPid}
            onKill={props.onKillClear}
          />
        )}
        {props.tab === 'plan' && <p className="quietCopy">Plan mode keeps edits locked until an explicit review approves the next step.</p>}
        {props.tab === 'diff' && <p className="quietCopy">File changes and tool results will appear here after agent runs.</p>}
        {props.tab === 'preview' && <p className="quietCopy">Local previews stay isolated from command execution.</p>}
        {props.tab === 'settings' && (
          <SettingsPanel
            mode={props.mode}
            releaseStatus={props.releaseStatus}
            releaseInfo={props.releaseInfo}
            onLaunchAi={props.onLaunchAi}
            onCheckRelease={props.onCheckRelease}
            onOpenRelease={props.onOpenRelease}
            onOpenAsset={props.onOpenAsset}
          />
        )}
      </section>
      <section className="outputPanel">
        <header className="outputHeader">
          <span>{props.commandBusy ? 'Running' : 'Output'}</span>
          <button type="button" disabled={!props.output || props.commandBusy} onClick={props.onCopy}>Copy output</button>
        </header>
        {props.copyStatus && <em>{props.copyStatus}</em>}
        <pre className="output" tabIndex={0}>{props.output}</pre>
      </section>
    </aside>
  );
}

function InstallPanel(props: {
  category: InstallCategory;
  targets: InstallTarget[];
  selectedKey: string | null;
  latest: boolean;
  onBack: () => void;
  onCategory: (category: InstallCategory) => void;
  onSelect: (key: string) => void;
  onLatest: (latest: boolean) => void;
  onInstall: () => void;
}): React.ReactElement {
  const visibleTargets = props.targets.filter((item) => item.category === props.category);
  const selected = visibleTargets.find((item) => item.key === props.selectedKey) || visibleTargets[0];
  return (
    <div className="toolPanel">
      <PanelHeader title="Install tools" onBack={props.onBack} />
      <div className="categorySwitch">
        {(['cli', 'ide', 'environment'] as InstallCategory[]).map((category) => (
          <button key={category} type="button" className={props.category === category ? 'selected' : ''} onClick={() => props.onCategory(category)}>
            {category}
          </button>
        ))}
      </div>
      <div className="choiceList">
        {visibleTargets.map((target) => (
          <button key={target.key} type="button" className={props.selectedKey === target.key ? 'choiceRow selectedTarget' : 'choiceRow'} onClick={() => props.onSelect(target.key)}>
            <strong>{target.displayName}</strong>
            <span>{target.description}</span>
          </button>
        ))}
      </div>
      <label className="checkRow">
        <input type="checkbox" checked={props.latest} onChange={(event) => props.onLatest(event.currentTarget.checked)} />
        <span>Use latest/update path when supported</span>
      </label>
      <div className="confirmStrip">
        <span>{selected ? selected.sourceUrl : 'No targets in this category.'}</span>
        <button type="button" disabled={!selected} onClick={props.onInstall}>Confirm install</button>
      </div>
    </div>
  );
}

function SkillsPanel(props: {
  packages: SkillPackage[];
  targets: SkillTarget[];
  selectedSkillKey: string | null;
  selectedTargetKeys: string[];
  onBack: () => void;
  onSelectSkill: (key: string) => void;
  onToggleTarget: (key: string) => void;
  onInstall: () => void;
}): React.ReactElement {
  const selected = props.packages.find((item) => item.key === props.selectedSkillKey) || props.packages[0];
  return (
    <div className="toolPanel">
      <PanelHeader title="Skills market" onBack={props.onBack} />
      <div className="choiceList">
        {props.packages.map((skill) => (
          <button key={skill.key} type="button" className={props.selectedSkillKey === skill.key ? 'choiceRow selectedTarget' : 'choiceRow'} onClick={() => props.onSelectSkill(skill.key)}>
            <strong>{skill.displayName}</strong>
            <span>{skill.description}</span>
            <code>{skill.sourceType}</code>
          </button>
        ))}
      </div>
      <div className="targetChecklist">
        {props.targets.map((target) => (
          <label key={target.key} className="checkRow">
            <input type="checkbox" checked={props.selectedTargetKeys.includes(target.key)} onChange={() => props.onToggleTarget(target.key)} />
            <span>{target.displayName} {target.detected ? '' : '(not detected)'} / {target.path}</span>
          </label>
        ))}
      </div>
      <div className="confirmStrip">
        <span>{selected ? selected.sourceUrl : 'No skill package selected.'}</span>
        <button type="button" disabled={!selected || props.selectedTargetKeys.length === 0} onClick={props.onInstall}>Confirm install</button>
      </div>
    </div>
  );
}

function ClearPanel(props: {
  processes: ClearProcess[];
  selectedPids: number[];
  onBack: () => void;
  onRefresh: () => void;
  onToggle: (pid: number) => void;
  onKill: () => void;
}): React.ReactElement {
  return (
    <div className="toolPanel">
      <PanelHeader title="Clean workstation" onBack={props.onBack} />
      <button type="button" className="secondaryButton" onClick={props.onRefresh}>Scan</button>
      <div className="choiceList">
        {props.processes.length === 0 && <p className="quietCopy">No safe background process candidates found.</p>}
        {props.processes.map((item) => (
          <label key={item.pid} className={props.selectedPids.includes(item.pid) ? 'choiceRow selectedTarget checkChoice' : 'choiceRow checkChoice'}>
            <input type="checkbox" checked={props.selectedPids.includes(item.pid)} onChange={() => props.onToggle(item.pid)} />
            <span>
              <strong>{item.name}</strong>
              <em>PID {item.pid} / {item.memoryMB.toFixed(1)} MB / CPU {item.cpuSeconds.toFixed(1)}s</em>
              <small>{item.reason}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="confirmStrip">
        <span>{props.selectedPids.length} processes selected.</span>
        <button type="button" disabled={props.selectedPids.length === 0} onClick={props.onKill}>Confirm end selected</button>
      </div>
    </div>
  );
}

function SettingsPanel(props: {
  mode: Mode;
  releaseStatus: string;
  releaseInfo: ReleaseInfo | null;
  onLaunchAi: () => void;
  onCheckRelease: () => void;
  onOpenRelease: () => void;
  onOpenAsset: (asset: ReleaseAsset) => void;
}): React.ReactElement {
  return (
    <div className="toolPanel">
      <div className="settingsCopy">
        <p>Use <code>/setting</code> in the CLI or embedded chat to persist base URL, API key, model IDs, and the active model.</p>
        <p>Current mode: <strong>{props.mode}</strong></p>
      </div>
      <button type="button" className="secondaryButton" onClick={props.onLaunchAi}>Open AI terminal</button>
      <div className="settingsSection">
        <h3>Release assets</h3>
        <button type="button" onClick={props.onCheckRelease}>Check latest release</button>
        <button type="button" onClick={props.onOpenRelease}>Open release page</button>
        <span className="releaseStatus">{props.releaseStatus}</span>
        {(props.releaseInfo?.assets || []).map((asset) => (
          <div className="releaseAsset" key={asset.browserDownloadUrl || asset.name}>
            <span>
              <strong>{asset.name}</strong>
              <em>{formatBytes(asset.size)}</em>
            </span>
            <button type="button" onClick={() => props.onOpenAsset(asset)}>Download asset</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeader(props: { title: string; onBack: () => void }): React.ReactElement {
  return (
    <header className="panelHeader">
      <div>
        <p>native desktop action</p>
        <h2>{props.title}</h2>
      </div>
      <button type="button" onClick={props.onBack}>Back</button>
    </header>
  );
}
