// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { translate, warn } = vi.hoisted(() => ({
  translate: (key: string) => key,
  warn: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn }) }));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from '@/lib/toast';
import { FeishuBotInstructionsSection } from '../FeishuBotInstructionsSection';

type InstructionField = 'role' | 'rules';
type TestSettingsState = FeishuBotSettingsState & { ownerScopeKey: string };
type InstructionsDraft = Pick<TestSettingsState, 'role' | 'rules' | 'ownerScopeKey'>;

const keyPrefix = 'settings.feishuBot.instructions';
const projectDir = 'E:/projects/feishu';

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeSettings(overrides: Partial<TestSettingsState> = {}): TestSettingsState {
  return {
    ownerScopeKey: 'owner-a',
    workingDir: null,
    workingDirAvailable: true,
    role: 'Role draft',
    rules: 'Rules draft',
    ...overrides,
  };
}

function installApi(initial = makeSettings()) {
  const api = {
    getBotSettings: vi.fn(async () => initial),
    setBotInstructions: vi.fn(async (payload: InstructionsDraft) =>
      makeSettings({ ...initial, ...payload }),
    ),
    chooseWorkingDirectory: vi.fn(async (ownerScopeKey: string) => ({
      canceled: false,
      state: makeSettings({ ...initial, ownerScopeKey, workingDir: projectDir }),
    })),
    resetWorkingDirectory: vi.fn(async (ownerScopeKey: string) =>
      makeSettings({ ...initial, ownerScopeKey, workingDir: null }),
    ),
    enrichInstructions: vi
      .fn<
        (payload: {
          field: InstructionField;
          text: string;
          ownerScopeKey: string;
        }) => Promise<{ text: string }>
      >()
      .mockResolvedValue({ text: 'Enriched text' }),
  };
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { feishuBot: api },
  });
  return api;
}

async function mountSection() {
  const view = render(<FeishuBotInstructionsSection />);
  await act(async () => {});
  return view;
}

function textbox(field: InstructionField) {
  return screen.getByRole('textbox', {
    name: `${keyPrefix}.${field}Label`,
  }) as HTMLTextAreaElement;
}

function edit(field: InstructionField, value: string) {
  fireEvent.change(textbox(field), { target: { value } });
}

function enrich(field: InstructionField) {
  fireEvent.click(
    screen.getAllByRole('button', { name: `${keyPrefix}.enrich` })[field === 'role' ? 0 : 1],
  );
}

async function finish<Result>(request: ReturnType<typeof deferred<Result>>, value: Result) {
  await act(async () => {
    request.resolve(value);
  });
}

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(600);
  });
}

