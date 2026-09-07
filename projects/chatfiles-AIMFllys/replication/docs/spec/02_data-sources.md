# 02 · 数据源定位规格（微信 4.0 / QQ NT）

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一权威。路径示例必须替换为本机只读配置。

> 本文件回答一个问题：**机主自己的聊天数据库与附件文件，到底躺在磁盘的哪里？** 不解决这一步，后面的解密（[03_decryption.md](03_decryption.md)）、解析（[04_parsing.md](04_parsing.md)）全是空中楼阁。本项目前 42 个排查阶段最大的教训，就是**完全漏掉了真实的微信存储目录**（被迁移到了 `D:`，而默认的 `C:\…\xwechat_files` 是空的）。本规格把"目录 schema + 迁移陷阱 + 枚举方法"一次讲透。
>
> 所有机器相关路径、账号、QQ 号一律用 `{{占位符}}`。复刻者 MUST 用自己机器的真实值替换。
>
> 红线（贯穿全程，详见 [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)）：**只定位并处理机主本人的本地数据**；**只读原始**、只对副本操作；不上传、不外传；本步骤不触碰任何加密/解密逻辑，只做"找路径 + 只读盘点"。

---

## 1. 适用范围与版本基线（CANONICAL）

| 项 | 本项目实测基线（占位符替换前的真实形态） |
|---|---|
| 微信客户端 | **WeChat 4.1.9.35**，进程名 **Weixin.exe**（注意是 `Weixin`，不是旧版 `WeChat`） |
| 微信存储格式 | **4.0 新架构**（`xwechat_files\<account>\db_storage\*`，SQLCipher v4 加密） |
| QQ 客户端 | **QQ NT 9.9.20-36330**，进程名 **QQ.exe** |
| QQ 存储格式 | **NT 架构**（`nt_qq\nt_db\*`，自定义 `QQ_NT DB` 头 + SQLCipher 变体） |
| 操作系统 | Windows（本项目 Windows 11） |

> 版本号 MUST 被记录下来：4.0 与旧版 3.x（`WeChat.exe` + `Msg\*.db`）目录布局完全不同；4.1.9.x 又改了进程内存布局，直接影响 [03_decryption.md](03_decryption.md) 的取密钥方式。复刻者若版本不同，目录 schema 仍大体适用，但**密钥提取细节可能需要重新对齐**。

---

## 2. 微信 4.0 数据源

### 2.1 存储根目录：`xwechat_files\`

微信 4.0 把一切放在一个名为 **`xwechat_files`** 的根目录下。

- **默认位置**：`C:\Users\{{你的Windows用户名}}\xwechat_files\`
- **但它可被迁移**：微信「设置 → 通用设置 → 文件管理 → 存储位置」允许把存储根改到任意盘符/目录。**一旦迁移，默认 `C:\…\xwechat_files` 会变成空壳或只剩极少残留，真实数据全部在新位置。**

> ⚠️ **「迁移陷阱（moved store gotcha）」——本项目的头号坑**
>
> 本项目真实数据被迁到了 `D:\{{微信迁移目录}}\xwechat_files\`（实测形如 `D:\{{微信迁移目录}}\xwechat_files\`），而 `C:\Users\{{你}}\xwechat_files` 是空的。前 42 个排查阶段一直盯着 `C:` 看，**一个微信库都没找到**，误以为"数据不存在"。
>
> 复刻者 MUST NOT 假设数据在 `C:`。MUST 用 §2.4 的枚举方法**全盘确认**真实根目录，再继续。

### 2.2 账号目录：`xwechat_files\<account>\`

`xwechat_files\` 下每个**已登录过的微信账号**有一个独立子目录，目录名形如：

```
{{wxid}}_{{short}}/          形如：wxid_xxxxxxxxxxxxxxxx_xxxx
```

- 一台机器可有多个账号目录。本项目主账号目录形如 `wxid_xxxx_xxxx`（其 `message_0.db` 达 **673MB**），另可有多个次账号目录。
- **机主自己的 wxid** 也在目录名里（即 `{{机主标识}}`）——这一点在 [04_parsing.md](04_parsing.md) 里用来识别"我"；真实 wxid **不入仓库**，通过环境变量在本机注入（见 [09_ai-assistant.md](09_ai-assistant.md) 同理的本机配置思路与项目根 `.env.local`）。
- 除账号目录外，`xwechat_files\` 下还有一个 **`all_users\`**：其中 `all_users\login\{{wxid}}\key_info.db` 是登录/密钥相关元数据（**注意：它不是明文主密钥**，本项目最终的密钥来自进程内存而非此文件，见 [03_decryption.md](03_decryption.md)）。

### 2.3 账号目录内部 schema

一个账号目录的关键结构（只列与本项目相关的；`*` 为按需分片，可能有多个）：

```
{{wxid}}_{{short}}/
├─ db_storage/                       ← 所有 SQLCipher v4 加密数据库
│  ├─ message/
│  │  ├─ message_0.db                主聊天库（本项目主账号 673MB）★核心
│  │  ├─ message_1.db                聊天分片（库满后递增）
│  │  ├─ media_0.db                  媒体引用
│  │  ├─ message_resource.db
│  │  ├─ message_fts.db              全文索引（FTS，解密时可跳过）
│  │  └─ biz_message_0.db / biz_message_1.db   公众号/服务号消息
│  ├─ contact/
│  │  └─ contact.db                  联系人/群成员（含 name2id、contact 表）★核心
│  ├─ session/
│  │  └─ session.db                  会话列表（v4 进程探测用的标志库）★核心
│  ├─ favorite/   favorite.db        收藏
│  ├─ sns/        sns.db             朋友圈
│  ├─ bizchat/    bizchat.db
│  ├─ emoticon/   emoticon.db        表情
│  ├─ general/    general.db
│  ├─ hardlink/   hardlink.db        文件硬链接索引
│  ├─ head_image/ head_image.db      头像
│  └─ solitaire/  …                  其它业务库
└─ msg/                              ← 收到/发出的实体文件（明文，可直接归档）
   ├─ file/        …                 文档/任意文件
   ├─ image/       …                 图片（注意：很多是 .dat 加密图，见下）
   ├─ video/       …
   └─ ...
