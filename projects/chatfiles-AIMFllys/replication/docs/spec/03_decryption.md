# 03 · 解密规格（微信 4.0 SQLCipher v4，完整可复现）

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一权威。只允许处理机主明确授权的本地副本。

> 这是全项目技术含量最高、也最容易被现成工具卡住的一步。本文件的目标是：**让任何人照着做，就能把自己机器上、自己微信账号的 `db_storage\*.db` 解密成明文 SQLite。** 不是"贴个命令"，而是把"为什么现成工具失效 + 我们打了哪两个补丁 + 真正奏效的派生密钥内存扫描算法 + SQLCipher v4 全部参数"讲到能独立重写。
>
> 本项目结果：主账号 **17 个数据库全部解密成功，0 坏页**（`message_0.db` 673MB、`contact.db`、`session.db`、`favorite.db` 等核心库全过）。
>
> 占位符：`{{微信主进程PID}}`、`{{账号目录}}`、`{{输出目录}}`、版本号等用自己的真实值替换。

---

## 0. 前提与红线（MUST，先读）

**前提（缺一不可）**：

1. **微信进程正在运行且已登录**。本方案的密钥**只存在于活进程内存中**——微信一旦退出/登出，派生密钥即从内存消失，无从扫描。MUST 保持微信处于已登录前台/后台运行态。
2. 已按 [02_data-sources.md](02_data-sources.md) 定位到**账号目录**（含 `db_storage\`）与**微信主进程 PID**。
3. 机器上有（或能自建）Go 工具链；纯 Go 的 `crackv4` 不需要 C 编译器，但参考实现 chatlog 的部分包需要 CGO（见 §1）。

**红线（贯穿，详见 [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)）**：

- **只解密机主自己的本地数据**；MUST NOT 对他人账号/设备操作。
- **只读原始、只对副本操作**：解密 MUST 写到独立输出目录（如 `work/decrypted/…`），MUST NOT 原地改写 `xwechat_files\` 内任何文件。读取进程内存与读原始库首页均为只读。
- **不上传、不外传**密钥与明文数据。
- **不运行来路不明的二进制**：Go / WinLibs mingw-gcc / chatlog 源码 / crackv4 **全部官方下载、本地编译、源码可审计**。MUST NOT 下载并运行任何预编译的"破解器"。
- QQ 正文不在本规格范围（自定义格式 + 政策边界，见 [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)）；MUST NOT 绕过安全限制。

---

## 1. 自建工具链（机器无 Go、无 C 编译器时）

本项目机器初始只有 Python / Node / git / cargo，**没有 Go，也没有 C 编译器**。全部用免管理员的"解压即用"方式自建到 `work/` 下：

### 1.1 Go 工具链

1. 从官方 `go.dev/dl` 下载 Windows amd64 的 **zip**（本项目用 `go1.26.4.windows-amd64.zip`，MUST 用官方校验和核对）。
2. 解压到 `work/go-toolchain/`（无需安装、无需管理员）。
3. 用本地 GOPATH/GOCACHE，避免污染全局：
   - `GOROOT = work/go-toolchain/go`
   - `GOPATH = work/gopath`
   - `GOCACHE = work/gocache`

### 1.2 C 编译器（CGO 用，仅 chatlog 参考实现需要）

1. 下载 **WinLibs mingw-w64 gcc** 的 zip（形如 `winlibs-x86_64-…-gcc-…-ucrt-…zip`，官方站 `winlibs.com`）。
2. 解压到 `work/mingw64/`，得到 `work/mingw64/bin/gcc.exe`。
3. 给 CGO 用：`CGO_ENABLED=1`、`CC = work/mingw64/bin/gcc.exe`。

> **注意**：真正奏效的 `crackv4` 是**纯 Go、无 CGO**（只用 `crypto/*`、`golang.org/x/crypto/pbkdf2`、`golang.org/x/sys/windows`）。mingw-gcc 只是为了能编译 chatlog 整体（它依赖 `go-sqlite3`/`go-silk`/`go-lame` 等 CGO 包）以作对照参考。**如果你只想解密、不要 chatlog 全家桶，可跳过 mingw，直接 `go build` crackv4。**

### 1.3 chatlog 参考实现（源码）

chatlog（`github.com/sjzar/chatlog`）是本项目的参考实现与"零件库"（我们复用它的 `common.DecryptPage` 与 v4 常量）。

- **它的 GitHub 仓库已被下架**（只剩一个 README，源码被清空）。
- 但 **`go install github.com/sjzar/chatlog@latest` 仍能从 Go module proxy 拉到 v0.0.31 源码**进 module cache。
- 把它从 module cache **复制**到可写目录 `work/chatlog-build/`（cache 里的文件是只读的，复制后 MUST **清掉只读属性**才能改/编）。
- 在 `work/chatlog-build/` 内编译（CGO_ENABLED=1，CC 指向 §1.2 的 gcc）。

> 复刻者若 proxy 也取不到，可用任意 v0.0.31 等价源码；本规格 §5–§7 把解密所需的全部算法与常量都写全了，**即使没有 chatlog 也能从零重写 `DecryptPage`**。

---

## 2. 为什么不能直接用 chatlog 的 `key` 命令（两个失效点 + 两个补丁）

直接跑 chatlog 的 `key` 命令在 WeChat 4.1.9.35 上会失败。实测日志：

```
ERR failed to get key error="no valid key found"
```

根因有两个，分别打一个补丁。

### 2.1 失效点一：主进程被误判为子进程（进程探测补丁）

**现象**：chatlog 报 "wechat process not found" / 拿不到进程。

**根因**：chatlog 的进程探测 `detector.go` 对 v4 同名进程靠 cmdline 区分主/子进程。微信 4.0 会起多个 `Weixin.exe`（主进程 + 渲染/工具子进程）。原逻辑把 **cmdline 里含任意 `--` 的进程当作子进程跳过**。但**从任务栏启动的主进程**，其 cmdline 恰恰是：

```
Weixin.exe --scene=taskbarpins
```

含 `--` → 被原逻辑误当子进程跳过 → 一个主进程都不剩 → "not found"。

**补丁（patch ①）**——`internal/wechat/process/windows/detector.go`：把跳过条件从"含 `--`"收紧为"含 `--type=`"（只有真正的渲染/工具子进程才带 `--type=…`）：

```go
// 改前：
//   if strings.Contains(cmdline, "--") {
//       continue
//   }
// 改后：
if strings.Contains(cmdline, "--type=") {
    continue
}
```

这样 `Weixin.exe --scene=taskbarpins`（主进程）不再被误跳，`Weixin.exe --type=renderer …`（子进程）仍被正确跳过。

### 2.2 失效点二：内存 STRUCT pattern 在 4.1.9.x 失配（取密钥补丁）

**现象**：进程找到了，但 `no valid key found`。

**根因**：chatlog v4 取密钥的思路是——在进程私有内存里找一个**指针结构 pattern**，原始 pattern 要求 `[8×0x00][uint64 len == 0x20][8 字节前是指向 32 字节密钥的指针]`，**且**还要求一个**尾部 `uint64 capacity == 0x2F`** 字段。这个布局是**强版本相关**的；微信 **4.1.9.x 改了内存布局**，尾部约束失配 → 找不到候选 → 无密钥。

**补丁（patch ②）**——`internal/wechat/key/windows/v4_windows.go`：**放宽 pattern**，去掉尾部 `0x2F`（capacity）约束，只保留 `[8 个 0x00 字节][uint64 == 0x20(=32)]`，并仍取其前 8 字节作为"指向密钥的指针"，再对指针指向的 32 字节做完整 SQLCipher 校验：

```go
// 放宽后的 pattern（原版尾部还要求一个 uint64 capacity==0x2F，已删除）：
keyPattern := []byte{
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
}
// 候选集变大，但每个候选仍由完整 SQLCipher 校验确认，不会误报。
```

> **关键结论**：放宽 pattern **能扩大候选集但并不可靠**——它仍假设密钥被一个特定的"指针 + 长度"结构包着。本项目最终**不靠 pattern**，而靠 §3 的**派生密钥内存暴扫**（`crackv4`）。patch ② 仅作对照/兜底；patch ① 则是无论用哪种方法都需要的（否则连进程都找不到）。

---

## 3. 真正奏效的解法：派生密钥内存扫描（crackv4）

### 3.1 核心洞察（为什么暴扫是可行的）

SQLCipher v4 的密钥体系是两层：

```
原始密钥 rawKey ──PBKDF2-SHA512(rawKey, salt, 256000 轮)──▶ encKey（页加密用，AES-256）
encKey       ──PBKDF2-SHA512(encKey, salt⊕0x3a, 2 轮)──▶ macKey（页 HMAC 用）
```

- **校验一个"原始密钥"候选**要先跑 **256000 轮 PBKDF2-SHA512**（极贵）——这就是为什么暴扫 rawKey 不现实。
- **但微信进程内存里直接存着 encKey**（每个打开的库都有一份派生好的 encKey 常驻）。**校验一个 encKey 候选只需 2 轮 PBKDF2 算出 macKey + 一次 HMAC-SHA512**（极便宜）。

于是策略反过来：**不暴扫 rawKey，直接全量暴扫进程私有内存找 encKey**。每个 32 字节窗口先过极廉价的预筛，再用便宜的 HMAC 终判。这与版本无关——不依赖任何内存布局 pattern，所以 4.1.9.x 改了布局也照样工作。

> **per-DB 性质（MUST 理解）**：encKey 是**逐库不同**的——因为它由 `PBKDF2(rawKey, salt, …)` 派生，而 **salt = 各库文件前 16 字节、各库不同**。所以**对每个目标库都要各扫一遍内存**（实现上：一次性把内存读进来，循环对每个库扫）。而且**只有微信当前打开着的库**其 encKey 才在内存里——主聊天/联系人/会话/收藏等核心库通常都处于打开态，故能取到；冷门未打开的库可能 MISS。

### 3.2 实现文件与构建

实现：`work/chatlog-build/tools/crackv4/main.go`（纯 Go，无 CGO）。构建：

```
go build -o work/crackv4.exe ./tools/chatlog-build/tools/crackv4
# 实际相对路径以你放置 crackv4 的位置为准；本项目为 work/chatlog-build 下 tools/crackv4
```

它仅 import：`crypto/aes`、`crypto/cipher`、`crypto/hmac`、`crypto/sha512`、`encoding/binary`、`golang.org/x/crypto/pbkdf2`、`golang.org/x/sys/windows`，以及复用 chatlog 的 `internal/wechat/decrypt/common`（`DecryptPage` / 常量 / `XorBytes`）。

### 3.3 算法分步（可据此从零重写）

#### 步骤 A — 收集目标库

遍历 `{{账号目录}}\db_storage\`，收集所有 `*.db`，**排除文件名含 `fts`** 的全文索引库（结构特殊、无正文价值）。对每个候选读首页 4096 字节，若首 15 字节已是 `"SQLite format 3"` 则跳过（已是明文）。其余即"加密目标"。

对每个目标库，从**首页（page 1，文件前 4096 字节）**取出 4 个量：

| 量 | 取法 | 字节范围 |
|---|---|---|
| `salt` | 文件前 16 字节（**不加密**，明文存盘） | `page1[0:16]` |
| `macSalt` | `salt` 每字节 XOR `0x3a` | 由 salt 计算 |
| `iv` | 首页加密区的 IV | `page1[pageSize-reserve : +16]` = `page1[4016:4032]` |
| `cipher0` | salt 之后第一块密文（用于 AES 首块头校验） | `page1[16:32]` |

（pageSize=4096、reserve=80，见 §5；故 `pageSize-reserve = 4016`。）

#### 步骤 B — 读取进程私有内存

`OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, {{PID}})`，用 `VirtualQueryEx` 从地址 0 起逐个区枚举，**只收满足以下全部条件的区**（`ReadProcessMemory` 读进缓冲）：

- `State == MEM_COMMIT`（已提交）；
- 可读保护位：`Protect` 命中 `PAGE_READONLY | PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE` 之一，且**不含** `PAGE_GUARD`、`PAGE_NOACCESS`；
- `Type == MEM_PRIVATE`（`0x20000`）——密钥在私有内存而非映射文件/镜像里。

> **与 chatlog 的关键差异（这是本方案奏效的核心之一）**：chatlog 的 `findMemory` **跳过 `< 1MB` 的小区**（`if memInfo.RegionSize < 1024*1024 { continue }`）。**crackv4 去掉了这个"≥1MB"限制**——派生密钥常常落在很小的私有分配里，跳过小区就会漏掉密钥。MUST NOT 保留该体积下限。

把所有合格区读成 `[][]byte` 一次性留在内存里（供所有库复用），统计总字节数。若总字节为 0 → PID 错误或无访问权限，报错退出。

#### 步骤 C — 对每个库扫描候选 encKey（三级校验，由便宜到贵）

对每个内存区缓冲，**以 8 字节对齐**滑动，取每个 **32 字节窗口 `cand`** 作为候选 encKey，依次过三道校验（任一不过即跳到下个窗口，并行多 worker 加速）：

1. **熵预筛（极廉价）**：`cand` 中**不同字节数 ≥ 20** 才继续。真实 256-bit 密钥熵高；这一步先甩掉海量低熵窗口（全 0、重复填充等）。

2. **AES 首块 SQLite 头校验（廉价）**：用 `cand` 作 **AES-256** 密钥、用该库的 `iv` 作 IV，**CBC 解 `cipher0`（即 `page1[16:32]`）** 得到 `dec[0:16]`。这 16 字节对应**明文 SQLite 头的偏移 16..31**。SQLCipher 加密时**不加密前 16 字节 salt**，但**会加密**头的其余部分；解出来后这些字节应等于 SQLite 头里的固定常量，于是校验：

   ```
   dec[0]==0x10 && dec[1]==0x00     // 偏移16..17：页大小 = 0x1000 = 4096
   && dec[5]==0x40                  // 偏移21：固定常量 0x40
   && dec[6]==0x20                  // 偏移22：固定常量 0x20
   && dec[7]==0x20                  // 偏移23：固定常量 0x20
   ```

   （偏移 16–17 是 SQLite 头的"页大小"大端字段 = 4096；21/22/23 是 SQLite 头里"最大/最小嵌入有效载荷比例 + 叶子有效载荷比例"等固定字节。这一步把候选从"熵够高"收窄到"AES 解出来真像个 SQLite 头"，**几乎零误报**，且**只做一次 AES 块解密**，远便宜于 HMAC。)

3. **HMAC 终判（确认，仍便宜——只有 2 轮 KDF + 一次 HMAC）**：

   ```
   macKey = PBKDF2-SHA512(cand, macSalt, iter=2, dkLen=32)   // macSalt = salt ⊕ 0x3a
   mac    = HMAC-SHA512(macKey, page1[16 : 4032] ‖ uint32LE(1))
   通过当且仅当  mac == page1[4032 : 4096]   // storedMAC（首页末尾 64 字节）
   ```

   注意 HMAC 覆盖范围：从 `page1[SaltSize=16]` 到 `dataEnd = pageSize - reserve + IVSize = 4096 - 80 + 16 = 4032`（即把每页末尾的 IV 也纳入 MAC），再追加**小端 4 字节页号 1**。这与 SQLCipher 的页 MAC 算法一致（见 §6 `DecryptPage`）。通过即 **`cand` 就是该库的 encKey**，记录并停止该库的扫描。

> 三级顺序就是"便宜 → 较便宜 → 仍便宜但更确定"，整条链上**没有 256000 轮的 KDF**，所以即使把每个 32 字节窗口都试一遍，全内存扫描也能在可接受时间内完成。

#### 步骤 D — 逐页解密落盘

拿到某库的 `encKey` 后：

```
macKey = PBKDF2-SHA512(encKey, salt⊕0x3a, 2, 32)
```

读整库（副本），**输出文件先写回明文头 `"SQLite format 3\x00"`**（16 字节），然后逐页（每页 4096B）调用 `DecryptPage(pageBuf, encKey, macKey, pageIndex, sha512, hmacSize=64, reserve=80, pageSize=4096)`（§6）。约定：

- **全零页**直接原样写出（SQLite 的空闲页）。
- page 0（首页）解密时**跳过前 16 字节 salt**（salt 段不加密；输出端已用明文头取代它）。
- 解密失败的页计入 `bad`，写占位以保持结构完整（本项目 17 库 **bad=0**）。

输出到 `{{输出目录}}\<相对路径>`（本项目 → `work/decrypted/wechat/<account>/db_storage/...`）。

---

## 4. 运行方式

```
work\crackv4.exe  {{微信主进程PID}}  "{{账号目录}}"  "{{输出目录}}"
```

- `{{微信主进程PID}}`：§2.1 补丁后正确识别的主进程 PID（cmdline 形如 `Weixin.exe --scene=taskbarpins`，**不含** `--type=`）。可用任务管理器/`Get-Process Weixin` 配合 cmdline 判断哪一个是主进程。
- `{{账号目录}}`：如 `D:\{{微信迁移目录}}\xwechat_files\{{wxid}}_{{short}}`（[02_data-sources.md](02_data-sources.md)）。
- `{{输出目录}}`：如 `work\decrypted\wechat\{{account}}`。

输出形如（每库一行）：

```
found 17 candidate db files under ...\db_storage
reading process private memory ...
loaded N regions, XXXX.X MB
  [DONE] db_storage\message\message_0.db key=<hex>  pages ok=164xxx bad=0 -> ...
  [DONE] db_storage\contact\contact.db key=<hex>  pages ok=3692 bad=0 -> ...
  [MISS] db_storage\sns\sns.db (key not in memory / db not open)
  ...
done
```

- `[DONE] … bad=0` = 该库完全解密成功。
- `[MISS]` = 该库的 encKey 不在内存里（微信当前没打开它）；**不是错误**，把对应库在微信里点开一次再重跑即可让其 encKey 进内存。

> 验证明文：解密产物应能被任意 SQLite 客户端直接打开。可用 Python 内置 `sqlite3` 校验：`python -X utf8 -c "import sqlite3; c=sqlite3.connect(r'{{out}}\db_storage\message\message_0.db'); print(c.execute('select count(*) from sqlite_master').fetchone())"`。

---

## 5. SQLCipher v4 参数（CANONICAL，逐字照抄）

| 参数 | 值 | 说明 |
|---|---|---|
| `pageSize` | **4096** | 每页字节数 |
| `reserve` | **80** | 每页末尾保留区 = IV 16 + HMAC-SHA512 64；本身已是 16 的倍数 |
| `IVSize` | **16** | AES-CBC 的 IV |
| `hmacSize` | **64** | HMAC-SHA512 输出长度 |
| `KeySize` | **32** | AES-256 密钥/encKey 长度 |
| `SaltSize` | **16** | 文件前 16 字节 = salt（**不加密**，明文存盘） |
| KDF（encKey） | PBKDF2-HMAC-**SHA512**，**256000** 轮，dkLen 32 | `rawKey,salt → encKey`（本方案不算它，只在校验 rawKey 时才需要——故贵） |
| KDF（macKey） | PBKDF2-HMAC-**SHA512**，**2** 轮，dkLen 32 | `encKey, salt⊕0x3a → macKey`（便宜——本方案靠它做校验） |
| macSalt | `salt` 每字节 ⊕ `0x3a` | |
| 页加密 | **AES-256-CBC** | 每页一个 IV（存在该页末尾保留区前 16 字节） |
| 首页布局 | `page1[0:16]=salt`（明文）、`page1[16:4016]=加密数据`、`page1[4016:4032]=iv`、`page1[4032:4096]=storedMAC` | 即 `pageSize-reserve=4016`、`+IVSize=4032` |
| 输出头 | 解密后在文件开头补回 **`"SQLite format 3\x00"`**（16 字节），取代原 salt 段 | |

这些常量在参考实现中分散于：

- `internal/wechat/decrypt/windows/v4.go`：`V4IterCount=256000`、`HmacSHA512Size=64`、`reserve = IVSize + hmacSize`、`pageSize=PageSize(4096)`、`deriveKeys`（两层 PBKDF2，macSalt=salt⊕0x3a）。
- `internal/wechat/decrypt/common/common.go`：`KeySize=32`、`SaltSize=16`、`AESBlockSize=16`、`IVSize=16`、`SQLiteHeader="SQLite format 3\x00"`、`XorBytes`、`ValidateKey`、`DecryptPage`。

**照抄即可**——这些是 SQLCipher v4 + 微信定制的固定值，不要臆改。

---

## 6. 单页解密算法 `DecryptPage`（与参考实现一致，可独立重写）

给定 `pageBuf`（4096B）、`encKey`(32)、`macKey`(32)、页号 `pageNum`(从 0 起)：

```
offset = (pageNum == 0) ? 16 : 0           // 首页跳过 salt 段

// 1) 先验 MAC（防错/防误密钥）
mac = HMAC-SHA512(macKey)
mac.update( pageBuf[offset : pageSize-reserve+IVSize] )   // = pageBuf[offset : 4032]
mac.update( uint32LE(pageNum + 1) )                       // 页号从 1 起
若 mac.digest() != pageBuf[4032 : 4032+64]:  报"页 MAC 校验失败"

// 2) AES-256-CBC 解密
iv  = pageBuf[pageSize-reserve : pageSize-reserve+IVSize]  // = pageBuf[4016:4032]
enc = pageBuf[offset : pageSize-reserve]                   // = pageBuf[offset:4016]
dec = AES-256-CBC-Decrypt(encKey, iv, enc)

// 3) 重组：解密区 + 原样保留区（IV+HMAC 段）
return dec ‖ pageBuf[pageSize-reserve : pageSize]          // 末 80 字节原样保留
```

要点：

- HMAC 覆盖到 `4032`（含该页 IV），追加**小端页号(+1)**，与 §3 步骤 C-3 的首页校验同源。
- 首页（pageNum 0）的 `offset=16`，解密区不含 salt；**输出文件用 `"SQLite format 3\x00"` 头取代这 16 字节**（在整库循环外，写文件最前面，见 §3 步骤 D）。
- 末尾 80 字节（IV+HMAC）按原样保留写出（SQLite 引擎打开明文库时这部分位于页尾保留区，不影响读取）。

---

## 7. 落盘后处理与校验

- 产物目录镜像源结构：`{{输出目录}}\db_storage\message\message_0.db` 等。本项目实测产物（节选）：`db_storage/{message,contact,session,favorite,sns,bizchat,emoticon,general,hardlink,head_image,solitaire}/*.db`，外加 `-wal`/`-shm` 旁文件复制。
- **逐库期望 `bad=0`**。出现大量坏页通常意味着：encKey 误判（极少，三级校验后基本不会）、或副本与取密钥时的库**不是同一 salt 来源**（确保副本与活进程是同一账号同一库）。
- 解密后的只读副本进入 [04_parsing.md](04_parsing.md) 的 source inventory 与 canonical adapter；不得直接覆盖活动数据角色。

---

## 8. 已知边界（MUST 如实记录，MUST NOT 绕过）

- **只能取到微信当前打开着的库**的 encKey（per-DB、per-salt 常驻内存）；未打开的库会 `[MISS]`。补救：在微信里点开该会话/功能让库进入打开态后重扫。**rawKey（原始密钥）本项目未恢复**——本方案直接用派生 encKey，不需要也未暴扫 256000 轮的 rawKey。
- **QQ 聊天正文未解密**：`nt_msg.db` 为自定义 `QQ_NT DB` 格式（salt 不在偏移 0、有自定义明文头），更难且强版本相关；本项目一次独立自动化尝试被使用政策（网络安全内容）拦截，**未绕过**。详见 [10_data-products-and-boundaries.md](10_data-products-and-boundaries.md)。QQ 明文附件（`nt_data\`）已直接归档。
- **微信 `.dat` 加密图**（本项目 69,820 个）需单独的图片密钥（dat2img）解密，本项目留作增强，不在本规格内。

---

## 9. 速查（一页纸）

1. 确认微信在跑且已登录；按 [02_data-sources.md](02_data-sources.md) 拿到账号目录 + 主进程 PID。
2. 自建 Go（+ 可选 mingw-gcc）到 `work/`；从 module cache 取 chatlog v0.0.31 到 `work/chatlog-build/`，清只读。
3. 打补丁 ①（`detector.go`：`--` → `--type=`）使主进程被正确识别。
4. `go build -o work/crackv4.exe`（纯 Go，无 CGO）。
5. `work\crackv4.exe {{PID}} "{{账号目录}}" "{{输出目录}}"` → 三级校验暴扫派生 encKey → 逐页 `DecryptPage` 落盘。
6. 期望每库 `bad=0`；`[MISS]` 的库在微信里点开后重扫。
7. SQLCipher v4 常量：pageSize 4096 / reserve 80 (IV16+HMAC64) / salt=前16 / page1 `[0:16]salt [16:4016]data [4016:4032]iv [4032:4096]mac` / 输出补 `"SQLite format 3\x00"`。
8. 全程只读原始、只写副本、不外传、不绕安全限制。下一步 → [04_parsing.md](04_parsing.md)；整体顺序 → [../RUNBOOK.md](../RUNBOOK.md)。
