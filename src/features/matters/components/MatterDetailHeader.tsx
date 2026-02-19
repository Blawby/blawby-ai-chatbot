
import type { ComponentType } from 'preact';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Avatar } from '@/shared/ui/profile';
import {
  PencilIcon,
  ScaleIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  DocumentCheckIcon,
  BriefcaseIcon,
  PauseCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUturnRightIcon
} from '@heroicons/react/24/outline';
import {
  MATTER_STATUS_LABELS,
  MATTER_WORKFLOW_STATUSES,
  type MatterStatus
} from '@/shared/types/matterStatus';
import { type MatterDetail, type MatterSummary } from '@/features/matters/data/matterTypes';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { formatLongDate } from '@/shared/utils/dateFormatter';

// Status icons mapping
const STATUS_ICON: Record<MatterStatus, unknown> = {
  first_contact: ChatBubbleLeftRightIcon,
  intake_pending: MagnifyingGlassIcon,
  conflict_check: ShieldExclamationIcon,
  conflicted: ExclamationTriangleIcon,
  eligibility: ScaleIcon,
  referred: ArrowUturnRightIcon,
  consultation_scheduled: DocumentCheckIcon,
  declined: XCircleIcon,
  engagement_pending: PauseCircleIcon,
  active: BriefcaseIcon,
  pleadings_filed: DocumentCheckIcon,
  discovery: MagnifyingGlassIcon,
  mediation: ScaleIcon,
  pre_trial: ShieldExclamationIcon,
  trial: ExclamationTriangleIcon,
  order_entered: CheckCircleIcon,
  appeal_pending: ArrowUturnRightIcon,
  closed: CheckCircleIcon
};

interface MatterDetailHeaderProps {
  matter: MatterSummary;
  detail: MatterDetail | null;
  headerMeta: {
    clientEntries: { id: string; name: string; status?: string; location?: string }[];
    description?: string;
    assigneeNames: string[];
    billingLabel: string;
    createdLabel: string;
  };
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Array<{ id: string; label: string }>;
  onUpdateStatus: (newStatus: MatterStatus) => void;
  onEdit: () => void;
  isLoading?: boolean;
}

export const MatterDetailHeader = ({
  matter,
  detail,
  headerMeta,
  activeTab,
  onTabChange,
  tabs,
  onUpdateStatus,
  onEdit,
  isLoading = false
}: MatterDetailHeaderProps) => {

  return (
    <div className="glass-panel p-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold leading-tight text-input-text mb-1 animate-float-in">
            {matter.title}
          </h1>
          <p className="text-xs text-input-placeholder">
            Created {formatLongDate(matter.createdAt)} · Updated {formatRelativeTime(matter.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Combobox
            label="Status"
            placeholder="Select status"
            value={matter.status}
            onChange={(val) => onUpdateStatus(val as MatterStatus)}
            options={MATTER_WORKFLOW_STATUSES.map((status) => ({
              value: status,
              label: MATTER_STATUS_LABELS[status]
            }))}
            leading={(selectedOption) => {
              const selectedStatus = (selectedOption?.value ?? matter.status) as MatterStatus;
              const StatusIcon = (STATUS_ICON[selectedStatus] as ComponentType<{ className?: string; 'aria-hidden'?: string | boolean }>) ?? ScaleIcon;
              return (
                <StatusIcon className="h-4 w-4 text-input-placeholder" aria-hidden="true" />
              );
            }}
            optionLeading={(option) => {
              const StatusIcon = (STATUS_ICON[option.value as MatterStatus] as ComponentType<{ className?: string; 'aria-hidden'?: string | boolean }>) ?? ScaleIcon;
              return <StatusIcon className="h-4 w-4 text-input-placeholder" aria-hidden="true" />;
            }}
            className="min-w-[200px]"
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!detail || isLoading}
            onClick={onEdit}
            aria-label="Edit matter"
          >
            <PencilIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <div className="mb-4">
        {headerMeta.clientEntries.length > 0 ? (
          <div className="flex items-center gap-3">
            <Avatar 
              name={headerMeta.clientEntries[0].name} 
              size="md" 
              status={
                headerMeta.clientEntries[0].status === 'active' || headerMeta.clientEntries[0].status === 'lead'
                  ? 'active'
                  : headerMeta.clientEntries[0].status === 'inactive' || headerMeta.clientEntries[0].status === 'archived'
                    ? 'inactive'
                    : undefined
              }
              className="bg-white/10 ring-1 ring-white/10" 
            />
            <div>
              <p className="text-sm font-medium text-input-text">{headerMeta.clientEntries[0].name}</p>
              <p className="text-xs text-input-placeholder">
                {[headerMeta.clientEntries[0].location, headerMeta.clientEntries[0].status]
                  .filter(Boolean)
                  .join(' · ') || 'No status available'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-input-placeholder">No client assigned</p>
        )}
      </div>
      
      <div className="-mx-4 px-4 -mb-4">
        <nav className="-mb-px flex flex-wrap items-center gap-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={[
                  'btn btn-tab whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors rounded-none',
                  isActive
                    ? 'active border-accent-500 text-input-text'
                    : 'border-transparent text-input-placeholder hover:border-line-glass/30 hover:text-input-text'
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