```

要点（CANONICAL）：

1. **`db_storage\*.db` 是 SQLCipher v4 加密的**。判据：文件头**不是** `SQLite format 3\x00`，而是 16 字节随机高熵 salt（本项目 `message_0.db` 头实测 `2e fc b6 fe …`）。MUST NOT 把"打不开/乱码"误判为损坏——那是正常的加密态。解密见 [03_decryption.md](03_decryption.md)。
2. **`msg\` 下的实体文件大体是明文**，可直接归档（[05 归档规格] / [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)）。本项目主账号 `msg\` 下约 **77,575 个文件、约 48GB**。
3. **`.dat` 加密图**：`msg\image\` 里大量 `.dat` 是微信私有加密图片（本项目 **69,820 个**），需单独的图片密钥（dat2img）才能还原，**本步骤不处理**，记入已知边界（[10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)）。
4. **`message_fts.db`（全文索引库）在解密阶段会被跳过**（文件名含 `fts`）——它对正文重建无价值，且结构特殊。见 [03_decryption.md](03_decryption.md) §6 的目标库收集逻辑。
5. **`-wal` / `-shm`**：微信运行时这些库会带 WAL/SHM 旁文件。**对副本操作**时它们一并复制即可；解密只针对 `.db` 主文件。

### 2.4 微信存储根的枚举方法（MUST 至少用其一确认）

复刻者 MUST 用以下方法之一**主动定位**真实根目录，而非假设默认路径：

**方法 A — 全盘搜目录名 `xwechat_files`（最稳，能戳穿迁移陷阱）**

PowerShell（遍历所有固定盘，找名为 `xwechat_files` 的目录）：

```powershell
Get-PSDrive -PSProvider FileSystem |
  ForEach-Object { $_.Root } |
  ForEach-Object {
    Get-ChildItem -Path $_ -Filter 'xwechat_files' -Directory -Recurse -ErrorAction SilentlyContinue -Force
  } | Select-Object FullName
```

> 全盘 `-Recurse` 可能很慢；可先只扫常见盘根（`C:\`, `D:\`, `E:\`）和用户目录。**关键是不要只看 `C:`。**

**方法 B — 按标志文件搜（更精准，直接命中账号目录）**

搜任意包含 `db_storage\session\session.db` 的目录——这是微信 4.0 账号目录的强标志（与 [03_decryption.md](03_decryption.md) 里 chatlog 的 `V4DBFile = db_storage\session\session.db` 一致）：

```powershell
Get-ChildItem -Path C:\,D:\ -Filter 'session.db' -File -Recurse -ErrorAction SilentlyContinue -Force |
  Where-Object { $_.FullName -like '*db_storage\session\session.db' } |
  ForEach-Object { $_.FullName }
