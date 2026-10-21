# 设计 / 前端 / 动效能力 → Agent Skill 的落地提案（讨论稿）

> 状态：**讨论稿，未经裁决**。本文不属于 `docs/design-rules/` 规范体系，不改变任何现有规则；
> 用途是把"要不要做、做成什么形状"这件事先谈清楚。分支 `docs/design-agent-skill-proposal`。

## 1. 现状：规范已经很强，缺的是"入口"

先摆事实，避免重复造轮子：

| 已有资产 | 规模 / 位置 | 说明 |
| --- | --- | --- |
| `docs/design-rules/DESIGN.md` | 2,056 行 / 16 章 | 颜色、字号字重、组件、圆角与点击目标、深度、双模式、微文案、交互约定、动效 |
| §7 Do's and Don'ts | 约 20 条 | 现成的硬约束（零阴影、禁渐变、灰度、字重 ≤600、圆角只有 5 档…） |
| §9 Agent Prompt Guide | Quick Color Reference + Example Component Prompts | 作者已经预见到"Agent 需要现成提示片段" |
| §10 双模式交付门槛 | 明确"只做一种模式视为未完成" | 附有"目检不是硬门槛，但必须如实报告"的口径 |
| §14.4 动效 | 5 个时长档 + 3 条曲线 + reduced motion | `--motion-instant/fast/base/enter/exit`，禁止硬编码 |
| 门禁 | `scripts/check-pr-design-basis.mjs`、`scripts/design-inventory.mjs`、`typographyTokenDiscipline.test.ts` | 机器可查的部分已经有人在守 |
| 治理合同 | `docs/design-rules/design-governance.md` | 两级证据（静态守卫 + 真机截图）、PR 风险分级 |

**结论：不缺规范，缺的是"每次改 UI 都读对章节"的机制。** 所以 skill 的职责是**路由 + 自检**，不是再写一份规范。

## 2. 外部设计类仓库在 Cindy 语境的取舍

把之前盘出的 8~9 个设计类仓库，按"对桌面端产品 UI 的可用度"过一遍：

| 仓库 | 可用度 | 能借什么 | 不能借什么（会和 Cindy DS 打架） |
| --- | --- | --- | --- |
| `ux-ui-agent-skills` | **中高** | a11y 审计清单、design-tokens 分层、design-review 的检查顺序 | 它的组件清单与 token 命名 |
| `taste-skill` | 中 | "先定方向、再动手"的流程；参考图 + 浏览器自检的做法 | 网页营销页的视觉语言（渐变、圆角、阴影） |
| Emil Kowalski 的动效判断 | 中 | **该不该动 / 动哪里** 的决策标准 | 时长与曲线数值 —— 必须用 `--motion-*` |
| `diagram-design` | 中 | 架构图、流程图（给文档/PR 用，不是产品 UI） | 图表视觉风格 |
| `lieflat-charts` | 中低 | 图表原型探索 | 数据可视化规范 —— 已有 `usage-history-charts.md` |
| `ui-ux-pro-max-skill` | 低 | 设计系统的组织方式 | 一整套自己的 DS，会和 Cindy 的 §4/§5 抢话语权 |
| `huashu-art-motion` | 低 | 宣传视频/动效片 | 与产品 UI 无关 |
| `openui` / `shadcn-admin` | 低 | 思路 | Cindy 有自己的组件库与后台形态 |

一句话：**外部 skill 里能拿的是"判断方法"，不是"数值和视觉语言"。** 数值一律回到 `DESIGN.md` 与 token。

## 3. 三种可选架构

| 方案 | 形态 | 成本 | 漂移风险 | 覆盖度 |
| --- | --- | --- | --- | --- |
| **A. 单一入口 skill** | 1 个 `cindy-ui-design/SKILL.md`（~120 行）：改动类型 → 该读哪节 → 硬约束（引用）→ 自检清单 → 证据要求 | 低（半天） | 中（靠"只引用不复制"控制） | 高（一个入口不漏读） |
| **B. 三层 skill** | `design-entry`（分流）/ `design-review`（评审）/ `design-evidence`（截图与报告） | 高（2~3 天） | 低 | 高但重叠（`design-review` 与 governance 两级证据重复） |
| **C. 不写 skill** | 把 §9 抽成 60 行 prompt 贴进 `AGENTS.md` 触发条目；让门禁脚本的报错直接指向章节号 | 最低（2 小时） | 最低 | 中（只覆盖"读了 AGENTS.md 的 agent"） |

## 4. 建议：A + C，skill 只写"读哪里 / 怎么查"

理由三条：

1. **规范会变**。把 `--motion-fast: 150ms` 抄进 skill，下一次调整 token 就多一处漂移点。
2. **门禁已经是机器真相**。能脚本判的（阴影、字重、硬编码颜色、圆角）不该再写进自然语言 skill。
3. **缺的是触发**。模型不会主动去读 2,056 行；但会读一个被命中的 skill 的 120 行，然后按里面的路由去读指定小节。

