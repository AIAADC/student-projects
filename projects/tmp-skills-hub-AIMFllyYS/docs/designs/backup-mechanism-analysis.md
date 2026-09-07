# 客户端 skills 备份机制分析（只分析，不实现）

> 状态：分析稿（2026-08-17 修订链接与 blob 布局口径后，作为 #116 施工依据）。
> 日期：2026-08-16；修订：2026-08-17

## 1. 为什么需要备份（不可逆风险盘点）

先盘点现有写操作的可逆性——备份要防的不是设计内的删除（那已经是软删除），而是设计外的意外：

| 操作 | 写什么 | 可逆性 | 意外风险 |
|---|---|---|---|
| adopt | 复制进库存 skills/ | 源目录不动，可逆 | 冲突判定 bug 把同名不同内容混入；复制中途失败留半目录（已有 tmp+rename 防护） |
| enable/disable | 客户端目录建/摘 junction | 可摘，可逆 | 链接台账与真实链接不一致（已由 verify 检测）；junction 目标被误改 |
| edit 写回(#37) | 改库存原件 | 可逆（改的是库存副本） | 编辑 bug 覆盖文件内容——这是最贴近「不可逆」的一步：库存原件被覆盖后没有副本了 |
| archive | 活跃区移入归档 zip | 软删除，zip 落盘后才删 | zip 损坏后原件不可恢复 |
| backup(本分析) | 只读源，写备份区 | 永远可逆 | — |

结论：单一环节都有防护，但缺少「操作链起点前的基线」。用户原话场景——「最开始发现 skills 这里」：
scan 发现 26 个客户端 root、581 份 skill 副本，这些是用户资产；任何后续真机操作（收录、链接、编辑）
之前，先建立一份可校验的基线快照，任何一步出问题都能按快照恢复。备份同时是审计证据（每份副本的哈希）。

## 2. 备份范围

- 源：discoverClientRoots(home) 发现的全部客户端 root 下的 skill 目录（26 root / 581 份副本）。
- 内容：每份 skill 目录的完整文件树（含 SKILL.md 与支撑文件）。
- 不含：把链接当成普通目录递归走进去（防环、防备份风暴）。链接本身记进清单（类型 + 目标）。
- 链接目标分流（2026-08-17 修订，见 §2.1）：目标在库存内 → 只记引用、不复制；目标在库存外 → 把那一份内容写入 blob 一次。
- 元数据：忠实备份保留文件 mtime（部分 skill 工具依赖）；哈希清单含相对路径 + SHA-256。

### 2.1 修订：跟随链接 vs 不跟随（2026-08-17）

批 7-3（#97）bootstrap 止血实现「跟随链接复制内容」，与原文 §2「不跟随、只记录链接」冲突。

**理由：** 备份要的是用户资产的内容基线，不是目录拓扑博物馆。客户端 skills 里大量 junction 指向库存 `skills/`——再复制一遍等于把库存打进备份；但若链接指向库存外的用户原件，只记目标路径、不存内容，原件一丢基线就空了。

**现行口径：**

1. 遍历源目录时用 `lstat` / `readLinkTarget`，**不把链接当目录走进去**（防环）。
2. 链接目标经 `realpath` 后若落在 `storeRoot` 内：manifest 只记 `{rel, kind, target, inStore:true}`，不写 blob。
3. 链接目标在库存外：把目标文件（或目标目录内的普通文件）按内容写入共享 blob 一次，manifest 记 `inStore:false` 与对应 hash。目标目录里的嵌套链接仍按 1–3 处理，不无限跟随。
4. blob 从「每个快照一份 `blobs/`」改为 **`backups/blobs/` 共享池**（见 §3）。否则第二次 backup 必然重写全部 blob，「增量只新增」无法成立。原文示意图把 blobs 画在快照目录里，那是第一稿；#97 已按哈希去重，本修订把共享池写死。

## 3. 备份目标位置（沙箱硬约束适配）

store-and-paths-v0.md §5：所有写操作必须能被 --home / SKILLS_HUB_HOME 整体重定向。
所以备份区落在库存根（即 --home 解析出的 storeRoot，与 skills/、archive/、tmp/ 并列）：

```
<storeRoot>/
  backups/
    blobs/             # 共享内容寻址库:<sha256> 一个文件一份内容(跨快照复用)
    <快照ID>/          # 如 2026-08-16T14-30-00Z
      manifest.json    # 清单:文件 {clientId, rel, hash, size, mtime} + 链接记录
    latest             # 指针文件:当前最新快照 ID(原子写)
```

真机首次备份由用户亲手执行（与「真机首次收录」同一授权口径），无人值守只打沙箱。

## 4. 存储形态与去重（复用确定性内核）

### 4.1 推荐：内容寻址 blob 库 + manifest（方案 A）

- 写：遍历源目录 → hashSkillFolder 得整目录哈希，逐文件 SHA-256 → 文件内容以 <sha256> 命名存入 blobs/（已存在即跳过）→ manifest 记录映射。
- 去重立竿见影：581 份副本只有 213 个唯一整目录哈希；跨副本、跨 root 的相同文件（如 demo-init 26 份）在 blob 层天然合并。
- 增量：第二次备份时目录哈希相同 → 整份跳过；目录变了 → 只补新 blob、manifest 增补一条版本记录。
- 恢复：按 manifest 用 blobs/ 拼回目录树，逐字节一致（哈希即校验）。
- 原子性：快照先写 tmp/ 再 rename 进 backups/（与 store 全链路同模式）。

### 4.2 备选方案

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| B. 每 root 一个 zip（复用 zipDirectory/zipEntries） | 紧凑、可浏览、有现成实现 | 增量需重打整包；当前 zip 是 store 模式（不压缩）、固定 mtime，非忠实备份 | 不适配 v1 |
| C. 单文件全量 zip | 最简单 | 恢复粒度粗（要恢复一份得解整个包） | 不做 |
| D. 目录树副本 | 恢复直观 | 581 份全量复制占空间、增量比对成本高 | 不做 |

方案 A 的三个复用点：hashSkillFolder（哈希）、原子 tmp+rename（落盘）、discoverClientRoots（发现）。
压缩（deflate）留作后续优化——markdown 可压 60–70%，但 skill 素材常含二进制，先保证简单正确。

## 5. 体量实测（2026-08-16，本机真实目录，只读）

| 指标 | 实测 | 说明 |
|---|---|---|
| root | 19（简化规则）/ 26（完整规则） | 完整规则含 .config 等深层位置 |
| skill 目录 | 398（简化规则） | 完整规则 581 份 |
| 文件 | 9,116 | — |
| 原始体积 | 264.7 MB | 完整规则预计 ~350 MB |
| 去重后预计 | ~130–180 MB | 213 唯一整目录 + blob 级合并 |
| 单次全量耗时 | 分钟级（万级文件 IO） | 增量后秒级 |

## 6. 命令面（cli-commands-v0.md 口径：先登记再实现）

| 命令 | 作用 | 写操作？ |
|---|---|---|
| backup [--full] | 建/更新基线快照（默认增量，--full 强制全量） | 是（写 backups/，需 --yes，--home 可重定向） |
| backup list | 列快照与最近备份时间 | 否 |
| backup verify | 用 manifest 哈希重算比对，报告损坏/缺失 | 否 |
| backup restore [snapshotId] | 按快照把客户端 skills 逐条拼回（库存与指针不动） | 是（写客户端 skill 落点，需 --yes；`--dry-run` 只预览） |
| reset [--snapshot id] | 还原客户端 → 旁路指针与旧库存 → 用确认前读到的 storeRoot 再收录并拉起面板 | 是（编排 restore + bootstrap，需 --yes；面板确认短语即授权） |

> **2026-08-17 修订**：原文写 restore 不在 v1、靠手工拼回。真机已用过一轮备份（#97 整树快照与 #116 内核并存），「等用过再做」的条件已满足。restore 纳入命令表；`reset` 是编排（restore + 旁路旧库 + 再收录），不是第二套备份内核。
>
> **2026-08-17 再修订（#157）**：批 12 曾规定面板「另开进程 + 让出 4321」。真机上 Windows `detached` 子进程没有可见控制台、失败被 `stdio: ignore` 吞掉、HTTP 却返回 `started: true`，用户看到成功提示但磁盘不变。且 reset 会在同一 `storeRoot` 路径重建库存，当前 ui 进程并不失去绑定。故改为：**面板在当前请求内跑完 reset**，成功信封与 CLI `--json` 同形。

### 6.1 restore 写盘口径

- 先 verify，失败不写盘。
- 跳过本项目目录（`skills-hub*`，与 #98 发现规则一致）。
- **禁止**对客户端 `skills` 目录整目录 rename/删除（core-patterns §2）。逐条 skill：链接 `unlink`/`rmdir` 且不跟随；普通目录 aside 到 `<storeRoot>/tmp/restore-aside-<id>/`，再写入快照内容。
- 新格式按 `files[]` + `links[]`；旧格式（#97 `roots/<client>/.<client>/skills`）必须能还原——本机第一份真机基线即此形态。
- 兼容 `latest` 为空：调用方可显式传 snapshotId。

### 6.2 reset 在哪个进程跑

`reset` 旁路旧库存后，用确认前读到的 `storeRoot` 再收录（不得落到默认 `~/.skills-hub`）。库存路径不变，当前 `ui` 进程的绑定仍然有效，下一发读请求读到的是重建后的库存。

面板二次确认后，`POST /api/reset` **在本请求内**跑完还原 → 旁路 → 再收录，返回完成信封。失败走错误信封。不另开控制台、不退出 ui 进程。CLI 直接调用 `reset --yes` 时，结束后仍可拉起面板（人不用 CLI 的日常路径不受影响）。

## 7. 边界与安全

- 源目录只读（与产品红线一致：不搬动、不修改用户 skill）。
- 不把链接当目录递归；库存内目标只记引用，库存外目标复制内容一次（§2.1）。
- 快照不可变：一个快照 ID 建好后不再修改（增量=新快照），与 core-patterns 的不可变快照语义一致。
- 备份内容不涉及密钥（skill 素材无密钥；清单不含路径以外的可识别信息）。
- 磁盘告警：blob 库增长受源变化驱动，manifest 记录每条来源路径，用户可 backup list 审计。

## 8. v1 验收标准（供拆 issue 用）

- [ ] 沙箱 home 下全量快照：26-root 规则下所有 skill 目录入 backups/，manifest 与文件一致
- [ ] backup verify 重算哈希全对；人为改坏一个 blob 能报出具体路径
- [ ] 幂等：同内容重复 backup 不新增 blob
- [ ] 增量：改一个文件后 backup，只新增对应 blob 与一条 manifest 记录
- [ ] 恢复演练：按 manifest 拼回的目录与原目录逐字节一致（含 mtime）
- [ ] 命令表登记 backup；四检全绿

## 9. 拆 issue 建议

1. **core：备份内核**——blob 库写入、manifest 读写、verify 重算（复用 hashSkillFolder / 原子写）——批 10 已完成
2. **cli：backup 命令**——命令表登记、增量策略、--full/list/verify 子命令——批 10 已完成
3. **恢复与一键 reset（批 12）**——规范回写 → core 逐条还原（含旧格式）→ CLI `backup restore` → CLI `reset` → HTTP + 报告页。面板按钮走同一套 `reset`，不与归档 `restore` 混用动作 id。#157：面板必须在本请求内跑完，不得只 spawn。
