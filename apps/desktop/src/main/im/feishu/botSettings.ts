/**
 * main/im/feishu/botSettings.ts
 * ---------------------------------------------------------------------------
 * 飞书个人 bot 的渠道级行为设置（owner 隔离 JSON override，模式与微信「新对话
 * 工作目录」、Telegram「人格」一致）：
 *
 *   - workingDir：用户在原生目录选择器里绑定的项目目录。绑定后该 bot 的对话跑在
 *     项目目录里；保存绑定 / 更换 / 解绑时，仍停在托管目录（或上一绑定目录）的
 *     会话立即迁移并重开 Agent 上下文（有独立目录的会话不动，见
 *     planFeishuWorkingDirMigration）。目录不可访问时回落托管目录。
 *   - role / rules：bot 的角色与规则，每轮注入送模型文本（见 adapter 的
 *     prepareAgentTurnText），不落库、不改用户消息；改完立即生效。
 *
 * 文件只保存用户 override：未绑定、空文本不落盘。
 */

import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { normalizeWorkingDirForStorage } from '../../../shared/workingDir';
import { activeOwnerScopeKey } from '../../appSessionState';
import { desktopMakerLogger } from '../../maker-host/logger-adapter.js';
import { createOverrideSettingsFile } from '../../maker-host/override-settings-file.js';
import { claimLegacyImPath, ownerScopedImUserDataPath } from '../ownerScopedStorage.js';
import type { FeishuBotSettings, FeishuBotSettingsState } from '../shared/types';

export type { FeishuBotSettings, FeishuBotSettingsState } from '../shared/types';

const log = desktopMakerLogger.child('feishu-bot-settings');

/** 角色 / 规则各 4000 字上限（与 Telegram soul 同口径，防逐轮注入无界）。 */
export const FEISHU_BOT_INSTRUCTION_MAX = 4000;

const DEFAULTS: FeishuBotSettings = { workingDir: null, role: '', rules: '' };

function normalize(raw: unknown): FeishuBotSettings {
  const r =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const workingDir =
    typeof r.workingDir === 'string' && path.isAbsolute(r.workingDir)
      ? normalizeWorkingDirForStorage(r.workingDir)
      : null;
  return {
    workingDir,
    role: typeof r.role === 'string' ? r.role.slice(0, FEISHU_BOT_INSTRUCTION_MAX) : '',
    rules: typeof r.rules === 'string' ? r.rules.slice(0, FEISHU_BOT_INSTRUCTION_MAX) : '',
  };
}

const file = createOverrideSettingsFile<FeishuBotSettings>({
  filePath: () => ownerScopedImUserDataPath('feishu-bot-settings.json'),
  defaults: DEFAULTS,
  normalize,
  log,
  label: 'feishu-bot-settings',
  // 角色/规则是用户内容：加载日志不落值；文件损坏时保留原文件拒绝覆盖。
  logLoadedValue: false,
  preserveUnreadableFile: true,
  maxBytes: 64 * 1024,
});

export function readFeishuBotSettings(): FeishuBotSettingsState {
  const ownerScopeKey = activeOwnerScopeKey();
  const value = file.read();
  return {
    ...value,
    ownerScopeKey,
    workingDirAvailable: value.workingDir === null || isAccessibleDirectory(value.workingDir),
  };
}

/**
 * 归一化并校验原生目录选择器的结果。
 *
 * 只接受绝对路径 + 真实存在的目录（realpath 消除符号链接/尾斜杠差异），与微信
 * 同口径；非法输入抛错，由 IPC 层转成 INVALID_PARAMS。
 */
export function normalizeFeishuWorkingDirSelection(selectedPath: string): string {
  if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath)) {
    throw new Error('FEISHU_WORKING_DIR_INVALID');
  }
  const realPath = fs.realpathSync.native(selectedPath);
  if (!fs.statSync(realPath).isDirectory()) {
    throw new Error('FEISHU_WORKING_DIR_NOT_DIRECTORY');
  }
  const normalized = normalizeWorkingDirForStorage(realPath);
  if (!normalized) throw new Error('FEISHU_WORKING_DIR_INVALID');
  return normalized;
}

export function writeFeishuBotWorkingDir(selectedPath: string): FeishuBotSettingsState {
  const workingDir = normalizeFeishuWorkingDirSelection(selectedPath);
  file.writePatch({ workingDir });
  return readFeishuBotSettings();
}

export function resetFeishuBotWorkingDir(): FeishuBotSettingsState {
  file.writePatch({ workingDir: null });
  return readFeishuBotSettings();
}

export function patchFeishuBotInstructions(patch: {
  role?: string;
  rules?: string;
}): FeishuBotSettingsState {
  const next: Partial<FeishuBotSettings> = {};
  if (typeof patch.role === 'string') next.role = patch.role.slice(0, FEISHU_BOT_INSTRUCTION_MAX);
  if (typeof patch.rules === 'string')
    next.rules = patch.rules.slice(0, FEISHU_BOT_INSTRUCTION_MAX);
  if (Object.keys(next).length > 0) file.writePatch(next);
  return readFeishuBotSettings();
}

