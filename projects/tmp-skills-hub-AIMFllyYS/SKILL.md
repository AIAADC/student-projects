---
name: skills-hub
description: 何时调用我:你需要管理本机 Agent Skill 的库存时——收录新 skill(本地目录/GitHub/skills.sh)、查某个 skill 的分组与描述、按需启用/撤回它在某个客户端的可见性、软删除不再需要的 skill、做相近/冲突分析。只读这一份就能跑通全流程,不需要其他对话。
---

# skills-hub:本机 Agent Skill 统一管理

## 什么时候该调用我

- **收录**:用户说「帮我存一下这个 skill / 这个目录是个 skill / 这个 GitHub 链接」→ 用 adopt 收录进统一库存(支持本地目录、GitHub 仓库或目录、skills.sh 三段链接)
- **查询**:想知道库存里有什么、某 skill 的分组与描述 → list / group list / show
- **按需启用**:想让某个 skill 在 Claude/Codex 等客户端可见 → enable
- **撤回**:不想让它再可见(原件保留)→ disable
- **软删除**:确定不要了 → archive(打包进归档区,不真删除)
- **分析**:想知道库存里哪个 skill 与某个 skill 相近或冲突 → analyze(模型判断,只建议不写盘)
- **按快照还原客户端**:用户说「按备份把客户端 skills 拼回去」(不动库存)→ backup restore
- **回到初始化前再自动初始化**:用户说「一键恢复到 bootstrap 之前再重新收录」→ reset。人在面板设置里点重置并确认;Agent 用 `reset --yes`。不要让人再打命令。

不需要调用我的场景:只是修改 skill 内容(那是 skill 自身的事,改完可 verify 校验哈希)。

## 前置

CLI 入口:仓库内 node packages/cli/dist/index.js <command>(需先 pnpm build),或全局 bin skills-hub <command>。

> 沙箱规则:任何"真实执行"都在沙箱 home 下做。所有演示命令用 <SANDBOX_HOME> 占位表示沙箱库存根,真实环境先问用户要库存位置。

## 全流程(自包含)

### 0. 一键初始化(真机体验;交互式,库存已就绪时直接启动面板)

    skills-hub bootstrap [--home <库存根>] [--port 4321] [--yes]

- 依次交互确认:库存位置(回车用默认 ~/.skills-hub)→ 备份(Y=复制全部客户端 skills 目录到 <库存根>/backups/<时间戳>/,N=跳过)→ 迁移(Y=收录全部本机 skills)
- 红字警告 + 每一步 Y 即显式授权;完成后自动启动面板并尝试打开浏览器
- 幂等:指针文件已配置 → 零交互直接启动面板
- 非 TTY 环境需 --yes(全自动,默认路径,跳过全部确认)

### 1. 初始化库存(一次性)

    skills-hub init --home <SANDBOX_HOME> --yes

### 2. 收录 skill(本地目录)

    skills-hub adopt <本地skill目录路径> --home <SANDBOX_HOME> --yes

重复收录同一内容 → 显示「已存在(内容相同)」并并入来源;同名不同内容 → 冲突,绝不覆盖。

### 2b. 收录 skill(GitHub / skills.sh 链接,需网络)

    skills-hub adopt https://github.com/<owner>/<repo> --home <SANDBOX_HOME> --yes
    skills-hub adopt https://github.com/<owner>/<repo>/tree/<ref>/<路径> --home <SANDBOX_HOME> --yes
    skills-hub adopt https://skills.sh/<owner>/<repo>/<skill> --home <SANDBOX_HOME> --yes

- GitHub 仓库根模式 → 发现全部含 SKILL.md 的目录;tree/blob 模式 → 只收指定目录。
- skills.sh 三段链接解析为 GitHub 源复用同一套判定;site/ 与 p/ 前缀会给出明确的不支持提示。
- 匿名 API 60 次/小时,超限时报 403 并提示设置 GITHUB_TOKEN 提升额度。

### 3. 看库存与读 description

    skills-hub list --home <SANDBOX_HOME>
    skills-hub show <skill名或哈希前缀> --home <SANDBOX_HOME>

### 4. 查分组与分组操作

    skills-hub group list --home <SANDBOX_HOME>
    skills-hub group add <组id> <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub group remove <组id> <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub group create <id> [--name 显示名] [--desc 描述] --home <SANDBOX_HOME> --yes
    skills-hub group delete <组id> --home <SANDBOX_HOME> --yes

内置分组:development / design / tooling / writing / research。分组只是视图——删除分组不影响任何 skill。

### 5. 按需启用(挂链接到客户端)

    skills-hub enable <skill名...> --client <claude|codex|...> --home <SANDBOX_HOME> --yes
    skills-hub enable --group <组id> --client <claude|codex|...> --home <SANDBOX_HOME> --yes

### 6. 撤回(摘链接,原件保留)

    skills-hub disable <skill名...> --client <claude|codex|...> --home <SANDBOX_HOME> --yes
    skills-hub disable --group <组id> --client <claude|codex|...> --home <SANDBOX_HOME> --yes

