import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Activity, PauseCircle, ShieldCheck, Sparkles } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input, Switch, Textarea } from '@/shared/ui/input';
import { EditorShell, SectionDivider } from '@/shared/ui/layout';
import { Icon } from '@/shared/ui/Icon';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';
import { resolveSettingsBasePath } from '@/shared/utils/workspace';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsAIPreface } from '@/features/settings/components/SettingsAIPreface';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { Pill } from '@/design-system/primitives';
import { Seg } from '@/design-system/patterns';

// ---------------------------------------------------------------------------
// Local-storage demo persistence
//
// TODO(backend): the columns below do not yet exist on the `practices` row.
// Each control is wired to localStorage so the design can be reviewed end to
// end without backend changes. Once the columns ship, swap the read/write
// helpers for the practices API and delete the LS_* constants.
// Needed columns/endpoints:
//   - practices.assistant_name (text)
//   - practices.assistant_tone (enum: direct | friendly | formal)
//   - practices.assistant_proactive_briefings (bool)
//   - practices.assistant_observations (bool)
//   - practices.system_prompt (text)
//   - practices.grounding_sources (jsonb array of table names)
//   - practices.pii_redaction (bool)
//   - GET/PUT /api/practices/:id/intelligence
// ---------------------------------------------------------------------------

const LS_ASSISTANT_NAME = 'blawby:settings:assistant-name';
const LS_TONE = 'blawby:settings:assistant-tone';
const LS_BRIEFINGS = 'blawby:settings:proactive-briefings';
const LS_OBSERVATIONS = 'blawby:settings:observations';
const LS_SYSTEM_PROMPT = 'blawby:settings:system-prompt';
const LS_GROUNDING_EXCLUDED = 'blawby:settings:grounding-excluded';
const LS_PII_REDACTION = 'blawby:settings:pii-redaction';

type Tone = 'direct' | 'friendly' | 'formal';

const TONE_OPTIONS = [
  { value: 'direct' as const, label: 'Direct' },
  { value: 'friendly' as const, label: 'Friendly' },
  { value: 'formal' as const, label: 'Formal' },
];

const GROUNDING_SOURCES: ReadonlyArray<{ key: string; rows: number }> = [
  { key: 'matters', rows: 142 },
  { key: 'contacts', rows: 318 },
  { key: 'intakes', rows: 87 },
  { key: 'invoices', rows: 1240 },
  { key: 'engagements', rows: 64 },
  { key: 'time_entries', rows: 2103 },
  { key: 'tasks', rows: 96 },
  { key: 'milestones', rows: 31 },
  { key: 'files', rows: 412 },
  { key: 'contact_forms', rows: 56 },
];

const DEFAULT_SYSTEM_PROMPT = `You are the assistant for {{practiceName}}, a {{practiceArea}} law practice.

Always:
- Ground every reply in this practice's matters, contacts, intakes, and ledger — never in someone else's data.
- Stage every write (invoices, status changes, emails) for human approval. Never execute without confirmation.
- Cite the source rows you used (matter id, intake id, file name) so the user can audit.

Never:
- Promise outcomes or settlement amounts.
- Give jurisdiction-specific advice outside the states this practice is licensed in.
- Reveal another client's name or matter details to the wrong audience.

Tone:
- Match the practice's configured tone preference. Default to direct, plainspoken.
- When asked "I noticed…" questions, surface what's observable; don't fabricate.`;

// AI model badge — read from env-injected metadata if available; otherwise
// fall back to the literal model name. TODO(backend): expose a
// `/api/system/active-model` endpoint so this isn't a string constant.
const ACTIVE_MODEL_LABEL = 'live · sonnet-4.5';