describe('FeishuBotInstructionsSection async drafts', () => {
  let api: ReturnType<typeof installApi>;

  beforeEach(() => {
    vi.useFakeTimers();
    api = installApi();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it.each(['role', 'rules'] as const)(
    'enriches %s using the latest draft of the other field',
    async (field) => {
      const request = deferred<{ text: string }>();
      api.enrichInstructions.mockReturnValueOnce(request.promise);
      await mountSection();
      enrich(field);
      const otherField = field === 'role' ? 'rules' : 'role';
      edit(otherField, 'Latest manual draft');

      await finish(request, { text: '  Enriched draft  ' });

      expect(textbox(field).value).toBe('Enriched draft');
      expect(textbox(otherField).value).toBe('Latest manual draft');
      expect(api.enrichInstructions).toHaveBeenCalledWith({
        field,
        text: makeSettings()[field],
        ownerScopeKey: 'owner-a',
      });
      expect(api.setBotInstructions).toHaveBeenCalledWith({
        ownerScopeKey: 'owner-a',
        [field]: 'Enriched draft',
        [otherField]: 'Latest manual draft',
      });
      await flushDebounce();
      expect(api.setBotInstructions).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['role', 'rules'] as const)(
    'discards an AI result when the %s draft changes while waiting',
    async (field) => {
      const request = deferred<{ text: string }>();
      api.enrichInstructions.mockReturnValueOnce(request.promise);
      await mountSection();
      enrich(field);
      edit(field, 'New manual draft');

      await finish(request, { text: 'Stale AI draft' });

      expect(textbox(field).value).toBe('New manual draft');
      expect(api.setBotInstructions).not.toHaveBeenCalled();
      await flushDebounce();
      expect(api.setBotInstructions).toHaveBeenCalledWith({
        role: 'Role draft',
        rules: 'Rules draft',
        ownerScopeKey: 'owner-a',
        [field]: 'New manual draft',
      });
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it.each(['role', 'rules'] as const)(
    'rejects an old AI result after %s changes A -> B -> A and autosaves',
    async (field) => {
      const request = deferred<{ text: string }>();
      api.enrichInstructions.mockReturnValueOnce(request.promise);
      await mountSection();
      enrich(field);
      edit(field, 'Temporary manual draft');
      edit(field, makeSettings()[field]);
      await flushDebounce();
      expect(api.setBotInstructions).toHaveBeenCalledTimes(1);

      await finish(request, { text: 'Stale AI draft' });

      expect(textbox(field).value).toBe(makeSettings()[field]);
      expect(api.setBotInstructions).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps a project chosen during enrichment even when the save response has the old project', async () => {
    const request = deferred<{ text: string }>();
    api.enrichInstructions.mockReturnValueOnce(request.promise);
    await mountSection();
    enrich('role');
    fireEvent.click(screen.getByRole('button', { name: `${keyPrefix}.projectManaged` }));
    await act(async () => {});

    await finish(request, { text: 'Enriched role' });

    expect(screen.getByRole('button', { name: projectDir })).toBeTruthy();
    expect(textbox('role').value).toBe('Enriched role');
    expect(api.setBotInstructions).toHaveBeenCalledWith({
      role: 'Enriched role',
      rules: 'Rules draft',
      ownerScopeKey: 'owner-a',
    });
  });

  it.each(['choose', 'reset', 'canceled choose'] as const)(
    'merges only project fields from a %s response during unsaved edits',
    async (operation) => {
      const initial = makeSettings({ workingDir: operation === 'reset' ? projectDir : null });
      api.getBotSettings.mockResolvedValueOnce(initial);
      const selectedDir = operation === 'reset' ? null : projectDir;
      const response = makeSettings({ workingDir: selectedDir, workingDirAvailable: false });
      const choose = deferred<{ canceled: boolean; state: TestSettingsState }>();
      const reset = deferred<TestSettingsState>();
      api.chooseWorkingDirectory.mockReturnValueOnce(choose.promise);
      api.resetWorkingDirectory.mockReturnValueOnce(reset.promise);
      await mountSection();
      fireEvent.click(
        screen.getByRole('button', {
          name: operation === 'reset' ? `${keyPrefix}.projectReset` : `${keyPrefix}.projectManaged`,
        }),
      );
      edit('role', 'Latest role');
      edit('rules', 'Latest rules');

      if (operation === 'reset') await finish(reset, response);
      else await finish(choose, { canceled: operation === 'canceled choose', state: response });

      expect(textbox('role').value).toBe('Latest role');
      expect(textbox('rules').value).toBe('Latest rules');
      expect(
        screen.getByRole('button', {
          name: selectedDir ?? `${keyPrefix}.projectManaged`,
        }),
      ).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBe(`${keyPrefix}.projectUnavailable`);
      await flushDebounce();
      expect(api.setBotInstructions).toHaveBeenCalledWith({
        role: 'Latest role',
        rules: 'Latest rules',
        ownerScopeKey: 'owner-a',
      });
    },
  );

  it.each(['choose', 'reset'] as const)(
    'ignores a %s project response stamped with another owner',
    async (operation) => {
      const initial = makeSettings({ workingDir: operation === 'reset' ? projectDir : null });
      api.getBotSettings.mockResolvedValueOnce(initial);
      const response = makeSettings({ ownerScopeKey: 'owner-b', workingDir: 'E:/other-owner' });
      api.chooseWorkingDirectory.mockResolvedValueOnce({ canceled: false, state: response });
      api.resetWorkingDirectory.mockResolvedValueOnce(response);
      await mountSection();
      fireEvent.click(
        screen.getByRole('button', {
          name: operation === 'reset' ? `${keyPrefix}.projectReset` : `${keyPrefix}.projectManaged`,
        }),
      );
      await act(async () => {});

      expect(
        screen.getByRole('button', {
          name: initial.workingDir ?? `${keyPrefix}.projectManaged`,
        }),
      ).toBeTruthy();
      expect(toast.success).not.toHaveBeenCalled();
    },
  );

  it('passes the loaded owner token with autosave, project, AI, and unmount writes', async () => {
    api = installApi(makeSettings({ ownerScopeKey: 'owner:loaded-generation' }));
    const view = await mountSection();
    edit('role', 'Manual role');
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: `${keyPrefix}.projectManaged` }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: `${keyPrefix}.projectReset` }));
    await act(async () => {});
    enrich('role');
    await act(async () => {});
    edit('rules', 'Unmount rules');
    view.unmount();

    expect(api.chooseWorkingDirectory).toHaveBeenCalledWith('owner:loaded-generation');
    expect(api.resetWorkingDirectory).toHaveBeenCalledWith('owner:loaded-generation');
    expect(api.enrichInstructions).toHaveBeenCalledWith({
      field: 'role',
      text: 'Manual role',
      ownerScopeKey: 'owner:loaded-generation',
    });
    expect(api.setBotInstructions).toHaveBeenCalledTimes(3);
    for (const [payload] of api.setBotInstructions.mock.calls) {
      expect(payload.ownerScopeKey).toBe('owner:loaded-generation');
    }
    expect(api.setBotInstructions).toHaveBeenLastCalledWith({
      role: 'Enriched text',
      rules: 'Unmount rules',
      ownerScopeKey: 'owner:loaded-generation',
    });
  });

  it.each(['owner-a', 'owner-b'])(
    'does not save a late AI result after remounting for %s',
    async (ownerScopeKey) => {
      const request = deferred<{ text: string }>();
      api.enrichInstructions.mockReturnValueOnce(request.promise);
      const previous = await mountSection();
      enrich('role');
      previous.unmount();
      api.getBotSettings.mockResolvedValueOnce(
        makeSettings({
          ownerScopeKey,
          role: 'Remounted role',
          rules: 'Remounted rules',
        }),
      );
      await mountSection();

      await finish(request, { text: 'Stale AI draft' });

      expect(textbox('role').value).toBe('Remounted role');
      expect(textbox('rules').value).toBe('Remounted rules');
      expect(api.setBotInstructions).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it('ignores a late AI rejection after unmount', async () => {
    const request = deferred<{ text: string }>();
    api.enrichInstructions.mockReturnValueOnce(request.promise);
    const view = await mountSection();
    enrich('role');
    view.unmount();

    await act(async () => {
      request.reject(new Error('Owner changed'));
    });

    expect(api.setBotInstructions).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('catches an unmount flush rejection and keeps its original owner token', async () => {
    const request = deferred<TestSettingsState>();
    api.setBotInstructions.mockReturnValueOnce(request.promise);
    const view = await mountSection();
    edit('rules', 'Unsaved rules');
    view.unmount();
    expect(api.setBotInstructions).toHaveBeenCalledWith({
      role: 'Role draft',
      rules: 'Unsaved rules',
      ownerScopeKey: 'owner-a',
    });
    api.getBotSettings.mockResolvedValueOnce(makeSettings({ ownerScopeKey: 'owner-b' }));
    await mountSection();

    await act(async () => {
      request.reject(new Error('Owner changed'));
    });

    expect(warn).toHaveBeenCalledWith('failed to save feishu bot instructions');
    expect(toast.error).not.toHaveBeenCalled();
    expect(textbox('rules').value).toBe('Rules draft');
  });

  it('does not restore an old project from an in-flight autosave response', async () => {
    const request = deferred<TestSettingsState>();
    api.setBotInstructions.mockReturnValueOnce(request.promise);
    await mountSection();
    edit('role', 'Saved role');
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: `${keyPrefix}.projectManaged` }));
    await act(async () => {});
    edit('rules', 'Latest rules');

    await finish(request, makeSettings({ role: 'Saved role' }));

    expect(screen.getByRole('button', { name: projectDir })).toBeTruthy();
    expect(textbox('rules').value).toBe('Latest rules');
  });

  it.each(['response', 'rejection'])(
    'ignores a superseded autosave %s without changing current metadata or showing errors',
    async (completion) => {
      const previous = deferred<TestSettingsState>();
      api.setBotInstructions.mockReturnValueOnce(previous.promise);
      api.setBotInstructions.mockResolvedValueOnce(makeSettings({ workingDirAvailable: false }));
      await mountSection();
      edit('role', 'Saved role');
      await flushDebounce();
      edit('rules', 'Latest rules');
      await flushDebounce();

      await act(async () => {
        if (completion === 'response') previous.resolve(makeSettings());
        else previous.reject(new Error('Superseded save'));
      });

      expect(textbox('role').value).toBe('Saved role');
      expect(textbox('rules').value).toBe('Latest rules');
      expect(screen.getByRole('alert').textContent).toBe(`${keyPrefix}.projectUnavailable`);
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it.each(['choose', 'reset'] as const)(
    'ignores a late %s response after remounting for another owner',
    async (operation) => {
      const initial = makeSettings({ workingDir: operation === 'reset' ? projectDir : null });
      api.getBotSettings.mockResolvedValueOnce(initial);
      const choose = deferred<{ canceled: boolean; state: TestSettingsState }>();
      const reset = deferred<TestSettingsState>();
      api.chooseWorkingDirectory.mockReturnValueOnce(choose.promise);
      api.resetWorkingDirectory.mockReturnValueOnce(reset.promise);
      const previous = await mountSection();
      fireEvent.click(
        screen.getByRole('button', {
          name: operation === 'reset' ? `${keyPrefix}.projectReset` : `${keyPrefix}.projectManaged`,
        }),
      );
      previous.unmount();
      api.getBotSettings.mockResolvedValueOnce(makeSettings({ ownerScopeKey: 'owner-b' }));
      await mountSection();

      if (operation === 'reset') await finish(reset, makeSettings());
      else
        await finish(choose, { canceled: false, state: makeSettings({ workingDir: projectDir }) });

      expect(screen.getByRole('button', { name: `${keyPrefix}.projectManaged` })).toBeTruthy();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it('ignores the first mount settings response after StrictMode restarts the effect', async () => {
    const previous = deferred<TestSettingsState>();
    const current = deferred<TestSettingsState>();
    api.getBotSettings.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
    render(
      <StrictMode>
        <FeishuBotInstructionsSection />
      </StrictMode>,
    );
    await finish(current, makeSettings({ ownerScopeKey: 'owner-b', role: 'Current role' }));

    await finish(previous, makeSettings({ role: 'Stale role' }));

    expect(textbox('role').value).toBe('Current role');
    edit('rules', 'Current rules');
    await flushDebounce();
    expect(api.setBotInstructions).toHaveBeenCalledWith({
      role: 'Current role',
      rules: 'Current rules',
      ownerScopeKey: 'owner-b',
    });
  });
});
