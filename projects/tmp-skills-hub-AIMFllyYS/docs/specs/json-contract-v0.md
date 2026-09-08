# JSON 输出契约 v0(#28)

> 状态:生效 | 位置:本文件是唯一口径,代码必须遵守 | 对应 issue:#28
> AI 与 Web 面板两个消费者,一个结构。结构一变两边同时坏——改动本契约必须同步改测试(json-contract.test.ts)。

## 1. 通用约定

### 1.1 输出通道

- `--json` 模式:**唯一 JSON 输出到 stdout**,一行一个文档(pretty-print 允许);人类可读的辅助信息可进 stderr,但 stdout 必须纯净。
- 人类模式:成功信息 → stdout;错误 → stderr。

### 1.2 成功信封

所有命令的成功 JSON 顶层含两个公共字段,再跟命令自己的数据字段:

```json
{ "ok": true, "command": "list", ...命令字段 }
```

### 1.3 失败信封

`--json` 下错误也必须结构化输出到 stdout,同时人类文本进 stderr:

```json
{ "ok": false, "command": "list", "code": "store-not-configured", "message": "..." }
```

- `code` 取值见 §3 枚举;消费方只匹配 `code`,不解析 `message` 文本。
- 失败一律进程退出码 2(用法/业务错误),内部异常为 1。

### 1.4 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功(含 dry-run 预演) |
| 1 | 内部错误/未分类异常 |
| 2 | 用法或业务错误(对应失败信封) |

### 1.5 分页

v0 不分页。list 返回全部命中;`total` 恒等于 `skills.length`。将来加 `limit`/`offset` 时在此追加字段,不破坏现有字段。

## 2. 命令结构

> 库存根解析(`list` / `adopt` 等):--home 是**显式库存根**(同时作沙箱 home 重定向);其次 SKILLS_HUB_HOME;最后指针文件。解析失败 → store-not-configured。`ui` / `bootstrap` 拉起的面板进程例外:传入的 home 只作指针基座,库存读指针(或 SKILLS_HUB_HOME),见 [store-and-paths-v0.md](store-and-paths-v0.md) §1。

### 2.1 list

```json
{ "ok": true, "command": "list", "storeRoot": "C:\\...", "total": 2, "skills": [SkillRecord] }
```

### 2.2 SkillRecord(库存视图)

```json
{
  "hash": "882c3cd9...",
  "dirName": "demo",
  "meta": { "name": "demo", "description": "..." },
  "origins": [ { "kind": "local-scan", "reference": "C:\\..." } ],
  "visibleIn": [ "claude" ],
  "installedAt": "2026-08-16T10:00:00.000Z"
}
```

**来源与客户端可见性是两个独立字段,永不合并**:

- `origins`:这份内容**从哪收录来的**(本地路径/GitHub URL,多值);
- `visibleIn`:链接**挂在哪些客户端目录**。权威来源是链接台账;CLI/HTTP JSON 边界按台账实时推导。`index.json` 写入空数组,不是缓存。
- 禁止出现 `source` 字段(历史混用名)。

### 2.3 show

```json
{ "ok": true, "command": "show", "storeRoot": "...", "matches": [SkillRecord] }
```

精确匹配 dirName 时 matches 长度 1;哈希前缀匹配最多 10 条。未找到 → `{ok:false, code:"not-found"}`,退出码 2。

### 2.4 doctor

```json
{
  "ok": true, "command": "doctor",
  "store": { "resolved": true, "storeRoot": "...", "reachable": true, "error": null },
  "roots": [ { "clientId": "claude", "skillsDir": "C:\\..." } ],
  "linkTypes": { "junction": true, "symlink": false, "hardlink": false },
  "danglingLinks": [ { "linkPath": "...", "target": "..." } ]
}
```

doctor 是自检命令:即使库存未配置也 `ok:true`(自检结果本身就是成功),用 `store.resolved/reachable` 表达状态。

### 2.5 group

- list(无动词或 `list`):
```json
{ "ok": true, "command": "group", "verb": "list", "groups": [ { "id": "design", "name": "设计", "description": "...", "memberHashes": ["hash..."] } ] }
```
- create/rename/delete/add/remove 成功:
```json
{ "ok": true, "command": "group", "verb": "create", "id": "mygroup", "name": "我的组", "description": "..." }
```
- add/remove 附 `id`、`dirNames`、`hashes`;delete 附 `memberCount`。
- dry-run:附加 `"dryRun": true`。
- 错误:重复创建 `group-exists`;不存在 `group-not-found`;组内无成员 `group-empty`。

### 2.6 enable / disable

```json
{ "ok": true, "command": "enable", "clientId": "claude", "scope": "global", "targetDir": "...", "created": ["..."], "removed": [] }
```

dry-run:附加 `dryRun:true` + `wouldCreate`/`wouldRemove`(与 created/removed 互斥出现)。

### 2.7 adopt / verify / archive

照 §2.1 信封加 `ok`/`command`,数据字段沿用现有形状(outcomes / checked+ok+drifted+missing / archiveDir+results+failed)。

### 2.8 backup

