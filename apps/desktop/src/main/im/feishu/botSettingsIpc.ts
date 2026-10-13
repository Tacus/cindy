/**
 * main/im/feishu/botSettingsIpc.ts
 * ---------------------------------------------------------------------------
 * 飞书个人 bot 行为设置的 IPC 通道（设置卡的数据面）：
 *   - feishuBot:get-bot-settings / set-bot-instructions（角色 + 规则）
 *   - feishuBot:choose-working-directory / reset-working-directory（项目绑定）
 *   - feishuBot:enrich-instructions（AI 一键丰富，辅助模型 oneshot）
 *
 * 工作目录改动「立即生效」：保存前后把仍停在托管目录（或上一绑定目录）的渠道行
 * 迁到目标目录并重开 Agent 上下文，执行器单独导出便于注入 fake 的单测。
 *
 * handler 全部先验可信 app renderer；写库/写文件前复核 owner scope 未变。
 */

import { eq } from 'drizzle-orm';
import { BrowserWindow, dialog, ipcMain } from 'electron';

import { getDbClient } from '../../localDb/client/current';
import { sessions } from '../../localDb/schema';
import { createLogger } from '../../logger';
import { assertTrustedAppRendererEvent } from '../../security/trustedAppRenderer.js';
import { throwIpcError } from '../../utils/ipcValidate.js';
import { activeOwnerScopeKey } from '../../appSessionState';
import { assertOwnerScopeSettledForWrite } from '../ownerScopedStorage';
import { getImOrchestrator } from '../shared/orchestrator';
import { switchSessionWorkingDir } from '../shared/sessionRepo';
import {
  FEISHU_BOT_INSTRUCTION_MAX,
  normalizeFeishuWorkingDirSelection,
  patchFeishuBotInstructions,
  readFeishuBotSettings,
  resetFeishuBotWorkingDir,
  writeFeishuBotWorkingDir,
} from './botSettings';
import {
  migrateFeishuSessionsForWorkingDirChange,
  type FeishuWorkingDirMigrationDeps,
} from './botSettingsApply';
import {
  FeishuInstructionEnrichError,
  enrichFeishuInstructions,
  isFeishuInstructionField,
} from './instructionsEnrich';

const log = createLogger('im:feishu-bot-settings');

function realMigrationDeps(): FeishuWorkingDirMigrationDeps {
  return {
    listSessions: async () => {
      const rows = await getDbClient()
        .drizzle.select({
          id: sessions.id,
          botAppId: sessions.feishuBotAppId,
          workingDir: sessions.workingDir,
        })
        .from(sessions)
        .where(eq(sessions.source, 'feishu'));
      return rows.map((row) => ({
        id: row.id,
        botAppId: row.botAppId ?? null,
        workingDir: row.workingDir ?? null,
      }));
    },
    switchWorkingDir: (item) =>
      switchSessionWorkingDir(item.id, item.workingDir, item.workspaceKind, {
        preserveVisibleHistory: true,
      }),
    disposeSession: async (sessionId) => {
      await getImOrchestrator('feishu')?.turnRunner.disposeOneSession(sessionId);
    },
  };
}

/** owner scope 在 await 间隙变化时统一走 fail-closed 的 IPC 错误。 */
function assertOwnerScopeForWrite(ownerScopeKey: string, action: string): void {
  try {
    assertOwnerScopeSettledForWrite(ownerScopeKey);
  } catch {
    throwIpcError('INTERNAL', `${action}未保存：账号切换中，请重试`);
  }
}

function requireOwnerScopeKey(value: unknown, action: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throwIpcError('INVALID_PARAMS', '缺少有效的 ownerScopeKey');
  }
  assertOwnerScopeForWrite(value, action);
  return value;
}

/**
 * 注册飞书 bot 行为设置 IPC。由 startImOrchestrators() 显式调用 —— 不能放模块
 * 顶层：host / orchestrator 被 mock 掉的单测传递 import 时会在收集期炸掉。
 */
