import {
  ClipboardList,
  Gavel,
  Users as UsersIcon,
  Receipt,
  AlertTriangle,
  SquarePen,
  Plus
} from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { InfoCard } from '@/shared/ui/cards/InfoCard';
import { DetailRow } from '@/shared/ui/detail/DetailRow';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { MatterDetail } from '@/features/matters/data/matterTypes';

const URGENCY_LABEL: Record<NonNullable<MatterDetail['urgency']>, string> = {
  routine: 'Routine',
  time_sensitive: 'Time sensitive',
  emergency: 'Emergency'
};

const BILLING_TYPE_LABEL: Record<MatterDetail['billingType'], string> = {
  hourly: 'Hourly',
  fixed: 'Fixed fee',
  contingency: 'Contingency',
  pro_bono: 'Pro bono'
};

const PAYMENT_FREQUENCY_LABEL: Record<NonNullable<MatterDetail['paymentFrequency']>, string> = {
  project: 'Project',
  milestone: 'Milestone'
};

export interface MatterSettingsTabProps {
  detail: MatterDetail;
  responsibleAttorneyLabel: string | null;
  originatingAttorneyLabel: string | null;
  assigneeLabel: string | null;
  onEditMatter: () => void;
  onAddTeamMember?: () => void;
  onCloseMatter?: () => void;
  onArchiveMatter?: () => void;
  onDeleteMatter?: () => void;
}

export const MatterSettingsTab = ({
  detail,
  responsibleAttorneyLabel,
  originatingAttorneyLabel,
  assigneeLabel,
  onEditMatter,
  onAddTeamMember,
  onCloseMatter,
  onArchiveMatter,
  onDeleteMatter
}: MatterSettingsTabProps) => (
  <div className="@container space-y-5">
    <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-2">
      <div className="space-y-5">
        <InfoCard
          icon={ClipboardList}
          title="Matter details"
          bodyGap="sm"
          trailing={
            <Button size="sm" variant="secondary" icon={SquarePen} onClick={onEditMatter}>
              Edit
            </Button>
          }
        >
          <DetailRow label="Title" value={detail.title} />
          <DetailRow label="Description" value={detail.description?.trim() || null} />
          <DetailRow label="Status" value={MATTER_STATUS_LABELS[detail.status]} />
          <DetailRow label="Urgency" value={detail.urgency ? URGENCY_LABEL[detail.urgency] : null} />
          <DetailRow label="Matter type" value={detail.matterType} />
          <DetailRow label="Case number" value={detail.caseNumber} />
        </InfoCard>

        <InfoCard
          icon={Gavel}
          title="Case information"
          bodyGap="sm"
          trailing={
            <Button size="sm" variant="secondary" icon={SquarePen} onClick={onEditMatter}>
              Edit
            </Button>
          }
        >
          <DetailRow label="Court" value={detail.court} />
          <DetailRow label="Judge" value={detail.judge} />
          <DetailRow label="Opposing party" value={detail.opposingParty} />
          <DetailRow label="Opposing counsel" value={detail.opposingCounsel} />
        </InfoCard>
      </div>

      <div className="space-y-5">
        <InfoCard
          icon={UsersIcon}
          title="Team"
          bodyGap="sm"
          trailing={
            onAddTeamMember ? (
              <Button size="sm" variant="secondary" icon={Plus} onClick={onAddTeamMember}>
                Add
              </Button>
            ) : null
          }
        >
          <DetailRow label="Responsible attorney" value={responsibleAttorneyLabel} />
          <DetailRow label="Originating attorney" value={originatingAttorneyLabel} />
          <DetailRow label="Assigned" value={assigneeLabel} />
        </InfoCard>

        <InfoCard
          icon={Receipt}
          title="Billing configuration"
          bodyGap="sm"
          trailing={
            <Button size="sm" variant="secondary" icon={SquarePen} onClick={onEditMatter}>
              Edit
            </Button>
          }
        >
          <DetailRow label="Billing type" value={BILLING_TYPE_LABEL[detail.billingType]} />
          <DetailRow
            label="Attorney rate"
            value={detail.attorneyHourlyRate ? `${formatCurrency(detail.attorneyHourlyRate)}/hr` : null}
          />
          <DetailRow
            label="Admin rate"
            value={detail.adminHourlyRate ? `${formatCurrency(detail.adminHourlyRate)}/hr` : null}
          />
          <DetailRow
            label="Fixed price"
            value={detail.totalFixedPrice ? formatCurrency(detail.totalFixedPrice) : null}
          />
          <DetailRow
            label="Contingency %"
            value={detail.contingencyPercent != null ? `${detail.contingencyPercent}%` : null}
          />
          <DetailRow
            label="Payment frequency"
            value={detail.paymentFrequency ? PAYMENT_FREQUENCY_LABEL[detail.paymentFrequency] : null}
          />
        </InfoCard>
      </div>
    </div>

    {(onCloseMatter || onArchiveMatter || onDeleteMatter) ? (
      <section className="space-y-4 rounded-xl border border-rose-500/50 bg-card p-5">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-[18px] w-[18px] text-rose-500" />
          <h3 className="text-base font-semibold text-rose-500">Danger zone</h3>
        </div>

        <div className="space-y-4">
          {onCloseMatter ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-input-text">Close this matter</p>
                <p className="text-xs text-input-placeholder">
                  Mark as closed. No new time entries or tasks can be added.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={onCloseMatter}>
                Close matter
              </Button>
            </div>
          ) : null}

          {onArchiveMatter ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-input-text">Archive this matter</p>
                <p className="text-xs text-input-placeholder">
                  Move this matter out of active workflows while preserving its data.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={onArchiveMatter}>
                Archive matter
              </Button>
            </div>
          ) : null}

          {onDeleteMatter ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-input-text">Delete this matter</p>
                <p className="text-xs text-input-placeholder">
                  Permanently delete this matter and all associated data. This cannot be undone.
                </p>
              </div>
              <Button size="sm" variant="danger" onClick={onDeleteMatter}>
                Delete matter
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    ) : null}
  </div>
);
