import type { FunctionComponent } from 'preact';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { RecentActivityTable } from '@/features/practice-dashboard/components/RecentActivityTable';
import { RecentClientsGrid } from '@/features/practice-dashboard/components/RecentClientsGrid';
import { DashboardHero } from '@/features/practice-dashboard/components/DashboardHero';
import type { BillingWindow } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

type RecentMessage = {
  preview: string;
  timestampLabel: string;
  senderLabel: string;
  avatarSrc: string | null;
  conversationId: string | null;
} | null;

type WorkspaceHomeSectionProps = {
  workspace: 'public' | 'practice' | 'client';
  practiceName?: string | null;
  practiceLogo?: string | null;
  recentMessage: RecentMessage;
  intakeContactStarted: boolean;
  onOpenRecentMessage: () => void;
  onSendMessage: () => void;
  onRequestConsultation: () => void;
  dashboardWindow: BillingWindow;
  summaryStats: Parameters<typeof DashboardHero>[0]['stats'];
  practiceBillingLoading: boolean;
  practiceBillingError: string | null;
  recentActivity: Parameters<typeof RecentActivityTable>[0]['days'];
  recentClients: Parameters<typeof RecentClientsGrid>[0]['clients'];
  onDashboardWindowChange: (value: BillingWindow) => void;
  onCreateInvoice: () => void;
  onOpenInvoice: (invoiceId: string) => void;
  onViewAllClients: () => void;
  onViewClient: (clientId: string) => void;
};

export const WorkspaceHomeSection: FunctionComponent<WorkspaceHomeSectionProps> = ({
  workspace,
  practiceName,
  practiceLogo,
  recentMessage,
  intakeContactStarted,
  onOpenRecentMessage,
  onSendMessage,
  onRequestConsultation,
  dashboardWindow,
  summaryStats,
  practiceBillingLoading,
  practiceBillingError,
  recentActivity,
  recentClients,
  onDashboardWindowChange,
  onCreateInvoice,
  onOpenInvoice,
  onViewAllClients,
  onViewClient,
}) => {
  if (workspace === 'practice') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-5">
        <DashboardHero
          windowSize={dashboardWindow}
          stats={summaryStats}
          loading={practiceBillingLoading}
          onWindowChange={onDashboardWindowChange}
          onCreateInvoice={onCreateInvoice}
        />
        {practiceBillingError ? (
          <div className="border-b border-line-glass/30" role="alert">
            <div className="mx-auto max-w-7xl px-4 py-3 text-sm text-input-text sm:px-6 lg:px-8">
              {practiceBillingError}
            </div>
          </div>
        ) : null}
        <RecentActivityTable
          days={recentActivity}
          loading={practiceBillingLoading}
          error={null}
          onOpenInvoice={(entry) => onOpenInvoice(entry.invoiceId)}
        />
        <RecentClientsGrid
          clients={recentClients}
          loading={practiceBillingLoading}
          error={null}
          onViewAll={onViewAllClients}
          onViewClient={onViewClient}
        />
      </div>
    );
  }

  return (
    <WorkspaceHomeView
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      onSendMessage={onSendMessage}
      onRequestConsultation={onRequestConsultation}
      recentMessage={recentMessage}
      onOpenRecentMessage={onOpenRecentMessage}
      consultationTitle={undefined}
      consultationDescription={undefined}
      consultationCta={undefined}
      showConsultationCard={!intakeContactStarted}
    />
  );
};
