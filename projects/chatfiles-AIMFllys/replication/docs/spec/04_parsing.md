# 04 · 微信解密副本解析与身份审计

> 文档状态：补充说明；现行 Canonical schema、字段和顺序以 [01_architecture.md](01_architecture.md) 为唯一权威。

> 本章规定从微信 4.x 解密副本生成候选明文库的完整契约。关键词 **MUST / MUST NOT / SHOULD** 按 RFC 2119 理解。所有中文、路径和 JSON 均使用 UTF-8。

---

## 1. 安全边界与默认产物

解析器入口为 `scripts/parseWeChat.ts`，核心实现位于 `scripts/wechat/parserRunner.ts`。它 **MUST** 只读取：

```text
work/decrypted/wechat/<snapshot>/db_storage/
```

默认一次运行只允许新建以下产物：

```text
data/wechat.next/
├── wechat.db
├── index.json
└── transcripts/
```

其中 `runId` 默认为 UTC 时间戳加进程号；测试或受控运行可通过安全字符组成的 `CHATFILES_RUN_ID` 固定。解析器：

- **MUST NOT** 删除、截断、改名或覆盖任何现有文件；
- **MUST NOT** 写 `data/wechat.db`、`data/wechat/index.json` 或 `work/chat-text/`；
- **MUST** 在启动时检查最终 `data/wechat.next/` bundle；已存在即非零退出；
- **MUST** 先在 `data/` 下独占创建隐藏的 `.wechat.next.<token>.staging/` 完整 bundle；
- **MUST** 只在 staging DB 已关闭、WAL 已 checkpoint、index 已完整写入、transcript 全部写完且 `parse_runs` 完成记录已落库后，才用一次同卷目录 `rename` 发布整个 bundle；
- 任一构建或发布步骤失败时，最终 `data/wechat.next/` **MUST** 不存在；staging bundle 可保留供诊断；
- **MUST NOT** 在源代码中调用 `rmSync`、`unlinkSync` 等删除 API。

next 产物只有通过严格审计后才能由人工或单独的受控切换步骤提升为活动库。解析器本身不做提升。

---

## 2. Canonical Owner 与快照选择

### 2.1 Owner 唯一解析

项目根 `.env.local` **MUST** 提供：

```dotenv
VITE_OWNER_WXID=<机主 wxid 的唯一片段>
```

对每个一级快照目录，解析器从该快照自己的 `contact.db.contact.username` 中查找包含此片段、且不是 `@chatroom` 的 username：

- 恰好一个匹配：该完整 username 是快照的 `canonical owner`；
- 零个或多个匹配：立即失败；
- 目录名、昵称、备注和数字 sender id **MUST NOT** 代替 canonical owner。

所有会话 ID 使用稳定 owner：

```text
wx:<canonical-owner>:<conversation-username>
```

`conversations.account` 保留被选择的快照目录名，`conversations.owner` 保存 canonical owner。

### 2.2 严格子集证明

解析器先扫描全部快照，不创建输出。每条消息的覆盖键由“稳定身份 + 语义证据”共同组成：

1. 稳定身份：非零 `server_id`，否则为 `source_db + source_table + local_id`；
2. 原始 `raw_type`；
3. `create_time`；
4. `real_sender_id` 经该消息所在分片自己的 Name2Id 解析出的 username（缺失则空）；
5. `message_content` 原始字节 SHA-256；正文为空时改用 `compress_content` 原始字节 SHA-256。

覆盖判断 **MUST NOT** 只比较 server/local id。同一个稳定 ID 只要类型、时间、sender 或原始正文哈希变化，就不是同一覆盖键，旧/新快照不得据此建立严格子集关系。

只有同时满足以下条件，旧快照 A 才能被新快照 B 排除：

- A 与 B 的 canonical owner 完全相同；
- B 的消息库更新时间晚于 A；
- A 的每个会话都存在于 B；
- 每个会话中 A 的所有消息覆盖键都存在于 B；
- B 至少多一个会话、消息键，或覆盖到更早的首条消息。

选择逻辑复用 `chooseAccountSnapshots`。相同 owner 下只要剩余两个无法证明严格覆盖关系的快照，就 **MUST** 全部保留在内存并以“歧义”失败，禁止静默拼接。不同 owner 的快照永不互相排除。

---

## 3. 源数据库契约

### 3.1 联系人与会话

`contact.db`：

```sql
SELECT username, nick_name, remark, alias FROM contact;
```

显示名统一为：

```text
remark || nick_name || alias || username
```

群聊仅由 `username.endsWith('@chatroom')` 判定。`chat_room` 表可缺失；存在时用于补齐群 username。

`session.db` 可选读取：

