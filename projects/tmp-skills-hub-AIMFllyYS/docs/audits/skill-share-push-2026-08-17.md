# 授信仓库推送方式调研（#118）

> 状态：调研结论（只定口径，不写实现）。批 11-2（#119）按本文施工。
> 日期：2026-08-17
> 方向依据：[第一次同步会](../updates/meeting-2026-08-15-first-sync.md) Step 6——「把所有成员当授信用户，往一个统一仓库写，别人用链接从统一的地方拿」。不做账号、不上公开市场。

本文回答 issue #118 的六个问题。每条结论附官方来源。测试与实现一律用 fetch 替身，不向任何真实远程仓库写入。

---

## 0. 给 #119 的施工摘要

| 项 | 结论 |
|---|---|
| 命令名 | `share`（面板按钮「分享」同一动词） |
| 写盘 API | **Git Trees + Git Commits + Git Refs**，一次提交一组文件。不用 Contents API 逐文件 PUT |
| 提交目标 | **直接 commit 到授信仓默认分支**（`force: false`） |
| 远端路径 | `skills/<dirName>/…`（必须含 `SKILL.md`） |
| 返回链接 | `https://github.com/<owner>/<repo>/tree/<default_branch>/skills/<dirName>`，现有 `adopt` 能识别 |
| 配置 | 库存根 `manifest.json` 可选字段 `trustedRepo`；**禁止**写入指针文件。`--home` 先解析 storeRoot 再读 manifest。CLI `--repo` 可覆盖一次 |
| Token | 只读环境变量 `GITHUB_TOKEN`（与现有 GitHub 收录相同）。无 token 不得推送 |
| 权限 | classic PAT：`repo`；fine-grained：仓库 **Contents: write** |
| 冲突 | 远端已有 `skills/<name>/` 且内容哈希不同 → 拒绝覆盖，code `remote-conflict` |
| 失败 | 无 token → `auth-required`；401/403/受保护分支 → `github-push-failed`。不编造成功 |

---

## 1. 创建/更新一组文件：Contents API 还是 Git Trees API？

### 1.1 官方能力

**Contents API** `PUT /repos/{owner}/{repo}/contents/{path}`：一次创建一个或**替换**一个文件，body 里 `content` 必须 Base64；更新已有文件必须带该文件当前 blob `sha`。官方写明：与「删除文件」并行会冲突，必须串行。classic token 需要 `repo` scope；改 `.github/workflows` 还要 `workflow`。

来源：<https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10>

GET contents 还有体积限制：≤1 MB 才返回完整 `content`；1–100 MB 只能走 raw/object；>100 MB 不支持。这是读接口的限制，但说明 Contents 这条路径不是为「整棵 skill 目录」设计的。

来源：同上页 “Get repository content” 的 size 说明。

**Git Trees API** `POST /repos/{owner}/{repo}/git/trees`：一次提交一棵树（可带 `base_tree` 做增量，`tree[].content` 或 `tree[].sha`）。官方明确：改完树之后必须再 **Create a commit**，再 **Update a reference**，分支才会指向新提交。

来源：

- 建树：<https://docs.github.com/en/rest/git/trees>
- 建提交：<https://docs.github.com/en/rest/git/commits>
- 更新引用（`force` 默认 `false`，保证快进、不覆盖别人的提交）：<https://docs.github.com/en/rest/git/refs>

现有收录侧已经用 `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1` 拉全树（`packages/cli/src/github-source.ts`），推送走同一组 Git Database 端点，读写对称。

### 1.2 权限 scope

| Token 种类 | Contents 单文件 PUT | Git Trees / Commits / Refs |
|---|---|---|
| PAT (classic) / OAuth | `repo`（改 workflows 另加 `workflow`） | 同左：写 Git 数据库也落在 `repo` |
| Fine-grained PAT | 仓库权限 **Contents: write** | 同一权限：**Contents: write** 覆盖 `POST /git/trees`、`POST /git/commits`、`PATCH /git/refs/{ref}` |

来源：

- classic `repo`：<https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10>（Create or update file contents 段）
- fine-grained Contents 表：<https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens>（Repository permissions for "Contents"）

若走 PR 路径，另需 **Pull requests: write**（`POST /repos/{owner}/{repo}/pulls`）。

来源：同上页 “Repository permissions for Pull requests”；创建 PR：<https://docs.github.com/en/rest/pulls/pulls>

### 1.3 推荐

**推荐 Git Trees 一条提交。** 理由：

1. skill 是多文件目录（`SKILL.md` + 支撑文件）。Contents API 每个文件一次 commit，N 个文件 = N 个提交，且官方禁止并行 PUT。
2. Trees + `base_tree` 一次原子更新路径集合，语义接近库存「一次 apply」。
3. 与现有 adopt 的「读 tree」同一 API 族，便于 #119 用同一套 fixture 做「推出去的形状能被 GitHubSourceProvider 认回来」。

