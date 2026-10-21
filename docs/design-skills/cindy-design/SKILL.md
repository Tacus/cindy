---
name: cindy-design
description: 任何涉及界面与视觉设计的任务都先走这里——UI、页面、组件、布局、样式、配色、字体排版、圆角、图标、Logo、图表、可视化、动效、动画、交互反馈、审美风格（"好看一点""做得高级感""有质感"）、前端设计评审。按任务类型自动路由到最合适的设计来源（本仓 docs/design-rules 规范，或已安装的设计 skill），并强制走自检与验证清单。
---

# cindy-design · 设计任务路由器

设计相关的活，**先判类型，再选来源，选完声明，最后自检**。不要凭感觉直接开始画。

## 1. 先判类型（一句话）

读用户诉求，落到下面 12 类之一：

| # | 任务类型 | 典型触发 |
| --- | --- | --- |
| 1 | 改本仓产品 UI | "这个组件""按钮/侧边栏/设置页""样式不对" |
| 2 | 要审美方向 | "好看一点""高级感""有质感""太土了" |
| 3 | 设计系统 / token / 组件规范 | "tokens""设计系统""组件库规范" |
| 4 | 可用性 / 无障碍 | "a11y""读不清""对比度""键盘可达" |
| 5 | 动效设计与判断 | "加个动效""过渡""动画""太生硬" |
| 6 | 数据可视化 / 图表 | "图表""折线/柱状""看板" |
| 7 | 架构图 / 流程图 | "画个架构图""时序图" |
| 8 | 演示稿 / 汇报 | "slides""汇报稿" |
| 9 | 宣传动效片 / 视频 | "宣传视频""动效片" |
| 10 | 非本仓的前端页面 / 落地页 | 外部项目、营销页 |
| 11 | 品牌 / Logo / Banner | "logo""品牌视觉" |
| 12 | 动效实现自检 | "reduced motion""性能" |

## 2. 路由表（主来源 → 辅助 → 数值真相）

**核心原则：外部仓库只提供"方法与检查项"，颜色 / 字号 / 圆角 / 时长的数值一律来自当前项目规范。**

| 类型 | 主来源 | 辅助（可选，1 个） | 数值/规范真相 |
| --- | --- | --- | --- |
| 1 改本仓 UI | `docs/design-rules/DESIGN.md` §2 §3 §4 §5 §10 §14 | — | 语义 token，禁止硬编码 |
| 2 审美方向 | `taste-skill`（`design-taste-frontend`；Codex 用 `gpt-tasteskill`） | `ui-ux-pro-max-skill` 的 `design-system` | 视觉语言仍受 DESIGN.md §1 / §7 约束 |
| 3 设计系统 | `ux-ui-agent-skills`（`design-tokens`、`design-system`） | — | DESIGN.md §10 + `token-decision-table.md` |
| 4 可用性 | `ux-ui-agent-skills`（`a11y-audit`、`design-review`） | — | DESIGN.md §14、`design-governance.md` |
| 5 动效 | DESIGN.md §14.4（5 档时长 + 3 曲线） | Emil 那套"该不该动"的判断（未装则跳过） | `--motion-*` token，禁止硬编码 |
| 6 图表 | `docs/design-rules/usage-history-charts.md` | `lieflat-charts`（只做原型探索） | §5 数据标记档位 |
| 7 架构图 | `diagram-design`（42 种图型） | `mermaid` 手写 | 不涉及产品 UI token |
| 8 演示稿 | `ui-ux-pro-max-skill`（`slides`） | — | 不用于产品 UI |
| 9 宣传动效 | `huashu-art-motion` | — | 不用于产品 UI |
| 10 外部前端 | `taste-skill` | `shadcn-admin`（脚手架） | 该项目自己的 token |
| 11 品牌 | `ui-ux-pro-max-skill`（`brand`、`banner-design`） | — | 本仓先看 DESIGN.md §15 Skin family |
| 12 动效自检 | DESIGN.md §14.4 + 组件实际实现 | — | reduced motion 必须生效 |

## 3. 调用协议（每次设计任务都走这 5 步）

