/**
 * 资产模型:与 docs/designs/architecture-initial-spec.md 第 3 章一一对应。
 * 一个 Skill = 一个文件夹,入口 SKILL.md,`name` + `description` 是收录最低要求。
 */

/** SKILL.md 通用层元数据。所有客户端都能读的最小集合。 */
export interface SkillMeta {
  /** 英文 name,检索与召回按它走(命名规范见架构规范 3.3)。 */
  name: string;
  description: string;
}

/** 整个文件夹内容的 SHA-256 哈希,唯一标识一个 skill 版本。 */
export type SkillHash = string;

/** 收录来源的种类。新增来源时扩展这个联合类型。 */
export type SkillSourceKind = "local-scan" | "github" | "skills-sh" | "authored" | "archive-restore";

export interface SkillSource {
  kind: SkillSourceKind;
  /** 本地路径或 GitHub URL 等,用于溯源展示与分类。 */
  reference: string;
}

/** 库存中的一条 skill 记录:「哈希 ↔ skill」对照表的行。 */
export interface SkillRecord {
  hash: SkillHash;
  /** store 内的目录名(英文)。 */
  dirName: string;
  meta: SkillMeta;
  /**
   * 收录来源(多值):同一份内容可能出现在 26 个客户端目录里,
   * 按内容哈希去重后是一条记录、多个来源(store-and-paths-v0.md §2.3)。
   */
  origins: SkillSource[];
  /**
   * 在哪些客户端可见。权威来源是链接台账(某 dirName 出现在哪些 clientId);
   * index.json 只写空数组,不缓存。CLI list / HTTP GET 在 JSON 边界按台账推导后填入。
   * 与 origins 独立:来源 = 从哪收录,visibleIn = 链接挂在了哪些客户端目录。
   */
  visibleIn: string[];
  installedAt: string;
}

/** 链接投射的范围:全局(用户目录)或项目级,复用各 Agent 已有隔离。 */
export type LinkScope = "global" | "project";
