<!-- CHATFILES_CANONICAL_ARCHITECTURE -->

# ChatFiles 规范架构、数据关系与能力边界

> 文档状态：唯一 prose 权威。本文定义现行代码边界、字段语义、数据关系、能力状态和发布流程。Zod/SQL 是其可执行实现；二者不一致时必须阻断发布并同步修正，不能任选一套继续运行。

## 1. 范围与原则

ChatFiles 保留 React 19 + Vite 8 + Express 5。它把机主明确授权的本地聊天副本整理为可审计的数据产品，不重写 Next.js，也不直接改动微信、QQ 或附件原件。

强制原则：

- 原始数据库、WAL、媒体和附件只读；解析、解密、转码只写 staging 或生成物。
- 未知人物、缺失资源和不支持格式必须保留明确状态，禁止猜测和伪造 ready。
- 时间精度只到源数据真实提供的秒，不制造毫秒。
- 默认归档时区为 `Asia/Shanghai`，可由 `CHATFILES_TIME_ZONE` 配置为合法 IANA 时区。
- 私人数据库、媒体、密钥、绝对路径和审计正文不得进入 Git 或公共状态接口。
- 每个数据产品必须带 schema version、run ID、内容指纹、依赖指纹、计数和审计 receipt。

## 2. 总体数据流

```text
只读源快照清单
  -> Canonical Event Store
       people -> conversations -> messages
       source_inventory + parse_runs + bundle_metadata
  -> 派生数据产品
       assets / media / library / insights / search
  -> Application Services
  -> HTTP / CLI / MCP / Agent / Vite UI
```

任何适配器都不得绕过 Canonical Event Store 自行定义人物、日期或消息顺序。资产、搜索、Agent 上下文、洞察高水位和 transcript 生成物都以 `canonical_seq` 为顺序依据。

## 3. 代码边界与依赖方向

| 目录 | 职责 | 允许依赖 |
|---|---|---|
| `shared/contracts` | Zod schema、DTO、错误码、Operation 契约 | 仅 `shared` |
| `shared/time`、`shared/ai` | 纯时间与上下文预算规则 | 仅 `shared` |
| `pipeline/<domain>` | 离线 inventory、解析、媒体、发布核心 | `pipeline`、`shared` |
| `scripts/` | 薄 CLI、显式参数映射和阶段编排 | `scripts`、`pipeline`、`shared` |
| `server/domain` | 纯领域规则 | `server/domain`、`shared` |
| `server/application` | 用例编排和 capability gating | `server/domain`、`shared` |
| `server/infrastructure` | SQLite、文件、FFmpeg、OpenAI 实现 | `server/application/domain`、`shared` |
| `server/http`、`server/routes` | 输入校验、序列化、HTTP 状态映射 | application service、shared contract |
| `src/app`、`src/pages` | URL 壳、lazy 页面组合 | `src/features/shared`、`shared` |
| `src/features` | 领域交互 | `src/shared`、`shared` |
| `src/components` | 可复用 UI | `src/shared/utils`、`shared` |

禁止 `server`/`pipeline` 导入 `src`，禁止 application 反向依赖 HTTP/Agent 适配器，禁止 route 调 route。依赖方向、循环、源码 300 行、UTF-8 和隐私边界由 guardrails 强制。

## 4. 源清单与 adapter

快照扫描必须动态发现所有 shard，不能假设只有 `message_0.db`：

| 文件模式 | domain | 正式处理方式 |
|---|---|---|
| `message_<n>.db` | regular | regular message adapter |
| `biz_message_<n>.db` | biz | biz message adapter |
| `media_<n>.db` / `VoiceInfo` | media | inventory 计数；资产阶段用 VoiceInfo adapter |
| `message_resource.db` | resource | inventory 计数；资产阶段解析资源证据 |
| 其他数据库 | unknown | 显式 `excluded_rows` + `exclusion_reason` |

`source_inventory` 的每个 `(snapshot, db, table)` 都记录 `discovered_rows`、`parsed_rows`、`deduplicated_rows`、`excluded_rows`。闭合条件是：

```text
discovered = parsed + deduplicated + excluded
```

未知 schema、缺少 shard-local `Name2Id` 或 deferred media/resource 不能静默跳过。

## 5. regular / biz 字段映射

regular 和 biz 使用同一源行形状，但保留独立 `source_adapter`。`Name2Id` 只能在当前 shard 内解释，不能跨数据库复用 rowid。

