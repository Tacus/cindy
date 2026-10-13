/**
 * FeishuBotInstructionsSection — 飞书 bot 的行为设置：
 *   - 项目：绑定后该 bot 的对话在项目目录里执行（保存时 main 侧会同步迁移
 *     仍在默认目录的任务并重开上下文）；
 *   - 角色 / 规则：每轮注入模型文本的指令，改完立即生效；各带 AI 一键丰富。
 *
 * 数据面是 feishuBot:get-bot-settings / set-bot-instructions /
 * choose-working-directory / reset-working-directory / enrich-instructions。
 * 文本按去抖自动保存（与 Telegram 人格同手感，无显式保存按钮），AI 丰富走
 * 完整动作、立即落盘。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { createLogger } from '@/lib/logger';

const log = createLogger('FeishuBotInstructionsSection');

/** 与 main 侧 FEISHU_BOT_INSTRUCTION_MAX 对齐的输入上限。 */
const INSTRUCTION_MAX = 4000;
/** 无显式保存按钮；600ms 去抖，卸载时 flush。 */
const SAVE_DEBOUNCE_MS = 600;

type InstructionField = 'role' | 'rules';
type InstructionsDraft = Pick<FeishuBotSettingsState, 'role' | 'rules' | 'ownerScopeKey'>;
type AsyncOperation = 'save' | 'directory' | 'enrich';