const PAUSE_DURATIONS = [
  { value: '1h', label: 'Pause for 1 hour' },
  { value: '4h', label: 'Pause for 4 hours' },
  { value: 'manual', label: 'Pause until I resume' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const readLS = (key: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeLS = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
};

const readBoolLS = (key: string, fallback: boolean): boolean => {
  const raw = readLS(key, fallback ? 'true' : 'false');
  return raw === 'true';
};

const readExcludedLS = (): Set<string> => {
  const raw = readLS(LS_GROUNDING_EXCLUDED, '');
  if (!raw) return new Set();
  return new Set(raw.split(',').filter(Boolean));
};

const writeExcludedLS = (excluded: Set<string>): void => {
  writeLS(LS_GROUNDING_EXCLUDED, Array.from(excluded).join(','));
};

// ---------------------------------------------------------------------------
// IntelligencePage
// ---------------------------------------------------------------------------

export interface IntelligencePageProps {
  className?: string;
  onBack?: () => void;
}

export const IntelligencePage = ({ className, onBack }: IntelligencePageProps) => {
  const { showSuccess } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const settingsBasePath = resolveSettingsBasePath(location.path);

  // ─── AI Behavior ─────────────────────────────────────────────────────────
  const [assistantName, setAssistantName] = useState<string>('Blawby');
  const [tone, setTone] = useState<Tone>('direct');
  const [proactiveBriefings, setProactiveBriefings] = useState(true);
  const [observations, setObservations] = useState(true);
  // Required for IOLTA compliance — UI is read-only. (No state needed; the
  // toggle is rendered statically as `on` + `disabled`.)

  // ─── System Prompt ───────────────────────────────────────────────────────
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);
  const [systemPromptDirty, setSystemPromptDirty] = useState(false);

  // ─── Grounding ───────────────────────────────────────────────────────────
  const [excludedSources, setExcludedSources] = useState<Set<string>>(() => new Set());

  // ─── Data & safety ───────────────────────────────────────────────────────
  const [piiRedaction, setPiiRedaction] = useState(true);

  // ─── Pause AI dialog ─────────────────────────────────────────────────────
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setAssistantName(readLS(LS_ASSISTANT_NAME, 'Blawby'));
    const persistedTone = readLS(LS_TONE, 'direct');
    setTone((persistedTone as Tone) ?? 'direct');
    setProactiveBriefings(readBoolLS(LS_BRIEFINGS, true));
    setObservations(readBoolLS(LS_OBSERVATIONS, true));
    setSystemPrompt(readLS(LS_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT));
    setExcludedSources(readExcludedLS());
    setPiiRedaction(readBoolLS(LS_PII_REDACTION, true));
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleAssistantNameChange = useCallback((value: string) => {
    setAssistantName(value);
    writeLS(LS_ASSISTANT_NAME, value);
  }, []);

  const handleToneChange = useCallback((next: Tone) => {
    setTone(next);
    writeLS(LS_TONE, next);
  }, []);

  const handleBriefingsChange = useCallback((next: boolean) => {
    setProactiveBriefings(next);
    writeLS(LS_BRIEFINGS, next ? 'true' : 'false');
  }, []);

  const handleObservationsChange = useCallback((next: boolean) => {
    setObservations(next);
    writeLS(LS_OBSERVATIONS, next ? 'true' : 'false');
  }, []);

  const handleSystemPromptChange = useCallback((value: string) => {
    setSystemPrompt(value);
    setSystemPromptDirty(value !== readLS(LS_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT));
  }, []);

  const handleSaveSystemPrompt = useCallback(() => {
    writeLS(LS_SYSTEM_PROMPT, systemPrompt);
    setSystemPromptDirty(false);
    showSuccess('System prompt saved', 'Demo persistence only — backend column coming.');
  }, [showSuccess, systemPrompt]);

  const handleResetSystemPrompt = useCallback(() => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setSystemPromptDirty(DEFAULT_SYSTEM_PROMPT !== readLS(LS_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT));
  }, []);

  const handleToggleSource = useCallback((key: string) => {
    setExcludedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeExcludedLS(next);
      return next;
    });
  }, []);

  const handlePiiChange = useCallback((next: boolean) => {
    setPiiRedaction(next);
    writeLS(LS_PII_REDACTION, next ? 'true' : 'false');
  }, []);

  const handleViewActivityLog = useCallback(() => {
    // No dedicated "AI events" filter on the activity log yet; the closest
    // surface today is the practice home / matter activity tabs. Until the
    // backend exposes a filtered AI events stream, surface intent + nav.
    // TODO(backend): /api/practices/:id/activity?actor=ai endpoint.
    showSuccess(
      'AI activity log',
      'A dedicated AI activity view ships with the audit-log endpoint.'
    );
  }, [showSuccess]);

  const handlePauseAi = useCallback((duration: string) => {
    // TODO(backend): wire to `/api/practices/:id/ai/pause` with a duration
    // parameter. For demo, surface intent and close the dialog.
    showSuccess(
      'Pause requested',
      `The assistant would be paused (${duration}) once the backend endpoint ships.`
    );
    setPauseDialogOpen(false);
  }, [showSuccess]);

  const groundingChips = useMemo(() => {
    return GROUNDING_SOURCES.map((source) => {
      const isExcluded = excludedSources.has(source.key);
      return (
        <button
          key={source.key}
          type="button"
          onClick={() => handleToggleSource(source.key)}
          aria-pressed={!isExcluded}
          className={cn(
            'inline-flex items-center gap-2 rounded-r-md border px-3 py-1.5 font-mono text-xs transition-colors',
            isExcluded
              ? 'border-dashed border-rule bg-paper text-dim line-through decoration-dim-2'
              : 'border-rule bg-card text-ink hover:border-accent hover:text-accent-deep',
          )}
          title={isExcluded ? 'Excluded from grounding — click to include' : 'Click to exclude from grounding'}
        >
          <span>{source.key}</span>
          <span className={cn('text-[10.5px]', isExcluded ? 'text-dim-2' : 'text-dim')}>
            {source.rows.toLocaleString()}
          </span>
        </button>
      );
    });
  }, [excludedSources, handleToggleSource]);

  // ─── Render ──────────────────────────────────────────────────────────────
  const fallbackBack = useCallback(() => {
    navigate(`${settingsBasePath}/practice`);
  }, [navigate, settingsBasePath]);

  return (
    <EditorShell
      title="Intelligence"
      subtitle="Assistant behavior, grounding, and safety"
      showBack
      backVariant="close"
      onBack={onBack ?? fallbackBack}
      className={className}
      contentMaxWidth={null}
      crumb="Settings · Practice · Intelligence"
      accentTitle={
        <>
          How the <em>assistant</em> works for you.
        </>
      }
      lede="I'm here so you can see and audit the rules I follow. Every write I propose is staged for your approval — never automatic."
      heroSlot={<SettingsAIPreface />}
    >
      <div className="space-y-10">
        {/* ─── AI Behavior ─────────────────────────────────────────────── */}
        <SettingSection
          title="AI behavior"
          description="How the assistant talks to you and your clients."
        >
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_320px] sm:items-start sm:gap-6">
              <div className="space-y-1">
                <div className="text-sm font-medium text-ink">Assistant name</div>
                <p className="text-xs text-dim">
                  What clients hear in your public intake widget. Internal staff always see &ldquo;Blawby&rdquo;.
                </p>
              </div>
              <Input
                value={assistantName}
                onChange={handleAssistantNameChange}
                placeholder="Blawby"
                aria-label="Assistant name"
              />
            </div>

            <SectionDivider />

            <div className="grid gap-3 sm:grid-cols-[1fr_320px] sm:items-center sm:gap-6">
              <div className="space-y-1">
                <div className="text-sm font-medium text-ink">Tone</div>
                <p className="text-xs text-dim">
                  Applies to client-facing replies and staff drafts.
                </p>
              </div>
              <Seg<Tone>
                value={tone}
                options={TONE_OPTIONS}
                onChange={handleToneChange}
                ariaLabel="Assistant tone"
                className="sm:justify-self-end"
              />
            </div>

            <SectionDivider />

            <Switch
              label="Proactive briefings"
              description="A morning summary at 07:00 every weekday — urgent intakes, retainer health, calendar."
              value={proactiveBriefings}
              onChange={handleBriefingsChange}
              id="proactive-briefings"
            />

            <SectionDivider />

            <Switch
              label={"“I noticed” observations"}
              description="The assistant volunteers opportunities it spots — pricing inconsistencies, stalled matters."
              value={observations}
              onChange={handleObservationsChange}
              id="observations"
            />

            <SectionDivider />

            <div
              className="flex items-center justify-between gap-4 py-3"
              title="Required for IOLTA compliance — cannot be turned off"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  Staged actions require approval
                  <Pill tone="gold">required</Pill>
                </div>
                <p className="mt-1 text-xs text-dim">
                  Required for IOLTA compliance — cannot be turned off. Every write is drafted, never executed automatically.
                </p>
              </div>
              <button
                type="button"
                className={cn('toggle', 'on', 'cursor-not-allowed opacity-60')}
                disabled
                aria-pressed
                aria-label="Staged actions require approval (required)"
              />
            </div>
          </div>
        </SettingSection>

        {/* ─── System Prompt Editor ────────────────────────────────────── */}
        <SettingSection
          title="System prompt"
          description="Prepended to every assistant call within your practice. Plain English."
        >
          {/* TODO(backend): needs practices.system_prompt column + GET/PUT endpoint */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-dim">
                <span>your_practice.system_prompt</span>
                <span className="text-dim-2">·</span>
                <span>editable from chat</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetSystemPrompt}
                  disabled={systemPrompt === DEFAULT_SYSTEM_PROMPT}
                >
                  Reset to default
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSystemPrompt}
                  disabled={!systemPromptDirty}
                >
                  Save prompt
                </Button>
              </div>
            </div>
            <Textarea
              id="system-prompt-editor"
              value={systemPrompt}
              onChange={handleSystemPromptChange}
              rows={14}
              className="font-mono text-xs leading-relaxed"
              aria-label="System prompt"
            />
            <SettingsHelperText>
              You can also tell the assistant in chat: &ldquo;remember that we don&rsquo;t take criminal cases&rdquo; — it edits this prompt for you.
            </SettingsHelperText>
          </div>
        </SettingSection>

        {/* ─── Grounding / Readable sources ────────────────────────────── */}
        <SettingSection
          title="Grounding & readable sources"
          description="Which of your tables the assistant can read when answering. Removing a source narrows what it knows."
        >
          {/* TODO(backend): persist excluded sources to practices.grounding_sources */}
          <div className="flex flex-wrap gap-2">
            {groundingChips}
          </div>
          <SettingsHelperText className="mt-3">
            Click a chip to exclude it. The assistant will skip that table on every grounding pass.
          </SettingsHelperText>
        </SettingSection>

        {/* ─── Data & safety ───────────────────────────────────────────── */}
        <SettingSection
          title="Data & safety"
          description="What's stored, what leaves your account, and what gets audited."
        >
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon icon={Sparkles} className="h-4 w-4 text-accent" />
                  Model
                </div>
                <p className="text-xs text-dim">
                  Anthropic Claude (managed). Your data is never used to train models.
                </p>
              </div>
              {/* TODO(backend): expose active model via /api/system/active-model */}
              <Pill tone="live">{ACTIVE_MODEL_LABEL}</Pill>
            </div>

            <SectionDivider />

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon icon={Activity} className="h-4 w-4 text-dim-2" />
                  AI activity log
                </div>
                <p className="text-xs text-dim">
                  Every staged write, approval, and tool call is logged with a timestamp and actor.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleViewActivityLog}>
                View AI activity log
              </Button>
            </div>

            <SectionDivider />

            <Switch
              label="PII redaction in client-facing chat"
              description="SSNs, account numbers, and DOB patterns are auto-masked in the public intake widget before they reach the model."
              value={piiRedaction}
              onChange={handlePiiChange}
              id="pii-redaction"
            />
          </div>
        </SettingSection>

        {/* ─── Danger zone ─────────────────────────────────────────────── */}
        <div className="mt-12 rounded-r-md border border-neg/30 bg-neg/5 p-6">
          <div className="flex items-start gap-3">
            <Icon icon={ShieldCheck} className="mt-0.5 h-5 w-5 shrink-0 text-neg" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-serif text-lg font-normal leading-tight text-neg">
                Danger zone
              </h3>
              <p className="text-sm text-ink-2">
                Stops all assistant replies, briefings, and staged writes practice-wide. Your data stays put.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {/* TODO(backend): wire to /api/practices/:id/ai/pause */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={PauseCircle}
              onClick={() => setPauseDialogOpen(true)}
              className="text-neg hover:text-neg"
            >
              Pause AI
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Pause AI dialog ──────────────────────────────────────────── */}
      <Dialog
        isOpen={pauseDialogOpen}
        onClose={() => setPauseDialogOpen(false)}
        title="Pause the assistant"
        description="No replies, briefings, or staged writes will be generated for the selected duration."
        showCloseButton
      >
        <DialogBody className="space-y-3">
          {PAUSE_DURATIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePauseAi(option.value)}
              className="flex w-full items-center justify-between rounded-r-md border border-rule bg-card px-4 py-3 text-left text-sm text-ink transition-colors hover:border-accent hover:text-accent-deep"
            >
              <span>{option.label}</span>
              <span aria-hidden="true" className="font-mono text-xs text-dim">→</span>
            </button>
          ))}
        </DialogBody>
        <DialogFooter className="justify-end px-5 py-4 sm:px-6">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPauseDialogOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </Dialog>
    </EditorShell>
  );
};

export default IntelligencePage;