```sql
SELECT username, summary, last_timestamp FROM SessionTable;
```

summary 仅作元数据，不参与消息数量。

### 3.2 消息表与分片 Name2Id

候选表名仍为：

```text
Msg_<md5(UTF-8(username))>
```

`message_0.db` 与 `message_1.db` **MUST** 被当作两个独立 sender 命名空间。每个分片打开后分别读取自己的：

```sql
SELECT rowid AS id, user_name FROM Name2Id;
```

禁止读取 `contact.db.name2id`，也禁止把一个消息分片的 `Name2Id` 用到另一个分片。

`sourceReader.ts` 读取：

```sql
SELECT
  local_id,
  CAST(server_id AS TEXT) AS server_id,
  CAST(local_type AS TEXT) AS raw_type,
  sort_seq,
  real_sender_id,
  create_time,
  message_content,
  compress_content
FROM "<Msg_table>"
ORDER BY sort_seq, local_id;
```

- `server_id` **MUST** 全程保持 TEXT，不能经过 JavaScript Number；
- `raw_type` 先按十进制字符串读取，写 SQLite 时用 BigInt，避免 64 位精度损坏；
- `local_id`、`sort_seq` 与来源分片/表必须保留。

---

## 4. 正文、类型与人物解析

### 4.1 UTF-8 与压缩

`message_content` / `compress_content` 可能为字符串、BLOB 或空值。BLOB 若以 `28 b5 2f fd` 开头，使用 zstd 解压。所有字节到文字的转换 **MUST** 使用 fatal UTF-8 解码：

- 非法 UTF-8：解析失败；
- zstd 解压失败：解析失败；
- 禁止用 U+FFFD 替换后继续；
- transcript 和 JSON 显式用 `encoding: 'utf8'` 写入。

### 4.2 64 位原始类型

`raw_type` 保存原始 64 位整数，基础类型为：

```ts
type = Number(BigInt.asUintN(32, BigInt(raw_type)))
```

即取低 32 位。标签映射：

| type | type_label |
|---:|---|
| 1 | text |
| 3 | image |
| 34 | voice |
| 42 | card |
| 43 | video |
| 47 | sticker |
| 48 | location |
| 49 | app |
| 50 | voip |
| 10000 / 10002 | system |
| 其它 | type_<n> |

### 4.3 群正文前缀与 Name2Id

群正文可含：

```text
<sender_wxid>:
<正文>
```

前缀正则固定为 `/^([0-9A-Za-z_@.\-]+):\n/`。人物优先级为：

1. 同一个 message DB 分片的 `real_sender_id -> Name2Id`；
2. 映射缺失时，可信群正文前缀；
3. 两者都缺失时，明确未知。

若 Name2Id 与正文前缀同时存在且不同：

- `sender` 保留 Name2Id 的权威值；
- `sender_prefix` 保留正文值；
- `sender_audit = 'group-prefix-mismatch'`；
- 严格审计必须失败。

### 4.4 私聊不得猜身份

私聊中：

- 同源 Name2Id 有值时，使用该 username；
- Name2Id 缺失时，`sender=''`、`sender_name='未知发送人'`、`sender_source='unknown'`；
- 禁止根据气泡顺序、会话对端、文本内容或目录名猜“本人/对方”；
- 已解析 sender 若既不是 canonical owner 也不是会话 peer，严格审计失败；
- `is_own=1` 当且仅当 `sender === canonical owner`。

---

## 5. 排序、去重与稳定 ID

每个会话合并两个消息分片后，**MUST** 按以下键稳定升序：

```text
time, sort_seq, source_db, local_id
```

写入前依次保护：

1. `(source_db, source_table, local_id)` evidence key 重复；
2. 同会话非零 `server_id` 重复；
3. `message_uid` 重复。

exact evidence key 重复无论内容是否相同都 **MUST** 立即失败。只有跨不同 evidence 的非零 `server_id` 或 `message_uid` 重复，才允许在以下语义指纹完全一致时折叠：

```text
create_time + raw_type + resolved sender + extracted text
```

若任一字段不同，解析器 **MUST** 抛出 `Conflicting duplicate` 并停止 staging 构建，禁止静默保留第一条。允许折叠且完全一致时保留稳定排序后的第一条，并计入 `deduplicated_message_count`。

`message_uid` 基于：

```text
canonical owner + conversation username
+ (非零 server_id；否则 source_db + source_table + local_id)
```

生成稳定 SHA-256。输出库再以唯一索引约束 message_uid、evidence key 和非零 server_id，形成第二道保护。去重完成后 `seq` 从 0 连续编号。

---

## 6. next 数据库 Schema