| 源字段/证据 | Canonical 字段 | 规则 |
|---|---|---|
| `Msg_<md5(username)>` | `messages.conv_id` | 先由 owner + conversation username 定位唯一 conversation |
| `local_id` | `local_id` | 源表内定位证据；与 source db/table 组成唯一键 |
| `server_id` | `server_id` | 按文本保存；非空且非 `0` 时参与稳定 UID 与去重 |
| `local_type` | `raw_type` | 保留完整 64 位值；禁止先转 JS Number 丢精度 |
| `local_type` 低 32 位 | `type` | `BigInt.asUintN(32)` 归一化 |
| `sort_seq` | `source_sort_seq` | 同秒真实排序的第一证据 |
| `real_sender_id` + shard `Name2Id` | `sender` / `person_id` | 映射成功为 `message-name2id`；失败不猜 |
| `create_time` | `occurred_at_epoch_s` / `time` | Unix 秒；`time_precision='second'` |
| archive time zone | `archive_day` | 使用 bundle 的 IANA 时区计算 `YYYY-MM-DD` |
| `message_content` | 内容 registry | 优先读取；空时再尝试 `compress_content` |
| `compress_content` | 内容 registry | zstd/文本解码后保留来源上下文 |
| 群消息正文前缀 | `sender_prefix` | 只作补充证据；与 Name2Id 冲突时记录 audit |
| db/table/snapshot | `source_*` | 永久保存回溯坐标 |

稳定 `message_uid` 优先绑定非零 server ID；没有 server ID 时绑定 owner、conversation、source db/table/local ID。语义相同的跨 shard 重复可去重，语义冲突必须使解析失败，不得任选一条。

## 6. 人物、会话与消息关系

```text
people(owner, username) 1 --- n conversations.owner_person_id
people(person_id)       0 --- n conversations.peer_person_id
conversations(id)       1 --- n messages.conv_id
people(person_id)       0 --- n messages.person_id
```

- `people` 的稳定 ID 由 owner + username 生成；显示名同时保存来源与 evidence JSON。
- `conversations` 只有一个 owner；私聊 peer 可为空，群聊不伪造单一 peer。
- `messages.person_id` 可空；`sender_name_snapshot` 保留解析当时的名字，避免后来改名破坏历史显示。
- `sender_source` 取 `message-name2id`、`group-prefix`、`private-self`、`private-peer` 或 `unknown`。
- `sender_audit` 保存 `group-prefix-mismatch`、`private-direction-unknown` 等原因。
- 没有足够证据时 `sender=''`、`person_id=NULL`，UI 使用稳定 sentinel `?` 过滤，并显示“未知发送者”。

## 7. Canonical 顺序与时间

每个 conversation 内先按下列证据稳定排序，再分配从 0 连续递增的 `canonical_seq`：

1. `occurred_at_epoch_s`
2. `source_sort_seq`
3. adapter 顺序：regular，再 biz
4. `source_db` 字典序
5. `local_id`

hash 或 `message_uid` 绝不用于决定同秒先后。`seq` 是 `canonical_seq` 的兼容别名；所有新消费者必须显式使用 canonical 字段。cursor v2 绑定 run ID、sequence 和 UID，跨 bundle cursor 失效。

服务端返回 bundle 的 `timeZone`；浏览器不得自行使用系统时区归日。列表显示 `HH:mm:ss`，详情、参与者最近发言和引用显示完整日期、秒与偏移。

## 8. 消息内容 registry

| kind | 主要类型 | 输出 |
|---|---|---|
| `text` | type 1 | 可读正文 |
| `media` | 图片、语音、视频、表情、位置、通话 | 占位文本 + file/CDN locator evidence |
| `app` | type 49、名片 | title、description、URL、file identifier、app name |
| `system` | 10000/10002 | 有界纯文本 |
| `unknown` | 未注册 low-32 type | 原 raw type + 明确占位，不丢源证据 |

结构化内容写入 `structured_content_json`；搜索可读 `text`，资产链路读取 locator evidence，二者不互相覆盖。

## 9. 资产证据模型

资产数据库使用六张规范表：

```text
asset_runs
  -> asset_sources
       -> asset_associations
            -> asset_candidates
            -> assets                 (仅非 quarantine)
       -> asset_materializations
```

- `asset_runs` 绑定 owner、source snapshot、account-root fingerprint、canonical run/database digest、resource DB digest 和 receipt。
- `asset_sources` 保存 resource/voice/link 来源、packed-info validity、lookup evidence、相对路径、大小和内容 SHA-256。
- `asset_associations` 保存 exact/partial/conflict/missing、确认状态、匹配/缺失/冲突字段与 `quarantined`。
- `asset_candidates` 保存所有候选消息，禁止只留“被选中的一条”。
- `assets` 只容纳 exact + confirmed 关联；partial/conflict/missing 只留在 quarantine。quarantine 不是第七张表，而是 `asset_associations.quarantined=1`，保留 candidates/materializations 且不生成 `assets` 行。
- `asset_materializations` 独立表达源是否存在、是否已物化、真实输出摘要和格式。

