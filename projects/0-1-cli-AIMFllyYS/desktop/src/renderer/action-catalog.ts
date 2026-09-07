export type DesktopActionKind = 'native-install' | 'native-skills' | 'native-clear' | 'cli-command';

export interface DesktopAction {
  id: 'clear' | 'skills' | 'install' | 'state' | 'api' | 'pay';
  kind: DesktopActionKind;
  title: string;
  command: string;
  description: string;
  usesNativePanel?: boolean;
}

export const desktopActions: DesktopAction[] = [
  { id: 'clear', kind: 'native-clear', usesNativePanel: true, title: 'Clean workstation', command: 'hi --clear', description: 'Scan processes, choose PIDs, then confirm before ending anything.' },
  { id: 'skills', kind: 'native-skills', usesNativePanel: true, title: 'Skills market', command: 'hi --skills', description: 'Browse skill packages, choose targets, and confirm installation.' },
  { id: 'install', kind: 'native-install', usesNativePanel: true, title: 'Install tools', command: 'hi --install', description: 'Use desktop categories, target cards, and explicit install confirmation.' },
  { id: 'state', kind: 'cli-command', title: 'System state', command: 'hi --state', description: 'Show GitHub, project paths, commands, and app status.' },
  { id: 'api', kind: 'cli-command', title: 'API platforms', command: 'hi --api', description: 'Open model API platform guidance.' },
  { id: 'pay', kind: 'cli-command', title: 'Payment resources', command: 'hi --pay', description: 'Open payment and card/relay resource guidance.' },
];
