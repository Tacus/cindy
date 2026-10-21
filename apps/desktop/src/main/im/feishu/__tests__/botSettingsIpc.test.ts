import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeishuWorkingDirSessionRow } from '../botSettings';
import type { FeishuBotSettingsState } from '../../shared/types';

const fixture = vi.hoisted(() => ({
  root: '',
  owner: 'cloud-a',
  scopeKey: 'cloud-a:1',
  pending: false,
  trusted: true,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  query: vi.fn<(owner: string) => Promise<FeishuWorkingDirSessionRow[]>>(),
  switchDirectory: vi.fn(),
  dispose: vi.fn(),
  enrich: vi.fn(),
  dialog: vi.fn(),
  databaseOwners: [] as string[],
  orchestratorOwners: [] as string[],
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('electron', () => ({
  app: { getPath: () => fixture.root },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      fixture.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    fromWebContents: () => ({ isDestroyed: () => false }),
  },
  dialog: { showOpenDialog: fixture.dialog },
}));
vi.mock('../../../logger', () => ({ createLogger: () => fixture.log }));
vi.mock('../../../maker-host/logger-adapter', () => ({
  desktopMakerLogger: { child: () => fixture.log },
}));
vi.mock('../../../appSessionState', () => ({
  activeOwnerScopeKey: () => fixture.scopeKey,
}));
vi.mock('../../ownerScopedStorage', () => ({
  ownerScopedImUserDataPath: (...parts: string[]) =>
    path.join(fixture.root, 'owners', fixture.owner, ...parts),
  claimLegacyImPath: vi.fn(),
  assertOwnerScopeSettledForWrite: (expectedScopeKey: string) => {
    if (fixture.pending || fixture.scopeKey !== expectedScopeKey) {
      throw new Error('owner changed or boundary pending');
    }
  },
}));
vi.mock('../../../security/trustedAppRenderer', () => ({
  assertTrustedAppRendererEvent: () => {
    if (!fixture.trusted) throw new Error('untrusted renderer');
  },
}));
vi.mock('../../../localDb/client/current', () => ({
  getDbClient: () => {
    const owner = fixture.owner;
    fixture.databaseOwners.push(owner);
    return {
      drizzle: {
        select: () => ({
          from: () => ({
            // listSessions 用到 leftJoin(bot_session_links) 过滤伙伴接管行。
            leftJoin: () => ({ where: () => fixture.query(owner) }),
            where: () => fixture.query(owner),
          }),
        }),
      },
    };
  },
}));
vi.mock('../../shared/sessionRepo', () => ({
  switchSessionWorkingDir: (...args: unknown[]) => fixture.switchDirectory(fixture.owner, ...args),
}));
vi.mock('../../shared/orchestrator', () => ({
  getImOrchestrator: () => {
    const owner = fixture.owner;
    fixture.orchestratorOwners.push(owner);
    return { turnRunner: { disposeOneSession: (id: string) => fixture.dispose(owner, id) } };
  },
}));
vi.mock('../instructionsEnrich', () => ({
  enrichFeishuInstructions: fixture.enrich,
  isFeishuInstructionField: (field: unknown) => field === 'role' || field === 'rules',
  FeishuInstructionEnrichError: class extends Error {},
}));

import * as settings from '../botSettings';
import * as migration from '../botSettingsApply';
import { registerFeishuBotSettingsIpc } from '../botSettingsIpc';

const PRIVILEGED_CHANNELS = [
  'feishuBot:set-bot-instructions',
  'feishuBot:choose-working-directory',
  'feishuBot:reset-working-directory',
  'feishuBot:enrich-instructions',
] as const;
const DIRECTORY_CHANNELS = [
  'feishuBot:choose-working-directory',
  'feishuBot:reset-working-directory',
] as const;

let temporaryRoot: string;
let previousDir: string;
let nextDir: string;
let rows: FeishuWorkingDirSessionRow[];
let savedFiles: Record<string, string>;

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function activateOwner(owner: string, generation = 1): void {
  fixture.owner = owner;
  fixture.scopeKey = owner + ':' + generation;
}

function settingsPath(owner: string): string {
  return path.join(fixture.root, 'owners', owner, 'feishu-bot-settings.json');
}

function payloadFor(channel: string, ownerScopeKey: unknown = fixture.scopeKey): unknown {
  if (channel === 'feishuBot:set-bot-instructions') return { role: 'edited role', ownerScopeKey };
  if (channel === 'feishuBot:enrich-instructions') {
    return { field: 'role', text: 'draft', ownerScopeKey };
  }
  return ownerScopeKey;
}

async function invoke<Result = unknown>(channel: string, payload?: unknown): Promise<Result> {
  const handler = fixture.handlers.get(channel);
  if (!handler) throw new Error('missing handler: ' + channel);
  return handler({ sender: {} }, payload) as Result;
}

function expectFilesUnchanged(): void {
  for (const owner of ['cloud-a', 'cloud-b']) {
    expect(fs.readFileSync(settingsPath(owner), 'utf8')).toBe(savedFiles[owner]);
  }
}

function expectNoPrivilegedEffects(): void {
  expect(fixture.dialog).not.toHaveBeenCalled();
  expect(fixture.query).not.toHaveBeenCalled();
  expect(fixture.switchDirectory).not.toHaveBeenCalled();
  expect(fixture.dispose).not.toHaveBeenCalled();
  expect(fixture.enrich).not.toHaveBeenCalled();
  expectFilesUnchanged();
}

beforeAll(() => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cindy-feishu-settings-ipc-'));
  registerFeishuBotSettingsIpc();
});

beforeEach(() => {
  vi.clearAllMocks();
  fixture.root = fs.mkdtempSync(path.join(temporaryRoot, 'case-'));
  fixture.pending = false;
  fixture.trusted = true;
  fixture.databaseOwners = [];
  fixture.orchestratorOwners = [];
  previousDir = path.join(fixture.root, 'previous-project');
  nextDir = path.join(fixture.root, 'next-project');
  fs.mkdirSync(previousDir);
  fs.mkdirSync(nextDir);
  savedFiles = {};
  for (const owner of ['cloud-b', 'cloud-a']) {
    activateOwner(owner);
    settings.patchFeishuBotInstructions({ role: owner + ' role', rules: owner + ' rules' });
    settings.writeFeishuBotWorkingDir(previousDir);
    savedFiles[owner] = fs.readFileSync(settingsPath(owner), 'utf8');
  }
  rows = [
    { id: 's1', botAppId: 'bot1', workingDir: previousDir },
    { id: 's2', botAppId: 'bot2', workingDir: previousDir },
  ];
  fixture.query.mockReset().mockResolvedValue(rows);
  fixture.switchDirectory.mockReset().mockResolvedValue(undefined);
  fixture.dispose.mockReset().mockResolvedValue(undefined);
  fixture.enrich.mockReset().mockResolvedValue('enriched draft');
  fixture.dialog.mockReset().mockResolvedValue({ canceled: false, filePaths: [nextDir] });
});

afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('Feishu settings IPC owner contract', () => {
  it('returns the main-owned scope and never persists it as a settings override', async () => {
    activateOwner('cloud-a', 2);
    const state = await invoke<FeishuBotSettingsState>('feishuBot:get-bot-settings');
    expect(state.ownerScopeKey).toBe('cloud-a:2');
    expect(state.role).toBe('cloud-a role');
    expect(JSON.parse(savedFiles['cloud-a'])).not.toHaveProperty('ownerScopeKey');
  });

  it.each(['feishuBot:get-bot-settings', ...PRIVILEGED_CHANNELS])(
    '%s refuses untrusted renderers before any owner access',
    async (channel) => {
      const read = vi.spyOn(settings, 'readFeishuBotSettings');
      fixture.trusted = false;
      await expect(invoke(channel, payloadFor(channel))).rejects.toThrow('untrusted renderer');
      expect(read).not.toHaveBeenCalled();
      expectNoPrivilegedEffects();
    },
  );

  describe.each(PRIVILEGED_CHANNELS)('%s', (channel) => {
    it.each([null, '', 3, {}, []])(
      'rejects invalid scope %j before any owner access',
      async (key) => {
        const read = vi.spyOn(settings, 'readFeishuBotSettings');
        await expect(invoke(channel, payloadFor(channel, key))).rejects.toThrow('[INVALID_PARAMS]');
        expect(read).not.toHaveBeenCalled();
        expectNoPrivilegedEffects();
      },
    );

    it('rejects a missing scope instead of capturing the current owner', async () => {
      await expect(
        invoke(channel, channel.includes('instructions') ? {} : undefined),
      ).rejects.toThrow('[INVALID_PARAMS]');
      expectNoPrivilegedEffects();
    });

    it('rejects a late old-renderer request after switching owners', async () => {
      const oldKey = fixture.scopeKey;
      activateOwner('cloud-b');
      const read = vi.spyOn(settings, 'readFeishuBotSettings');
      await expect(invoke(channel, payloadFor(channel, oldKey))).rejects.toThrow('[INTERNAL]');
      expect(read).not.toHaveBeenCalled();
      expectNoPrivilegedEffects();
    });

    it('rejects a pending boundary even while the key still matches', async () => {
      fixture.pending = true;
      await expect(invoke(channel, payloadFor(channel))).rejects.toThrow('[INTERNAL]');
      expectNoPrivilegedEffects();
    });
  });

  it('rejects a debounce from an earlier generation of the same owner', async () => {
    const oldKey = fixture.scopeKey;
    activateOwner('cloud-b');
    activateOwner('cloud-a', 2);
    await expect(
      invoke(
        'feishuBot:set-bot-instructions',
        payloadFor('feishuBot:set-bot-instructions', oldKey),
      ),
    ).rejects.toThrow('[INTERNAL]');
    expectNoPrivilegedEffects();
  });

  it('refuses to return settings while the account boundary is pending', async () => {
    fixture.pending = true;
    const read = vi.spyOn(settings, 'readFeishuBotSettings');
    await expect(invoke('feishuBot:get-bot-settings')).rejects.toThrow('[INTERNAL]');
    expect(read).not.toHaveBeenCalled();
  });

  it('patches only the requested field for the current owner', async () => {
    const state = await invoke<FeishuBotSettingsState>(
      'feishuBot:set-bot-instructions',
      payloadFor('feishuBot:set-bot-instructions'),
    );
    expect(state).toMatchObject({
      ownerScopeKey: 'cloud-a:1',
      role: 'edited role',
      rules: 'cloud-a rules',
    });
    expect(fs.readFileSync(settingsPath('cloud-b'), 'utf8')).toBe(savedFiles['cloud-b']);
  });

  it.each(DIRECTORY_CHANNELS)(
    '%s preserves history and rebuilds each active Agent',
    async (channel) => {
      const result = await invoke<
        FeishuBotSettingsState | { canceled: boolean; state: FeishuBotSettingsState }
      >(channel, fixture.scopeKey);
      const state = 'state' in result ? result.state : result;
      expect(state.ownerScopeKey).toBe('cloud-a:1');
      expect(state.workingDir === null).toBe(channel === 'feishuBot:reset-working-directory');
      expect(fixture.switchDirectory).toHaveBeenCalledTimes(2);
      for (const call of fixture.switchDirectory.mock.calls) {
        expect(call[0]).toBe('cloud-a');
        expect(call[4]).toEqual({ preserveVisibleHistory: true });
      }
      expect(fixture.dispose.mock.calls).toEqual([
        ['cloud-a', 's1'],
        ['cloud-a', 's2'],
      ]);
      expect(fixture.switchDirectory.mock.invocationCallOrder[1]).toBeLessThan(
        fixture.dispose.mock.invocationCallOrder[0],
      );
      expect(fs.readFileSync(settingsPath('cloud-b'), 'utf8')).toBe(savedFiles['cloud-b']);
    },
  );

  it('canceling a dialog under the same owner returns its current settings without migration', async () => {
    fixture.dialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(
      invoke('feishuBot:choose-working-directory', fixture.scopeKey),
    ).resolves.toMatchObject({ canceled: true, state: { ownerScopeKey: fixture.scopeKey } });
    expect(fixture.query).not.toHaveBeenCalled();
    expectFilesUnchanged();
  });

  it.each([
    { canceled: true, filePaths: [] },
    { canceled: false, filePaths: [] },
    { canceled: false, filePaths: ['selected'] },
  ])('drops dialog result %j after switching owners, including cancellation', async (result) => {
    const gate = deferred<{ canceled: boolean; filePaths: string[] }>();
    fixture.dialog.mockReturnValueOnce(gate.promise);
    const read = vi.spyOn(settings, 'readFeishuBotSettings');
    const operation = invoke('feishuBot:choose-working-directory', fixture.scopeKey);
    activateOwner('cloud-b');
    gate.resolve({ ...result, filePaths: result.filePaths.length ? [nextDir] : [] });
    await expect(operation).rejects.toThrow('[INTERNAL]');
    expect(read).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expectFilesUnchanged();
  });

  describe.each(DIRECTORY_CHANNELS)('%s async boundaries', (channel) => {
    it.each(['list', 'switch-1', 'switch-2', 'dispose-1', 'dispose-2'])(
      'stops after awaiting %s without accessing the new owner',
      async (stage) => {
        const entered = deferred<void>();
        const gate = deferred<void>();
        const plan = vi.spyOn(settings, 'planFeishuWorkingDirMigration');
        if (stage === 'list') {
          fixture.query.mockImplementationOnce(async () => {
            entered.resolve();
            await gate.promise;
            return rows;
          });
        } else {
          const target = stage.startsWith('switch') ? fixture.switchDirectory : fixture.dispose;
          let count = 0;
          target.mockImplementation(async () => {
            count += 1;
            if (count === Number(stage.slice(-1))) {
              entered.resolve();
              await gate.promise;
            }
          });
        }
        const operation = invoke(channel, fixture.scopeKey);
        await entered.promise;
        activateOwner('cloud-b');
        gate.resolve();
        await expect(operation).rejects.toThrow('[INTERNAL]');
        expect(fixture.databaseOwners).toEqual(['cloud-a']);
        expect(fixture.switchDirectory.mock.calls.every((call) => call[0] === 'cloud-a')).toBe(
          true,
        );
        expect(fixture.orchestratorOwners.every((owner) => owner === 'cloud-a')).toBe(true);
        expect(fixture.dispose.mock.calls.every((call) => call[0] === 'cloud-a')).toBe(true);
        if (stage === 'list') {
          expect(plan).not.toHaveBeenCalled();
          expect(fixture.switchDirectory).not.toHaveBeenCalled();
          expect(fixture.dispose).not.toHaveBeenCalled();
        } else if (stage.startsWith('switch')) {
          expect(fixture.switchDirectory).toHaveBeenCalledTimes(Number(stage.slice(-1)));
          expect(fixture.dispose).not.toHaveBeenCalled();
        } else {
          expect(fixture.dispose).toHaveBeenCalledTimes(Number(stage.slice(-1)));
        }
        expect(fs.existsSync(path.join(fixture.root, 'owners', 'cloud-b', 'im-working-dir'))).toBe(
          false,
        );
        expectFilesUnchanged();
      },
    );

    it('guards the executor continuation before planning, after the list closure returned', async () => {
      const plan = vi.spyOn(settings, 'planFeishuWorkingDirMigration');
      fixture.query.mockImplementationOnce(async () => {
        queueMicrotask(() => {
          queueMicrotask(() => {
            activateOwner('cloud-b');
          });
        });
        return rows;
      });
      await expect(invoke(channel, fixture.scopeKey)).rejects.toThrow('[INTERNAL]');
      expect(plan).not.toHaveBeenCalled();
      expect(fixture.switchDirectory).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(fixture.root, 'owners', 'cloud-b', 'im-working-dir'))).toBe(
        false,
      );
      expectFilesUnchanged();
    });

    it('guards the final JSON save after the executor has successfully returned', async () => {
      const migrate = migration.migrateFeishuSessionsForWorkingDirChange;
      vi.spyOn(migration, 'migrateFeishuSessionsForWorkingDirChange').mockImplementationOnce(
        async (args, deps) => {
          const moved = await migrate(args, deps);
          queueMicrotask(() => {
            activateOwner('cloud-b');
          });
          return moved;
        },
      );
      await expect(invoke(channel, fixture.scopeKey)).rejects.toThrow('[INTERNAL]');
      expect(fixture.dispose.mock.calls).toEqual([
        ['cloud-a', 's1'],
        ['cloud-a', 's2'],
      ]);
      expectFilesUnchanged();
    });

    it('rejects a pending boundary after listing before planning or creating directories', async () => {
      const gate = deferred<FeishuWorkingDirSessionRow[]>();
      const entered = deferred<void>();
      fixture.query.mockImplementationOnce(() => {
        entered.resolve();
        return gate.promise;
      });
      const plan = vi.spyOn(settings, 'planFeishuWorkingDirMigration');
      const operation = invoke(channel, fixture.scopeKey);
      await entered.promise;
      fixture.pending = true;
      gate.resolve(rows);
      await expect(operation).rejects.toThrow('[INTERNAL]');
      expect(plan).not.toHaveBeenCalled();
      expect(fixture.switchDirectory).not.toHaveBeenCalled();
      expectFilesUnchanged();
    });
  });

  it.each(['switched', 'pending'])('drops AI results when the owner is %s', async (boundary) => {
    const gate = deferred<string>();
    fixture.enrich.mockReturnValueOnce(gate.promise);
    const operation = invoke(
      'feishuBot:enrich-instructions',
      payloadFor('feishuBot:enrich-instructions'),
    );
    if (boundary === 'switched') activateOwner('cloud-b');
    else fixture.pending = true;
    gate.resolve('old owner enriched draft');
    await expect(operation).rejects.toThrow('[INTERNAL]');
    expectFilesUnchanged();
  });
});
