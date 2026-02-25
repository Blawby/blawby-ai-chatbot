import { FunctionComponent } from 'preact';
import { 
  ChatBubbleLeftRightIcon, 
  UsersIcon, 
  BriefcaseIcon,
  CheckCircleIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';

type IconComponent = typeof ChatBubbleLeftRightIcon;

interface DashboardCardProps {
  title: string;
  value: string | number;
  label: string;
  icon: IconComponent;
  onClick?: () => void;
}

const DashboardCard: FunctionComponent<DashboardCardProps> = ({ title, value, label, icon: Icon, onClick }) => (
  <div 
    className="glass-card p-6 flex flex-col gap-4 hover:border-accent-500/50 transition-colors cursor-pointer group"
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        onClick?.();
      }
    }}
  >
    <div className="flex items-center justify-between">
      <div className="w-12 h-12 rounded-2xl bg-accent-500/10 flex items-center justify-center text-accent-500 group-hover:bg-accent-500 group-hover:text-white transition-colors">
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-input-text">{value}</div>
        <div className="text-xs text-input-placeholder">{label}</div>
      </div>
    </div>
    <div>
      <div className="text-sm font-semibold text-input-text">{title}</div>
    </div>
  </div>
);

export const WorkspaceDashboardView: FunctionComponent<{
  practiceName?: string | null;
  onNavigateToConversations: () => void;
  onNavigateToMatters: () => void;
  onNavigateToClients: () => void;
}> = ({ practiceName, onNavigateToConversations, onNavigateToMatters, onNavigateToClients }) => {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-input-text tracking-tight font-display">
          Welcome back, {practiceName || 'Counselor'}
        </h1>
        <p className="text-input-placeholder">
          Here&apos;s an overview of your practice activities today.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard 
          title="Recent Conversations" 
          value="0" 
          label="last 24h" 
          icon={ChatBubbleLeftRightIcon}
          onClick={onNavigateToConversations}
        />
        <DashboardCard 
          title="Active Matters" 
          value="0" 
          label="total" 
          icon={BriefcaseIcon}
          onClick={onNavigateToMatters}
        />
        <DashboardCard 
          title="Potential Clients" 
          value="0" 
          label="new leads" 
          icon={UsersIcon}
          onClick={onNavigateToClients}
        />
        <DashboardCard 
          title="Success Rate" 
          value="--" 
          label="conversion" 
          icon={ChartBarIcon}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-card p-6">
            <h2 className="text-lg font-semibold text-input-text mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-4">
              <Button variant="secondary" onClick={onNavigateToConversations}>View all messages</Button>
              <Button variant="secondary" onClick={onNavigateToMatters}>Manage matters</Button>
              <Button variant="primary">Share intake link</Button>
            </div>
          </section>

          <section className="glass-card p-0 overflow-hidden">
            <div className="p-6 border-b border-line-glass/30 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-input-text">Recent Activity</h2>
              <Button variant="secondary" size="xs">View all</Button>
            </div>
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-surface-panel/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="w-8 h-8 text-input-placeholder" />
              </div>
              <p className="text-input-placeholder text-sm">No recent activity found. Once you share your intake link, you&apos;ll see updates here.</p>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="glass-card p-6 border-accent-500/20 bg-accent-500/5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-accent-500 mb-4">Setup Complete</h2>
            <p className="text-sm text-input-text leading-relaxed">
              Your practice is fully configured and ready to accept new clients. 
              The intake bot is active on your public profile.
            </p>
            <div className="mt-6 pt-6 border-t border-accent-500/10">
              <Button variant="primary" className="w-full">Open public intake</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
