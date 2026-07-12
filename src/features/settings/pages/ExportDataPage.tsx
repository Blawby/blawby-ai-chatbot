// TODO(backend): Required endpoints:
//   - POST /api/practices/:id/export?type=full|matters|billing|trust|audit
//     → triggers async export job, sends download link via email when ready

import { Button } from '@/shared/ui/Button';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsCard } from '@/features/settings/components/SettingsCard';

// ---------------------------------------------------------------------------
// Export cards
// ---------------------------------------------------------------------------

interface ExportCardProps {
  name: string;
  format: string;
  description: string;
  primary?: boolean;
}

const ExportCard = ({ name, format, description, primary = false }: ExportCardProps) => (
  <div className="flex items-center justify-between gap-6 py-4 border-b border-rule last:border-0 max-sm:flex-col max-sm:items-start">
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        {name}
        <span className="font-mono text-[10px] uppercase tracking-wider text-dim border border-rule rounded px-1.5 py-px">{format}</span>
      </div>
      <p className="text-xs text-dim mt-0.5">{description}</p>
    </div>
    <Button variant={primary ? 'primary' : 'ghost'} size="sm" className="shrink-0" disabled title="Requires the backend export contract">
      Export unavailable
    </Button>
  </div>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface ExportDataPageProps {
  className?: string;
}

export const ExportDataPage = ({ className = '' }: ExportDataPageProps) => (
    <div className={className}>
      <SettingSection first title="Available exports" description="Practice-wide exports are not connected yet. No export request is sent from this screen.">
        <SettingsCard className="max-w-[820px]">
        <ExportCard
          name="Full practice export"
          format="ZIP"
          description="Everything — matters, contacts, billing, trust ledger, documents, and conversation history."
          primary
        />
        <ExportCard
          name="Matters & contacts"
          format="CSV"
          description="All matter records, events, notes, and contact information."
        />
        <ExportCard
          name="Billing & invoices"
          format="CSV"
          description="Invoice history, time entries, and payment records."
        />
        <ExportCard
          name="Trust ledger"
          format="CSV"
          description="Complete IOLTA trust account transaction history with running balances."
        />
        <ExportCard
          name="Audit log"
          format="CSV"
          description="Full event log with timestamps, actors, and actions."
        />
        </SettingsCard>
      </SettingSection>
    </div>
);
