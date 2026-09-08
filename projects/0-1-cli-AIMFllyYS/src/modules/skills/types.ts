export interface SkillPackage {
  key: string;
  displayName: string;
  description: string;
  sourceUrl: string;
  sourceType: 'local' | 'git';
  sourcePath?: string;
  repoUrl?: string;
}

export interface SkillTarget {
  key: string;
  displayName: string;
  path: string;
  detected: boolean;
}
