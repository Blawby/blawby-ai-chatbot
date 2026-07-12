import { FileLock2, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-preact';

import { Pill } from '@/design-system/primitives';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsAIPreface } from '@/features/settings/components/SettingsAIPreface';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { Button } from '@/shared/ui/Button';

export interface IntelligencePageProps {
  className?: string;
}

const CapabilityRow = ({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  status: 'unavailable' | 'enforced' | 'pending';
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
    <Pill tone={status === 'enforced' ? 'live' : status === 'pending' ? 'warn' : 'dim'}>
      {status === 'enforced' ? 'Enforced' : status === 'pending' ? 'Pending backend' : 'Unavailable'}
    </Pill>
  </div>
);

export const IntelligencePage = ({ className }: IntelligencePageProps) => (
  <div className={className}>
    <SettingsAIPreface />
    <div className="mt-8 space-y-10">
      <SettingSection
        title="AI behavior"
        description="Practice AI settings need a durable backend contract before they can change assistant behavior."
      >
        <SettingsCard className="max-w-[860px]">
          <CapabilityRow
            icon={SlidersHorizontal}
            title="Structured practice skills"
            description="Free-text system prompts are intentionally not offered. The backend skills registry is the source of truth for configurable capabilities."
            status="pending"
          />
          <CapabilityRow
            icon={Sparkles}
            title="Assistant name, tone, briefings, and observations"
            description="These controls are not connected. Blawby no longer stores browser-only preferences that appear saved but do not affect the assistant."
            status="unavailable"
          />
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

      <SettingSection
        title="Operational controls"
        description="A practice-wide pause must stop real model calls and staged writes, not just change this browser."
      >
        <SettingsCard className="flex max-w-[860px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">Pause AI</h3>
            <p className="mt-1 text-sm text-dim-2">No backend pause state is connected, so this control cannot safely claim success.</p>
          </div>
          <Button variant="secondary" size="sm" disabled title="Requires a backend practice-wide pause contract">
            Pause unavailable
          </Button>
        </SettingsCard>
      </SettingSection>
    </div>
  </div>
);
