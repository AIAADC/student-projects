import React, { useEffect, useState } from 'react';
import { desktopActions } from '../action-catalog';
import type { DesktopAction } from '../action-catalog';
import { useInspectorState } from './useInspectorState';
import type {
  ClearProcess,
  InstallCategory,
  InstallTarget,
  Mode,
  SkillPackage,
  SkillTarget,
} from './types';

/**
 * Modal drawer that runs the classic "0-1 CLI" commands GUI-style. Native
 * actions (install/skills/clear) reuse useInspectorState's IPC wiring with
 * explicit confirmation; cli-command actions (state/api/pay) run via
 * runCommand and show their output here.
 */
export function CommandPanel(props: {
  action: DesktopAction;
  mode: Mode;
  onClose: () => void;
}): React.ReactElement {
  const inspector = useInspectorState(props.mode);
  const [confirming, setConfirming] = useState(false);

  // Open the action exactly once when the modal mounts.
  useEffect(() => {
    inspector.onOpenAction(props.action.id);
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.action.id]);

  const isNative = props.action.kind !== 'cli-command';

  return (
    <div className="commandModalOverlay" role="dialog" aria-modal="true" aria-label={props.action.title} onMouseDown={props.onClose}>
      <div className="commandModal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="commandModalHeader">
          <div>
            <code className="commandModalCmd">{props.action.command}</code>
            <h2>{props.action.title}</h2>
            <p>{props.action.description}</p>
          </div>
          <button type="button" className="commandModalClose" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </header>

        <div className="commandModalBody">
          {props.action.id === 'install' && (
            <InstallBody
              category={inspector.installCategory}
              targets={inspector.installTargets}
              selectedKey={inspector.selectedInstallKey}
              latest={inspector.installLatest}
              confirming={confirming}
              onConfirming={setConfirming}
              onCategory={inspector.onInstallCategory}
              onSelect={inspector.onSelectInstall}
              onLatest={inspector.onInstallLatest}
              onRun={inspector.onRunInstall}
            />
          )}
          {props.action.id === 'skills' && (
            <SkillsBody
              packages={inspector.skillPackages}
              targets={inspector.skillTargets}
              selectedSkillKey={inspector.selectedSkillKey}
              selectedTargetKeys={inspector.selectedSkillTargets}
              confirming={confirming}
              onConfirming={setConfirming}
              onSelectSkill={inspector.onSelectSkill}
              onToggleTarget={inspector.onToggleSkillTarget}
              onRun={inspector.onRunSkillInstall}
            />
          )}
          {props.action.id === 'clear' && (
            <ClearBody
              processes={inspector.clearProcesses}
              selectedPids={inspector.selectedClearPids}
              confirming={confirming}
              onConfirming={setConfirming}
              onRefresh={inspector.onRefreshClear}
              onToggle={inspector.onToggleClearPid}
              onKill={inspector.onKillClear}
            />
          )}
          {!isNative && (
            <p className="commandRunHint">
              Runs the whitelisted <code>{props.action.command}</code> command and shows its output below.
            </p>
          )}
        </div>

        <section className="commandOutput" aria-label="Command output">
          <header>
            <span className={inspector.commandBusy ? 'commandOutputStatus running' : 'commandOutputStatus'}>
              {inspector.commandBusy ? 'Running…' : 'Output'}
            </span>
            <button type="button" disabled={!inspector.output || inspector.commandBusy} onClick={inspector.onCopy}>
              Copy
            </button>
          </header>
          {inspector.copyStatus && <em className="commandCopyStatus">{inspector.copyStatus}</em>}
          <pre tabIndex={0}>{inspector.output}</pre>
        </section>
      </div>
    </div>
  );
}

/**
 * Two-step confirmation gate. The first click arms; the second click within the
 * armed state actually fires the IPC. This keeps the explicit-confirm safety
 * contract intact GUI-side.
 */
function ConfirmButton(props: {
  label: string;
  armedLabel: string;
  disabled?: boolean;
  confirming: boolean;
  onConfirming: (value: boolean) => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={props.confirming ? 'confirmAction armed' : 'confirmAction'}
      disabled={props.disabled}
      onClick={() => {
        if (props.confirming) {
          props.onConfirm();
          props.onConfirming(false);
        } else {
          props.onConfirming(true);
        }
      }}
    >
      {props.confirming ? props.armedLabel : props.label}
    </button>
  );
}

