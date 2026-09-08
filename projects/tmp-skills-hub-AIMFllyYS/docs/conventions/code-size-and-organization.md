# 代码长度与文件组织规范

> 本文档是 `AGENTS.md` 中"代码长度"与"文件放置"条款的完整背景说明。
> AGENTS.md 是面向 AI 编码代理的精简操作策略，本文档面向人类开发者，提供理由、阈值参考与判断方法。
> 具体"放哪个包、哪个目录"的决策树见 [project-structure.md](./project-structure.md) 第三节。

## 一、核心原则

### 1. 长度是触发器，不是规则

> **Length is a trigger to look, never a rule to obey.**
> —— [human-readable-code](https://github.com/jwmurray/human-readable-code)

长文件/长函数是**代码异味（code smell）**，不是**违规**。它的本质问题是认知复杂度（cognitive complexity），而不是行数本身。

- 超过阈值 → 停下来审视，找**自然接缝（natural seam）**
- 自然接缝 = 一个可独立命名的职责能干净分离的点
- 有真实接缝 → 拆分
- 没有真实接缝 → 保持完整，留一行注释说明原因
- **永远不要为了凑数字而拆** —— 人为拆分比一个诚实的大文件更糟

### 2. 函数长度与复杂度成反比

> The maximum length of a function is inversely proportional to the complexity and indentation level of that function.
> —— [Linux Kernel Coding Style](https://kernel.org/doc/html/latest/process/coding-style.html)

- 概念简单的线性流程（如长 case-statement、CLI 命令注册表）可以稍长
- 复杂、高嵌套的函数必须更短
- 人脑同时能跟踪约 7 件事，超过就容易混乱

### 3. 文件放置由使用范围决定，不由行数决定

一个文件应该尽量靠近使用它的地方（colocation）。在本仓库里这条原则具体化为：

- **包边界按能力划分**（core = 确定性内核，cli = 终端外衣，web = 页面外衣），不按文件类型划分
- 包内按**领域/命令**聚合（`cli/src/scan.ts`、`web/src/features/<domain>/`），不按"components/hooks/utils"机械分桶
- 单处使用的代码留在使用处；跨处复用时才提升，提升的判断依据是**使用范围**，不是文件长度

## 二、阈值参考

以下数字来自业界经验（ESLint `max-lines`、human-readable-code、clean-code 文献），**每个数字都读作"在这里看一眼"，不是"在这里服从"**：

| 维度 | 软目标 | 停下来审视 | 拆分或说明原因 |
|---|:---:|:---:|:---:|
| 函数长度 (LOC) | ~50 | ~60 | 80+ |
| 文件长度 (LOC) | ~400 | ~600 | 800+ |
| 圈复杂度 | ≤5 | >10 | >15 |
| 嵌套深度 | ≤3 | 4 | 5+ |
| 函数参数 | ≤4 | 5 | 6+ |

- 本项目**不启用** `max-lines` / `max-lines-per-function` 等硬性 lint 规则，避免诱导机械式拆分
- 这些阈值仅作为 code review 时的审视提示

## 三、提升与拆分的判断

### 什么时候把代码提升到 core

判断标准只有一条：**这段逻辑错了会不会破坏数据一致性？**

- 会（哈希、store 变更、链接操作、lockfile）→ 进 core，且必须可单测
- 不会（命令编排、输出格式化、页面渲染）→ 留在 cli / web

**不应提升的情况**：

- cli 里某个命令文件变长了 → 在 cli 内拆分，不是塞进 core
- web 两个组件共用一个格式化函数 → 提到 `web/src/` 内共享位置，core 不收 UI 工具
- 只是"文件超过 400 行了" → 这不是提升理由，先找自然接缝就地拆分

### 拆分判断方法

当文件/函数触发审视阈值时，按以下顺序判断：

1. **找自然接缝**：是否存在一个可独立命名的职责，能干净分离且不产生循环依赖？
   - 是 → 按职责拆分，每个拆分单元有单一职责
   - 否 → 进入第 2 步

2. **判断是否职责混杂**：文件/函数是否同时承担了多个不同关注点？
   - 是 → 按关注点拆分（如 I/O / 纯计算 / 展示分离）
   - 否 → 进入第 3 步

3. **保留完整并注释**：代码内聚良好、无自然接缝，保持完整，在文件/函数顶部留一行注释说明为何不拆分

**禁止的拆分模式**：

- 为凑行数把一个内聚函数切成三段
- 把单处使用的代码提升到共享位置只因为"太长"
- 按文件类型机械拆分（把一个功能的类型、逻辑、常量分到三个文件）

## 四、参考来源

- [ESLint max-lines 规则文档](https://eslint.org/docs/latest/rules/max-lines)
- [Linux Kernel Coding Style](https://kernel.org/doc/html/latest/process/coding-style.html)
- [human-readable-code](https://github.com/jwmurray/human-readable-code)
- [Small Files Are Your Friends — Codecraft](https://codecraft.co/small-files-are-your-friends.html)
