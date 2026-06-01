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

/**
 * Tab counts shown next to each tab label, per the canonical chat-first
 * Matter.html design.
 *
 * **IA divergence from design:** the canonical design has 9 sibling tabs
 * (Overview / Activity / Time & expenses / Files / Notes / Tasks / Milestones /
 * Invoices / People). Our shipped IA keeps 7 tabs (Overview / Work / Notes /
 * Billing / Files / Activity / Settings) with Tasks+Milestones nested under
 * Work and Time+Expenses+Invoices nested under Billing via sub-Seg. Adding
 * the missing tabs would risk breaking existing routes and editor state, so
 * we surface the canonical information density via tab counts instead.
 */
export interface MatterDetailTabCounts {
  activity?: number;
  work?: number; // open tasks count
  notes?: number;
  billing?: number; // invoice count
  files?: number;
}

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
  /**
   * Counts shown beside each tab label. Omit a key to render the tab
   * without a count badge.
   */
  tabCounts?: MatterDetailTabCounts;
}

const buildTabs = (counts?: MatterDetailTabCounts): TabItem[] => [
  { id: 'overview', label: 'Overview' },
  { id: 'work', label: 'Work', count: counts?.work },
  { id: 'notes', label: 'Notes', count: counts?.notes },
  { id: 'billing', label: 'Billing', count: counts?.billing },
  { id: 'files', label: 'Files', count: counts?.files },
  { id: 'activity', label: 'Activity', count: counts?.activity },
  { id: 'settings', label: 'Settings' }
];

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
  settings,
  tabCounts
}: MatterDetailPanelProps) => (
  <div className="page-detail">
    <MatterDetailHeader {...header} />
    <div className="tab-bar">
      <Tabs
        items={buildTabs(tabCounts)}
        activeId={detailSection}
        onChange={(id) => onSectionChange(id as DetailSectionId)}
      />
    </div>
    <div className="page-content">
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
