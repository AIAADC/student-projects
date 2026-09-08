# skills.sh 链接结构与拉取方式调研(2026-08-16)

> 为「用户给一个 skills.sh 链接,我们代为收录进库存」提供事实依据。本文档全部结论来自联网实测(抓取 skills.sh 站点、调用其 API 与 GitHub 源)与官方文档,每条附来源;明确区分「已查证事实」与「推断」。

## TL;DR

- skills.sh 的**目录 API 全部要求 Vercel OIDC 认证**(匿名一律 401),本地开发需 `vercel link` + `vercel env pull` 才能拿 token —— 不适合直接作为收录源。
- 官方安装方式是 CLI:`npx skills add <owner/repo>`,其数据本质是 **GitHub 仓库目录**(skill = 仓库内一个目录,含 SKILL.md)。
- **降级建议:只支持 GitHub 链接收录**。用 GitHub 官方 API/raw 直拉,免认证(限流宽松),形态可控;skills.sh 链接可先解析成 GitHub 源再走同一条路;非 GitHub 来源(site/ 前缀)本期不支持。

## 一、链接形态(已查证)

### 1.1 GitHub 技能(skills.sh 上的主体)

- 目录页 URL 三段式:`https://skills.sh/<owner>/<repo>/<skill>`(实测首页 leaderboard 的全部 href 均为该形态,如 `/vercel-labs/skills/find-skills`、`/anthropics/skills/frontend-design`)。
- 注意:不存在 `/s/` 前缀详情页(实测 `/s/...` 返回 Next.js 404 错误页);详情路径就是三段式本身,与 API 返回的 `url` 字段一致。
- `/trending`、`/hot`、`/official`、`/topic/<topic>`、`/agent/<agent>` 是榜单/筛选页,不是单个 skill 链接。

### 1.2 非 GitHub 站点技能(well-known)

- 形如 `https://skills.sh/site/<domain>/<slug>`(实测首页存在 `/site/open.feishu.cn/lark-doc` 等)。
- API 中用 `sourceType` 区分:GitHub 源为 `"github"`,站点源为域名本身(如 `"mintlify.com"`,见官方 API 文档示例)。

### 1.3 Packs(合集)

- 形如 `https://skills.sh/p/<pack-id>`,CLI 可直接安装(`npx skills add https://skills.sh/p/<pack-id>`)。pack 是未列出的技能集合,安装无需登录。

来源:
- 首页实测:https://www.skills.sh/
- API Reference:https://www.skills.sh/docs/api
- CLI Reference:https://www.skills.sh/docs/cli
- FAQ:https://www.skills.sh/docs/faq

## 二、拉取方式(已查证)

### 2.1 官方 CLI(最简路径,但不适合我们)

- `npx skills add <owner/repo>` —— 下载 skill 并配置给本地 AI agent;无需安装,直接 npx。
- `npx skills add https://skills.sh/p/<pack-id>` —— 安装整个 pack。
- `npx skills update` —— 更新已安装技能;新安装总是拉取当前内容。
- 遥测:默认收集匿名遥测(skill 名、skill 文件、时间戳,无个人信息)用于榜单排名;`DISABLE_TELEMETRY=1` 关闭。
- CLI 本体开源:https://github.com/vercel-labs/skills(官网页脚 "Made with care by Vercel. Skills are open source on GitHub.")。

> 我们**不采用** CLI 方式:它会写入本地 agent 目录并附带遥测与版本管理行为,与「只把内容收录进我们的库存」的目标不符。

### 2.2 skills.sh 官方 API(目录 + 全文件,但需认证)

Base URL `https://skills.sh`,全部端点位于 `/api/v1/`,响应为 JSON:

