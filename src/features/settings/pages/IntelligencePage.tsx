import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  BriefcaseBusiness,
  FileLock2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
} from 'lucide-preact';

import { Pill } from '@/design-system/primitives';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsAIPreface } from '@/features/settings/components/SettingsAIPreface';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import {
  practiceSkillsApi,
  type PracticeSkillDefinition,
  type PracticeSkillKey,
  type PracticeSkillsContract,
} from '@/features/settings/services/practiceSkillsApi';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { Button } from '@/shared/ui/Button';
import { Switch } from '@/shared/ui/input/Switch';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

export interface IntelligencePageProps {
  className?: string;
}

const skillIcons = {
  matter_management: BriefcaseBusiness,
  billing: ReceiptText,
  client_intake: UserRoundSearch,
} satisfies Record<PracticeSkillKey, typeof Sparkles>;

const CapabilityRow = ({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  status: 'enforced' | 'pending';
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-line-subtle py-4 last:border-0">
    <div className="flex min-w-0 items-start gap-3">
      <div className="rounded-md border border-line-subtle bg-paper-2 p-2 text-dim-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim-2">{description}</p>
      </div>
    </div>
    <Pill tone={status === 'enforced' ? 'live' : 'warn'}>
      {status === 'enforced' ? 'Enforced' : 'Pending backend'}
    </Pill>
  </div>
);

const SkillRow = ({
  skill,
  enabled,
  disabled,
  onChange,
}: {
  skill: PracticeSkillDefinition;
  enabled: boolean;
  disabled: boolean;
  onChange: (skill: PracticeSkillKey, enabled: boolean) => void;
}) => {
  const Icon = skillIcons[skill.key];
  return (
    <div className="border-b border-line-subtle py-4 last:border-0">
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-md border border-line-subtle bg-paper-2 p-2 text-accent">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <Switch
          id={`practice-skill-${skill.key}`}
          className="min-w-0 flex-1 py-0"
          label={skill.label}
          description={skill.description}
          value={enabled}
          disabled={disabled}
          onChange={(value) => onChange(skill.key, value)}
        />
      </div>
    </div>
  );
};

export const IntelligencePage = ({ className }: IntelligencePageProps) => {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const practiceId = useMemo(
    () => currentPractice?.betterAuthOrgId ?? currentPractice?.id ?? null,
    [currentPractice?.betterAuthOrgId, currentPractice?.id],
  );
  const [contract, setContract] = useState<PracticeSkillsContract | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = useCallback(
    async (signal?: AbortSignal) => {
      if (!practiceId) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await practiceSkillsApi.get(practiceId, signal);
        if (signal?.aborted) return;
        setContract(result);
        setIsSaved(false);
      } catch (loadError) {
        if (signal?.aborted) return;
        setContract(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load practice AI skills.');
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [practiceId],
  );

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    void loadSkills(controller.signal);
    return () => controller.abort();
  }, [loadSkills, practiceId]);

  const updateSkill = async (skill: PracticeSkillKey, enabled: boolean) => {
    if (!practiceId || !contract || isSaving) return;
    const enabledSkills = enabled
      ? [...contract.enabled_skills, skill]
      : contract.enabled_skills.filter((candidate) => candidate !== skill);
    setIsSaving(true);
    setIsSaved(false);
    setError(null);
    try {
      setContract(await practiceSkillsApi.update(practiceId, enabledSkills));
      setIsSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update practice AI skills.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={className}>
      <SettingsAIPreface />
      <div className="mt-8 space-y-10">
        <SettingSection
          title="Practice skills"
          description="Choose the structured capabilities available to your practice assistant and client intake. Changes apply practice-wide."
        >
          <SettingsCard className="max-w-[860px]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-4">
              <div>
                <h3 className="text-sm font-medium text-ink">Enabled intelligence</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim-2">
                  Each skill is versioned in code and grounded in your saved practice data. There is no free-text system prompt.
                </p>
              </div>
              <Pill tone={isSaving ? 'warn' : isSaved ? 'live' : 'dim'}>
                {isSaving ? 'Saving' : isSaved ? 'Saved' : 'Practice-wide'}
              </Pill>
            </div>

            {!practiceId ? (
              <SettingsNotice variant="warning" className="mt-4">
                Select a practice to manage its AI skills.
              </SettingsNotice>
            ) : isLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner ariaLabel="Loading practice skills" />
              </div>
            ) : contract ? (
              <div>
                {contract.available_skills.map((skill) => (
                  <SkillRow
                    key={skill.key}
                    skill={skill}
                    enabled={contract.enabled_skills.includes(skill.key)}
                    disabled={isSaving}
                    onChange={updateSkill}
                  />
                ))}
              </div>
            ) : null}

            {error ? (
              <SettingsNotice variant="danger" className="mt-4" role="alert">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{error}</span>
                  {!contract ? (
                    <Button variant="secondary" size="sm" onClick={() => void loadSkills()}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      Try again
                    </Button>
                  ) : null}
                </div>
              </SettingsNotice>
            ) : null}
          </SettingsCard>
        </SettingSection>

        <SettingSection
          title="Grounding and safety"
          description="Current enforced boundaries are shown separately from future configuration."
        >
          <SettingsCard className="max-w-[860px]">
            <CapabilityRow
              icon={FileLock2}
              title="Tenant-scoped grounding"
              description="Authenticated practice and audience boundaries are enforced. Per-table include/exclude controls and source row counts are not available."
              status="enforced"
            />
            <CapabilityRow
              icon={ShieldCheck}
              title="PII and high-risk actions"
              description="Client-facing sanitization is enforced by the application. Durable cross-client approval and audit behavior remains pending human merge of the backend approval contract."
              status="pending"
            />
          </SettingsCard>
        </SettingSection>
      </div>
    </div>
  );
};