所以 A 的正文只保留四类内容：**分流表 / 硬约束清单（指向 §7、§10、§14.4）/ 自检问题 / 交付时要报告什么**。

## 5. 走 A 的话，草案骨架

```markdown
---
name: cindy-ui-design
description: 修改 Cindy 的界面、组件、样式、动效或 UI 文案时使用。先读规范章节，再做改动。
---

# cindy-ui-design

## 改动类型 → 必读章节
| 你要改的 | 先读 |
| 颜色 / 主题 | DESIGN.md §2、§10 |
| 字号字重 | §3（含 §3 字重登记表） |
| 组件外观 | §4、§5（圆角 5 档 / 点击目标） |
| 布局 | §5、§8 |
| 动效 | §14.4（5 档时长 + 3 曲线 + reduced motion） |
| 交互行为 | §14.1—§14.3 |
| 文案 | §11(微文案) + i18n/GLOSSARY.md |

## 硬约束（详读 §7 / §10 / §14.4，此处只列标题）
- 零阴影、禁渐变、灰度为主
- 颜色只走语义 token，禁止硬编码 hex
- 双模式同一次改动内完成
- 动效只用 --motion-* ，reduced motion 必须生效
- 字号/行高成对，字重不超过 600

## 自检（交付前逐条回答）
1. 这一层用的是哪一档圆角？依据 §5 的哪一步？
2. 新增/修改的状态有哪些？Light / Dark 各是什么 token？
3. 动效属于哪个档位？reduced motion 下变成什么？
4. 有没有引入 §7 Don't 里的任何一条？

## 交付时必须在 PR 描述里写
- 实际检查了哪种模式、哪种没检查（不得含糊）
- Level 1 门禁跑了哪些
```

## 6. 需要你定的三件事

1. **放哪里**：仓库内 `.claude/skills/`（随仓分发、团队一致，但需要接受 Codex/Cursor 的读取方式差异）／个人 `~/.claude/skills/`（只自己用，不进仓）。
2. **能不能内嵌少量数值**：例如在 skill 里写"动效 ≤150ms 的属于 functional"，还是 100% 只引用章节号（更抗漂移，但模型可能懒得点开）。
3. **主工具优先级**：Codex 为主 / Claude Code 为主 / 两者同等 —— 这决定 frontmatter 措辞与安装说明写哪一套。

## 7. 明确不做

- 不把 `DESIGN.md` 内容搬进 skill（复制即漂移）
- 不做独立的"设计评审 skill"（与 `design-governance.md` 的两级证据重复）
- 不引入外部的 token 体系或组件库
- 不在 skill 里放"审美偏好"这类无法判定对错的内容

---

## 8. 形态选型：Skill / Role / Plugin / 门禁，谁负责哪一段

依据 `docs/product-rules/core-product-principles.md` §5：**工作方法进 Skill，富交互进插件，Core 保持纯粹**。设计这件事拆开看，三段需求不同，形态就不同。

| 维度 | Skill（SKILL.md） | Role / Agent（`.claude/agents`） | Plugin（`.cindy`） | 门禁脚本 |
| --- | --- | --- | --- | --- |
| 能否在常规会话里**自动**上场 | ✅ 按 description 每轮匹配 | ❌ 需要显式委派或 `/` 调用 | ❌ 需要用户打开面板/触发动作 | ⚠️ CI 或提交时 |
| 能否**强制**约束 | ❌ 模型可能不读 | ❌ 同左 | ⚠️ 只能在自家 UI 里强制 | ✅ 唯一真强制 |
| 是否需要专属界面 | ❌ 不需要 | ❌ 不需要 | ✅ 这是它的存在理由 | ❌ |
| 跨工具复用（Claude / Codex / Pi） | ✅ 同一份 SKILL.md | ⚠️ 各家 agents 格式不同 | ❌ 仅 Cindy | ⚠️ 脚本可复用 |
| 分发 / 权限成本 | 最低（放目录即可） | 低 | 高（安装、批准、沙箱、凭证） | 低 |

**结论：设计路由与设计流程 = Skill；设计评审可以额外做一个 Role；Plugin 现在不做。**

### 8.1 为什么不是 Role

Role 是"被叫上场的角色"，不是"随身的判断"。常规会话里用户说"这个按钮太丑"，不会有任何机制去委派一个 design-reviewer——只有 Skill 的描述匹配会在这一轮自动命中。Role 适合的是**把评审变成一次独立任务**：给它单独上下文、只看 diff 与截图、产出 finding 列表，不直接改代码。

### 8.2 为什么不是 Plugin

