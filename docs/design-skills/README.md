# 设计类 Agent Skill（正本目录）

这里放**可被 Agent 自动调用的设计 skill 正本**，用脚本投影到 Agent 的发现目录。

## 为什么正本不放 `.agents/`

`.gitignore` 第 121—124 行把 `.agents/`、`.claude/`、`.pi/` 整体忽略（"Agent 工具私有目录整体忽略；
共享说明只通过 AGENTS.md / CLAUDE.md 提交"）。所以技能不能直接躺在发现目录里入仓——
**正本放在这个被跟踪的目录，安装动作由脚本完成**。

## 当前技能

| Skill | 作用 | 触发场景 |
| --- | --- | --- |
| [`cindy-design`](./cindy-design/SKILL.md) | 设计任务路由器：判类型 → 选来源（本仓规范 / 已装设计 skill）→ 声明 → 自检 | UI、组件、样式、配色、排版、圆角、动效、图表、审美（"好看一点""高级感"） |

## 安装

```bash
node scripts/install-design-skill.mjs            # 本仓级：<repo>/.agents/skills（仅本机生效）
node scripts/install-design-skill.mjs --user     # 个人级：~/.agents/skills（所有项目生效）
node scripts/install-design-skill.mjs --check    # 比对已装副本与正本，判断是否过期
node scripts/install-design-skill.mjs --dry-run  # 只打印动作
```

等价的 pnpm 入口：`pnpm design:skill:install` / `pnpm design:skill:check`。

脚本行为：

- 只接管带 `.cindy-design-skill.json` 标记的目录；目标已有同名但无标记的目录时**拒绝覆盖**。
- 复制而非软链（Windows 创建符号链接需要额外权限）。
- 改了正本要重新跑一次；`--check` 不一致说明已过期。

## 各引擎的发现路径（Cindy 运行时实测代码）

| 引擎 | 个人级 | 项目级 |
| --- | --- | --- |
| Pi（Cindy 默认） | `~/.agents/skills` | `{cwd}/.pi/skills`、从 cwd 向上到 git root 每层 `.agents/skills` |
| Claude Code | `~/.claude/skills/{name}/SKILL.md` | `{wd}/.claude/skills` |
| Codex | `~/.agents/skills`、`~/.codex/skills` | `{wd}/.agents/skills`、`{wd}/.codex/skills` |

- `~/.agents/skills` 是共享索引；Cindy 会把 `.claude/skills`、`.codex/skills` 的条目双向链接过去。
- 项目级 skill 在 Pi 里先是 `discovered` 预览，**需在 Cindy 批准项目 trust** 才会装配为 `loaded`；
  且必须是"目录内含 `SKILL.md`"，单文件 Markdown 不算。

## 写新技能的约定

1. 目录名即 skill 名：`docs/design-skills/<name>/SKILL.md`，frontmatter 只需 `name` + `description`。
2. `description` 要写清**什么时候触发**（列出用户会说的词），这是自动调用的唯一依据。
3. 不要在 skill 里复制 `docs/design-rules/DESIGN.md` 的数值——规范会变，复制即漂移；
   skill 只写"读哪一节"和"改完怎么自检"。
4. 外部设计仓库只提供方法与检查项，颜色 / 字号 / 圆角 / 时长永远来自本仓 token。
