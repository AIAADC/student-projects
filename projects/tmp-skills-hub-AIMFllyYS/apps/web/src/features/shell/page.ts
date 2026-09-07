export type AppPage = "overview" | "stats" | "skills" | "agent";
export type SkillsTab = "apps" | "content";
export type StatsTab = "overview" | "usage" | "apps" | "sources";

/** 壳内跳转：设置走覆盖层，不占主区页。省略的字段保持现状。 */
export interface ShellNav {
  page?: AppPage;
  tab?: SkillsTab;
  clientId?: string;
  hash?: string;
  settings?: boolean;
}