插件是"可运行的小程序"，代价是安装、批准、沙箱、能力声明。设计路由本身**零 UI 需求**，做成插件属于用重武器打小目标，也违反"能由 Skill 承载就优先 Skill"。只有出现下面任一条，才值得升格为插件：

1. 需要**设计资产面板**（浏览已安装的设计 skill、预览产出、一键套用）；
2. 需要**截图对比**（Light/Dark 并排、改动前后 diff）这类结构化界面；
3. 需要接**外部设计源**（Figma、设计规范同步）并在 UI 里可视化；
4. 需要在 UI 里维护**设计决策台账**并跨会话查询。

### 8.3 "可插拔"靠什么实现

不需要写运行时，靠三件朴素的事：

1. **路由表即插槽**：新增一个设计来源，只在 `skills/cindy-design/SKILL.md` 的路由表加一行（任务类型 → 主来源 / 辅助），不碰任何代码。
2. **来源可缺席**：skill 里已经写了降级规则——外部 skill 未安装时按规范直做并如实报告，所以"装与不装"不改变流程能否跑。
3. **单一真相源**：数值永远来自项目规范，外部 skill 只提供方法与检查项；换掉一个外部仓库不会污染设计系统。

### 8.4 建议的最终形态

| 层 | 产出 | 状态 |
| --- | --- | --- |
| 路由 + 流程 + 自检 | `skills/cindy-design/SKILL.md` | ✅ 已写，待评审 |
| 强制约束 | 现有门禁（`check-pr-design-basis.mjs`、`design-inventory.mjs`、token 测试） | ✅ 已有，建议让报错指向 DESIGN.md 章节号 |
| 设计评审（可选） | `.claude/agents/design-reviewer.md`（只读、产出 finding） | ⬜ 待定 |
| 资产面板（远期） | `.cindy` 插件 | ⬜ 触发条件见 8.2 |

---

## 9. Cindy 对三种形态的实际支持（代码核对，2026-10-19）

结论先行：**Skill 三引擎全通；Role 只有 Claude Code 引擎认；Plugin 能装 skill 但走私有投影，且 `agent` 槽不是"角色定义"。**

### 9.1 Skill：三套引擎都支持，但目录不同

| 引擎 | 个人级 | 项目级 | 证据 |
| --- | --- | --- | --- |
| Pi（Cindy 默认） | `~/.agents/skills` | `{cwd}/.pi/skills`、以及从 cwd 向上到 git root 每层的 `.agents/skills` | `packages/maker-core/src/agents/pi/customization-scanner.ts` |
| Claude Code | `~/.claude/skills/{name}/SKILL.md` | `{wd}/.claude/skills` | `packages/maker-core/src/agents/claude-code/customization-scanner.ts` |
| Codex | `~/.agents/skills`、`~/.codex/skills` | `{wd}/.agents/skills`、`{wd}/.codex/skills` | `packages/maker-core/src/agents/codex/customization-scanner.ts` |

**关键事实**：`~/.agents/skills` 是共享索引，Cindy 会把 `.claude/skills`、`.codex/skills` 的条目双向链接过去（`apps/desktop/src/main/maker-host/shared-global-skills.ts`：`~/.agents/skills` is the shared index that Cindy Codex and Pi scan）。所以**个人安装只需放 `~/.agents/skills/`**。

项目级有前置条件：Pi 的项目技能先是 `discovered` 预览，**必须经过项目 trust 批准**才会被装配；且必须是"目录内含 SKILL.md"，单文件 md 不算（`docs/dev-rules/pi-project-trust.md`）。

> 修正：本文早期把技能放在仓库根 `skills/` —— **那是错的位置，任何引擎都扫不到**。已移到 `.agents/skills/cindy-design/SKILL.md`。

### 9.2 Role / Agent：只有 Claude Code 引擎支持

| 位置 | 是否被扫描 | 说明 |
| --- | --- | --- |
| `~/.claude/agents/{name}.md`、`{wd}/.claude/agents/{name}.md` | ✅ `kind=agent` | Cindy 的 Claude scanner 明确列出 agents 目录 |
| Pi | ❌ | Pi scanner 的 kinds 只有 `'skill'`，没有 agents 契约 |
| Codex | ❌ | 同上是 skill-only |

也就是说：**做 Role 只能用 Claude 引擎跑**；在 Pi 会话里它不会出现。Cindy 里真正的"角色"载体是**伙伴（Bot）**——按 Bot 隔离的 `skills/<slug>/SKILL.md`、身份卡、规则与工作目录（`docs/product-rules/cindy-bots-runtime.md`），这是另一套机制，不是 `.claude/agents`。

### 9.3 Plugin：能带 skill，但走的是私有投影

`.cindy` 插件的能力声明里同时有 `skill` 与 `agent`，容易误读：