| 端点 | 作用 | 备注 |
| --- | --- | --- |
| `GET /api/v1/skills` | 榜单分页(含全部技能) | `view`=all-time(默认)/trending/hot;`page` 0 起;`per_page` 1-500 默认 100 |
| `GET /api/v1/skills/search` | 按名称/来源/描述搜索 | `q`(≥2 字符)、`limit`(≤200)、`owner`(限 GitHub owner);单词模糊、多词语义搜索 |
| `GET /api/v1/skills/curated` | 官方精选集 | 与 skills.sh/official 同源 |
| `GET /api/v1/skills/{id}` | 单技能详情 + **完整文件树** | id 形如 `{source}/{slug}`;`files[]` 含 `path`+全文 `contents`;`hash` 为内容 SHA-256,可做变更检测 |
| `GET /api/v1/skills/audit/{id}` | 安全审计结果 | Gen Agent Trust Hub / Socket / Snyk / Runlayer / ZeroLeaks 多方 |

- **认证(关键限制)**:所有端点都需要 `Authorization: Bearer <token>`,token 为 **Vercel OIDC**(部署在 Vercel 时由平台注入 `x-vercel-oidc-token`;本地需 `vercel link` + `vercel env pull`,token 约 12h 轮换)。
- **匿名实测**:2026-08-16 实测 `GET /api/v1/skills?per_page=1` 与 `GET /api/v1/skills/vercel-labs/skills/find-skills` 均返回 `401 {"error":"authentication_required",...}`。
- **限流**:文档明示 audit 端点按 (team, project) 限 600/min;认证体系为所有端点共用,可视为全局额度。
- 单技能响应示例(官方文档):`{"id":"vercel-labs/skills/find-skills","source":"vercel-labs/skills","slug":"find-skills","installs":24531,"hash":"a1b2c3...","files":[{"path":"SKILL.md","contents":"---\nname: ..."}]}`。

来源:https://www.skills.sh/docs/api(全文,含认证与各端点示例);401 为本文档实测。

### 2.3 GitHub 直拉(免认证,降级路径)

- **原始文件**:`https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`(实测 `vercel-labs/skills` 仓库 `main` 分支 `skills/find-skills/SKILL.md` 返回 200 与完整 frontmatter)。
- **目录列举**:GitHub Contents API `GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}` —— 匿名限流 60 req/h/IP,带 token 5000 req/h(详见 GitHub 官方限流文档)。
- **验证仓库存在**:`GET https://api.github.com/repos/{owner}/{repo}`(`default_branch` 字段即默认分支)。
- 也可 `git clone --depth 1 --filter=blob:none --sparse` 只取所需目录(适合多文件技能,不占带宽)。

来源:
- raw 实测:https://raw.githubusercontent.com/vercel-labs/skills/main/skills/find-skills/SKILL.md
- GitHub REST 限流文档:https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

## 三、产物结构(已查证)

- **skill = 一个目录**,核心文件 `SKILL.md`(frontmatter 含 `name`、`description` 等 + 正文),可带支持文件(脚本、示例、模板)。API 详情端点的 `files[]` 就是该目录的完整列举(path + contents)。
- **仓库布局不统一**(同一生态内并存):
  - 根目录即多个 skill 目录:如 `mattpocock/skills`(首页可见 grill-me、tdd 等直接列于其名下);
  - 统一 `skills/` 子目录:`vercel-labs/skills` → `skills/find-skills/SKILL.md`(实测);
  - 其他布局:`vercel-labs/agent-skills` 根含 `packages/` 与 `skills/` 两个目录(实测 GitHub API 列根)。
