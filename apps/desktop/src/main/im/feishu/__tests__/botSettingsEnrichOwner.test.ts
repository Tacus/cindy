import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  ownerScopeKey: 'cloud-a:1',
  pending: false,
  getMaker: vi.fn(),
  request: vi.fn(),
}));

vi.mock('electron', () => ({ app: { getPath: () => '' } }));
vi.mock('../../../appSessionState', () => ({
  activeOwnerScopeKey: () => fixture.ownerScopeKey,
}));
vi.mock('../../ownerScopedStorage', () => ({
  ownerScopedImUserDataPath: () => '',
  claimLegacyImPath: vi.fn(),
  assertOwnerScopeSettledForWrite: (expectedScopeKey: string) => {
    if (fixture.pending || fixture.ownerScopeKey !== expectedScopeKey)
      throw new Error('owner changed');
  },
}));
vi.mock('../../../maker-host/index', () => ({ getMaker: fixture.getMaker }));
vi.mock('../../../utility-model/oneShotCandidates', () => ({
  requestUtilityText: fixture.request,
}));

import { enrichFeishuInstructions } from '../instructionsEnrich';

beforeEach(() => {
  vi.clearAllMocks();
  fixture.ownerScopeKey = 'cloud-a:1';
  fixture.pending = false;
  fixture.request.mockResolvedValue({ ok: true, text: 'enriched draft' });
});

describe('Feishu enrichment lazy dependency owner boundary', () => {
  it('does not resolve a new owner Maker or send the old draft after awaiting imports', async () => {
    const operation = enrichFeishuInstructions({ field: 'role', text: 'old owner draft' });
    fixture.ownerScopeKey = 'cloud-b:1';
    await expect(operation).rejects.toThrow('owner changed');
    expect(fixture.getMaker).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it('refuses a pending boundary before loading or requesting utility dependencies', async () => {
    fixture.pending = true;
    await expect(enrichFeishuInstructions({ field: 'rules', text: 'draft' })).rejects.toThrow(
      'owner changed',
    );
    expect(fixture.getMaker).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it('continues to use the utility chain when the owner remains settled', async () => {
    await expect(enrichFeishuInstructions({ field: 'role', text: 'draft' })).resolves.toBe(
      'enriched draft',
    );
    expect(fixture.getMaker).toHaveBeenCalledTimes(1);
    expect(fixture.request).toHaveBeenCalledTimes(1);
  });
});
