import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  discoverClientRoots,
  hashSkillFolder,
  readSkillMeta,
  type SkillMeta,
} from "@skills-hub/core";

/** 一次本地扫描发现的 skill(尚未入库,仅供查看;入库是 M1 的 add 流程)。 */
export interface DiscoveredSkill {
  clientId: string;
  folderPath: string;
  hash: string;
  meta: SkillMeta;
}

/**
 * 扫描 home 下全部客户端 skills 根目录(按目录形状发现,不维护品牌名单),
 * 返回达到收录最低要求的 skill。home 由调用方显式传入(scan 是只读命令,默认真实 home)。
 */
export async function scanKnownClients(home: string): Promise<DiscoveredSkill[]> {
  const roots = await discoverClientRoots(home);
  const discovered: DiscoveredSkill[] = [];

  for (const root of roots) {
    const entries = await readdir(root.skillsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const folderPath = path.join(root.skillsDir, entry.name);
      const meta = await readSkillMeta(folderPath);
      if (meta === null) continue; // 缺 name/description,未达收录最低要求

      discovered.push({
        clientId: root.clientId,
        folderPath,
        hash: await hashSkillFolder(folderPath),
        meta,
      });
    }
  }
  return discovered;
}
