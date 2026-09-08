# HTTP 契约 v0:本地服务(ui-server)

> 状态:生效 | 适用范围:packages/cli/src/ui-server.ts（及 ui-groups / ui-drafts / ui-content / ui-links）↔ apps/web | 对应 issue:#31
> 信封、错误 code 与 SkillRecord 字段一律复用 [json-contract-v0.md](json-contract-v0.md),不重复发明。
> **#192 修订（2026-08-22）**：字段名与状态码以 `ui-server.ts` + `http-api.test.ts` + web `types.ts` 为准回写；不再保留已废弃的 `files` / `translated` / raw PUT body。`:hash` 匹配的实现漂移见 #190，本契约仍以 CLI `resolveNames`（dirName 精确，否则唯一哈希前缀）为口径。
> **#216 修订（2026-08-24）**：`POST /api/agent/chat` 改为 AI SDK UI message stream；翻译 SSE 与 Agent 解绑。

## 1. 基础

- 服务:`skills-hub ui [--port <n>] [--home <path>]`;Hono,`hostname: "127.0.0.1"`(固定,不接受外部绑定)
- 默认端口:4321;HTTP/JSON,UTF-8
- 成功信封:`{ ok: true, command: "<命令>", ...数据 }`;失败信封:`{ ok: false, command, code, message }`(code 枚举见 json-contract-v0.md §3)
- 写端点(body JSON)无需 --yes:面板按钮即用户显式操作;授权边界 = 只绑本机
- storeRoot 解析失败(未 init)时,所有业务端点返回 503 store-not-configured

## 2. 读端点

| 端点 | 成功响应 | 失败 |
| --- | --- | --- |
| GET /api/health | { ok: true } | — |
| GET /api/skills | { ok, command: "skills", storeRoot, total, skills: SkillRecord[] } | 503 store-not-configured |
| GET /api/skills/:hash | { ok, command: "skill", skill: SkillRecord } | 404 not-found;503 |
| GET /api/groups | { ok, command: "groups", version, groups: GroupDef[] } | 503 |
| GET /api/stats | { ok, command: "stats", stats: StatsFile, ranking: UsageRankEntry[] } | 503 |
| GET /api/archive | { ok, command: "archive", verb: "list", archiveDir, archived: ArchivedSkill[] } | 503 |
| GET /api/clients | { ok, command: "clients", clients: { clientId, skillsDir }[] }(global 侧发现的客户端) | —(不依赖库存) |
| GET /api/skills/:hash/links | { ok, command: "skill-links", hash, links: { clientId, state, detail }[] }(检查器客户端页,按需拉取) | 404 not-found;503 |
| GET /api/clients/:clientId/skill-states | { ok, command: "client-skill-states", clientId, skillsDir, enabled, total, rows: { hash, state, detail }[] }(客户端视角全集行状态) | 404 not-found;503 |
| GET /api/verify | { ok, command: "verify", storeRoot, checked, passed, drifted, missing }(只读;CLI --json 的 ok 数组在此改名为 passed,避开信封 ok) | 503 |
| GET /api/doctor | { ok, command: "doctor", store, roots, linkTypes, danglingLinks } | 503 store-not-configured（HTTP 与 CLI 不同：CLI `doctor --json` 在库存未配置时仍 `ok:true`，用 `store.resolved` 表达；HTTP 走 withStore → 503） |
| GET /api/backups | { ok, command: "backup", verb: "list", storeRoot, latest, snapshots }(与 CLI backup list --json 同形) | 503 |
| GET /api/drafts | { ok, command: "drafts", drafts: DraftRecord[] }（无 verb；与 CLI `new list` 的 `command:"new"` 不同） | 503 |
| GET /api/agent/models | { ok, command: "agent-models", defaultModel, models: { id, label, note }[] }（Agent 模型白名单，见 agent-v0.md §6） | — |
| GET /api/skills/:hash/tree | { ok, command: "skill-tree", dirName, entries: SkillFileEntry[], truncated } | 404 not-found;503 |
| GET /api/skills/:hash/file?path= | { ok, command: "skill-file", dirName, path, content, sizeBytes } | 400 bad-usage（缺 path / outside）;404;422 binary\|too-large;503 |
| GET /api/skills/:hash/translation?path= | { ok, command: "skill-translation", hash, path, translated }（译文缓存命中，见 store-and-paths-v0.md §2.1.1） | 400 bad-usage（缺 path / outside）;404 translation-not-found;503 |