不推荐 Contents API 作为主路径。单文件热修可以以后再加，不进 v1。

---

## 2. 直接 commit 到默认分支，还是开 PR？

录音稿口径：授信成员、**往一个统一仓库写**、别人用链接拿。不是对外开源贡献流。

来源：[meeting-2026-08-15-first-sync.md](../updates/meeting-2026-08-15-first-sync.md) Step 6「共享」。

| 方案 | 优点 | 缺点 |
|---|---|---|
| 直写默认分支 | 返回的 tree 链接立刻可 `adopt`；权限只要 Contents: write；步骤少 | 全员可写意味着谁都能改已发布路径；默认分支若开 protection，`PATCH refs` 会 422 |
| 开 PR | 覆盖变成可见审查；默认可保护 | 未合并前默认分支上没有文件；要立刻可 adopt 必须再返回 head 分支 tree URL；还要 Pull requests: write；「授信全员可写」下自己合自己的 PR 安全增益有限 |

**推荐：v1 直接 commit 到默认分支。** 安全靠产品规则，不靠 PR：

1. 先读远端 tree。`skills/<name>/` 不存在 → 写入。
2. 存在且内容哈希与本地相同 → 幂等成功，返回已有链接，不新建提交。
3. 存在且哈希不同 → **冲突，不覆盖**（与库存 adopt 同名不同内容一致，见 [store-and-paths-v0.md](../specs/store-and-paths-v0.md) §2.3）。
4. 更新引用时 `force` 必须为 `false`（官方默认），避免非快进覆盖他人提交。来源：<https://docs.github.com/en/rest/git/refs>
5. 默认分支受保护导致 422/403 → 可读失败 `github-push-failed`，提示人工处理或暂时关掉对该路径的 protection。v1 **不开自动 PR**，避免两条写路径。

「全员可写」场景下 PR 并不能阻止覆盖（有写权限的人可以合并自己的 PR）。真正挡住误覆盖的是第 3 条冲突检测。

空仓库不能建 ref（官方：empty repositories 无法 `POST /git/refs`）。授信仓必须事先有默认分支，由人在 GitHub 上建好。来源：<https://docs.github.com/en/rest/git/refs>（Create a reference）

---

## 3. 匿名与 `GITHUB_TOKEN` 限额；推送是否必须有 token？

官方主限额（REST core）：

| 身份 | 限额 |
|---|---|
| 未认证（按 IP） | **60 次/小时** |
| 认证用户（PAT / 用户态 App / OAuth） | **5,000 次/小时** |
| GitHub Actions 仓库内建 `GITHUB_TOKEN` | 1,000 次/小时/仓库（GHEC 资源 15,000） |

来源：<https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>

超限返回 403 或 429，`x-ratelimit-remaining=0`。这与现有 `github-source.ts` 注释及 403 提示一致。

**推送必须有 token。** 未认证请求官方只允许「fetching public data」。Create tree / commit / update ref 都是写操作，无 `Authorization` 会 401/404，不能靠匿名碰授信仓。

Token 落点（沿用收录侧，不另开通道）：

- 只从环境变量 `GITHUB_TOKEN` 读（测试可注入）。
- **不进** `manifest.json`、指针文件、源码、日志、发往前端的响应。
- 面板「分享」由本机 CLI 进程带环境变量发请求，浏览器不持有 token。

---

## 4. 授信仓库地址的配置落点

[store-and-paths-v0.md](../specs/store-and-paths-v0.md) §1：**指针文件只存一个绝对路径，不存任何业务数据。** 因此 `~/.skills-hub/config.json` **不得**加 `trustedRepo`。

`--home` / `SKILLS_HUB_HOME` 的解析顺序是：显式 home → 环境变量 → 指针里的 `storeRoot`。配置必须挂在 **解析出来的库存根** 上，才会被沙箱整体重定向。

**推荐：库存根 `manifest.json` 增加可选字段 `trustedRepo`。**

```json
{
  "version": 1,
  "createdAt": "2026-08-16T00:00:00.000Z",
  "trustedRepo": "https://github.com/example-club/skills"
}
```

- `trustedRepo` 接受 `https://github.com/<owner>/<repo>` 或 `owner/repo`。实现时用现有 `parseGitHubUrl` 校验。
- 这是「这个库存往哪分享」的库级身份，跟库存走，换机器拷库不丢。
- `--home <沙箱>` 时 storeRoot 就是沙箱（或指针指向的沙箱库），读到的是沙箱 manifest，不会写到真实授信仓配置之外。
- CLI `--repo <url>` 覆盖这一次调用，方便测试与单次指定；不写回 manifest，除非以后另做 `share config`（v1 不做）。
- 缺字段且无 `--repo` → `store-not-configured` 或 `bad-usage`，提示先在 manifest 写上授信仓。不猜 `KinomotoMio/skill-hub`，也不猜当前 `origin`。

