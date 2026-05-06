import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { MatterDetailHeader, type MatterDetailHeaderProps } from '@/features/matters/components/MatterDetailHeader';
import { MatterOverviewTab, type MatterOverviewTabProps } from '@/features/matters/components/MatterOverviewTab';
import { MatterWorkTab, type MatterWorkTabProps } from '@/features/matters/components/MatterWorkTab';
import { MatterNotesTab, type MatterNotesTabProps } from '@/features/matters/components/MatterNotesTab';
import { MatterBillingTab, type MatterBillingTabProps } from '@/features/matters/components/MatterBillingTab';
import { MatterFilesTab } from '@/features/matters/components/MatterFilesTab';
import { MatterActivityTab, type MatterActivityTabProps } from '@/features/matters/components/MatterActivityTab';
import { MatterSettingsTab, type MatterSettingsTabProps } from '@/features/matters/components/MatterSettingsTab';

export type DetailSectionId =
  | 'overview'
  | 'work'
  | 'notes'
  | 'billing'
  | 'files'
  | 'activity'
  | 'settings';

const MATTER_DETAIL_TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'work', label: 'Work' },
  { id: 'notes', label: 'Notes' },
  { id: 'billing', label: 'Billing' },
  { id: 'files', label: 'Files' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' }
];

export interface MatterDetailPanelProps {
  detailSection: DetailSectionId;
  onSectionChange: (section: DetailSectionId) => void;
  matterId: string;

  header: MatterDetailHeaderProps;
  overview: MatterOverviewTabProps;
  work: MatterWorkTabProps;
  notes: MatterNotesTabProps;
  billing: MatterBillingTabProps;
  activity: MatterActivityTabProps;
  settings: MatterSettingsTabProps;
}

export const MatterDetailPanel = ({
  detailSection,
  onSectionChange,
  matterId,
  header,
  overview,
  work,
  notes,
  billing,
  activity,
  settings
}: MatterDetailPanelProps) => (
  <div className="themed-scrollbar flex h-full flex-col overflow-y-auto">
    <MatterDetailHeader {...header} />
    <div className="border-b border-card-border px-4 sm:px-6">
      <Tabs
        items={MATTER_DETAIL_TABS}
        activeId={detailSection}
        onChange={(id) => onSectionChange(id as DetailSectionId)}
      />
    </div>
    <div className="p-4 sm:p-6">
      {detailSection === 'overview' ? <MatterOverviewTab {...overview} /> : null}
      {detailSection === 'work' ? <MatterWorkTab {...work} /> : null}
      {detailSection === 'notes' ? <MatterNotesTab {...notes} /> : null}
      {detailSection === 'billing' ? <MatterBillingTab {...billing} /> : null}
      {detailSection === 'files' ? <MatterFilesTab matterId={matterId} /> : null}
      {detailSection === 'activity' ? <MatterActivityTab {...activity} /> : null}
      {detailSection === 'settings' ? <MatterSettingsTab {...settings} /> : null}
    </div>
  </div>
);