`packed_info` 中解析出的 hash 叫 lookup evidence，不叫 content digest。只有读取实际字节后计算的 SHA-256 才是 content digest。稳定 asset ID 由 message UID、规范资源证据、kind/data index 组成，不依赖资源数据库 rowid。

## 10. 媒体与语音物化

正式状态为：`not_attempted`、`key_unavailable`、`source_missing`、`cdn_only`、`decrypt_failed`、`unsupported_codec`、`thumbnail_only`、`ready`。失败状态必须有原因；`ready`/`thumbnail_only` 必须有真实输出摘要。

图片链路：

1. resource lookup evidence 映射本地 `.dat`；单靠 `aeskey` 或 `md5` 不等于内容匹配。
2. V1 仅处理严格验证的 legacy XOR；V2 AES 使用 AES-128-ECB + tail XOR。
3. V2 key 只由短生命周期 provider 注入，使用后清零；禁止默认读取或提交 `image_key.json`。
4. 解密后严格验证 JPEG/PNG/GIF/WebP/wxgf magic 与结构。
5. `wxgf` 必须找到真实 HEVC start code，并由参数数组调用 FFmpeg；转出后再次验证 JPEG magic。

语音链路读取 `VoiceInfo`，按 conversation、local/server ID、时间和 data index 对齐。unique 才可进入普通资产；missing/conflict 均 quarantine。支持识别 SILK、AMR、AMR-WB；未知 magic 为 `unsupported_codec`。

视频必须区分原片和缩略图。只有 `_thumb` 或图片载荷时为 `thumbnail_only`，不得冒充完整 mp4。CDN-only 不自动下载；“本地有”只表示本机缓存上限，不承诺补齐从未打开的媒体。

## 11. 能力矩阵

| 能力 | 状态 | 说明 |
|---|---|---|
| regular message shard | supported | 动态发现并闭合 inventory |
| biz message shard | supported | 独立 adapter，进入同一 canonical 顺序 |
| 人物映射 | conditional | Name2Id 或明确证据；未知保持未知 |
| resource packed_info | supported | 仅作 lookup evidence |
| VoiceInfo | conditional | unique 对齐与受支持 magic 才 ready |
| V1 `.dat` | conditional | 严格 XOR + 容器验证 |
| V2 AES `.dat` | conditional | 需要短生命周期 key |
| wxgf / HEVC | conditional | 需要合法 framing 与可用 FFmpeg |
| 视频原片 | conditional | 本地存在并验证时 supported |
| 视频缩略图 | supported | 明确 `thumbnail_only` |
| CDN-only | unsupported | 离线不越权下载，不伪造本地文件 |
| QQ 正文解密 | unsupported | 只记录边界，不绕过安全限制 |
| 本地缓存覆盖 | conditional | 只恢复实际落地且可验证的缓存，不承诺全量 |

## 12. 数据产品目录与激活

现行 product kind 为 `wechat`、`assets`、`library`、`insights`。不可变 bundle 按内容寻址，`catalog.current.json` 是唯一活动指针，`catalog.previous.json` 是最后可回滚版本。

manifest 包含：schema/run、bundle SHA-256、domain receipt、排序后的文件 size/hash、entrypoint、依赖产品的 run/schema/entrypoint digest 和 counts。派生产品指纹不匹配时，对应 feature 状态为 `dependency_mismatch`，不得静默读取 legacy。

发布顺序：

```text
build staging -> domain audit -> seal immutable product
-> validate candidate catalog + parent/CAS -> acquire lock -> journal: validated
-> atomically write validated current as previous -> journal: current_moved
-> atomically publish current -> verify digest -> journal: activated -> release lock
```

失败进入 `rolled_back` 或 `rollback_failed`；非终态 journal/lock 必须显式运行 `npm run data -- recover`。普通 activate 遇到 lock 会拒绝执行。current 存在但无效时 fail closed。`npm run data:doctor` 只报告无路径状态；`npm run data:prune` 只枚举未引用生成物，不删除 current、最后可用 previous、原始源或 archive。

## 13. Operation Catalog 与外部适配器

`shared/contracts/operations.ts` 的 `operationCatalog` 是唯一领域操作定义，声明 Zod input/output、只读标记、依赖能力和限额：