- create(无动词):
```json
{ "ok": true, "command": "backup", "verb": "create", "mode": "incremental", "storeRoot": "...", "snapshotId": "...", "snapshotDir": "...", "files": 2, "links": 0, "blobsWritten": 1, "blobsReused": 1 }
```
`mode` 为 `incremental`(默认)或 `full`(`--full`)。dry-run 附加 `"dryRun": true`,并含 `clientRoots`、`latestSnapshotId`,不含 `snapshotId`。
- list:
```json
{ "ok": true, "command": "backup", "verb": "list", "storeRoot": "...", "latest": "...", "snapshots": [ { "snapshotId": "...", "createdAt": "...", "files": 2, "links": 0, "blobsWritten": 1, "blobsReused": 0 } ] }
```
- verify 成功:
```json
{ "ok": true, "command": "backup", "verb": "verify", "storeRoot": "...", "snapshotId": "...", "checked": 2, "passed": true, "issues": [] }
```
- 无快照:`code: "not-found"`;blob 缺失或哈希不符:`code: "verify-failed"`,附加 `issues: [{ hash, rel, reason }]`。
- restore:
```json
{ "ok": true, "command": "backup", "verb": "restore", "storeRoot": "...", "snapshotId": "...", "clients": 2, "skills": 3, "files": 4, "links": 1 }
```
dry-run 附加 `"dryRun": true` 与 `wouldRestore`（将写入的客户端/skill 条目）,不含已写盘计数以外的副作用。校验失败:`code: "verify-failed"` 或 `restore-failed`。

### 2.9 share

```json
{ "ok": true, "command": "share", "dirName": "demo", "url": "https://github.com/org/repo/tree/main/skills/demo", "idempotent": false, "dryRun": false }
```

远端已有且内容哈希相同:`idempotent: true`,不新建提交。dry-run 附加 `"dryRun": true`,不写远端。

失败:`auth-required`(无 token / 非交互缺 --yes);`remote-conflict`(远端同名不同内容,不覆盖);`github-push-failed`(401/403/限流/分支保护);`not-found`;`bad-usage`。

### 2.10 new

- allocate(无动词或 `new`):
```json
{ "ok": true, "command": "new", "verb": "allocate", "dirName": "my-skill", "storeDir": "C:\\...\\skills\\my-skill" }
```
- commit:
```json
{ "ok": true, "command": "new", "verb": "commit", "dirName": "my-skill", "hash": "abc123..." }
```
哈希在定稿时才计算(创建期不参与去重)。
- discard:
```json
{ "ok": true, "command": "new", "verb": "discard", "dirName": "my-skill", "archivePath": "C:\\...\\archive\\drafts\\my-skill-2026..." }
```
半成品移入 `archive/drafts/`,不引入真删除路径。
- list:
```json
{ "ok": true, "command": "new", "verb": "list", "drafts": [ { "dirName": "my-skill", "meta": { "name": "my-skill", "description": "..." }, "origin": { "kind": "authored", "reference": "cli" }, "createdAt": "..." } ] }
```
- 错误:`draft-exists`(占名冲突);`draft-not-found`(commit/discard 目标不存在);`draft-incomplete`(commit 时 SKILL.md 缺 name 或 description)。

### 2.11 reset

```json
{ "ok": true, "command": "reset", "storeRoot": "...", "snapshotId": "...", "asideStore": "...", "asidePointer": "...", "adopted": 3 }
```
dry-run 附加 `"dryRun": true`,含将旁路的指针/库存路径与 restore 预览,不写盘。面板 `POST /api/reset` 成功信封与上表同形（本请求内跑完还原,不再返回 `{ started: true }`）。

失败:`auth-required`;`not-found`(无快照);`verify-failed`;`restore-failed`;`bad-usage`(缺确认短语)。

## 3. 错误 code 枚举

| code | 场景 |
| --- | --- |
| bad-usage | 参数缺失/非法、名与分组互斥 |
| auth-required | 写操作缺 --yes(非交互) |
| store-not-configured | 库存根未配置 |
| store-not-reachable | 指针可解析但库存不可读 |
| not-found | show/list 未命中、enable 组不存在等 |
| group-exists | 分组重复创建 |
| group-not-found | rename/delete/add/remove 目标组不存在 |
| group-empty | 按空分组启用/停用 |
| invalid-skill | 缺 name/description 的目录 |
| link-failed | 链接切换失败(回滚完成) |
| verify-failed | backup verify 发现 blob 缺失或哈希不符 |
| restore-failed | backup restore / reset 写回客户端 skills 失败 |
| github-push-failed | share 推送被 GitHub 拒绝(无权限/限流/分支保护) |
| remote-conflict | share 远端已有同名不同内容,不覆盖 |
| draft-exists | new 占名时目标 dirName 已被 skills[] 或 drafts[] 占用 |
| draft-not-found | new commit / new discard 目标不在 drafts[] 中 |
| draft-incomplete | new commit 时 SKILL.md 缺 name 或 description |
| io-error | 文件系统故障 |
| not-configured | 分析/翻译缺 DEEPSEEK_API_KEY（HTTP 503；CLI `analyze` 当前可能映射为 analyze-failed，对齐见工程债） |
| github-fetch-failed | adopt 拉 GitHub/skills.sh 失败 |
| analyze-failed | 分析模型调用失败 |

HTTP 另有文件读取 code：`binary` / `too-large`（422）、`outside`（400），见 [http-api-v0.md](http-api-v0.md) §4。

## 4. ui-server 的 GET /api/skills（库存视图）

与 CLI `list --json` 同形的库存 `SkillRecord`，不是扫描视图：

```json
{ "ok": true, "command": "skills", "storeRoot": "...", "total": 2, "skills": [SkillRecord] }
```

- 字段见 §2.2：含 `origins` 与 `visibleIn`，**禁止** `source` / 顶层 `clientId`。
- 扫描视图（现扫现报、按客户端目录列出）只存在于 CLI `scan --json`，不走 `/api/skills`。
- HTTP 完整端点表见 [http-api-v0.md](http-api-v0.md)。

## 5. 测试

契约测试在 `packages/cli/test/json-contract.test.ts`:spawn 构建产物逐条断言 §2 形状;契约改动必须同步改测试,否则 CI 失败。