### 7. 软删除(归档)

    skills-hub archive <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub archive --home <SANDBOX_HOME>   # 列出归档区

归档 = 先摘全部受管链接,再把库存目录打包成 zip 移入归档区,并从库存清单移除。

### 8. 校验与自检

    skills-hub verify --home <SANDBOX_HOME>
    skills-hub doctor --home <SANDBOX_HOME>

verify 重算哈希,报告被外部修改(漂移)或缺失的 skill,不自动改写。

### 9. 相近/冲突分析(文本判断交给模型)

    skills-hub analyze <本地skill目录|库存skill名> --home <SANDBOX_HOME>
    skills-hub analyze <库存skill名> --home <SANDBOX_HOME> --json

- 对照库存 description 给出相近(similar)与可能冲突(conflict)清单及理由;
- 只读建议,不触发任何写操作;
- 需要 DEEPSEEK_API_KEY(写在仓库根 .env,已被 git 忽略,绝不提交);无密钥时明确降级提示,不编造结论。

### 10. 本地查看服务(面板)

    skills-hub ui --home <SANDBOX_HOME> --port 4321

浏览器打开 http://127.0.0.1:4321。人用壳是左侧三板块(总览 / 统计 / Skills 管理)加左下角设置;可在面板上启用/编辑/归档。仅绑 127.0.0.1。

### 11. 按快照还原客户端 skills(库存与指针不动)

    skills-hub backup restore --home <SANDBOX_HOME> --yes
    skills-hub backup restore <snapshotId> --home <SANDBOX_HOME> --dry-run --json

先 verify 再逐条写回客户端 skill 落点;不整目录改名 skills; displaced 条目进库存 tmp/restore-aside。与 archive restore 不是同一条命令。

### 12. 一键回到初始化前并重新收录

    skills-hub reset --home <SANDBOX_HOME> --yes
    skills-hub reset --snapshot <snapshotId> --home <SANDBOX_HOME> --yes

还原客户端 → 旁路指针与旧库存(只改名) → 用确认前读到的 storeRoot 再收录。--yes 不得落到默认 ~/.skills-hub。面板设置里确认重置后由 POST /api/reset 在当前 ui 进程跑完同一套逻辑,用户不用再打字。

### 13. 新建 skill(#169)

用户说「帮我做一个 skill」「我要创建一个新 skill」时,用 `new` 在库存里直接创建,而不是在客户端目录里手动建文件夹:

    skills-hub new <name> --home <SANDBOX_HOME> --json
    # 返回 storeDir——往这个路径写 SKILL.md 和 references/
    # AI 写完后:
    skills-hub new commit <name> --home <SANDBOX_HOME> --json

这条路径让新 skill 从诞生起就在库存里,不产生孤儿目录。`new` 不要求 `--yes`(只在库存内写,不碰客户端目录)。

如果 AI 写到一半决定放弃:

    skills-hub new discard <name> --home <SANDBOX_HOME> --json

半成品移入归档区,不引入真删除。

查看当前草稿:

    skills-hub new list --home <SANDBOX_HOME> --json

## 禁止事项(红线)

- **没有真删除**:archive 是唯一移除方式,且库存原件一个字节不删;disable 只摘链接。任何"彻底删除"只能由用户自己处理归档区文件。
- **写操作必须显式授权**:非交互环境不带 --yes 会被拒绝(exit 2)。不要绕过,也不要替用户想当然。
- **只写沙箱**:除非用户明确指定,库存写操作一律在沙箱 home 验证。
- **不碰客户端目录内容**:enable/disable 只挂/摘链接(junction),绝不移动或修改用户已有目录。
- **不提交密钥**:DEEPSEEK_API_KEY / GITHUB_TOKEN 只从环境变量或 .env 读取,不进日志、不进报告、不进发往前端的响应。

## 机器可读输出

所有命令支持 --json,结构契约见 docs/specs/json-contract-v0.md(成功信封 ok+command,失败信封 ok:false+code+message,退出码 0/1/2)。

## 开发与自测

改动前后跑四检:pnpm lint / pnpm typecheck / pnpm build / pnpm test。
沙箱 E2E:init → adopt(本地+GitHub+skills.sh)→ list/show → enable/disable(--group 批量)→ verify → archive → analyze,全部在 --home <SANDBOX_HOME> 下。

## 自测记录

- 2026-08-16:沙箱全流程实测 init → adopt×2 → group list(5 内置)/create/add → enable(2 链接)→ disable(清空)→ rename/delete → archive,全部通过;show/enable 计数正确写入 stats.json;exit 2 路径(重复创建、名+组互斥、空组、缺 --yes)验证通过。
- 2026-08-16:analyze 真实密钥 E2E(命中相近+冲突,理由具体,无写操作;无密钥降级、not-found 均验证);GitHub/skills.sh 收录 E2E(404/限流可读降级、tmp 零残留)。
- 2026-08-16:bootstrap E2E(--yes 全自动:备份 manifest + 收录 + 自动起面板 /api/skills 200);单测 5 例(全流程/跳过备份/取消/幂等/非TTY拒绝);CI 双平台绿(core 116 / cli 69)。
