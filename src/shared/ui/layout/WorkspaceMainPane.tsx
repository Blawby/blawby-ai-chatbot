import type { ComponentChildren } from 'preact';
import type { LayoutMode } from '@/app/MainApp';
import { WorkspacePlaceholderState, type WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';

type WorkspaceView =
  | 'home'
  | 'setup'
  | 'list'
  | 'conversation'
  | 'matters'
  | 'clients'
  | 'invoices'
  | 'invoiceCreate'
  | 'invoiceDetail'
  | 'reports'
  | 'settings';

type WorkspaceMainPaneProps = {
  layoutMode: LayoutMode;
  view: WorkspaceView;
  isPracticeWorkspace: boolean;
  isClientWorkspace: boolean;
  selectedMatterIdFromPath: string | null;
  isMatterNonListRoute: boolean;
  chatView: ComponentChildren;
  content: ComponentChildren;
  topBar?: ComponentChildren;
  bottomNav?: ComponentChildren;
  sectionPlaceholderAction?: WorkspacePlaceholderAction;
};

const SectionPlaceholder = ({
  titleKey,
  descriptionKey,
  action,
}: {
  titleKey: string;
  descriptionKey: string;
  action?: WorkspacePlaceholderAction;
}) => {
  const { t } = useTranslation();
  return (
    <WorkspacePlaceholderState
      title={t(titleKey)}
      description={t(descriptionKey)}
      primaryAction={action}
      className="p-8"
    />
  );
};

export function WorkspaceMainPane({
  layoutMode,
  view,
  isPracticeWorkspace,
  isClientWorkspace,
  selectedMatterIdFromPath,
  isMatterNonListRoute,
  chatView,
  content,
  topBar,
  bottomNav,
  sectionPlaceholderAction,
}: WorkspaceMainPaneProps) {
  const isDesktop = layoutMode === 'desktop';
  const isDesktopWorkspace = isPracticeWorkspace || isClientWorkspace;
  const isDesktopConversationShell = isDesktop && isDesktopWorkspace && (view === 'list' || view === 'conversation');
  const isDesktopMattersShell = isDesktop && isDesktopWorkspace && view === 'matters';
  const isDesktopClientsShell = isDesktop && isPracticeWorkspace && view === 'clients';
  const isDesktopReportsShell = isDesktop && isPracticeWorkspace && view === 'reports';
  const isDesktopInvoicesShell = isDesktop && isDesktopWorkspace && (view === 'invoices' || view === 'invoiceDetail');
  const shouldAllowMainScroll = view !== 'conversation' && view !== 'list';
  const isMatterDetailRoute = Boolean(selectedMatterIdFromPath);

  const mainContent = isDesktopConversationShell
    ? (
      <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
        {chatView}
      </div>
    )
    : isDesktopMattersShell
      ? (selectedMatterIdFromPath || isMatterNonListRoute)
        ? (
          <div className={cn(
            'min-h-0 h-full flex flex-1 flex-col',
            isMatterDetailRoute ? 'overflow-hidden' : 'overflow-y-auto'
          )}>
            {content}
          </div>
        )
        : (
          <SectionPlaceholder
            titleKey="workspace.empty.matter.title"
            descriptionKey="workspace.empty.matter.description"
            action={sectionPlaceholderAction}
          />
        )
      : isDesktopClientsShell || isDesktopReportsShell
        ? (
          <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
            {content}
          </div>
        )
      : isDesktopInvoicesShell
        ? view === 'invoiceDetail'
          ? (
            <div className="min-h-0 h-full flex flex-1 flex-col overflow-hidden">
              {content}
            </div>
          )
          : (
            <SectionPlaceholder
              titleKey="workspace.empty.invoice.title"
              descriptionKey="workspace.empty.invoice.description"
              action={sectionPlaceholderAction}
            />
          )
      : (
        <div className={cn('min-h-0 h-full flex flex-1 flex-col', shouldAllowMainScroll ? 'overflow-y-auto' : 'overflow-hidden')}>
          {content}
        </div>
      );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {topBar ? <div>{topBar}</div> : null}
      <div className="relative flex-1 min-h-0">
        {mainContent}
      </div>
      {bottomNav ? <div className="mt-auto">{bottomNav}</div> : null}
    </div>
  );
}