export function registerFeishuBotSettingsIpc(): void {
  ipcMain.handle('feishuBot:get-bot-settings', (event) => {
    assertTrustedAppRendererEvent(event);
    assertOwnerScopeForWrite(activeOwnerScopeKey(), '机器人设置');
    return readFeishuBotSettings();
  });

  ipcMain.handle('feishuBot:set-bot-instructions', (event, payload: unknown) => {
    assertTrustedAppRendererEvent(event);
    const p =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const ownerScopeKey = requireOwnerScopeKey(p.ownerScopeKey, '机器人指令');
    const patch: { role?: string; rules?: string } = {};
    for (const field of ['role', 'rules'] as const) {
      const value = p[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string') {
        throwIpcError('INVALID_PARAMS', `机器人${field === 'role' ? '角色' : '规则'}必须是文本`);
      }
      if (value.length > FEISHU_BOT_INSTRUCTION_MAX) {
        throwIpcError(
          'INVALID_PARAMS',
          `机器人${field === 'role' ? '角色' : '规则'}超出 ${FEISHU_BOT_INSTRUCTION_MAX} 字上限`,
        );
      }
      patch[field] = value;
    }
    assertOwnerScopeForWrite(ownerScopeKey, '机器人指令');
    return patchFeishuBotInstructions(patch);
  });

  ipcMain.handle(
    'feishuBot:choose-working-directory',
    async (event, expectedOwnerScopeKey: unknown) => {
      assertTrustedAppRendererEvent(event);
      const ownerScopeKey = requireOwnerScopeKey(expectedOwnerScopeKey, '机器人项目');
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || owner.isDestroyed()) {
        throwIpcError('INTERNAL', '无法打开目录选择器：设置窗口不可用');
      }
      const result = await dialog.showOpenDialog(owner, {
        properties: ['openDirectory', 'createDirectory'],
      });
      assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
      if (result.canceled || !result.filePaths[0]) {
        return { canceled: true as const, state: readFeishuBotSettings() };
      }
      let nextDir: string;
      try {
        nextDir = normalizeFeishuWorkingDirSelection(result.filePaths[0]);
      } catch {
        throwIpcError('INVALID_PARAMS', '所选目录不可用或不是目录');
      }
      const previousDir = readFeishuBotSettings().workingDir;
      assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
      try {
        await migrateFeishuSessionsForWorkingDirChange(
          { nextDir, previousDir, ownerScopeKey },
          realMigrationDeps(),
        );
      } catch (err) {
        assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
        log.warn('feishu working-dir migration failed before save', {
          error: err instanceof Error ? err.message : String(err),
        });
        throwIpcError('INTERNAL', '机器人项目未保存：现有任务的工作目录切换失败，请重试');
      }
      assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
      return { canceled: false as const, state: writeFeishuBotWorkingDir(nextDir) };
    },
  );

  ipcMain.handle(
    'feishuBot:reset-working-directory',
    async (event, expectedOwnerScopeKey: unknown) => {
      assertTrustedAppRendererEvent(event);
      const ownerScopeKey = requireOwnerScopeKey(expectedOwnerScopeKey, '机器人项目');
      const previousDir = readFeishuBotSettings().workingDir;
      if (previousDir === null) return readFeishuBotSettings();
      assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
      try {
        await migrateFeishuSessionsForWorkingDirChange(
          { nextDir: null, previousDir, ownerScopeKey },
          realMigrationDeps(),
        );
      } catch (err) {
        assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
        log.warn('feishu working-dir reset migration failed before save', {
          error: err instanceof Error ? err.message : String(err),
        });
        throwIpcError('INTERNAL', '机器人项目未解绑：恢复现有任务的工作目录失败，请重试');
      }
      assertOwnerScopeForWrite(ownerScopeKey, '机器人项目');
      return resetFeishuBotWorkingDir();
    },
  );

  ipcMain.handle('feishuBot:enrich-instructions', async (event, payload: unknown) => {
    assertTrustedAppRendererEvent(event);
    const p =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const ownerScopeKey = requireOwnerScopeKey(p.ownerScopeKey, '机器人指令');
    const field = p.field;
    const text = p.text;
    if (!isFeishuInstructionField(field)) {
      throwIpcError('INVALID_PARAMS', '未知的机器人指令字段');
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      throwIpcError('INVALID_PARAMS', '先写一段内容再用 AI 丰富');
    }
    if (text.length > FEISHU_BOT_INSTRUCTION_MAX) {
      throwIpcError('INVALID_PARAMS', `内容超出 ${FEISHU_BOT_INSTRUCTION_MAX} 字上限`);
    }
    let enriched: string;
    try {
      enriched = await enrichFeishuInstructions({ field, text });
    } catch (err) {
      assertOwnerScopeForWrite(ownerScopeKey, '机器人指令');
      if (err instanceof FeishuInstructionEnrichError && err.reason === 'model_unavailable') {
        throwIpcError('INTERNAL', 'AI 丰富暂时不可用，请稍后重试');
      }
      log.warn('feishu instructions enrich failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throwIpcError('INTERNAL', 'AI 丰富失败，文本保持不变');
    }
    assertOwnerScopeForWrite(ownerScopeKey, '机器人指令');
    return { text: enriched };
  });
}
