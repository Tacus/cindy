/**
 * main/im/feishu/botSettingsApply.ts
 * ---------------------------------------------------------------------------
 * 「项目绑定立即生效」的迁移执行器：把绑定变化落到渠道行。
 *
 * 只依赖注入的 deps（不 import db / orchestrator），便于用 fake 钉住行为；
 * 真实依赖的装配在 botSettingsIpc.ts。每个命中行先 switchSessionWorkingDir
 * （落库 + 广播 + 清 sdkSessionId），再 dispose 活会话，让下一条消息在新目录
 * 重建 —— 与 Telegram `/project` 切换同一语义。
 */

import { createLogger } from '../../logger';
import { assertOwnerScopeSettledForWrite } from '../ownerScopedStorage';
import {
  ensureFeishuManagedWorkingDir,
  planFeishuWorkingDirMigration,
  type FeishuWorkingDirMigration,
  type FeishuWorkingDirSessionRow,
} from './botSettings';

const log = createLogger('im:feishu-bot-settings');

export interface FeishuWorkingDirMigrationDeps {
  listSessions(): Promise<FeishuWorkingDirSessionRow[]>;
  switchWorkingDir(item: FeishuWorkingDirMigration): Promise<void>;
  disposeSession(sessionId: string): Promise<void>;
}

export async function migrateFeishuSessionsForWorkingDirChange(
  args: { nextDir: string | null; previousDir: string | null; ownerScopeKey: string },
  deps: FeishuWorkingDirMigrationDeps,
): Promise<number> {
  assertOwnerScopeSettledForWrite(args.ownerScopeKey);
  const rows = await deps.listSessions();
  assertOwnerScopeSettledForWrite(args.ownerScopeKey);
  const items = planFeishuWorkingDirMigration(rows, {
    nextDir: args.nextDir,
    previousDir: args.previousDir,
    managedDirFor: ensureFeishuManagedWorkingDir,
  });
  for (const item of items) {
    assertOwnerScopeSettledForWrite(args.ownerScopeKey);
    await deps.switchWorkingDir(item);
  }
  for (const item of items) {
    assertOwnerScopeSettledForWrite(args.ownerScopeKey);
    await deps.disposeSession(item.id);
  }
  assertOwnerScopeSettledForWrite(args.ownerScopeKey);
  if (items.length > 0) {
    log.info('feishu working-dir binding applied to existing sessions', { moved: items.length });
  }
  return items.length;
}
