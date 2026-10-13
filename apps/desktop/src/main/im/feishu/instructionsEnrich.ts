/**
 * main/im/feishu/instructionsEnrich.ts
 * ---------------------------------------------------------------------------
 * 「AI 一键丰富」：把用户写的角色 / 规则草稿交给公共辅助模型链改写。
 *
 * 走 requestUtilityText（与标题生成、hook 脚本生成同一口径：只用 Cindy 的
 * 辅助模型配置 / 网关凭证，不读订阅凭证，不新增模型选择）。返回纯文本，由
 * IPC 层写回设置字段；模型不可用时抛错，由 IPC 转成统一错误协议。
 */

import { FEISHU_BOT_INSTRUCTION_MAX } from './botSettings';
import { activeOwnerScopeKey } from '../../appSessionState';
import { assertOwnerScopeSettledForWrite } from '../ownerScopedStorage';

export type FeishuInstructionField = 'role' | 'rules';

export function isFeishuInstructionField(value: unknown): value is FeishuInstructionField {
  return value === 'role' || value === 'rules';
}

export type FeishuInstructionEnrichErrorReason = 'empty' | 'too_long' | 'model_unavailable';

export class FeishuInstructionEnrichError extends Error {
  constructor(readonly reason: FeishuInstructionEnrichErrorReason) {
    super(`FEISHU_INSTRUCTIONS_ENRICH_${reason.toUpperCase()}`);
    this.name = 'FeishuInstructionEnrichError';
  }
}

export type FeishuInstructionTextRequest = (
  prompt: string,
  opts: {
    systemPrompt: string;
    maxTokens: number;
    timeoutMs: number;
    disableReasoning: boolean;
  },
) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;

export interface FeishuInstructionsEnrichDeps {
  request: FeishuInstructionTextRequest;
}

const FIELD_SYSTEM_PROMPTS: Record<FeishuInstructionField, string> = {
  role:
    '你是 Cindy 的机器人配置助手。用户会给你一段为飞书机器人写的「角色」草稿：' +
    '这个机器人是谁、用什么语气和主人说话。请把它改写成清晰、具体、可直接执行的设定，' +
    '保留用户原意与语言；可以调整措辞和结构，但不要添加用户没有表达的新身份或新限制。' +
    '输出会作为机器人每轮对话的指令注入，请写紧凑，不写空话。' +
    '只输出改写后的文本：不要解释，不要用 Markdown 代码块，不要加标题。',
  rules:
    '你是 Cindy 的机器人配置助手。用户会给你一段为飞书机器人写的「规则」草稿：' +
    '它必须遵守的边界与工作习惯。请把它改写成清晰、具体、可执行的规则条目，' +
    '保留用户原意与语言；可以合并重复、明确措辞，但不要添加用户没有表达的新限制。' +
    '输出会作为机器人每轮对话的指令注入，请写紧凑，不写空话。' +
    '只输出改写后的文本：不要解释，不要用 Markdown 代码块，不要加标题。',
};

/**
 * 丰富一段草稿；调用方保证字段与长度已校验。
 * 模型失败或输出清洗后为空 → 抛 FeishuInstructionEnrichError。
 */
export async function enrichFeishuInstructions(
  args: { field: FeishuInstructionField; text: string },
  deps: FeishuInstructionsEnrichDeps = defaultDeps(),
): Promise<string> {
  const draft = args.text.trim();
  if (!draft) throw new FeishuInstructionEnrichError('empty');
  if (draft.length > FEISHU_BOT_INSTRUCTION_MAX) {
    throw new FeishuInstructionEnrichError('too_long');
  }
  const result = await deps.request(draft, {
    systemPrompt: FIELD_SYSTEM_PROMPTS[args.field],
    maxTokens: 2500,
    timeoutMs: 60_000,
    disableReasoning: true,
  });
  if (!result.ok) throw new FeishuInstructionEnrichError('model_unavailable');
  const enriched = cleanEnrichedText(result.text);
  if (!enriched) throw new FeishuInstructionEnrichError('model_unavailable');
  return enriched.slice(0, FEISHU_BOT_INSTRUCTION_MAX);
}

/**
 * 清洗模型输出：去掉整体包裹的 Markdown 代码块、首尾成对引号与多余空行。
 * 只做形态清洗，不改写内容——内容错误由模型重生成 / 用户编辑兜底。
 */
export function cleanEnrichedText(raw: string): string {
  let text = raw.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
  if (fenced) text = fenced[1].trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”')))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 真实依赖：动态 import 主进程辅助模型链，避免把 maker-host 静态拽进
 * feishu adapter / 本模块的纯单测（与 adapter 的群历史判断同一取舍）。
 */
function defaultDeps(): FeishuInstructionsEnrichDeps {
  const ownerScopeKey = activeOwnerScopeKey();
  return {
    request: async (prompt, opts) => {
      assertOwnerScopeSettledForWrite(ownerScopeKey);
      const [{ requestUtilityText }, { getMaker }] = await Promise.all([
        import('../../utility-model/oneShotCandidates.js'),
        import('../../maker-host/index.js'),
      ]);
      assertOwnerScopeSettledForWrite(ownerScopeKey);
      const result = await requestUtilityText(getMaker(), prompt, {
        systemPrompt: opts.systemPrompt,
        maxTokens: opts.maxTokens,
        timeoutMs: opts.timeoutMs,
        disableReasoning: opts.disableReasoning,
      });
      return result.ok ? { ok: true, text: result.text } : { ok: false, reason: result.reason };
    },
  };
}