export function FeishuBotInstructionsSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<FeishuBotSettingsState | null>(null);
  const [isUpdatingDir, setIsUpdatingDir] = useState(false);
  const [enriching, setEnriching] = useState<InstructionField | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<InstructionsDraft | null>(null);
  const settingsRef = useRef<FeishuBotSettingsState | null>(null);
  const mountRef = useRef<symbol | null>(null);
  const operationVersions = useRef({ save: 0, directory: 0, enrich: 0 });
  const fieldRevisions = useRef({ role: 0, rules: 0 });

  const isCurrentOperation = useCallback(
    (mount: symbol | null, ownerScopeKey: string, operation: AsyncOperation, version: number) =>
      mount !== null &&
      mountRef.current === mount &&
      settingsRef.current?.ownerScopeKey === ownerScopeKey &&
      operationVersions.current[operation] === version,
    [],
  );

  const mergeProjectState = useCallback((state: FeishuBotSettingsState) => {
    const current = settingsRef.current;
    if (!current || current.ownerScopeKey !== state.ownerScopeKey) return;
    const merged = {
      ...current,
      workingDir: state.workingDir,
      workingDirAvailable: state.workingDirAvailable,
    };
    settingsRef.current = merged;
    setSettings(merged);
  }, []);

  useEffect(() => {
    const mount = Symbol();
    mountRef.current = mount;
    void window.electronAPI.feishuBot
      .getBotSettings()
      .then((value) => {
        if (mountRef.current === mount) {
          settingsRef.current = value;
          setSettings(value);
        }
      })
      .catch(() => {
        if (mountRef.current === mount) log.warn('failed to load feishu bot settings');
      });
    return () => {
      mountRef.current = null;
      settingsRef.current = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      // 去抖窗口内未落盘的最新编辑：卸载时 flush，关面板不丢内容。
      if (pendingSave.current) {
        const flush = pendingSave.current;
        pendingSave.current = null;
        void window.electronAPI.feishuBot.setBotInstructions(flush).catch(() => {
          log.warn('failed to save feishu bot instructions');
        });
      }
    };
  }, []);

  /**
   * 保存指令文本。回包只用来同步项目字段（可用性），不用它回写角色/规则 ——
   * 保存期间用户可能又打字，用旧回包覆盖会吞字。
   */
  const persistInstructions = useCallback(
    async (next: InstructionsDraft) => {
      const mount = mountRef.current;
      const current = settingsRef.current;
      if (!mount || !current || current.ownerScopeKey !== next.ownerScopeKey) return;
      const version = ++operationVersions.current.save;
      const directoryVersion = operationVersions.current.directory;
      try {
        const state = await window.electronAPI.feishuBot.setBotInstructions(next);
        if (!isCurrentOperation(mount, next.ownerScopeKey, 'save', version)) return;
        const latest = settingsRef.current;
        if (
          !latest ||
          state.ownerScopeKey !== next.ownerScopeKey ||
          operationVersions.current.directory !== directoryVersion ||
          latest.workingDir !== current.workingDir ||
          latest.workingDirAvailable !== current.workingDirAvailable ||
          state.workingDir !== latest.workingDir
        )
          return;
        mergeProjectState(state);
      } catch {
        if (!isCurrentOperation(mount, next.ownerScopeKey, 'save', version)) return;
        log.warn('failed to save feishu bot instructions');
        toast.error(t('settings.feishuBot.instructions.saveFailed'));
      }
    },
    [isCurrentOperation, mergeProjectState, t],
  );

  const scheduleSave = useCallback(
    (field: InstructionField, value: string) => {
      const current = settingsRef.current;
      if (!current || !mountRef.current) return;
      fieldRevisions.current[field] += 1;
      const next = {
        role: current.role,
        rules: current.rules,
        ownerScopeKey: current.ownerScopeKey,
        [field]: value,
      };
      const merged = { ...current, ...next };
      // ref 立即跟上最新编辑：连续按键时下一条从新值出发，不丢字。
      settingsRef.current = merged;
      setSettings(merged);
      pendingSave.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        pendingSave.current = null;
        void persistInstructions(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [persistInstructions],
  );

  const chooseWorkingDirectory = useCallback(async () => {
    const current = settingsRef.current;
    const mount = mountRef.current;
    if (!current || !mount || isUpdatingDir) return;
    const ownerScopeKey = current.ownerScopeKey;
    const version = ++operationVersions.current.directory;
    setIsUpdatingDir(true);
    try {
      const result = await window.electronAPI.feishuBot.chooseWorkingDirectory(ownerScopeKey);
      if (
        !isCurrentOperation(mount, ownerScopeKey, 'directory', version) ||
        result.state.ownerScopeKey !== ownerScopeKey
      )
        return;
      mergeProjectState(result.state);
      if (!result.canceled) {
        toast.success(t('settings.feishuBot.instructions.projectSaved'));
      }
    } catch {
      if (!isCurrentOperation(mount, ownerScopeKey, 'directory', version)) return;
      log.warn('failed to choose feishu bot working directory');
      toast.error(t('settings.feishuBot.instructions.projectFailed'));
    } finally {
      if (isCurrentOperation(mount, ownerScopeKey, 'directory', version)) setIsUpdatingDir(false);
    }
  }, [isCurrentOperation, isUpdatingDir, mergeProjectState, t]);

  const resetWorkingDirectory = useCallback(async () => {
    const current = settingsRef.current;
    const mount = mountRef.current;
    if (!current || !mount || isUpdatingDir) return;
    const ownerScopeKey = current.ownerScopeKey;
    const version = ++operationVersions.current.directory;
    setIsUpdatingDir(true);
    try {
      const state = await window.electronAPI.feishuBot.resetWorkingDirectory(ownerScopeKey);
      if (
        !isCurrentOperation(mount, ownerScopeKey, 'directory', version) ||
        state.ownerScopeKey !== ownerScopeKey
      )
        return;
      mergeProjectState(state);
      toast.success(t('settings.feishuBot.instructions.projectResetDone'));
    } catch {
      if (!isCurrentOperation(mount, ownerScopeKey, 'directory', version)) return;
      log.warn('failed to reset feishu bot working directory');
      toast.error(t('settings.feishuBot.instructions.projectFailed'));
    } finally {
      if (isCurrentOperation(mount, ownerScopeKey, 'directory', version)) setIsUpdatingDir(false);
    }
  }, [isCurrentOperation, isUpdatingDir, mergeProjectState, t]);

  /** AI 一键丰富：整段替换 + 立即落盘（不等去抖，结果要马上生效）。 */
  const enrich = useCallback(
    async (field: InstructionField) => {
      const current = settingsRef.current;
      const mount = mountRef.current;
      if (!current || !mount || enriching) return;
      const draft = current[field].trim();
      if (!draft) return;
      const ownerScopeKey = current.ownerScopeKey;
      const version = ++operationVersions.current.enrich;
      const fieldRevision = fieldRevisions.current[field];
      setEnriching(field);
      try {
        const { text } = await window.electronAPI.feishuBot.enrichInstructions({
          field,
          text: draft,
          ownerScopeKey,
        });
        if (!isCurrentOperation(mount, ownerScopeKey, 'enrich', version)) return;
        const latest = settingsRef.current;
        if (
          !latest ||
          fieldRevisions.current[field] !== fieldRevision ||
          latest[field] !== current[field]
        )
          return;
        const enriched = text.trim();
        if (!enriched) throw new Error('empty enriched text');
        const next = { role: latest.role, rules: latest.rules, ownerScopeKey, [field]: enriched };
        const merged = { ...latest, ...next };
        fieldRevisions.current[field] += 1;
        settingsRef.current = merged;
        setSettings(merged);
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        pendingSave.current = null;
        await persistInstructions(next);
      } catch {
        if (!isCurrentOperation(mount, ownerScopeKey, 'enrich', version)) return;
        log.warn(`failed to enrich feishu bot ${field}`);
        toast.error(t('settings.feishuBot.instructions.enrichFailed'));
      } finally {
        if (isCurrentOperation(mount, ownerScopeKey, 'enrich', version)) setEnriching(null);
      }
    },
    [enriching, isCurrentOperation, persistInstructions, t],
  );

  if (!settings) return null;
  const configuredDir = settings.workingDir;

  return (
    <section
      className="flex flex-col gap-5"
      aria-label={t('settings.feishuBot.instructions.title')}
    >
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-13 font-medium text-[var(--settings-section-title)]">
            {t('settings.feishuBot.instructions.projectLabel')}
          </h3>
          <p className="mt-1 text-12 leading-[1.55] text-[var(--settings-section-desc)]">
            {t('settings.feishuBot.instructions.projectHint')}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="secondary"
            size="lg"
            type="button"
            onClick={() => void chooseWorkingDirectory()}
            disabled={isUpdatingDir}
            className="min-w-0 flex-1"
          >
            <FolderOpen size={15} className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate" title={configuredDir ?? undefined} dir="auto">
              {configuredDir ?? t('settings.feishuBot.instructions.projectManaged')}
            </span>
          </Button>
          {configuredDir && (
            <Button
              variant="secondary"
              size="lg"
              type="button"
              onClick={() => void resetWorkingDirectory()}
              disabled={isUpdatingDir}
              className="shrink-0"
            >
              {t('settings.feishuBot.instructions.projectReset')}
            </Button>
          )}
        </div>
        {!settings.workingDirAvailable && (
          <p className="text-12 text-[var(--settings-error-text)]" role="alert">
            {t('settings.feishuBot.instructions.projectUnavailable')}
          </p>
        )}
      </div>

      {(['role', 'rules'] as const).map((field) => (
        <FormField
          key={field}
          label={t(`settings.feishuBot.instructions.${field}Label`)}
          hint={t(`settings.feishuBot.instructions.${field}Hint`)}
          labelAction={
            <Button
              variant="secondary"
              size="sm"
              compact
              loading={enriching === field}
              type="button"
              onClick={() => void enrich(field)}
              disabled={enriching !== null || settings[field].trim().length === 0}
            >
              <Sparkles size={13} />
              {t('settings.feishuBot.instructions.enrich')}
            </Button>
          }
        >
          {(control) => (
            <Textarea
              {...control}
              value={settings[field]}
              onChange={(value) => scheduleSave(field, value)}
              maxLength={INSTRUCTION_MAX}
              rows={4}
              spellCheck={false}
              placeholder={t(`settings.feishuBot.instructions.${field}Placeholder`)}
            />
          )}
        </FormField>
      ))}
    </section>
  );
}