### SkillRecord(与 json-contract §2 同定义)

- `hash`:内容哈希(hex)
- `dirName`:库存目录名
- `meta: { name, description }`:SKILL.md 元信息
- `origins[]`:收录来源(kind + reference),**与 visibleIn 永不合并**
- `visibleIn[]`:客户端可见性,由台账实时推导(某 dirName 在哪些客户端有链接)
- `installedAt`:入库时间(ISO)
- **不存在 `source` 字段**(历史遗留的 clientId 别名已废除)

### UsageRankEntry(与 core 同名类型;GET /api/stats 的 ranking 项)

- `skillHash`:skill 内容哈希(hex)。**没有 `hash` 字段**(与 SkillRecord.hash 同值、不同键名)
- `show` / `enable`:分别计数
- `total`:`show + enable`

## 3. 写端点

| 端点 | body | 成功响应 | 失败 |
| --- | --- | --- | --- |
| POST /api/skills/:hash/enable | { clientId, scope? } | { ok, command: "enable", clientId, scope, targetDir, created, removed } | 400 bad-usage(缺 clientId);404 not-found(客户端或 skill 不存在);409 link-failed;503 |
| POST /api/skills/:hash/disable | 同上 | { ok, command: "disable", ... } | 同上 |
| POST /api/links/preview | { hashes, clientIds, action: enable\|disable, scope? } | { ok, command: "links-preview", action, add, remove, conflictCount, wouldCreate, wouldRemove, conflicts }(不写盘) | 400 bad-usage;404 not-found;503 |
| POST /api/links/apply | 同上 | { ok, command: "links-apply", action, created, removed }(按落点各一次 applyLinkSet) | 400;404;409 link-failed(含 conflicts,未写盘);503 |
| POST /api/skills/:hash/archive | —(无 body) | { ok, command: "archive", dirName, archiveFile, sizeBytes, removedLinks } | 404 not-found;409(归档失败);503 |
| POST /api/skills/:hash/restore | —(无 body;:hash 为归档名) | { ok, command: "restore", dirName, hash, archiveFile } | 404 not-found;409 conflict;500;503 |
| POST /api/adopt | { source }(本地路径或 GitHub / skills.sh URL) | { ok, command: "adopt", adopted, duplicates, conflicts, invalid, outcomes } | 400 bad-usage;502 github-fetch-failed;503 |
| POST /api/drafts | { dirName, description? } | description 非空：allocate+commit，`{ ok, command: "new", verb: "create", dirName, hash, storeDir }`；description 空：只 allocate，无 hash | 400 bad-usage;409 draft-exists;503 |
| POST /api/drafts/:dirName/commit | —(无 body) | { ok, command: "new", verb: "commit", dirName, hash } | 404 draft-not-found;400 draft-incomplete;409 draft-exists;503（#193：与 CLI `new commit` 同 code） |
| POST /api/drafts/:dirName/discard | —(无 body) | { ok, command: "new", verb: "discard", dirName, archivePath } | 404 draft-not-found;503（#193：与 CLI `new discard` 同 code） |
| PUT /api/skills/:hash/file?path= | JSON `{ content: string }` | { ok, command: "skill-file-save", dirName, path, hash }（`hash` 为写回后的新内容哈希） | 400 bad-usage（缺 path / 缺 content / outside）;404;422 too-large;503 |
| POST /api/translate | { text, target?, path? }（target/path 可省：纯文本翻译不落盘；两者都带时流式成功结束后 best-effort 存入译文缓存，落盘失败不影响 done） | **SSE 流**（翻译专用：`event: delta` `{ text }` / `done` `{}` / `error` `{ code, message }`。底层走 AI SDK `streamText`，见 [ai-integration-v1.md](ai-integration-v1.md)） | 进流前：400 bad-usage JSON 信封；未配置密钥走流内 error |
| POST /api/agent/chat | { messages: UIMessage[], model?, writePolicy?: "ask"\|"allow" }（见 [agent-v0.md](agent-v0.md)） | **AI SDK UI message stream**（`createAgentUIStreamResponse`；`x-vercel-ai-ui-message-stream`） | 400 bad-usage（缺 messages / 含 system role）；**503 not-configured**（无 `QINIU_API_KEY`，进流前 JSON 信封） |
| POST /api/groups | { id, name?, description? } | { ok, command: "group", verb: "create", id, name, description } | 400 bad-usage;409 group-exists;503 |
| PATCH /api/groups/:id | { name?, description? }(至少一项) | { ok, command: "group", verb: "rename", id, name, description } | 400;404 group-not-found;503 |
| DELETE /api/groups/:id | — | { ok, command: "group", verb: "delete", id, memberCount }(只删分组定义,不删 skill) | 404 group-not-found;503 |
| POST /api/groups/:id/members | { hashes, action: add\|remove } | { ok, command: "group", verb: "add"\|"remove", id, hashes, changed } | 400;404 group-not-found\|not-found;503 |
| POST /api/analyze | { target }(hash 前缀或 dirName) | { ok, command: "analyze", target, similar, conflict }(只建议,不写盘) | 400 bad-usage;404 not-found;503 not-configured;502 analyze-failed |
| POST /api/share | { target, repo? }(hash 前缀或 dirName;repo 覆盖 manifest.trustedRepo) | { ok, command: "share", dirName, url, idempotent, dryRun } | 400 bad-usage;404 not-found;409 remote-conflict;503 auth-required(无 GITHUB_TOKEN);502 github-push-failed |
| POST /api/backups/preview | { snapshotId? } | { ok, command: "backups-preview", snapshotId, dryRun: true, clients, skills, files, links, wouldRestore, skippedOwnDirs, asideStore, asidePointer }(不写盘) | 400;404 not-found;409 verify-failed;503 |
| POST /api/reset | { snapshotId?, confirm: "reset" } | { ok, command: "reset", storeRoot, snapshotId, asideStore, asidePointer, adopted }(本请求内跑完还原,与 CLI `reset --json` 同形) | 400 bad-usage(缺确认短语);404;409 verify-failed\|restore-failed;500 io-error;503 |

