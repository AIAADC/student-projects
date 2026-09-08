import * as path from 'path';

export interface ScanTarget {
  name: string;
  path: string;
}

export function getConservativeTargets(): ScanTarget[] {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const programData = process.env.ProgramData || 'C:\\ProgramData';

  return [
    { name: 'User temp', path: process.env.TEMP || '' },
    { name: 'System temp', path: path.join(sysRoot, 'Temp') },
    { name: 'Windows update cache', path: path.join(sysRoot, 'SoftwareDistribution', 'Download') },
    { name: 'Windows logs', path: path.join(sysRoot, 'Logs') },
    { name: 'Windows prefetch', path: path.join(sysRoot, 'Prefetch') },
    { name: 'Windows error reporting', path: path.join(programData, 'Microsoft', 'Windows', 'WER') },
    { name: 'Edge cache', path: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache') },
    { name: 'Chrome cache', path: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache') },
    { name: 'Windows thumbnail cache', path: path.join(localAppData, 'Microsoft', 'Windows', 'Explorer') },
  ];
}

export function getAggressiveTargets(): ScanTarget[] {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';

  return [
    { name: 'DirectX shader cache', path: path.join(localAppData, 'D3DSCache') },
    { name: 'NVIDIA DX cache', path: path.join(localAppData, 'NVIDIA', 'DXCache') },
    { name: 'NVIDIA GL cache', path: path.join(localAppData, 'NVIDIA', 'GLCache') },
    { name: 'System minidumps', path: path.join(sysRoot, 'Minidump') },
    { name: 'Windows upgrade logs', path: 'C:\\$WINDOWS.~BT\\Sources\\Panther' },
    { name: 'Delivery Optimization cache', path: path.join('C:\\ProgramData', 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache') },
  ];
}