```sql
CREATE TABLE contacts(
  account TEXT,
  owner TEXT,
  username TEXT,
  display TEXT,
  nick TEXT,
  remark TEXT,
  alias TEXT,
  is_group INTEGER
);

CREATE TABLE conversations(
  id TEXT PRIMARY KEY,
  account TEXT,
  owner TEXT,
  username TEXT,
  display TEXT,
  is_group INTEGER,
  msg_count INTEGER,
  text_count INTEGER,
  first_time INTEGER,
  last_time INTEGER,
  summary TEXT
);

CREATE TABLE messages(
  conv_id TEXT,
  message_uid TEXT,
  seq INTEGER,
  source_snapshot TEXT,
  source_db TEXT,
  source_table TEXT,
  local_id INTEGER,
  server_id TEXT,
  sort_seq INTEGER,
  time INTEGER,
  sender TEXT,
  sender_name TEXT,
  sender_prefix TEXT,
  is_own INTEGER,
  sender_source TEXT,
  sender_audit TEXT,
  raw_type INTEGER,
  type INTEGER,
  type_label TEXT,
  text TEXT
);

CREATE TABLE parse_runs(
  run_id TEXT PRIMARY KEY,
  status TEXT,
  completed_at TEXT,
  selected_snapshot_count INTEGER,
  selected_source_count INTEGER,
  source_conversation_count INTEGER,
  source_message_count INTEGER,
  output_conversation_count INTEGER,
  output_message_count INTEGER,
  output_text_count INTEGER,
  deduplicated_message_count INTEGER
);
```

必要索引：

```sql
CREATE INDEX idx_msg_conv_order
  ON messages(conv_id, time, sort_seq, source_db, local_id);
CREATE UNIQUE INDEX idx_msg_uid ON messages(message_uid);
CREATE UNIQUE INDEX idx_msg_evidence
  ON messages(conv_id, source_db, source_table, local_id);
CREATE UNIQUE INDEX idx_msg_server
  ON messages(conv_id, server_id)
  WHERE server_id IS NOT NULL AND trim(server_id)<>'' AND server_id<>'0';
```

`msg_count` 与 `text_count` 必须从最终去重消息重新计算。候选 DB 完成时必须恰好插入一条 `parse_runs`，且：

- `status='complete'`，`completed_at` 非空；
- selected snapshot/source 数为正；
- `source_conversation_count = output_conversation_count`；
- `source_message_count = output_message_count + deduplicated_message_count`；
- output 三项计数与实际 conversations/messages/文本消息查询完全相等；
- 会话或消息为零时禁止写完成记录、禁止发布最终路径。

---

## 7. Index 与版本化 Transcript

`data/wechat.next/index.json` 至少保存：

- `generatedAt`、`runId`；
- 被选择的 `account + owner`；
- 被严格排除的快照及其替代者；
- 总会话/总消息数；
- 每个会话的 owner、account、首末时间与计数。

每个含文本的会话在 `data/wechat.next/transcripts/` 生成一个 UTF-8 文件。文件名由安全化 display/username 加 username hash 组成，使用独占创建，避免截断后重名覆盖。Header 必须同时保留 owner 与 username；对应 `runId` 保存在同 bundle 的 index 与 `parse_runs` 中。

---

## 8. 运行与严格验收

仅在已备份当前活动库并确认 next 路径为空后运行：

```powershell
npx tsx scripts/parseWeChat.ts
npx tsx scripts/auditChatIdentity.ts --source work/decrypted/wechat --db data/wechat.next/wechat.db --strict
```

严格审计至少检查：

- canonical owner 唯一；
- 同 owner 只剩一个已选择快照；
- `parse_runs` 恰好一条且状态为 complete；
- source/output/deduplicated 计数闭合，输出会话与消息均非零；
- message_uid、evidence key、非零 server_id 无重复；
- message provenance 字段完整；
- 每条输出消息必须从 provenance 指定的源行重新派生，并与源 `server_id/raw_type/create_time/sort_seq`、规范化 `text` 完全一致；
- `sender` 必须来自同一 message shard 的 Name2Id/群前缀规则，`sender_name` 必须与该 snapshot 的 contact 显示名规则完全一致；
- 私聊 sender 仅为 owner、peer 或空；
- 群前缀与同源 Name2Id 冲突数为 0；
- `type` 等于 `raw_type` 低 32 位；
- `seq` 连续且排序不回退；
- `is_own` 与 canonical owner 一致；
- 会话计数与消息表一致；
- 中文无 U+FFFD，抽样 UTF-8 往返一致；
- 旧活动 DB/index/transcript 的 hash 未改变。

通过审计前，**MUST NOT** 将 next 文件提升为活动产物。