- `:hash` 与 CLI 共用 `resolveSkill`:dirName 精确,否则唯一哈希前缀;0 命中 404 not-found;前缀不唯一 400 bad-usage
- `SkillFileEntry`:`{ path, kind: "file"|"dir", sizeBytes }`
- `scope`:global(默认,home 下)/ project(cwd 下),与 cli-commands-v0.md §2 一致
- 写操作复用同一套 perform*:链接 `performLinkChange` / `previewLinkChange`,分组 `performCreateGroup` / `performUpdateGroup` / `performDeleteGroup` / `performGroupMembers`,草稿 `performAllocate` / `performCreate` / `performCommit` / `performDiscard`(与 CLI 同一实现,行为不漂移)
- unregistered-conflict(落点被用户目录占据)与 not-link-conflict 以 409 + link-failed 返回,message 给出人工处理指引,绝不覆盖
- `/api/translate` 与 `/api/agent/chat` 的流式响应不受 withStore 守卫;库存未配置时 Agent 仍可对话(工具返回可读文本)
- Agent 流契约与翻译 SSE 分离：Agent 走 AI SDK UI message stream，翻译仍用 delta/done/error（#216）

## 4. HTTP 状态码映射

| code | HTTP |
| --- | --- |
| bad-usage | 400 |
| not-found | 404 |
| group-not-found | 404 |
| link-failed | 409 |
| group-exists | 409 |
| store-not-configured | 503 |
| not-configured | 503 |
| io-error(预留) | 500 |
| github-fetch-failed | 502 |
| analyze-failed | 502 |
| github-push-failed | 502 |
| remote-conflict | 409 |
| auth-required | 503 |
| verify-failed | 409 |
| restore-failed | 409 |
| draft-exists | 409 |
| draft-not-found | 404 |
| draft-incomplete | 400 |
| binary | 422 |
| too-large | 422 |
| outside | 400 |

> 注:auth-required / group-empty / invalid-skill 是 CLI 专属 code(交互授权、按空组 enable)。分组写操作走 HTTP,code 与 CLI 同口径。

## 5. 测试

packages/cli/test/http-api.test.ts:createUiApp 注入沙箱 storeRoot/home,`app.request()` 直测(不占真实端口),覆盖信封形状、origins/visibleIn 分离、写端点成功与结构化失败、links preview/apply、分组 CRUD、`/api/drafts*`（含 draft-not-found / draft-incomplete）、analyze 只读建议、verify/doctor 只读报告、503 未配置。
