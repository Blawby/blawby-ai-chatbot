import { useNavigation } from '@/shared/utils/navigation';
import { ClientDashboardHero } from './components/ClientDashboardHero';
import { ClientActionRequiredWidget } from './components/ClientActionRequiredWidget';
import { ClientRecentInvoicesTable } from './components/ClientRecentInvoicesTable';
import { ClientMattersGrid } from './components/ClientMattersGrid';
import { useClientDashboardData } from './hooks/useClientDashboardData';

type ClientDashboardProps = {
  practiceId: string | null;
  practiceSlug: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  onSendMessage?: () => void;
};

export const ClientDashboard = ({
  practiceId,
  practiceSlug,
  practiceName,
  practiceLogo,
  onSendMessage,
}: ClientDashboardProps) => {
  const { navigate } = useNavigation();
  const {
    stats,
    actionItems,
    recentActivity,
    matterCards,
    loading,
    error,
  } = useClientDashboardData({
    practiceId,
    practiceSlug,
    enabled: Boolean(practiceId && practiceSlug),
  });

  const basePath = practiceSlug ? `/client/${encodeURIComponent(practiceSlug)}` : '';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5">
      <ClientDashboardHero
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        stats={stats}
        loading={loading}
        onSendMessage={onSendMessage}
      />
      {error ? (
        <div className="border-b border-line-subtle" role="alert">
          <div className="mx-auto max-w-7xl px-4 py-3 text-sm text-input-text sm:px-6 lg:px-8">
            {error}
          </div>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ClientActionRequiredWidget
            items={actionItems}
            loading={loading}
            error={null}
            onAction={(item) => navigate(item.navigateTo)}
          />
          <ClientMattersGrid
            matters={matterCards}
            loading={loading}
            error={null}
            onViewAll={() => basePath && navigate(`${basePath}/matters`)}
            onViewMatter={(matterId) => basePath && navigate(`${basePath}/matters/${encodeURIComponent(matterId)}`)}
          />
        </div>
      </div>
      <ClientRecentInvoicesTable
        days={recentActivity}
        loading={loading}
        error={null}
        onOpenInvoice={(entry) => basePath && navigate(`${basePath}/invoices/${encodeURIComponent(entry.invoiceId)}`)}
      />
    </div>
  );
};

export default ClientDashboard;