- **`skills.sh.json`(仓库根的索引文件)**:`vercel-labs/agent-skills` 根存在该文件(实测),含 `$schema`(https://skills.sh/schemas/skills.sh.schema.json)、`groupings[]`(标题+描述+技能名列表)。用于目录页分组展示,**不是**强制要求,也不是拉取内容的依据。
- **收录判断锚点**:技能目录存在 + 其中 `SKILL.md` 可读且 frontmatter 可解析 → 可视为合法 skill。

## 四、限制条件汇总(已查证)

| 限制 | 说明 | 影响 |
| --- | --- | --- |
| API 认证门槛 | 必须 Vercel OIDC token;本地需 vercel CLI 关联项目并 env pull | 我们不能无凭据消费目录 API |
| API 限流 | 600/min per (team, project)(认证后) | 即使有 token,量也不成问题,但需处理 429 |
| GitHub 匿名限流 | 60 req/h/IP(Contents/Repo API) | 目录列举与验证需省着用;原始文件走 raw.githubusercontent 不限流 |
| 非 GitHub 源 | site/ 前缀技能无 GitHub 仓库,无法 raw 直拉 | 本期不收录该类 |
| 内容可变性 | 收录即快照;源仓库后续更新不会自动同步 | 需要版本快照机制(与现有 hash 快照一致) |

## 五、链接合法性判断(已查证 + 推断)

已查证:
- skills.sh 链接形态固定(三段式 owner/repo/skill 或 site/ 前缀或 p/ pack),可用正则先筛。
- GitHub 仓库存在性可通过 API 验证;`raw.githubusercontent` 对不存在路径返回 404。

推断(未逐仓库验证,建议实现时按此顺序判定):
1. 形态检查:URL 解析出 owner/repo(/skill 可选)。
2. 仓库存在(API 200)且 `default_branch` 已知。
3. 若给了 skill 路径:该目录存在且含 `SKILL.md`;未给路径则列出根目录,把「含 SKILL.md 的顶层目录」都视为候选 skill(仓库根布局)或扫描 `skills/` 子目录(统一布局)。
4. 命中至少一个 → 收录;否则报「非技能仓库」并给出已识别的技能列表供用户选择。

## 六、降级建议(结论)

1. **本期只支持 GitHub 链接**(三段式 `owner/repo[/skill]`,或 GitHub 网页 URL `github.com/owner/repo[/tree/ref/path]`)。拉取走 raw.githubusercontent + GitHub Contents API(带可配置 token 以提升限流,匿名 60/h 足够低频收录)。
2. **skills.sh 链接**先解析成 GitHub 源再走同一条路(其 URL 本身就是 owner/repo/skill 三段);解析失败(如 site/ 类型)时明确提示「暂不支持非 GitHub 来源」。
3. **skills.sh API 暂不接入**:需要 Vercel OIDC 凭据,且收益(榜单数据、审计)与收录目标无关;等有真实需求再评估。
4. 收录产物按现有库存规范落盘(目录 + SKILL.md + 支持文件),生成内容哈希快照,源 URL 记入元数据,便于追溯与未来更新。

## 七、GitHub 链接收录需要处理的形态(已查证)

- **仓库根即技能目录**:`mattpocock/skills`(多 skill 目录并排于根)。
- **统一子目录**:`skills/`(`vercel-labs/skills`)、`packages/`(`vercel-labs/agent-skills` 同时有两者)。
- **指定分支或 tag**:raw URL 与 Contents API 均支持 `ref` 参数;默认用 `default_branch`。收录时记录实际 ref,保证快照可复现。
- **单仓库多技能**:一个仓库常含多个 skill 目录(anthropics/skills 下有 skill-creator、frontend-design 等)——收录 UI 需让用户选目录或默认全收。

## 附录:来源链接

- skills.sh 首页(链接形态实测):https://www.skills.sh/
- API Reference:https://www.skills.sh/docs/api
- CLI Reference:https://www.skills.sh/docs/cli
- FAQ:https://www.skills.sh/docs/faq
- skills CLI 源码仓库:https://github.com/vercel-labs/skills
- raw 文件实测(vercel-labs/skills,main):https://raw.githubusercontent.com/vercel-labs/skills/main/skills/find-skills/SKILL.md
- skills.sh.json 示例(vercel-labs/agent-skills):https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills.sh.json
- GitHub REST API 限流文档:https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