1. **判类型**，用第 1 节的表。
2. **选来源**：1 个主来源 + 最多 1 个辅助；**不要同时启用两个"审美/风格"来源**（`taste-skill`、`ui-ux-pro-max`、`ux-ui-agent-skills` 会互相抢视觉决策）。
3. **声明一句**，让用户看得见路由：
   ```
   设计路由：类型 5（动效） → 主 DESIGN.md §14.4；辅助：无；数值真相 --motion-*
   ```
4. **执行**：先读主来源对应章节/技能，再动手；外部 skill 的产出必须翻译成项目 token。
5. **自检 + 报告**（见第 5、6 节）。

## 4. 降级规则

- 外部 skill **未安装**：不要报错、不要现编。降级为"按项目规范直做"，并在报告里写一句 `辅助来源不可用：<name> 未安装，已按规范直做`。
- 项目规范与外部 skill **冲突**：**项目规范胜**，并在报告里指出冲突点（例：外部建议 24px 圆角，本仓 §5 不允许）。
- 任务跨类型（既改组件又要动效）：主来源取"影响面最大"的那类，另一类作为第 4 步的子步骤，不新增第二个审美来源。

## 5. 本仓硬约束（只列标题，细则读原文）

在 Cindy 仓库内改动时，逐条对照 `DESIGN.md`：

- §7 Do's / Don'ts：零阴影、禁渐变、灰度为主、字重 ≤600、圆角只有 0/2/4/8/12/9999 六档、边框 1px
- §10 双模式交付门槛：**同一次改动内**完成 Light + Dark；只做一种视为未完成；目检不是硬门槛，但必须如实说明查了哪种
- §14.4 动效：只用 `--motion-instant/fast/base/enter/exit` 与 3 条曲线；reduced motion 必须生效；禁装饰性大动效（弹跳、视差、循环）
- §3 字号/行高必须成对；§5 圆角与点击目标分类；§11 微文案语气
- 颜色只走语义 token，**禁止硬编码 hex / rgba**

## 6. 交付前自检（逐条回答，答不上就是没做完）

1. 这一层用的是哪一档圆角？依据 §5 哪一步？
2. 本次改动涉及哪些状态（default/hover/pressed/selected/focus/disabled/loading/empty/error）？Light / Dark 各是什么 token？
3. 动效属于哪一档？reduced motion 下变成什么？
4. 有没有踩到 §7 Don't 的任何一条？
5. 有没有为了"看起来高级"引入规范外的颜色、阴影、渐变或圆角？

## 7. 报告格式（写进回复或 PR 描述）

```
设计路由：类型 <n> → 主 <来源>；辅助 <无/名称>
约束来源：DESIGN.md §<章节>（+ 外部 skill 仅提供方法）
验证：Level 1 静态守卫 <跑/未跑>；Light/Dark 目检 <都查/仅查 X/未查>
未解决：<冲突点或待裁决项，没有就写"无">
```

## 8. 安装与前置

主来源是本仓文档，无需安装。**辅助来源**按需装（仓库 README 给出的命令）：

```bash
npx skills add Leonxlnx/taste-skill --skill design-taste-frontend
npx skills add plugin87/ux-ui-agent-skills
npx skills add cathrynlavery/diagram-design
npx skills add larashero3-dotcom/lieflat-charts
# Codex 原生：codex plugin marketplace add <owner>/<repo> && codex plugin add <name>@<name>
```

**本 skill 自身**的正本在 `docs/design-skills/cindy-design/`（`.agents/`、`.claude/`、`.pi/` 都被 gitignore，不能直接入仓）：

```bash
node scripts/install-design-skill.mjs            # 装到本仓 .agents/skills（项目级）
node scripts/install-design-skill.mjs --user     # 装到 ~/.agents/skills（全局，所有项目）
node scripts/install-design-skill.mjs --check    # 确认已装副本是否过期
```

个人级 `~/.agents/skills` 是 Cindy 三个引擎（Pi / Claude Code / Codex）的共享索引；项目级安装后仍需在 Cindy 里批准项目 trust，Pi 才会把它从 `discovered` 装配为 `loaded`。
