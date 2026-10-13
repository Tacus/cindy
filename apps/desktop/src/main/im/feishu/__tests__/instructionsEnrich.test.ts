/**
 * AI 一键丰富的模型输出清洗与请求编排（注入 fake request，不碰真实辅助模型链）。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '') } }));
vi.mock('../../ownerScopedStorage', () => ({
  ownerScopedImUserDataPath: (...parts: string[]) => parts.join('/'),
  claimLegacyImPath: vi.fn(),
}));

import { FEISHU_BOT_INSTRUCTION_MAX } from '../botSettings';
import {
  FeishuInstructionEnrichError,
  cleanEnrichedText,
  enrichFeishuInstructions,
} from '../instructionsEnrich';

describe('cleanEnrichedText', () => {
  it('剥掉整体包裹的代码块与成对引号', () => {
    expect(cleanEnrichedText('```\n你是助理\n```')).toBe('你是助理');
    expect(cleanEnrichedText('```markdown\n你是助理\n```')).toBe('你是助理');
    expect(cleanEnrichedText('"你是助理"')).toBe('你是助理');
    expect(cleanEnrichedText('“你是助理”')).toBe('你是助理');
  });

  it('压缩多余空行、裁掉首尾空白；正文里的代码块不受影响', () => {
    expect(cleanEnrichedText('  a\n\n\n\nb  ')).toBe('a\n\nb');
    expect(cleanEnrichedText('说明：\n```\ncode\n```')).toBe('说明：\n```\ncode\n```');
  });
});

describe('enrichFeishuInstructions', () => {
  interface RequestOpts {
    systemPrompt: string;
    maxTokens: number;
    timeoutMs: number;
    disableReasoning: boolean;
  }

  function fakeRequest(result: { ok: true; text: string } | { ok: false; reason: string }) {
    return vi.fn(async (_prompt: string, _opts: RequestOpts) => result);
  }

  it('空草稿与超长草稿在调用模型前就被拒绝', async () => {
    const request = fakeRequest({ ok: true, text: 'x' });
    await expect(
      enrichFeishuInstructions({ field: 'role', text: '   ' }, { request }),
    ).rejects.toMatchObject({ reason: 'empty' });
    await expect(
      enrichFeishuInstructions(
        { field: 'role', text: 'a'.repeat(FEISHU_BOT_INSTRUCTION_MAX + 1) },
        { request },
      ),
    ).rejects.toMatchObject({ reason: 'too_long' });
    expect(request).not.toHaveBeenCalled();
  });

  it('按字段给不同的系统提示，并把草稿作为用户内容传入', async () => {
    const request = fakeRequest({ ok: true, text: ' 改写后的内容 ' });
    await expect(
      enrichFeishuInstructions({ field: 'role', text: '你是助理' }, { request }),
    ).resolves.toBe('改写后的内容');
    const [prompt, opts] = request.mock.calls[0]!;
    expect(prompt).toBe('你是助理');
    expect(opts.systemPrompt).toContain('角色');
    expect(opts.systemPrompt).toContain('不要添加用户没有表达的新身份');
    expect(opts.disableReasoning).toBe(true);
    expect(opts.maxTokens).toBeGreaterThan(0);
    expect(opts.timeoutMs).toBeGreaterThan(0);

    request.mockClear();
    await enrichFeishuInstructions({ field: 'rules', text: '不要动 main' }, { request });
    const rulesOpts = request.mock.calls[0]![1];
    expect(rulesOpts.systemPrompt).toContain('规则');
    expect(rulesOpts.systemPrompt).toContain('不要添加用户没有表达的新限制');
  });

  it('模型失败或输出为空 ⇒ model_unavailable', async () => {
    await expect(
      enrichFeishuInstructions(
        { field: 'rules', text: 'x' },
        { request: fakeRequest({ ok: false, reason: 'timeout' }) },
      ),
    ).rejects.toBeInstanceOf(FeishuInstructionEnrichError);
    await expect(
      enrichFeishuInstructions(
        { field: 'rules', text: 'x' },
        { request: fakeRequest({ ok: true, text: '   \n ' }) },
      ),
    ).rejects.toMatchObject({ reason: 'model_unavailable' });
  });

  it('输出超过上限时按上限截断', async () => {
    const request = fakeRequest({ ok: true, text: '字'.repeat(FEISHU_BOT_INSTRUCTION_MAX + 50) });
    const result = await enrichFeishuInstructions({ field: 'role', text: 'x' }, { request });
    expect(result.length).toBe(FEISHU_BOT_INSTRUCTION_MAX);
  });
});
