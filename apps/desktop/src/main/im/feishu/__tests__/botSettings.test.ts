/**
 * 飞书 bot 行为设置的纯逻辑测试：指令块格式、绑定迁移计划、目录选择校验与
 * 迁移执行器（注入 fake deps）。存储层文件 IO 与微信/Telegram 同构，不在此重复覆盖。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scopeMocks = vi.hoisted(() => ({ root: '', owner: 'cloud-a' }));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => scopeMocks.root) },
}));

vi.mock('../../../appSessionState', () => ({
  activeOwnerScopeKey: () => scopeMocks.owner,
}));

vi.mock('../../ownerScopedStorage', () => ({
  ownerScopedImUserDataPath: (...parts: string[]) =>
    path.join(scopeMocks.root, 'owners', scopeMocks.owner, ...parts),
  claimLegacyImPath: vi.fn(),
  assertOwnerScopeSettledForWrite: (expectedScopeKey: string) => {
    if (expectedScopeKey !== scopeMocks.owner) throw new Error('owner changed');
  },
}));

import {
  ensureFeishuManagedWorkingDir,
  formatFeishuBotInstructionBlock,
  normalizeFeishuWorkingDirSelection,
  planFeishuWorkingDirMigration,
} from '../botSettings';
import { normalizeWorkingDirForStorage } from '../../../../shared/workingDir';
import { migrateFeishuSessionsForWorkingDirChange } from '../botSettingsApply';

beforeAll(() => {
  scopeMocks.root = fs.mkdtempSync(path.join(os.tmpdir(), 'xdt-feishu-bot-settings-'));
});

beforeEach(() => {
  scopeMocks.owner = 'cloud-a';
});

afterAll(() => {
  fs.rmSync(scopeMocks.root, { recursive: true, force: true });
});

const managedOf = (botId: string) => ensureFeishuManagedWorkingDir(botId);

describe('formatFeishuBotInstructionBlock', () => {
  it('角色/规则都空时返回空串（不注入）', () => {
    expect(formatFeishuBotInstructionBlock({ role: '', rules: '' })).toBe('');
    expect(formatFeishuBotInstructionBlock({ role: '  \n', rules: '\t' })).toBe('');
  });

  it('带声明行与两个分节，不以用户消息自居', () => {
    const block = formatFeishuBotInstructionBlock({ role: '你是助理', rules: '不要动 main' });
    expect(block).toContain('<bot_instructions>');
    expect(block).toContain('不是本轮用户消息');
    expect(block).toContain('[角色]\n你是助理');
    expect(block).toContain('[规则]\n不要动 main');
    expect(block.endsWith('</bot_instructions>\n\n')).toBe(true);
  });

  it('只有一段时只出该分节，并裁掉首尾空白', () => {
    expect(formatFeishuBotInstructionBlock({ role: '  简洁  ', rules: '' })).toContain(
      '[角色]\n简洁',
    );
    const rulesOnly = formatFeishuBotInstructionBlock({ role: '', rules: '先给计划' });
    expect(rulesOnly).not.toContain('[角色]');
    expect(rulesOnly).toContain('[规则]\n先给计划');
  });
});

describe('normalizeFeishuWorkingDirSelection', () => {
  it('接受存在的目录并做存储归一化', () => {
    const dir = fs.mkdtempSync(path.join(scopeMocks.root, 'pick-'));
    const result = normalizeFeishuWorkingDirSelection(`${dir}${path.sep}`);
    expect(path.isAbsolute(result)).toBe(true);
    expect(fs.statSync(result).isDirectory()).toBe(true);
  });

  it('拒绝相对路径、文件与不存在的目录', () => {
    expect(() => normalizeFeishuWorkingDirSelection('relative/dir')).toThrow(
      'FEISHU_WORKING_DIR_INVALID',
    );
    const file = path.join(scopeMocks.root, 'a-file.txt');
    fs.writeFileSync(file, 'x');
    expect(() => normalizeFeishuWorkingDirSelection(file)).toThrow(
      'FEISHU_WORKING_DIR_NOT_DIRECTORY',
    );
    expect(() =>
      normalizeFeishuWorkingDirSelection(path.join(scopeMocks.root, 'missing')),
    ).toThrow();
  });
});

describe('planFeishuWorkingDirMigration', () => {
  const botA = { botAppId: 'bot_a' };

  it('绑定/更换：托管目录与上一绑定目录的行迁到新目录，独立目录不动', () => {
    const managedA = managedOf('bot_a');
    const plan = planFeishuWorkingDirMigration(
      [
        { id: 's-managed', ...botA, workingDir: managedA },
        { id: 's-previous', ...botA, workingDir: '/work/old-project' },
        { id: 's-own', ...botA, workingDir: '/work/own-dir' },
        { id: 's-target', ...botA, workingDir: '/work/new-project' },
        { id: 's-null-bot', botAppId: null, workingDir: managedA },
        { id: 's-null-dir', ...botA, workingDir: null },
      ],
      { nextDir: '/work/new-project', previousDir: '/work/old-project', managedDirFor: managedOf },
    );
    expect(plan).toEqual([
      { id: 's-managed', workingDir: '/work/new-project', workspaceKind: 'project' },
      { id: 's-previous', workingDir: '/work/new-project', workspaceKind: 'project' },
    ]);
  });

  it('解绑：只回收停在上一绑定目录的行，回到各自 bot 的托管目录', () => {
    // 迁移计划输出存归一化路径（'/' 分隔），期望值同样按存储口径归一。
    const managedA = normalizeWorkingDirForStorage(managedOf('bot_a'));
    const managedB = normalizeWorkingDirForStorage(managedOf('bot_b'));
    const plan = planFeishuWorkingDirMigration(
      [
        { id: 's-project', ...botA, workingDir: '/work/old-project/' },
        { id: 's-own', ...botA, workingDir: '/work/own-dir' },
        { id: 's-managed', ...botA, workingDir: managedA },
        { id: 's-other-bot', botAppId: 'bot_b', workingDir: '/work/old-project' },
      ],
      { nextDir: null, previousDir: '/work/old-project', managedDirFor: managedOf },
    );
    expect(plan).toEqual([
      { id: 's-project', workingDir: managedA, workspaceKind: 'dialogue' },
      { id: 's-other-bot', workingDir: managedB, workspaceKind: 'dialogue' },
    ]);
  });

  it('上一绑定为空时解绑是 no-op；未绑定/目录为空的行走不到', () => {
    expect(
      planFeishuWorkingDirMigration([{ id: 's1', ...botA, workingDir: managedOf('bot_a') }], {
        nextDir: null,
        previousDir: null,
        managedDirFor: managedOf,
      }),
    ).toEqual([]);
  });

  it('已被伙伴接管的行不随设置页绑定迁移（绑定与解绑两个方向）', () => {
    // 伙伴专线任务的工作区由伙伴自己决定，迁移它会改动用户没碰过的任务并清掉
    // 续接状态。两个方向都要守住：next 有值（绑定/更换）与 next 为 null（解绑）。
    const managedA = managedOf('bot_a');
    const rows = [
      { id: 's-settings', ...botA, workingDir: managedA },
      { id: 's-bot-managed', ...botA, workingDir: managedA, botLinked: true },
      { id: 's-bot-previous', ...botA, workingDir: '/work/old-project', botLinked: true },
    ];
    expect(
      planFeishuWorkingDirMigration(rows, {
        nextDir: '/work/new-project',
        previousDir: '/work/old-project',
        managedDirFor: managedOf,
      }),
    ).toEqual([{ id: 's-settings', workingDir: '/work/new-project', workspaceKind: 'project' }]);
    expect(
      planFeishuWorkingDirMigration(rows, {
        nextDir: null,
        previousDir: '/work/old-project',
        managedDirFor: managedOf,
      }),
    ).toEqual([]);
  });

  it('目录比较走存储归一化（尾斜杠 / 反斜杠 / 长路径前缀）', () => {
    const plan = planFeishuWorkingDirMigration(
      [{ id: 's1', ...botA, workingDir: `${managedOf('bot_a')}${path.sep}` }],
      { nextDir: '/work/new-project', previousDir: null, managedDirFor: managedOf },
    );
    expect(plan).toHaveLength(1);
  });
});

describe('migrateFeishuSessionsForWorkingDirChange', () => {
  function deps(rows: Array<{ id: string; botAppId: string | null; workingDir: string | null }>) {
    const switches: string[] = [];
    const disposals: string[] = [];
    return {
      switches,
      disposals,
      deps: {
        listSessions: async () => rows,
        switchWorkingDir: async (item: { id: string }) => {
          switches.push(item.id);
        },
        disposeSession: async (id: string) => {
          disposals.push(id);
        },
      },
    };
  }

  it('先全部落库切换再 dispose，返回迁移条数', async () => {
    const managed = managedOf('bot_a');
    const harness = deps([
      { id: 's1', botAppId: 'bot_a', workingDir: managed },
      { id: 's2', botAppId: 'bot_a', workingDir: '/work/old' },
      { id: 's3', botAppId: 'bot_a', workingDir: '/work/own' },
    ]);
    const moved = await migrateFeishuSessionsForWorkingDirChange(
      { nextDir: '/work/new', previousDir: '/work/old', ownerScopeKey: scopeMocks.owner },
      harness.deps,
    );
    expect(moved).toBe(2);
    expect(harness.switches).toEqual(['s1', 's2']);
    expect(harness.disposals).toEqual(['s1', 's2']);
  });

  it('没有命中行时不 switch 也不 dispose', async () => {
    const harness = deps([{ id: 's1', botAppId: 'bot_a', workingDir: '/work/own' }]);
    await expect(
      migrateFeishuSessionsForWorkingDirChange(
        { nextDir: '/work/new', previousDir: null, ownerScopeKey: scopeMocks.owner },
        harness.deps,
      ),
    ).resolves.toBe(0);
    expect(harness.switches).toEqual([]);
    expect(harness.disposals).toEqual([]);
  });
});