不推荐新文件 `share.json`：多一个数据文件要进 init 布局与版本故事，收益只是少改 manifest。manifest 已经是「库自身元信息」。

---

## 5. 推送目录布局（必须能被现有 adopt 识别）

现有 `GitHubSourceProvider.pickCandidates`：

- **仓库根链接**（`https://github.com/owner/repo`）：扫描全树，凡路径以 `/SKILL.md` 结尾的目录都是候选 skill。
- **tree 链接**（`https://github.com/owner/repo/tree/<ref>/<path>`）：该 `<path>` 下必须有 `SKILL.md`。

来源：`packages/cli/src/github-source.ts`；URL 切分：`packages/core/src/github-url.ts`。实测形态见测试里的 `https://github.com/vercel-labs/skills/tree/main/skills/find-skills`。

**推荐布局：授信仓内 `skills/<dirName>/SKILL.md`（及同目录支撑文件）。**

对应关系：

| 本地 | 远端 | adopt 输入 |
|---|---|---|
| `<storeRoot>/skills/<dirName>/` | `<repo>/skills/<dirName>/` | `https://github.com/<owner>/<repo>/tree/<default_branch>/skills/<dirName>` |

- 仓库根模式也能扫到这些 skill（任意深度含 `SKILL.md` 即可），社团成员也可以 `adopt` 整个仓。
- **不要**把仓库根当成「一个 skill」。授信仓是共享库，会有很多 skill；根级单 skill 会和第二次推送打架。
- `dirName` 用库存目录名（与 `index.json` 一致），不要用哈希当路径。

返回给用户的必须是 **tree 深链**（上表第三列），不要只给仓库根——否则 `adopt` 会把仓里所有 skill 都拉下来。

---

## 6. 失败语义（code）

沿用 [json-contract-v0.md](../specs/json-contract-v0.md) 信封。#119 实现时把新 code 补进契约枚举。

| 场景 | HTTP/GitHub | CLI `--json` code | 行为 |
|---|---|---|---|
| 非交互未加 `--yes` | — | `auth-required` | 不发网 |
| 无 `GITHUB_TOKEN` | — | `auth-required` | 不发网；提示设环境变量。不假装已推送 |
| 未配置 `trustedRepo` 且无 `--repo` | — | `bad-usage` | 不发网 |
| 库存里没有该 skill | — | `not-found` | 不发网 |
| Token 无效 / 无 Contents: write / 私有仓 404 伪装 | 401、403、对私有资源的 404 | `github-push-failed` | 可读消息（权限或仓库不存在），不编造成功。官方对未授权访问私有资源返回 404 以免泄露存在性：<https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api> |
| 限流 | 403/429，`x-ratelimit-remaining=0` | `github-push-failed` | 提示等待 `x-ratelimit-reset` 或检查 token |
| 默认分支保护，无法快进更新 ref | 422 / 403 | `github-push-failed` | 说明是保护规则，不改 force、不开 PR |
| 远端 `skills/<name>/` 已在且哈希不同 | 本地比对（先 GET tree + raw） | `remote-conflict` | **不覆盖**。消息带远端 tree 链接与两边哈希前缀 |
| 远端已在且哈希相同 | — | 成功信封 | 幂等，返回已有链接 |
| 空仓库（无默认分支） | 409 / 无法建 ref | `github-push-failed` | 提示人先在 GitHub 建好默认分支 |

成功信封（供 #119 对照）：

```json
{
  "ok": true,
  "command": "share",
  "storeRoot": "...",
  "dirName": "demo",
  "url": "https://github.com/example-club/skills/tree/main/skills/demo",
  "idempotent": false
}
```

`url` 必须能被 `parseGitHubUrl` + `GitHubSourceProvider` 再拉回来。

---

## 7. #119 实现边界（仍不写代码）

- 网络只在 `packages/cli`。core 继续只做 URL 解析与哈希，不 import fetch、不碰 GitHub。
- 先改 `cli-commands-v0.md` 登记 `share`，再写命令 / `POST /api/share` / 面板动作。
- 测试：fetch 替身覆盖成功链接、无 token、远端冲突；再用同一 fixture 走一遍 adopt 解析。不打真实 GitHub，不写 `KinomotoMio/skill-hub`，不写用户真实仓。
- 不引入 octokit。现有 `github-source.ts` 已是裸 `fetch`，推送保持同一风格。
- 不实现 restore-from-remote、不实现自动合 PR、不把 token 代理到浏览器。
