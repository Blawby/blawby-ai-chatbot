import { FileClock } from 'lucide-preact';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { Button } from '@/shared/ui/Button';

export interface AuditLogPageProps {
  className?: string;
}

export const AuditLogPage = ({ className = '' }: AuditLogPageProps) => (
  <div className={className}>
    <SettingSection
      first
      title="Audit log"
      description="A practice-wide compliance log needs one authoritative backend event stream."
    >
      <SettingsCard className="max-w-[860px]">
        <div className="flex flex-col items-start gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-line-subtle bg-paper-2 p-2 text-dim-2">
              <FileClock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-ink">Practice-wide audit events are not connected</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-dim-2">
                Invoice, matter, upload, authentication, and assistant events currently live in separate systems.
                Blawby will not present sample entries as compliance evidence or claim an export was requested.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled title="Requires the backend audit-log contract">
            Export unavailable
          </Button>
        </div>
      </SettingsCard>
    </SettingSection>
  </div>
);
