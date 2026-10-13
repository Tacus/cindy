/**
 * 飞书 bot 行为设置 IPC 的安全合同（源码级）：这组通道能改用户绑定目录、写用户
 * 文本，并触发对现有任务的工作目录迁移。sender 校验必须拦在任何 dialog / 写库 /
 * 迁移之前；owner scope 必须在 await 前快照、写前复核（切号中途不得落到别的 owner）。
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../botSettingsIpc.ts', import.meta.url), 'utf8');

const HANDLERS = [
  'feishuBot:get-bot-settings',
  'feishuBot:set-bot-instructions',
  'feishuBot:choose-working-directory',
  'feishuBot:reset-working-directory',
  'feishuBot:enrich-instructions',
] as const;

function handlerRange(channel: string): { start: number; end: number } {
  const handlers = Array.from(source.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g));
  const start = handlers.find((handler) => handler[1] === channel)?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const nextStarts = handlers.map((handler) => handler.index).filter((index) => index > start);
  return { start, end: nextStarts.length > 0 ? Math.min(...nextStarts) : source.length };
}

describe('feishu bot settings IPC security contract', () => {
  it.each(HANDLERS)('%s verifies the trusted app renderer first', (channel) => {
    const { start, end } = handlerRange(channel);
    const guard = source.indexOf('assertTrustedAppRendererEvent(event);', start);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(end);
  });

  it.each(HANDLERS.filter((c) => c !== 'feishuBot:get-bot-settings'))(
    '%s has no privileged side effect before the sender guard',
    (channel) => {
      const { start, end } = handlerRange(channel);
      const guard = source.indexOf('assertTrustedAppRendererEvent(event);', start);
      for (const sideEffect of [
        'dialog.showOpenDialog(',
        'patchFeishuBotInstructions(',
        'writeFeishuBotWorkingDir(',
        'resetFeishuBotWorkingDir(',
        'migrateFeishuSessionsForWorkingDirChange(',
        'enrichFeishuInstructions(',
      ]) {
        const index = source.indexOf(sideEffect, start);
        if (index !== -1 && index < end) expect(index).toBeGreaterThan(guard);
      }
    },
  );

  it.each(HANDLERS.filter((channel) => channel !== 'feishuBot:get-bot-settings'))(
    '%s requires the renderer snapshot before accessing owner data',
    (channel) => {
      const { start, end } = handlerRange(channel);
      const handler = source.slice(start, end);
      const capture = handler.indexOf('const ownerScopeKey = requireOwnerScopeKey(');
      expect(capture).toBeGreaterThan(0);
      expect(handler).not.toContain('const ownerScopeKey = activeOwnerScopeKey();');
      for (const sideEffect of [
        'readFeishuBotSettings(',
        'dialog.showOpenDialog(',
        'patchFeishuBotInstructions(',
        'writeFeishuBotWorkingDir(',
        'resetFeishuBotWorkingDir(',
        'migrateFeishuSessionsForWorkingDirChange(',
        'enrichFeishuInstructions(',
      ]) {
        const index = handler.indexOf(sideEffect);
        if (index !== -1) expect(index).toBeGreaterThan(capture);
      }
    },
  );

  it.each(['feishuBot:choose-working-directory', 'feishuBot:reset-working-directory'])(
    '%s rechecks the owner after migration and before the final JSON save',
    (channel) => {
      const { start, end } = handlerRange(channel);
      const handler = source.slice(start, end);
      const migration = handler.indexOf('await migrateFeishuSessionsForWorkingDirChange(');
      const guard = handler.lastIndexOf('assertOwnerScopeForWrite(ownerScopeKey');
      const save = Math.max(
        handler.indexOf('writeFeishuBotWorkingDir('),
        handler.indexOf('resetFeishuBotWorkingDir('),
      );
      expect(migration).toBeGreaterThan(0);
      expect(guard).toBeGreaterThan(migration);
      expect(save).toBeGreaterThan(guard);
    },
  );

  it('validation failures use the unified IPC error protocol', () => {
    expect(source).not.toContain('throw new Error(');
  });
});