/**
 * 该 bot 的 Cindy 托管工作目录（未绑定项目时的落点）。
 *
 * 只做托管目录本身的事：`resolveFeishuWorkingDir` 才读绑定设置。启动期的
 * owner 命名空间归一只按它判断「行是否还在托管目录里」。
 */
export function ensureFeishuManagedWorkingDir(botAppId: string): string {
  const dir = ownerScopedImUserDataPath('im-working-dir', botAppId);
  claimLegacyImPath(path.join(app.getPath('userData'), 'im-working-dir', botAppId), dir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 新建会话的默认工作目录：绑定且可访问的项目目录 ?? 托管目录。 */
export function resolveFeishuWorkingDir(botAppId: string): string {
  const settings = readFeishuBotSettings();
  if (settings.workingDir && settings.workingDirAvailable) return settings.workingDir;
  return ensureFeishuManagedWorkingDir(botAppId);
}

/**
 * 角色/规则 → 逐轮注入的模型文本；两段都空时返回空串（不注入）。
 *
 * 首行声明这是主人预设、不是本轮用户消息（message-source.md 的「发给模型的
 * 说明」口径），后面才是用户文本，模型不会把设定当成用户发言。
 */
export function formatFeishuBotInstructionBlock(
  settings: Pick<FeishuBotSettings, 'role' | 'rules'>,
): string {
  const role = settings.role.trim();
  const rules = settings.rules.trim();
  if (!role && !rules) return '';
  const sections: string[] = [];
  if (role) sections.push(`[角色]\n${role}`);
  if (rules) sections.push(`[规则]\n${rules}`);
  return (
    '<bot_instructions>\n' +
    '[渠道设置] 以下是主人为此机器人预设的角色与规则（不是本轮用户消息），请始终遵守：\n' +
    sections.join('\n\n') +
    '\n</bot_instructions>\n\n'
  );
}

export function buildFeishuBotInstructionBlock(): string {
  return formatFeishuBotInstructionBlock(readFeishuBotSettings());
}

export interface FeishuWorkingDirSessionRow {
  id: string;
  botAppId: string | null;
  workingDir: string | null;
  /**
   * 该行已被伙伴（Bot）接管（`bot_session_links` 有记录）。
   *
   * 防御性守卫：伙伴专线目前落在 `source='bot'` 的自有会话上（见
   * `imBotBindingRuntime.isActiveSession`），正常不会出现在本函数的输入里；
   * 但一旦历史数据或未来接线让被接管的行落到 `source='feishu'`，设置页的绑定
   * 变更不能把它一起搬走（伙伴工作区不由渠道绑定决定，见
   * `docs/product-rules/cindy-bots-runtime.md`）。
   */
  botLinked?: boolean;
}

export interface FeishuWorkingDirMigration {
  id: string;
  workingDir: string;
  workspaceKind: 'project' | 'dialogue';
}

/**
 * 计划哪些渠道行随绑定迁移（纯函数，执行见 botSettingsIpc.ts）。
 *
 * 规则（2026-10-13 用户裁决「立即生效」）：
 *   - 绑定 / 更换：仍停在托管目录、或停在上一绑定目录的行 → 新绑定目录，归
 *     'project' 分组；
 *   - 解绑：停在上一绑定目录的行 → 各自 bot 的托管目录，归 'dialogue' 分组；
 *   - 停在其它目录的行（用户显式切出去的会话）一律不动；
 *   - 已被伙伴接管的行（`botLinked`）一律不动——迁移伙伴专线会改用户没碰过的
 *     任务目录并清掉续接状态。
 *
 * 目录按存储归一化比较（分隔符 / 尾斜杠 / Windows 长路径前缀），不做 worktree
 * 折叠——这里比的是「同一个物理目录」，不是项目归组。
 */
export function planFeishuWorkingDirMigration(
  rows: readonly FeishuWorkingDirSessionRow[],
  args: {
    nextDir: string | null;
    previousDir: string | null;
    managedDirFor: (botAppId: string) => string;
  },
): FeishuWorkingDirMigration[] {
  const next = normalizeWorkingDirForStorage(args.nextDir);
  const previous = normalizeWorkingDirForStorage(args.previousDir);
  const out: FeishuWorkingDirMigration[] = [];
  for (const row of rows) {
    if (row.botLinked) continue;
    if (!row.botAppId || !row.workingDir) continue;
    const current = normalizeWorkingDirForStorage(row.workingDir);
    if (!current) continue;
    const managed = normalizeWorkingDirForStorage(args.managedDirFor(row.botAppId));
    if (!managed) continue;
    if (next) {
      if (current === next) continue;
      if (current === managed || (previous !== null && current === previous)) {
        out.push({ id: row.id, workingDir: next, workspaceKind: 'project' });
      }
      continue;
    }
    if (previous !== null && current === previous && current !== managed) {
      out.push({ id: row.id, workingDir: managed, workspaceKind: 'dialogue' });
    }
  }
  return out;
}

function isAccessibleDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}