- `status`
- `list_conversations`
- `search_messages`
- `search_artifacts`
- `read_document`
- `get_message_context`
- `get_timeline_slice`
- `get_link_preview`

所有 adapter 映射同一 executor，但公开子集不同：

| Operation | generic HTTP | Agent | CLI/MCP/local |
|---|---:|---:|---:|
| `status` | yes | no | yes |
| `list_conversations` | yes | yes | yes |
| `search_messages` | yes | yes | yes |
| `search_artifacts` | yes | yes | yes |
| `read_document` | yes | yes | yes |
| `get_message_context` | yes | yes | yes |
| `get_timeline_slice` | yes | yes | no |
| `get_link_preview` | yes | yes | no |

`/api/local/v1` 与既有 MCP 工具名保持兼容，但不得维护第二套领域 schema。每个 operation 按需打开 chat/assets/documents/link；任一必需依赖不可用时该 operation 返回 unavailable，未声明的资源不打开。产品 release state、Operation dependency 和单文件 materialization/capability 是三条正交状态轴；资产不可用不能阻断纯聊天搜索。

## 14. HTTP 与文件能力

- 新 UI 数据：`/api/v1/data/*`
- 概览与洞察：`/api/v1/overview`、`/api/v1/insights`
- 会话、每日 facets、时间轴与资产：`/api/v1/chat/*`
- 统一文件能力：`/api/v1/files/:scope/:id/{content,text,archive,database,inspect,thumb,voice}`
- 通用 operation：`/api/v1/operations/:name`
- 本地兼容 API：`/api/local/v1/*`
- AI：`/api/ai/chat` 与 `/api/ai/agent`

`scope` 只允许 `archive`、`source`、`artifact`，具体能力由 policy 决定。route 只校验输入、调用 application service、映射 HTTP；未知 `/api/*` 在 SPA fallback 前返回 JSON 404。AI parser 为 2 MB，operation parser 为 256 KB；大 ZIP 只禁预览，不改动原文件。

无生产消费者的旧全量消息列表与全文 AI 注入路由已移除。Agent 通过有界搜索、消息上下文和 timeline slice 取证，不把整段会话一次性塞给模型。

## 15. Vite UI 与每日时间轴

URL 是页面状态来源：

- `/`
- `/chat/:conversationId`
- `/files`、`/insights`、`/academics`、`/media`、`/knowledge`
- `/settings/{summary,clues,synthesis,databases,candidates,ai}`

route module lazy load 页面和自有 CSS；`App` 只负责壳、导航、主题与 `Outlet`。共享 API client 校验 HTTP status、content type 与 Zod response，并区分 loading、empty、stale、unavailable。

聊天 URL 保存 `q`、`sender`、`day`、`messageUid`。`TimelinePage` 只返回消息和 cursor；participants 与 days 是独立 facets。右轨以 `YYYY-MM-DD` 虚拟化展示所有有消息日期，日期锚点由服务端提供首条 UID/sequence。所有消息按 canonical sequence 渲染，时间显示到秒。

开发：Vite 5173 代理 `/api` 到 Express 3456；preview 4173；生产由 Express 3456 提供 `dist` 和受限 SPA fallback。

## 16. 更新、审计与提交顺序

1. 在只读副本上生成 source manifest 和 `.next`/staging。
2. 运行 canonical source/chat audit，确认 inventory、人物、顺序、时区和 receipt 闭合。
3. 生成资产候选，运行 association/quarantine/materialization audit。
4. 生成 insights/library，并验证依赖 run/fingerprint。
5. seal 四个不可变产品，生成候选 catalog。
6. 停止使用旧 bundle 的服务后激活 catalog；代码 commit 与数据激活记录分离。
7. 运行 `npm test`、全部 typecheck、`npm run lint`、`npm run check:guardrails`、`npm run build` 和 `npm run test:e2e`。
8. 检查 UTF-8、隐私和 diff，再为当前阶段创建一次本地 commit。

任何步骤失败都保留旧 current；不得清理或改写原始数据。正式数据激活的 receipt 留在本地数据角色，不进入 Git。

## 17. 文档权威关系

本文是架构、字段、能力和激活规则的唯一 prose 权威。`00_overview`、`02` 至 `11`、RUNBOOK、PROMPT、SKILLS 均为补充说明，必须在开头声明状态。历史计划、旧部署教程和日期化 verification 只记录当时背景，不能覆盖本文。若本文与可执行 Zod/SQL 契约不一致，文档检查或领域审计必须失败，修正并复验后才能发布。
