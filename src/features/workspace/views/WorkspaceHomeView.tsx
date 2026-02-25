/**
 * WorkspaceHomeView - Clean home view component
 *
 * Dedicated component for workspace home view with proper separation
 * of concerns from the monolithic WorkspacePage.
 */

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import { SparklesIcon, ChatBubbleLeftRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface WorkspaceHomeViewProps {
  practice: Practice | null;
  details: PracticeDetails | null;
  onStartNewConversation?: () => void;
  onNavigateToMatters?: () => void;
  isLoading?: boolean;
}

const WorkspaceHomeView: FunctionComponent<WorkspaceHomeViewProps> = ({
  practice,
  details,
  onStartNewConversation,
  onNavigateToMatters,
  isLoading = false,
}) => {
  const practiceName = practice?.name || 'Your Practice';
  const hasDescription = Boolean(details?.description || practice?.description);
  const description = details?.description || practice?.description || '';

  const quickActions = useMemo(() => [
    {
      id: 'new-conversation',
      label: 'Start Conversation',
      description: 'Begin a new client consultation',
      icon: ChatBubbleLeftRightIcon,
      onClick: onStartNewConversation,
      disabled: !practice,
      variant: 'primary' as const,
    },
    {
      id: 'view-matters',
      label: 'View Matters',
      description: 'Manage client matters and cases',
      icon: DocumentTextIcon,
      onClick: onNavigateToMatters,
      disabled: !practice,
      variant: 'secondary' as const,
    },
  ], [practice, onStartNewConversation, onNavigateToMatters]);

  return (
    <Page className="h-full">
      <PageHeader
        title={`Welcome to ${practiceName}`}
        subtitle={hasDescription ? description : undefined}
      />

      <div className="space-y-8">
        {/* Welcome Section */}
        <section className="glass-card p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-accent-100 rounded-full">
              <SparklesIcon className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-input-text">Practice Dashboard</h2>
              <p className="text-sm text-input-placeholder">
                Manage your practice and client interactions
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {quickActions.map((action) => (
              <div key={action.id} className="glass-card p-4 hover:bg-accent-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-background rounded-lg">
                    <action.icon className="w-5 h-5 text-accent-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-input-text mb-1">{action.label}</h3>
                    <p className="text-sm text-input-placeholder mb-3">{action.description}</p>
                    <Button
                      variant={action.variant}
                      onClick={action.onClick}
                      disabled={action.disabled || isLoading}
                      className="w-full sm:w-auto"
                    >
                      {action.label}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Practice Status */}
        {practice && (
          <section className="glass-card p-6">
            <h3 className="text-lg font-semibold text-input-text mb-4">Practice Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold text-accent-500">Active</div>
                <div className="text-sm text-input-placeholder">Practice Status</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold text-accent-500">Ready</div>
                <div className="text-sm text-input-placeholder">Setup Status</div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-2xl font-bold text-accent-500">0</div>
                <div className="text-sm text-input-placeholder">Active Matters</div>
              </div>
            </div>
          </section>
        )}

        {/* Recent Activity */}
        <section className="glass-card p-6">
          <h3 className="text-lg font-semibold text-input-text mb-4">Recent Activity</h3>
          <div className="text-center py-8 text-input-placeholder">
            <ChatBubbleLeftRightIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No recent conversations</p>
            <p className="text-sm mt-2">Start a new conversation to see activity here</p>
          </div>
        </section>
      </div>
    </Page>
  );
};

export default WorkspaceHomeView;