```

命中后，向上回溯两级（`…\<account>\db_storage\session\session.db` → 账号目录 → `xwechat_files` 根）即得存储根。

**方法 C — 读运行中 Weixin 主进程的打开文件句柄 / 工作目录**

微信运行时，其主进程会**持有 `db_storage\*.db` 的打开句柄**，根目录就在句柄路径里。本项目的 `crackv4` / chatlog 正是用进程信息确定数据根（chatlog 的 `initializeProcessInfo` 从进程拿数据目录与账户名）。这条与 [03_decryption.md](03_decryption.md) 的进程探测天然衔接：找到微信主进程 PID 的同时就拿到了账号目录路径。

> 工具辅助：可借助 Sysinternals `handle.exe` 或 `Get-Process Weixin | …` + 句柄枚举确认。但**这是只读盘点**，MUST NOT 在此步骤做任何写入。

### 2.5 「实时 vs 备份」副本选择（与解密强相关）

本项目同时存在两份微信存储：

- **LIVE（实时，进程正在用，有文件锁）**：`C:\Users\{{你}}\xwechat_files\…`（若未迁移）或迁移后的实时根。
- **BACKUP（备份，无文件锁，更安全）**：`D:\{{微信迁移目录}}\xwechat_files\…`。

权衡（MUST 理解，否则会与 [03_decryption.md](03_decryption.md) 的前提冲突）：

- **取密钥**（扫进程内存）MUST 针对**正在运行且已登录**的微信进程——密钥只在活进程内存里。
- **解密落盘**则 SHOULD 针对**副本**（把目标 `.db` 复制到 `work/` 再解，或对 BACKUP 根操作），**绝不在原始文件上原地改写**。
- 一个细节：进程内存里只有**微信当前打开着的库**才有其派生密钥（per-DB encKey 常驻），所以"哪份副本里的库被微信打开"会影响能否取到对应密钥。本项目实践：**密钥从 LIVE 进程内存取，解密对副本/备份执行**——二者 salt 必须一致（同一账号同一库，salt 即文件前 16 字节，相同来源即相同）。详见 [03_decryption.md](03_decryption.md)。

---

## 3. QQ NT 数据源

### 3.1 存储根目录：`nt_qq\`

QQ NT 把数据放在腾讯文件目录下、以 QQ 号分隔：

```
C:\Users\{{你}}\Documents\Tencent Files\{{QQ号}}\nt_qq\
├─ nt_db/                            ← 聊天数据库（加密，难）
│  ├─ nt_msg.db                      主消息库（本项目 298MB）
│  ├─ group_msg_fts.db              群消息全文索引
│  ├─ group_info.db                 群信息
│  └─ ...                            其它 nt_*.db
└─ nt_data/                          ← 附件（明文，可直接归档）
   ├─ Pic/                           图片
   ├─ Video/                         视频
   ├─ Ptt/                           语音
   └─ File/                          文件
```

- `{{QQ号}}`：是一个纯数字目录（你的 QQ 号；真实号码不入仓库）。
- 定位方法同微信方法 A/B：全盘搜目录名 `nt_qq`，或搜 `nt_msg.db` 文件并回溯。

### 3.2 QQ 数据库的特殊性（已知边界，不在本项目解密范围）

`nt_qq\nt_db\nt_msg.db` 的文件头是 **`SQLite header 3\0` 之后紧跟自定义 `QQ_NT DB` 标记**——这是腾讯在 SQLCipher 之上加的自定义格式：

- salt **不在文件偏移 0**（与微信不同），且有自定义明文头；
- 比微信难、且强版本相关。

**本项目的处置（MUST 如实记录，MUST NOT 绕过）**：QQ 聊天**正文未解密**。一次独立的自动化解密尝试被使用政策（网络安全内容）拦截，**未绕过、未继续**。完整边界说明见 [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)。

### 3.3 QQ 附件（可直接用，明文）

`nt_qq\nt_data\` 下的 `Pic / Video / Ptt / File` 是**明文实体文件**，无需任何解密即可归档进"文件"板块。本项目从这里归档了 QQ 附件（实测 227 个）。这是 QQ 侧唯一进入产品的数据。

---

## 4. 盘点产物（本步骤交付物）

本步骤**只产出一张"数据源清单"**（只读盘点的结果），不解密、不复制原始大文件。建议记录字段：

| 字段 | 说明 | 本项目示例 |
|---|---|---|
| 平台 | wechat / qq | wechat |
| 账号 | 账号目录名 / QQ 号 | `{{wxid}}_{{short}}` |
| 存储根 | 实际定位到的根（**注明是否被迁移**） | `D:\{{微信迁移目录}}\xwechat_files\`（已迁移） |
| 核心加密库 | 路径 + 大小 + 是否加密 | `db_storage\message\message_0.db`，673MB，SQLCipher v4 |
| 实体文件根 | `msg\` / `nt_data\` 路径 + 文件数/体量 | `msg\`，77,575 文件 / 48GB |
| 是否在跑/已登录 | 取密钥前提 | 是 |

这张清单直接驱动：

- [03_decryption.md](03_decryption.md)：拿"账号目录"与"微信主进程 PID"去取密钥+解密；
- [04_parsing.md](04_parsing.md)：拿解密后的库做 schema 解析；
- 归档/产品边界：见 [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)。

---

## 5. 本步骤的红线复述（MUST）

- **只定位机主本人的本地数据**；MUST NOT 触碰他人设备/账号的数据。
- **只读原始**：盘点、句柄枚举、读文件头判断加密——全部只读。MUST NOT 在原始 `xwechat_files\` / `nt_qq\` 内做任何删除、移动、改写。后续解密 MUST 对副本进行。
- **不上传、不外传**任何路径下的真实数据。
- QQ 正文不在本项目解密范围（[10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)），MUST NOT 尝试绕过安全限制。

> 下一步：在确认了"存储根 + 账号目录 + 微信主进程在跑且已登录"之后，进入 [03_decryption.md](03_decryption.md) 完成 SQLCipher v4 解密。整体操作顺序参见 [../RUNBOOK.md](../RUNBOOK.md)。