- **`skill` 槽**：插件可以内置技能，但投影到**账号私有**的 `<状态根>/agent-skills`，并由各引擎分别加载（Claude 用每插件独立的本地 plugin、Codex 走 `CODEX_HOME/skills`、Pi 用显式 `--skill`）；**不会**写进 `~/.agents/skills` 或 `~/.claude/skills`。`skill` 是唯一越出沙箱的能力——技能指令以用户全部权限执行，因此必须在 manifest 里声明、并经安装批准（`docs/dev-rules/plugin-security-and-authoring.md`）。
- **`agent` 槽**：插件**请求 Cindy Agent 开一个新回合**（一次性票据、模板只作为普通 user 消息、绝不进 system prompt），**不是**定义角色或子代理（`apps/desktop/src/main/cindy-brain/agentSlot.ts`）。
- **`panel` / `mainView` / `card`**：这才是插件的价值所在——富交互界面。

| 形态 | Pi | Claude | Codex | 常规会话自动上场 | 分发渠道 |
| --- | --- | --- | --- | --- | --- |
| Skill（个人 `~/.agents/skills`） | ✅ | ✅（fanout） | ✅ | ✅ 按 description | SkillHub |
| Skill（项目 `.agents/skills`） | ✅（需 project trust） | ✅ | ✅ | ✅ | 随仓 |
| Skill（插件 `skill` 槽） | ✅（`--skill`） | ✅（会话私有 plugin） | ✅（CODEX_HOME） | ✅（随插件启用） | 插件市场 |
| Role（`.claude/agents`） | ❌ | ✅ | ❌ | ⚠️ 需显式调用 | 随仓 / 个人 |
| Bot（伙伴技能） | ✅ | ✅ | ✅ | 仅该 Bot 会话 | 仓内 / 远端 |
| Plugin 面板 | ✅ | — | — | ❌ 需用户操作 | 插件市场 |

### 9.4 对本文结论的影响

- 8.4 的"Skill 为主"成立，但**落点要改**：`.agents/skills/cindy-design/SKILL.md`，个人装 `~/.agents/skills/`。
- "Role 可选"要加限制：**只有 Claude 引擎会话能用**；若主力是 Pi，则不要投入做 Role。
- "Plugin 远期"的触发条件不变，但要记住插件内 skill 是私有投影，不是公共 skill。

### 9.5 交付约束：`.agents/` `.claude/` `.pi/` 全部被 gitignore

`.gitignore` 第 121—124 行写得很明确：

```
# Agent 工具私有目录整体忽略；共享说明只通过 AGENTS.md / CLAUDE.md 提交。
.agents/
.learnings/
.claude/
.pi/
```

**后果**：把 `SKILL.md` 放进 `.agents/skills/` 只能在本机生效，**永远提交不进去**。所以"随仓分发"和"放进 `.agents/`"是互斥的两件事。三条可行路径：

| 路径 | 生效范围 | 是否入仓 | 代价 |
| --- | --- | --- | --- |
| **A. 个人全局** `~/.agents/skills/cindy-design/` | 所有项目、所有会话 | 否（本机配置） | 无；换机需重装 |
| **B. 仓内正本 + 安装脚本**：正本放 `docs/design-rules/`（或 `tools/skills-src/`），脚本把它链接到 `.agents/skills/` | 本仓、团队一致 | ✅ 正本与脚本入仓 | 多一步安装；需接受 AGENTS.md 指个路 |
| **C. SkillHub 发布** | 安装者全项目 | 否（走市场分发） | 需要 SkillHub 账号 / 组织；本仓已有 `skillhub/publishService.ts` |

按仓库现有约定（"共享说明只通过 AGENTS.md / CLAUDE.md 提交"），**B 是唯一既入仓又生效的形态**；A 是"我现在就想用"的最短路径；C 适合以后给团队/组织用。

---

## 10. 落地记录（2026-10-19，方案 B）

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| 技能正本 | `docs/design-skills/cindy-design/SKILL.md` | 被 git 跟踪，团队共享 |
| 目录说明 | `docs/design-skills/README.md` | 为何正本不放 `.agents/`、各引擎发现路径、写新技能的约定 |
| 安装脚本 | `scripts/install-design-skill.mjs` | 复制到 `.agents/skills`；只接管带 `.cindy-design-skill.json` 标记的目录，拒绝覆盖手工副本 |
| 入口 | `pnpm design:skill:install` / `pnpm design:skill:check` | 与 `pnpm design:inventory` 同一命名族 |
| 索引 | `AGENTS.md` 规则索引新增一条 | 指向 `docs/design-skills/README.md` |

已验证：`--dry-run`、安装、`--check`（一致）、标记缺失时拒绝覆盖、`node --check` 语法、`package.json` 可解析。

尚未验证：Pi 是否真的把项目级 skill 装配为 `loaded`（需要先在 Cindy 里批准本仓的项目 trust）。
