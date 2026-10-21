#!/usr/bin/env node
/**
 * 把 docs/design-skills/<name>/ 的设计 skill 安装到 Agent 能发现的目录。
 *
 * 背景：`.agents/`、`.claude/`、`.pi/` 都被 .gitignore 整体忽略（agent 私有目录），
 * 所以 skill 的正本放在被跟踪的 docs/design-skills/，本脚本负责把它投影到发现路径。
 *
 * 用法:
 *   node scripts/install-design-skill.mjs            # 装到本仓 .agents/skills（项目级，仅本机生效）
 *   node scripts/install-design-skill.mjs --user     # 装到 ~/.agents/skills（全局，所有项目生效）
 *   node scripts/install-design-skill.mjs --check    # 只比对已装副本与正本是否一致，不写盘
 *   node scripts/install-design-skill.mjs --dry-run  # 只打印将要做什么
 *   node scripts/install-design-skill.mjs --skill cindy-design
 *
 * 约定:
 * - 只接管带 `.cindy-design-skill.json` 标记的目录；目标位置已有同名但无标记的目录时拒绝覆盖。
 * - 复制而非软链：Windows 创建符号链接需要额外权限，复制在任何平台都可靠。
 * - 安装后仍需在 Cindy 里批准项目 trust，Pi 才会把项目级 skill 从 discovered 装配为 loaded。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'docs', 'design-skills');
const MARKER = '.cindy-design-skill.json';

function parseArgs(argv) {
  const opts = { user: false, check: false, dryRun: false, skill: 'cindy-design' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--user') opts.user = true;
    else if (arg === '--check') opts.check = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skill') opts.skill = argv[++i];
    else if (arg.startsWith('--skill=')) opts.skill = arg.slice('--skill='.length);
    else if (arg === '--help' || arg === '-h') return { help: true };
    else throw new Error(`未知参数: ${arg}`);
  }
  return opts;
}

/** 稳定摘要：按相对路径排序后逐个哈希文件内容。 */
function hashDir(dir) {
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === MARKER) continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else {
        hash.update(path.relative(dir, abs).split(path.sep).join('/'));
        hash.update('\0');
        hash.update(fs.readFileSync(abs));
        hash.update('\0');
      }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function targetRoot(opts) {
  return opts.user
    ? path.join(os.homedir(), '.agents', 'skills')
    : path.join(REPO_ROOT, '.agents', 'skills');
}

function readMarker(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write('用法: node scripts/install-design-skill.mjs [--user] [--check] [--dry-run] [--skill <name>]\n');
    return 0;
  }

  const source = path.join(SOURCE_ROOT, opts.skill);
  const skillFile = path.join(source, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    process.stderr.write(`找不到正本: ${path.relative(REPO_ROOT, skillFile)}\n`);
    return 1;
  }

  const root = targetRoot(opts);
  const target = path.join(root, opts.skill);
  const sourceSha = hashDir(source);
  const installed = readMarker(target);
  const scope = opts.user ? '全局（~/.agents/skills）' : '本仓（.agents/skills）';

  if (opts.check) {
    if (!installed) {
      process.stdout.write(`未安装：${target}\n`);
      return 1;
    }
    const same = installed.sourceSha256 === sourceSha;
    process.stdout.write(`安装位置: ${target}\n已装版本: ${installed.sourceSha256.slice(0, 12)}\n正本版本: ${sourceSha.slice(0, 12)}\n`);
    process.stdout.write(same ? '状态: 一致\n' : '状态: 已过期，请重新运行本脚本（不带 --check）\n');
    return same ? 0 : 1;
  }

  if (fs.existsSync(target) && !installed) {
    process.stderr.write(
      `拒绝覆盖：${target} 已存在且不是本脚本安装的（缺少 ${MARKER}）。\n` +
        '如果是手工放的副本，请先移走或改名，再重新运行。\n',
    );
    return 1;
  }

  if (opts.dryRun) {
    process.stdout.write(`[dry-run] ${sourceSha.slice(0, 12)} ${path.relative(REPO_ROOT, source)} -> ${target}（${scope}）\n`);
    return 0;
  }

  fs.mkdirSync(root, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  fs.writeFileSync(
    path.join(target, MARKER),
    `${JSON.stringify(
      {
        source: path.relative(REPO_ROOT, source).split(path.sep).join('/'),
        sourceSha256: sourceSha,
        scope: opts.user ? 'user' : 'project',
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  process.stdout.write(`已安装: ${target}（${scope}）\n版本: ${sourceSha.slice(0, 12)}\n`);
  if (!opts.user) {
    process.stdout.write(
      '下一步:\n' +
        '  1. 在 Cindy 里为本仓库批准项目 trust，Pi 才会把项目级 skill 从 discovered 装配为 loaded；\n' +
        '  2. Claude Code / Codex 走 Cindy 的共享索引 fanout，无需额外操作；\n' +
        '  3. 改了正本后重新运行本脚本（或用 --check 确认是否过期）。\n',
    );
  }
  return 0;
}

process.exitCode = main();
