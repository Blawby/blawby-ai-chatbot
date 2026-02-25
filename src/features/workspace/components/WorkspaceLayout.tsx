/**
 * WorkspaceLayout - Clean layout component for workspace pages
 *
 * Extracts layout logic from WorkspacePage to provide cleaner separation
 * between layout concerns and view rendering.
 */

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { AppShell, type AppShellProps } from '@/shared/ui/layout/AppShell';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { SplitView, type SplitViewProps } from '@/shared/ui/layout/SplitView';
import WorkspaceNav, { type WorkspaceNavProps } from '@/features/chat/views/WorkspaceNav';
import type { WorkspaceType } from '@/shared/types/workspace';

export interface WorkspaceLayoutProps {
  workspace: WorkspaceType;
  practiceId: string;
  practiceSlug: string | null;
  clientPracticeSlug: string | null;
  children: React.ReactNode;
  header?: React.ReactNode;
  headerClassName?: string;
  showPracticeTabs?: boolean;
  showClientTabs?: boolean;
  isWidget?: boolean;
}

const WorkspaceLayout: FunctionComponent<WorkspaceLayoutProps> = ({
  workspace,
  practiceId,
  practiceSlug,
  clientPracticeSlug,
  children,
  header,
  headerClassName,
  showPracticeTabs = false,
  showClientTabs = false,
  isWidget = false,
}) => {
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';
  const isPublicWorkspace = workspace === 'public';

  const navigationBasePath = useMemo(() => {
    if (isPracticeWorkspace) {
      return practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/';
    }
    if (isClientWorkspace) {
      return clientPracticeSlug ? `/client/${encodeURIComponent(clientPracticeSlug)}` : '/';
    }
    if (isPublicWorkspace && practiceSlug) {
      return `/public/${encodeURIComponent(practiceSlug)}`;
    }
    return '/';
  }, [workspace, practiceSlug, clientPracticeSlug]);

  const shouldShowTabs = useMemo(() => {
    if (isPracticeWorkspace) return showPracticeTabs;
    if (isClientWorkspace) return showClientTabs;
    return false;
  }, [isPracticeWorkspace, isClientWorkspace, showPracticeTabs, showClientTabs]);

  const navProps: WorkspaceNavProps = {
    variant: 'sidebar',
    activeTab: 'home',
    onSelectTab: () => {},
    showPracticeTabs: shouldShowTabs,
    showClientTabs: shouldShowTabs,
    showLogo: true,
  };

  const shellProps: AppShellProps = {
    header,
    headerClassName,
    sidebar: (
      <WorkspaceNav {...navProps} />
    ),
    main: children,
  };

  return (
    <AppShell {...shellProps}>
      <Page className="h-full">
        {header && typeof header === 'string' && (
          <PageHeader
            title={header}
            className={headerClassName}
          />
        )}

        <SplitView
          primary={
            <div className="w-64 min-w-0 border-r border-line-glass/30">
              <WorkspaceNav {...navProps} />
            </div>
          }
          secondary={
            <div className="flex-1 min-h-0">
              {children}
            </div>
          }
        />
      </Page>
    </AppShell>
  );
};

export default WorkspaceLayout;
