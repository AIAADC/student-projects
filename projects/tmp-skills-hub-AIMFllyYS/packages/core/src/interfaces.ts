/**
 * 换介质 / 换来源时的类型登记(架构规范 §5)。
 * 当前运行时是函数内核,全仓没有任何 implements。
 * 不要按这些对象写新代码;存储走 adopt/allocate/commit/archive,
 * 客户端走 discoverClientRoots + applyLinkSet,来源网络留在 cli。
 */

import type { LinkScope, SkillHash, SkillRecord, SkillSource } from "./types.js";
import type { DraftRecord } from "./store.js";

/**
 * 存储介质——未来换实现时的形状草稿,不是现行合同。
 * 现行函数:readStoreIndex / adoptSkillFolder / archiveSkill / allocateDraft / commitDraft。
 */
export interface StorageProvider {
  /** 列出库存中的全部 skill 记录。 */
  list(): Promise<SkillRecord[]>;
  /** 按哈希取一条记录,不存在返回 null。 */
  get(hash: SkillHash): Promise<SkillRecord | null>;
  /** 将一个标准化的 skill 文件夹收进库存,返回记录(内容相同则幂等返回已有记录)。 */
  add(folderPath: string, record: Omit<SkillRecord, "hash">): Promise<SkillRecord>;
  /**
   * 软删除:把记录移出活跃区并归档(zip),不销毁内容(cli-commands-v0.md §2)。
   * 全项目不存在真删除路径——需要彻底删除时只向用户显示归档文件路径。
   */
  archive(hash: SkillHash): Promise<void>;
  /**
   * 占位:在库存内分配目录并写入模板,登记到 drafts[](#169)。
   * 与 add 相反:add 是 content-first(内容先到),allocate 是 location-first(先占名再写内容)。
   */
  allocate(dirName: string, origin: SkillSource): Promise<DraftRecord>;
  /**
   * 定稿:校验 SKILL.md 达标后算哈希,从 drafts[] 移入 skills[](#169)。
   */
  commit(dirName: string): Promise<SkillRecord>;
}

/**
 * 收录来源——未来换实现时的形状草稿。
 * 现行:本地扫描走 scan+adopt;GitHub/skills.sh 在 cli 里鸭子类型 canHandle/fetch。
 */
export interface SourceProvider {
  /** 该来源能否处理这个输入(路径 / URL / 其他)。 */
  canHandle(input: string): boolean;
  /** 拉取并标准化,返回可供 StorageProvider.add 使用的本地文件夹路径列表。 */
  fetch(input: string): Promise<string[]>;
}

/**
 * 按品牌单条挂链的旧模型,与现行 applyLinkSet 冲突。无实现。不要按它写代码。
 * 现行:discoverClientRoots(按目录形状) + applyLinkSet(集合切换)。
 */
export interface ClientAdapter {
  /** 客户端标识,如 "claude" | "codex" | "cursor"。 */
  id: string;
  /** 该客户端在指定范围下的 skills 目录绝对路径。 */
  skillsDir(scope: LinkScope, projectRoot?: string): string;
  /** 在客户端目录创建指回库存原件的符号链接。 */
  link(record: SkillRecord, storePath: string, scope: LinkScope, projectRoot?: string): Promise<void>;
  /** 删除链接(≠ 删除原件;Agent 读不到即等于卸下)。 */
  unlink(record: SkillRecord, scope: LinkScope, projectRoot?: string): Promise<void>;
}

/**
 * 身份接入——D 块账号到来之前不要实现。现行分享只读 GITHUB_TOKEN。
 */
export interface IdentityProvider {
  /** 当前用户是否可写共享仓库。第一版恒真(全员授信)。 */
  canWrite(): Promise<boolean>;
}