function InstallBody(props: {
  category: InstallCategory;
  targets: InstallTarget[];
  selectedKey: string | null;
  latest: boolean;
  confirming: boolean;
  onConfirming: (value: boolean) => void;
  onCategory: (category: InstallCategory) => void;
  onSelect: (key: string) => void;
  onLatest: (latest: boolean) => void;
  onRun: () => void;
}): React.ReactElement {
  const visible = props.targets.filter((item) => item.category === props.category);
  const selected = visible.find((item) => item.key === props.selectedKey) || visible[0];
  return (
    <div className="panelStack">
      <div className="segmented">
        {(['cli', 'ide', 'environment'] as InstallCategory[]).map((category) => (
          <button key={category} type="button" className={props.category === category ? 'selected' : ''} onClick={() => props.onCategory(category)}>
            {category}
          </button>
        ))}
      </div>
      <div className="choiceList">
        {visible.map((target) => (
          <button
            key={target.key}
            type="button"
            className={props.selectedKey === target.key ? 'choiceRow selectedTarget' : 'choiceRow'}
            onClick={() => props.onSelect(target.key)}
          >
            <strong>{target.displayName}</strong>
            <span>{target.description}</span>
          </button>
        ))}
        {visible.length === 0 && <p className="quietCopy">No install targets in this category.</p>}
      </div>
      <label className="checkRow">
        <input type="checkbox" checked={props.latest} onChange={(event) => props.onLatest(event.currentTarget.checked)} />
        <span>Use latest / update path when supported</span>
      </label>
      <div className="confirmStrip">
        <span>{selected ? selected.sourceUrl : 'No target selected.'}</span>
        <ConfirmButton
          label="Install"
          armedLabel="Click to confirm install"
          disabled={!selected}
          confirming={props.confirming}
          onConfirming={props.onConfirming}
          onConfirm={props.onRun}
        />
      </div>
    </div>
  );
}

function SkillsBody(props: {
  packages: SkillPackage[];
  targets: SkillTarget[];
  selectedSkillKey: string | null;
  selectedTargetKeys: string[];
  confirming: boolean;
  onConfirming: (value: boolean) => void;
  onSelectSkill: (key: string) => void;
  onToggleTarget: (key: string) => void;
  onRun: () => void;
}): React.ReactElement {
  const selected = props.packages.find((item) => item.key === props.selectedSkillKey) || props.packages[0];
  return (
    <div className="panelStack">
      <div className="choiceList">
        {props.packages.map((skill) => (
          <button
            key={skill.key}
            type="button"
            className={props.selectedSkillKey === skill.key ? 'choiceRow selectedTarget' : 'choiceRow'}
            onClick={() => props.onSelectSkill(skill.key)}
          >
            <strong>{skill.displayName}</strong>
            <span>{skill.description}</span>
            <code>{skill.sourceType}</code>
          </button>
        ))}
        {props.packages.length === 0 && <p className="quietCopy">No skill packages available.</p>}
      </div>
      <div className="targetChecklist">
        {props.targets.map((target) => (
          <label key={target.key} className="checkRow">
            <input type="checkbox" checked={props.selectedTargetKeys.includes(target.key)} onChange={() => props.onToggleTarget(target.key)} />
            <span>
              {target.displayName} {target.detected ? '' : '(not detected)'} · <code>{target.path}</code>
            </span>
          </label>
        ))}
      </div>
      <div className="confirmStrip">
        <span>{selected ? selected.sourceUrl : 'No skill package selected.'}</span>
        <ConfirmButton
          label="Install skill"
          armedLabel="Click to confirm install"
          disabled={!selected || props.selectedTargetKeys.length === 0}
          confirming={props.confirming}
          onConfirming={props.onConfirming}
          onConfirm={props.onRun}
        />
      </div>
    </div>
  );
}

function ClearBody(props: {
  processes: ClearProcess[];
  selectedPids: number[];
  confirming: boolean;
  onConfirming: (value: boolean) => void;
  onRefresh: () => void;
  onToggle: (pid: number) => void;
  onKill: () => void;
}): React.ReactElement {
  return (
    <div className="panelStack">
      <button type="button" className="secondaryButton" onClick={props.onRefresh}>
        Re-scan processes
      </button>
      <div className="choiceList">
        {props.processes.length === 0 && <p className="quietCopy">No safe background process candidates found.</p>}
        {props.processes.map((item) => (
          <label key={item.pid} className={props.selectedPids.includes(item.pid) ? 'choiceRow selectedTarget checkChoice' : 'choiceRow checkChoice'}>
            <input type="checkbox" checked={props.selectedPids.includes(item.pid)} onChange={() => props.onToggle(item.pid)} />
            <span>
              <strong>{item.name}</strong>
              <em>
                PID {item.pid} · {item.memoryMB.toFixed(1)} MB · CPU {item.cpuSeconds.toFixed(1)}s
              </em>
              <small>{item.reason}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="confirmStrip">
        <span>{props.selectedPids.length} process(es) selected.</span>
        <ConfirmButton
          label="End selected"
          armedLabel="Click to confirm end"
          disabled={props.selectedPids.length === 0}
          confirming={props.confirming}
          onConfirming={props.onConfirming}
          onConfirm={props.onKill}
        />
      </div>
    </div>
  );
}

export const COMMAND_ACTIONS = desktopActions;
